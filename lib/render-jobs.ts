import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveMediaFile } from "./media";
import { claudeAuthStatus, DEFAULT_CLAUDE_MODEL, DEFAULT_EFFORT, effortLabel, modelLabel } from "./claude-cli";
import { recordPrompt } from "./prompt-history";
import { getRenderRecord, hasProject, projectArchiveDir, saveRenderRecord } from "./render-history";
import { estimateProgress, forgetProgress } from "./render-progress";
import type { AgentLogEntry, AgentUsage, RenderJobState } from "./render-status";
import { parseStudioInput } from "./studio";
import {
  bindWorkspace,
  jobDirectory,
  prepareRevisionWorkspace,
  prepareWorkspace,
  readAgentEvents,
  readAgentOutput,
  readAgentSummary,
  spawnVideoAgent,
  type AgentEvent,
} from "./video-agent";
import { errorMessage } from "./errors";

const MAX_LOG = 400;
const DEFAULT_MODEL = DEFAULT_CLAUDE_MODEL;

let activeJobId: string | null = null;
let activeChild: ChildProcess | null = null;
let runSerial = 0;
const writeChains = new Map<string, Promise<void>>();

function isJobId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function statusPath(id: string): string {
  return path.join(jobDirectory(id), "status.json");
}

export async function readJob(id: string): Promise<RenderJobState | null> {
  if (!isJobId(id)) return null;
  const file = statusPath(id);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const text = await fs.readFile(file, "utf8");
      if (!text.trim()) throw new Error("empty");
      const job = JSON.parse(text) as RenderJobState;
      return { ...job, log: job.log ?? [] };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" && attempt === 3) return null;
      if (attempt === 3) return null;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  return null;
}

async function writeStatus(id: string, job: RenderJobState): Promise<void> {
  const target = statusPath(id);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(job, null, 2), "utf8");
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EEXIST") throw error;
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
  }
}

function updateJob(id: string, change: (job: RenderJobState) => RenderJobState): Promise<void> {
  const previous = writeChains.get(id) ?? Promise.resolve();
  const next = previous.then(async () => {
    const current = await readJob(id);
    if (!current) return;
    await writeStatus(id, change(current));
  });
  writeChains.set(id, next.catch(() => undefined));
  return next;
}

export async function readLatestJob(): Promise<RenderJobState | null> {
  const directory = path.join(process.cwd(), "tmp", "jobs");
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  let latest: RenderJobState | null = null;
  for (const name of names) {
    const job = await readJob(name);
    if (!job) continue;
    if (!latest || job.startedAt > latest.startedAt) latest = job;
  }
  if (!latest) return null;
  if (latest.status === "rendering" || latest.status === "paused") return latest;
  if (latest.status === "success" && latest.finishedAt && Date.now() - Date.parse(latest.finishedAt) < 6 * 60 * 60 * 1000) {
    return latest;
  }
  return null;
}

async function ensureMedia(relativePath: string | null, label: string): Promise<void> {
  if (!relativePath) return;
  try {
    await fs.access(resolveMediaFile(relativePath));
  } catch {
    throw new Error(`${label} dosyası bulunamadı.`);
  }
}

function formatModel(
  model: { id: string; params?: { id: string; value: string }[] } | null | undefined,
  effort?: string | null,
): string | null {
  const name = modelLabel(model?.id);
  if (!name) return null;
  const level = effortLabel(effort);
  return level ? `${name} · efor: ${level}` : name;
}

function mergeUsage(previous: AgentUsage | null | undefined, next: AgentUsage | undefined): AgentUsage | null {
  if (!next) return previous ?? null;
  const base = previous ?? { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  return {
    turns: base.turns + next.turns,
    inputTokens: base.inputTokens + next.inputTokens,
    outputTokens: base.outputTokens + next.outputTokens,
    cacheReadTokens: base.cacheReadTokens + next.cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + next.cacheWriteTokens,
  };
}

function detailFor(event: AgentEvent): string | null {
  if (event.kind === "text") return event.text.split("\n")[0].slice(0, 140);
  if (event.kind === "tool") return event.text.slice(0, 140);
  return null;
}

function appendEvents(job: RenderJobState, events: AgentEvent[]): RenderJobState {
  if (events.length === 0) return job;
  const entries: AgentLogEntry[] = events.map((event) => ({
    at: event.at,
    kind: event.kind,
    text: event.text,
    ...(event.status ? { status: event.status } : {}),
  }));
  const agentId = events.find((event) => event.agentId)?.agentId ?? job.agentId;
  const latest = [...events].reverse().map(detailFor).find(Boolean) ?? job.detail;
  return {
    ...job,
    agentId,
    detail: latest,
    log: [...job.log, ...entries].slice(-MAX_LOG),
  };
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    const stat = await fs.stat(file);
    return stat.size > 0;
  } catch {
    return false;
  }
}

