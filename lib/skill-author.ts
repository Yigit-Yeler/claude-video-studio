import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { claudeAuthStatus, claudeEnv, DEFAULT_CLAUDE_MODEL, DEFAULT_EFFORT, modelLabel, openClaudeLogin, resolveClaudeCommand } from "./claude-cli";
import { parseStyleSkillSpec, type StyleSkillSpec } from "./style-skill";

export type SkillJobState = {
  id: string;
  status: "analyzing" | "success" | "error";
  error: string | null;
  skill: StyleSkillSpec | null;
  modelName: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv"]);
const MAX_VIDEOS = 8;
const MAX_BYTES = 150 * 1024 * 1024;

let activeJobId: string | null = null;

function jobDirectory(id: string): string {
  return path.join(process.cwd(), "tmp", "skill-jobs", id);
}

function isJobId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function readSkillJob(id: string): Promise<SkillJobState | null> {
  if (!isJobId(id)) return null;
  try {
    const raw = await fs.readFile(path.join(jobDirectory(id), "status.json"), "utf8");
    return JSON.parse(raw) as SkillJobState;
  } catch {
    return null;
  }
}

async function writeSkillJob(job: SkillJobState): Promise<void> {
  const directory = jobDirectory(job.id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "status.json"), JSON.stringify(job, null, 2), "utf8");
}

export async function claudeAuthReady(force = false): Promise<{ ready: boolean; email: string | null; plan: string | null; error: string | null }> {
  const auth = await claudeAuthStatus(force);
  return { ready: auth.ready, email: auth.email, plan: auth.plan, error: auth.error };
}

export async function loginClaude(): Promise<{ opened: boolean; message: string }> {
  return openClaudeLogin();
}

export function skillsDirectory(): string {
  return path.join(process.cwd(), "data", "generated-skills");
}

export async function listGeneratedSkills(): Promise<StyleSkillSpec[]> {
  const directory = skillsDirectory();
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory);
  const skills: StyleSkillSpec[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(directory, entry), "utf8")) as Record<string, unknown>;
      const guide = await fs
        .readFile(path.join(directory, entry.replace(/\.json$/, ".md")), "utf8")
        .catch(() => null);
      const parsed = parseStyleSkillSpec(guide ? { ...raw, guide } : raw);
      if (parsed) skills.push(parsed);
    } catch {
      continue;
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

function formatModelName(model: { id: string } | undefined): string | null {
  return modelLabel(model?.id);
}

function slugify(name: string): string {
  const base = name
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "stil";
}

const MAX_FRAMES_PER_VIDEO = 12;
const MAX_TOTAL_FRAMES = 48;

function videoDuration(binary: string, videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["-hide_banner", "-i", videoPath], { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", () => resolve(0));
    child.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve(match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0);
    });
  });
}

export async function extractFrames(videoPath: string, outputDirectory: string, count: number): Promise<string[]> {
  const binary = ffmpegPath;
  if (!binary) throw new Error("ffmpeg bulunamadı.");
  await fs.mkdir(outputDirectory, { recursive: true });
  const pattern = path.join(outputDirectory, "frame-%02d.jpg");
  const duration = await videoDuration(binary, videoPath);
  const rate = duration > 0 ? count / duration : 1;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      ["-y", "-i", videoPath, "-vf", `fps=${rate},scale=480:-2`, "-frames:v", String(count), pattern],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split(/\r?\n/).slice(-4).join("\n") || "Kare çıkarılamadı."));
    });
  });
  const files = (await fs.readdir(outputDirectory))
    .filter((name) => name.endsWith(".jpg"))
    .sort()
    .map((name) => path.join(outputDirectory, name));
  if (files.length === 0) throw new Error("Videodan kare alınamadı.");
  return files;
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model JSON döndürmedi.");
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

async function writeSkillFiles(spec: StyleSkillSpec): Promise<void> {
  const directory = skillsDirectory();
  const componentDirectory = path.join(process.cwd(), "remotion", "skills", "generated");
  await fs.mkdir(directory, { recursive: true });
  await fs.mkdir(componentDirectory, { recursive: true });
  const { guide, ...rest } = spec;
  await fs.writeFile(path.join(directory, `${spec.id}.json`), JSON.stringify(rest, null, 2), "utf8");
  if (guide) await fs.writeFile(path.join(directory, `${spec.id}.md`), guide, "utf8");
  const component = `import spec from "../../../data/generated-skills/${spec.id}.json";
import type { StyleSkillSpec } from "../../../lib/style-skill";
import { StyleSkill } from "../StyleSkill";

const styleSpec = spec as StyleSkillSpec;

export const GeneratedStyleSkill: React.FC = () => {
  return <StyleSkill spec={styleSpec} />;
};
`;
  await fs.writeFile(path.join(componentDirectory, `${spec.id}.tsx`), component, "utf8");
}

