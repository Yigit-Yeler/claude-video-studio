import fs from "node:fs/promises";
import path from "node:path";
import type { AgentUsage, RenderJobState } from "./render-status";
import { parseStudioInput, type StudioInputProps } from "./studio";

// Üretilen her videonun kalıcı kaydı: data/render-history/<id>.json
// Video: public/renders/<id>.mp4 · Ayarlar: o anda seçilen tüm parametreler (skill kılavuzlarının o anki hali dahil).

export type RenderRecord = {
  id: string;
  /** Bu video başka bir videonun düzeltilmiş sürümüyse o videonun kimliği. */
  revisionOf?: string | null;
  /** Düzeltme isteği (prompt). */
  revisionPrompt?: string | null;
  outputUrl: string;
  startedAt: string;
  finishedAt: string | null;
  modelName: string | null;
  usage: AgentUsage | null;
  summary: string | null;
  settings: StudioInputProps;
};

export type RenderRecordSummary = Omit<RenderRecord, "settings"> & {
  /** Kod arşivi var mı (Düzelt için gerekli). */
  hasProject: boolean;
  prompt: string;
  skills: { id: string; name: string }[];
  sourceVideos: string[];
  sfxMode: StudioInputProps["sfxMode"];
  hasMusic: boolean;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function historyDir(): string {
  return path.join(process.cwd(), "data", "render-history");
}

export function projectArchiveDir(id: string): string {
  return path.join(historyDir(), id, "project");
}

function rendersDir(): string {
  return path.join(process.cwd(), "public", "renders");
}

function jobDir(id: string): string {
  return path.join(process.cwd(), "tmp", "jobs", id);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function normalizeSettings(raw: unknown): StudioInputProps | null {
  try {
    return parseStudioInput(raw);
  } catch {
    return null;
  }
}

// Arşive alınmayanlar: ayarlardaki medyanın kopyaları (düzeltmede kütüphaneden geri yüklenir), render çıktısı,
// kontrol görselleri ve geçici dosyalar.
const SETTINGS_MEDIA = /^(source|reference)(-\d+)?\.[a-z0-9]+$|^music\.[a-z0-9]+$|^cut\.mp4$/i;
const ANALYSIS_TEXT = /\.(md|json|txt|py|ts|tsx|js|mjs|csv)$/i;

async function copyFiltered(from: string, to: string, keep: (relative: string, isDir: boolean) => boolean, base = ""): Promise<void> {
  const entries = await fs.readdir(from, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (!keep(relative, entry.isDirectory())) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyFiltered(source, target, keep, relative);
    } else if (entry.isFile()) {
      await fs.mkdir(to, { recursive: true });
      await fs.copyFile(source, target);
    }
  }
}

/** Videoyu üreten Remotion projesini (kod, plan, transkript, üretilen sesler) kalıcı olarak arşivler. */
export async function archiveProject(id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  const workspace = path.join(jobDir(id), "workspace");
  const exists = await fs.access(path.join(workspace, "src")).then(() => true, () => false);
  if (!exists) return false;
  const target = projectArchiveDir(id);
  await fs.rm(target, { recursive: true, force: true });
  await copyFiltered(workspace, target, (relative, isDir) => {
    const [top, ...rest] = relative.split("/");
    if (top === "out" || top === "node_modules" || relative === "render-progress.json") return false;
    if (top === "src") return true;
    if (top === "analysis") {
      if (rest[0] === "stills") return false;
      return isDir || ANALYSIS_TEXT.test(relative);
    }
    if (top === "public") {
      if (rest.length === 0) return true;
      if (rest[0] === "assets") return false;
      return !(rest.length === 1 && SETTINGS_MEDIA.test(rest[0]));
    }
    return !isDir && /\.(json|md|ts|tsx)$/i.test(relative);
  });
  return true;
}

/** Bir işin ayarlarını kalıcı geçmişe yazar. Video başarıyla üretildiğinde çağrılır. */
export async function saveRenderRecord(id: string, job?: RenderJobState | null): Promise<RenderRecord | null> {
  if (!ID.test(id)) return null;
  const settings = normalizeSettings(await readJson(path.join(jobDir(id), "input.json")));
  if (!settings) return null;
  const status = job ?? (await readJson<RenderJobState>(path.join(jobDir(id), "status.json")));
  const revision = await readJson<{ parentId?: string; prompt?: string }>(path.join(jobDir(id), "revision.json"));
  const record: RenderRecord = {
    id,
    revisionOf: revision?.parentId ?? null,
    revisionPrompt: revision?.prompt ?? null,
    outputUrl: status?.outputUrl ?? `/renders/${id}.mp4`,
    startedAt: status?.startedAt ?? new Date().toISOString(),
    finishedAt: status?.finishedAt ?? null,
    modelName: status?.modelName ?? null,
    usage: status?.usage ?? null,
    summary: status?.summary ?? null,
    settings,
  };
  await fs.mkdir(historyDir(), { recursive: true });
  await fs.writeFile(path.join(historyDir(), `${id}.json`), JSON.stringify(record, null, 2), "utf8");
  await archiveProject(id).catch(() => false);
  return record;
}

/** public/renders içinde olup geçmişte kaydı olmayan videoları eski iş klasörlerinden doldurur. */
async function backfill(): Promise<void> {
  const videos = (await fs.readdir(rendersDir()).catch(() => [] as string[])).filter((name) => name.endsWith(".mp4"));
  const existing = new Set((await fs.readdir(historyDir()).catch(() => [] as string[])).map((name) => name.replace(/\.json$/, "")));
  for (const name of videos) {
    const id = name.replace(/\.mp4$/, "");
    if (!existing.has(id)) {
      await saveRenderRecord(id).catch(() => null);
    } else if (!(await hasProject(id))) {
      await archiveProject(id).catch(() => false);
    }
  }
}

export async function hasProject(id: string): Promise<boolean> {
  return fs.access(path.join(projectArchiveDir(id), "src")).then(() => true, () => false);
}

export async function listRenderRecords(): Promise<RenderRecordSummary[]> {
  await backfill();
  const names = (await fs.readdir(historyDir()).catch(() => [] as string[])).filter((name) => name.endsWith(".json"));
  const records: RenderRecordSummary[] = [];
  for (const name of names) {
    const record = await readJson<RenderRecord>(path.join(historyDir(), name));
    if (!record?.settings) continue;
    const videoExists = await fs
      .access(path.join(rendersDir(), `${record.id}.mp4`))
      .then(() => true)
      .catch(() => false);
    if (!videoExists) continue;
    const { settings, ...rest } = record;
    records.push({
      ...rest,
      hasProject: await hasProject(record.id),
      prompt: settings.prompt,
      skills: settings.styleSkills.map((skill) => ({ id: skill.id, name: skill.name })),
      sourceVideos: settings.sourceVideos,
      sfxMode: settings.sfxMode,
      hasMusic: Boolean(settings.backgroundMusic),
    });
  }
  return records.sort((a, b) => (b.finishedAt ?? b.startedAt).localeCompare(a.finishedAt ?? a.startedAt));
}

export async function getRenderRecord(id: string): Promise<RenderRecord | null> {
  if (!ID.test(id)) return null;
  return readJson<RenderRecord>(path.join(historyDir(), `${id}.json`));
}