function pauseFlag(id: string): string {
  return path.join(jobDirectory(id), "pause");
}

function isResting(status: RenderJobState["status"]): boolean {
  return status === "cancelled" || status === "paused";
}

function launchPipeline(id: string, model: string, mode: "start" | "resume" | "revise"): void {
  const serial = ++runSerial;
  activeJobId = id;
  void runPipeline(id, model, mode, serial)
    .catch(async (error: unknown) => {
      const message = errorMessage(error, "Video üretilemedi.");
      const modelName = (error as { modelName?: string }).modelName;
      await updateJob(id, (current) =>
        isResting(current.status)
          ? current
          : {
              ...current,
              status: "error",
              error: message,
              detail: null,
              ...(modelName ? { modelName } : {}),
              finishedAt: new Date().toISOString(),
            },
      );
    })
    .finally(() => {
      forgetProgress(id);
      if (serial === runSerial && activeJobId === id) activeJobId = null;
    });
}

async function runPipeline(id: string, model: string, mode: "start" | "resume" | "revise", serial: number): Promise<void> {
  await fs.rm(pauseFlag(id), { force: true });
  const props = parseStudioInput(JSON.parse(await fs.readFile(path.join(jobDirectory(id), "input.json"), "utf8")));
  const effort = props.effort ?? DEFAULT_EFFORT;
  const existing = await readJob(id);
  let prepared;
  if (mode === "start") {
    await updateJob(id, (job) => ({ ...job, detail: "Çalışma klasörü hazırlanıyor", progress: 1, stage: "Hazırlanıyor" }));
    prepared = await prepareWorkspace(id, props);
    if (serial !== runSerial || isResting((await readJob(id))?.status ?? "rendering")) return;
    await updateJob(id, (job) => ({ ...job, detail: "Ajan başlatılıyor", progress: 3, stage: "Ajan başlatılıyor" }));
  } else if (mode === "revise") {
    await updateJob(id, (job) => ({ ...job, detail: "Önceki videonun projesi açılıyor", progress: 1, stage: "Hazırlanıyor" }));
    const revision = JSON.parse(await fs.readFile(path.join(jobDirectory(id), "revision.json"), "utf8")) as {
      parentId: string;
      prompt: string;
    };
    prepared = await prepareRevisionWorkspace(id, projectArchiveDir(revision.parentId), props, revision.prompt);
    if (serial !== runSerial || isResting((await readJob(id))?.status ?? "rendering")) return;
    await updateJob(id, (job) => ({ ...job, detail: "Ajan başlatılıyor", progress: 3, stage: "Ajan başlatılıyor" }));
  } else {
    prepared = bindWorkspace(id);
    await fs.access(prepared.workspace);
  }

  let offset = 0;
  if (mode === "resume") {
    offset = (await fs.stat(prepared.eventsPath).catch(() => null))?.size ?? 0;
  }
  if (serial !== runSerial) return;
  const { child, done } = await spawnVideoAgent(prepared, model, {
    agentId: mode === "resume" ? existing?.agentId : null,
    keepEvents: mode === "resume",
    pausePath: pauseFlag(id),
    effort,
  });
  if (serial !== runSerial) {
    killTree(child);
    return;
  }
  activeChild = child;

  let agentStarted = mode === "resume";
  let progress = mode === "resume" ? (existing?.progress ?? 3) : 3;
  const pump = async () => {
    const read = await readAgentEvents(prepared.eventsPath, offset);
    offset = read.offset;
    if (read.events.length) agentStarted = true;
    const estimate = await estimateProgress(id, prepared.workspace, agentStarted, progress);
    progress = estimate.progress;
    await updateJob(id, (job) =>
      isResting(job.status) ? job : { ...appendEvents(job, read.events), progress: estimate.progress, stage: estimate.stage },
    );
    const output = await readAgentOutput(prepared.outputPath);
    const current = await readJob(id);
    if (
      output?.status === "finished" &&
      output.agentId &&
      current?.agentId === output.agentId &&
      child.exitCode === null &&
      (await exists(prepared.finalOutput))
    ) {
      killTree(child);
    }
  };
  const timer = setInterval(() => void pump(), 1000);
  let code: number | null;
  try {
    code = await done;
  } finally {
    clearInterval(timer);
    activeChild = null;
  }
  await pump();
  forgetProgress(id);

  // Bu çalıştırmanın kullanımını işe ekle (duraklat/devam ettir dahil toplam).
  const usageOutput = await readAgentOutput(prepared.outputPath);
  if (usageOutput?.usage) {
    await updateJob(id, (job) => ({ ...job, usage: mergeUsage(job.usage, usageOutput.usage) }));
  }

  const current = await readJob(id);
  if (serial !== runSerial || (current && isResting(current.status))) return;

  const output = await readAgentOutput(prepared.outputPath);
  const modelName = formatModel(output?.model ?? { id: model }, effort) ?? model;
  const hasVideo = await exists(prepared.finalOutput);
  if (!hasVideo) {
    throw Object.assign(
      new Error(output?.error || (code === 3221225477 ? "Ajan süreci çöktü. Tekrar başlat." : "Ajan final videoyu üretmedi.")),
      { modelName },
    );
  }

  const rendersDir = path.join(process.cwd(), "public", "renders");
  await fs.mkdir(rendersDir, { recursive: true });
  await fs.copyFile(prepared.finalOutput, path.join(rendersDir, `${id}.mp4`));
  const summary = (await readAgentSummary(prepared.workspace)) ?? output?.result ?? null;

  await updateJob(id, (job) => ({
    ...job,
    status: "success",
    outputUrl: `/renders/${id}.mp4`,
    error: null,
    detail: "Hazır",
    progress: 100,
    stage: "Tamamlandı",
    modelName,
    summary,
    finishedAt: new Date().toISOString(),
  }));
  // Kullanılan tüm ayarları kalıcı geçmişe kaydet (Geçmiş sayfası).
  await saveRenderRecord(id).catch(() => null);
}