async function analyze(id: string, prompt: string, skillName: string, strict: boolean): Promise<void> {
  const directory = jobDirectory(id);
  const videoDirectory = path.join(directory, "videos");
  const names = (await fs.readdir(videoDirectory)).filter((name) =>
    VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()),
  );
  const framePaths: string[] = [];
  const notes: string[] = [];

  const perVideo = Math.max(4, Math.min(MAX_FRAMES_PER_VIDEO, Math.floor(MAX_TOTAL_FRAMES / Math.max(1, names.length))));
  for (const name of names) {
    const frames = await extractFrames(path.join(videoDirectory, name), path.join(directory, "frames", name), perVideo);
    notes.push(`${name}: ${frames.length} kare`);
    framePaths.push(...frames);
  }

  const instruction = [
    "Referans videolardan çıkarılan kareleri Read aracıyla tek tek incele.",
    "Kareleri bu mesaja yapıştırma. Yollar:",
    ...framePaths.map((frame) => `- ${frame}`),
    "Kareler her videonun başından sonuna eşit aralıklarla alındı (dosya adındaki sıra zamandır).",
    "Ortak tarzı yaz: geçişler, hareket, renk, yazı tipi hissi, altyazı animasyonu, ses efekti ritmi.",
    "Ses dalgasını duymuyorsun; görüntü ritminden ve kullanıcının notundan çıkarım yap, uydurma iddia etme.",
    strict
      ? "guide alanı, bu skill seçildiğinde video ajanının birebir uygulayacağı bağlayıcı bir Markdown kılavuzdur: sahne türleri ve ritim, altyazı (Google Fonts yazı tipi, px boyut, konum, kelime animasyonu), giriş/çıkış, geçişler, grafik/kart stilleri, kapanış, ses efektleri ve yasaklar. 1080x1920 için somut ölçüler ve 30 fps kare sayıları ver."
      : "guide alanı, video ajanının esinleneceği bir Markdown stil notudur: sahne türleri ve ritim, altyazı (Google Fonts yazı tipi, px boyut, konum, kelime animasyonu), giriş/çıkış, geçişler, grafik/kart stilleri, kapanış ve ses efektleri. 1080x1920 için somut ölçüler ve 30 fps kare sayıları ver. Yasak listesi yazma; ajan bu notları kendi yorumuyla kullanacak.",
    "outroSeconds: videolar konuşma bittikten sonra ayrı bir kapanış kartıyla bitiyorsa o kartın saniyesi (ör. 3.5), yoksa 0.",
    "Dosya oluşturma. Yalnızca tek bir JSON nesnesi döndür.",
    "Şema:",
    '{"name":"","summary":"","analysis":"","guide":"","outroSeconds":0,"style":{"fontFamily":"Arial, Helvetica, sans-serif","primaryText":"#f8fafc","accent":"#c4b5fd","sampleText":"","textAnimation":"fade-up","transition":"none","grade":"neutral","motion":"static","subtitlePosition":"bottom"}}',
    "fontFamily yalnız şunlardan biri olabilir: Arial, Helvetica, sans-serif | Impact, Haettenschweiler, sans-serif | Georgia, serif | \"Courier New\", monospace | \"Segoe UI\", sans-serif | \"Trebuchet MS\", sans-serif",
    "textAnimation: fade-up | pop | slide | typewriter",
    "transition: none | flash | dip | zoom",
    "grade: neutral | warm | cool | cinematic | vhs",
    "motion: static | slow-zoom | drift | shake",
    "subtitlePosition: bottom | center | top",
    "analysis Türkçe olsun ve ortak tarzı anlatsın.",
    `Kare notları: ${notes.join("; ")}`,
    prompt.trim() ? `Kullanıcı notu: ${prompt.trim().slice(0, 2000)}` : "Kullanıcı notu yok.",
  ].join("\n");

  const inputPath = path.join(directory, "agent-input.json");
  const outputPath = path.join(directory, "agent-output.json");
  await fs.writeFile(
    inputPath,
    JSON.stringify({ instruction, claude: resolveClaudeCommand(), model: DEFAULT_CLAUDE_MODEL, effort: DEFAULT_EFFORT }),
    "utf8",
  );

  const exit = await runAgentProcess(inputPath, outputPath);
  let output: { status?: string; result?: string | null; error?: string | null; model?: { id: string; params?: { id: string; value: string }[] } } | null = null;
  try {
    output = JSON.parse(await fs.readFile(outputPath, "utf8"));
  } catch {
    output = null;
  }

  const modelName = formatModelName(output?.model);
  const withModel = await readSkillJob(id);
  if (withModel && modelName) {
    await writeSkillJob({ ...withModel, modelName });
  }
  if (!output?.result || output.status !== "finished") {
    throw new Error(
      output?.error ||
        (exit.code === 3221225477
          ? "Model süreci çöktü. Analizi tekrar başlat."
          : "Analiz tamamlanamadı."),
    );
  }

  const drafted = extractJson(output.result) as { name?: string; guide?: unknown; analysis?: unknown };
  const guide =
    typeof drafted.guide === "string" && drafted.guide.trim()
      ? drafted.guide
      : typeof drafted.analysis === "string"
        ? drafted.analysis
        : "";
  const parsed = parseStyleSkillSpec({
    ...drafted,
    guide,
    strict,
    name: skillName,
    id: `${slugify(skillName)}-${id.slice(0, 8)}`,
  });
  if (!parsed) throw new Error("Model geçersiz bir skill döndürdü.");
  if (strict && !parsed.guide) throw new Error("Model bağlayıcı kılavuz yazmadı. Analizi tekrar başlat.");
  await writeSkillFiles(parsed);
  const current = await readSkillJob(id);
  if (!current) return;
  await writeSkillJob({
    ...current,
    status: "success",
    skill: parsed,
    modelName: modelName ?? current.modelName,
    error: null,
    finishedAt: new Date().toISOString(),
  });
  if (activeJobId === id) activeJobId = null;
}