export async function createRenderJob(input: unknown): Promise<RenderJobState> {
  if (activeJobId) {
    const current = await readJob(activeJobId);
    if (current?.status === "rendering") {
      throw new Error("Başka bir video işleniyor.");
    }
    activeJobId = null;
  }

  const props = parseStudioInput(input);
  const auth = await claudeAuthStatus().catch(() => ({ ready: false, error: null as string | null }));
  if (!auth.ready) throw new Error(auth.error ?? "Claude Code hazır değil. Önce \"Claude ile bağlan\" butonunu kullan.");
  if (props.sourceVideos.length === 0) throw new Error("En az bir kaynak video seç.");
  const musicSkill = props.styleSkills.find((skill) => skill.strict && skill.timeline === "music");
  if (musicSkill && !props.backgroundMusic) {
    throw new Error(`"${musicSkill.name}" skill'i müziğin ritmine göre çalışır; bir müzik seç.`);
  }
  if (props.prompt.trim().length < 3 && props.styleSkills.length === 0) {
    throw new Error("Bir stil skill'i seç ya da ajana ne istediğini anlatan bir prompt yaz.");
  }

  for (const video of props.sourceVideos) await ensureMedia(video, "Kaynak video");
  for (const video of props.referenceVideos) await ensureMedia(video, "Referans video");
  await ensureMedia(props.backgroundMusic, "Müzik");
  for (const asset of props.assetImages) await ensureMedia(asset, "Görsel");

  const id = randomUUID();
  const model = props.model ?? DEFAULT_MODEL;
  await fs.mkdir(jobDirectory(id), { recursive: true });
  await fs.writeFile(path.join(jobDirectory(id), "input.json"), JSON.stringify(props), "utf8");

  const job: RenderJobState = {
    id,
    status: "rendering",
    outputUrl: null,
    error: null,
    detail: "Sıraya alındı",
    progress: 0,
    stage: "Sıraya alındı",
    modelName: formatModel({ id: model }, props.effort ?? DEFAULT_EFFORT),
    agentId: null,
    log: [],
    summary: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pausedMs: 0,
  };
  await fs.writeFile(statusPath(id), JSON.stringify(job, null, 2), "utf8");
  launchPipeline(id, model, "start");
  // Prompt geçmişine kaydet (hata olursa video üretimini etkilemesin).
  await recordPrompt(props.prompt).catch(() => undefined);

  return job;
}