export function runAgentProcess(inputPath: string, outputPath: string): Promise<{ code: number | null }> {
  const script = path.join(process.cwd(), "scripts", "run-skill-agent.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, inputPath, outputPath], {
      cwd: process.cwd(),
      env: claudeEnv(),
      windowsHide: true,
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code }));
  });
}

export async function startSkillJob(
  files: File[],
  prompt: string,
  skillName: string,
  strict: boolean,
): Promise<SkillJobState> {
  const auth = await claudeAuthReady();
  const name = skillName.trim().slice(0, 60);
  if (!auth.ready) {
    throw new Error(auth.error ?? "Claude Code hazır değil. Önce \"Claude ile bağlan\" butonunu kullan.");
  }
  if (!name) throw new Error("Skill adı gerekli.");
  if (files.length === 0) throw new Error("En az bir video yükle.");
  if (files.length > MAX_VIDEOS) throw new Error(`En fazla ${MAX_VIDEOS} video yüklenebilir.`);
  if (activeJobId) {
    const current = await readSkillJob(activeJobId);
    if (current?.status === "analyzing") throw new Error("Başka bir analiz sürüyor.");
    activeJobId = null;
  }

  const id = randomUUID();
  const videoDirectory = path.join(jobDirectory(id), "videos");
  await fs.mkdir(videoDirectory, { recursive: true });

  for (const [index, file] of files.entries()) {
    const extension = path.extname(file.name).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(extension)) throw new Error("Yalnızca mp4, webm, mov veya mkv yükle.");
    if (file.size > MAX_BYTES) throw new Error("Bir video 150 MB sınırını aşıyor.");
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(videoDirectory, `${index + 1}${extension}`), bytes);
  }

  const job: SkillJobState = {
    id,
    status: "analyzing",
    error: null,
    skill: null,
    modelName: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  await writeSkillJob(job);
  activeJobId = id;

  void analyze(id, prompt, name, strict).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Analiz başarısız.";
    const current = await readSkillJob(id);
    if (!current || current.status !== "analyzing") return;
    await writeSkillJob({
      ...current,
      status: "error",
      error: message,
      finishedAt: new Date().toISOString(),
    });
    if (activeJobId === id) activeJobId = null;
  });

  return job;
}