export async function createRevisionJob(input: {
  parentId?: unknown;
  prompt?: unknown;
  model?: unknown;
  effort?: unknown;
}): Promise<RenderJobState> {
  if (activeJobId) {
    const current = await readJob(activeJobId);
    if (current?.status === "rendering") throw new Error("Başka bir video işleniyor.");
    activeJobId = null;
  }
  const parentId = String(input.parentId ?? "");
  const request = String(input.prompt ?? "").trim().slice(0, 4000);
  if (request.length < 3) throw new Error("Neyi düzeltmek istediğini yaz.");
  const parent = await getRenderRecord(parentId);
  if (!parent) throw new Error("Düzeltilecek video bulunamadı.");
  if (!(await hasProject(parentId))) throw new Error("Bu videonun kod arşivi yok; düzeltme yapılamaz.");
  const auth = await claudeAuthStatus().catch(() => ({ ready: false, error: null as string | null }));
  if (!auth.ready) throw new Error(auth.error ?? "Claude Code hazır değil. Önce \"Claude ile bağlan\" butonunu kullan.");

  const props = parseStudioInput({
    ...parent.settings,
    ...(typeof input.model === "string" && input.model ? { model: input.model } : {}),
    ...(typeof input.effort === "string" && input.effort ? { effort: input.effort } : {}),
  });
  for (const video of props.sourceVideos) await ensureMedia(video, "Kaynak video");
  for (const video of props.referenceVideos) await ensureMedia(video, "Referans video");
  await ensureMedia(props.backgroundMusic, "Müzik");
  for (const asset of props.assetImages) await ensureMedia(asset, "Görsel");

  const id = randomUUID();
  const model = props.model ?? DEFAULT_MODEL;
  await fs.mkdir(jobDirectory(id), { recursive: true });
  await fs.writeFile(path.join(jobDirectory(id), "input.json"), JSON.stringify(props), "utf8");
  await fs.writeFile(path.join(jobDirectory(id), "revision.json"), JSON.stringify({ parentId, prompt: request }), "utf8");

  const job: RenderJobState = {
    id,
    status: "rendering",
    outputUrl: null,
    error: null,
    detail: "Sıraya alındı",
    progress: 0,
    stage: "Sıraya alındı",
    modelName: formatModel({ id: model }, props.effort ?? DEFAULT_EFFORT),
    agentId: null,
    log: [],
    summary: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    pausedMs: 0,
    revisionOf: parentId,
    revisionPrompt: request,
  };
  await fs.writeFile(statusPath(id), JSON.stringify(job, null, 2), "utf8");
  launchPipeline(id, model, "revise");
  return job;
}

export async function cancelRenderJob(id: string): Promise<RenderJobState | null> {
  const job = await readJob(id);
  if (!job || (job.status !== "rendering" && job.status !== "paused")) return job;
  await updateJob(id, (current) => ({
    ...current,
    status: "cancelled",
    detail: null,
    error: "İptal edildi.",
    finishedAt: new Date().toISOString(),
  }));
  await fs.rm(pauseFlag(id), { force: true });
  if (activeJobId === id && activeChild) killTree(activeChild);
  return readJob(id);
}

export async function pauseRenderJob(id: string): Promise<RenderJobState | null> {
  const job = await readJob(id);
  if (!job || job.status !== "rendering") return job;
  await updateJob(id, (current) => ({
    ...current,
    status: "paused",
    detail: "Duraklatıldı",
    error: null,
    finishedAt: new Date().toISOString(),
  }));
  await fs.writeFile(pauseFlag(id), "1", "utf8");
  const child = activeJobId === id ? activeChild : null;
  if (child && child.exitCode === null) {
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => child.once("close", () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
    if (!exited) killTree(child);
  }
  return readJob(id);
}

export async function resumeRenderJob(id: string): Promise<RenderJobState> {
  if (activeJobId && activeJobId !== id) {
    const current = await readJob(activeJobId);
    if (current?.status === "rendering") throw new Error("Başka bir video işleniyor.");
  }

  const job = await readJob(id);
  if (!job || job.status !== "paused") throw new Error("Devam ettirilecek duraklatılmış iş yok.");
  const props = parseStudioInput(JSON.parse(await fs.readFile(path.join(jobDirectory(id), "input.json"), "utf8")));
  const model = props.model ?? DEFAULT_MODEL;
  const pausedFor = job.finishedAt ? Math.max(0, Date.now() - Date.parse(job.finishedAt)) : 0;

  await updateJob(id, (current) => ({
    ...current,
    status: "rendering",
    error: null,
    detail: "Kaldığı yerden devam ediliyor",
    finishedAt: null,
    pausedMs: (current.pausedMs ?? 0) + pausedFor,
  }));
  launchPipeline(id, model, "resume");

  const updated = await readJob(id);
  if (!updated) throw new Error("İş bulunamadı.");
  return updated;
}
