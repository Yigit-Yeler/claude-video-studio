import fs from "node:fs/promises";
import path from "node:path";

type Stage = { id: string; label: string; start: number; end: number; tau: number };

const STAGES: Stage[] = [
  { id: "prepare", label: "Hazırlanıyor", start: 0, end: 4, tau: 10 },
  { id: "started", label: "Ajan başladı", start: 4, end: 8, tau: 30 },
  { id: "explore", label: "Kaynak video inceleniyor", start: 8, end: 20, tau: 90 },
  { id: "transcript", label: "Konuşma metne döküldü", start: 20, end: 26, tau: 60 },
  { id: "plan", label: "Sahne planı yazılıyor", start: 26, end: 32, tau: 60 },
  { id: "code", label: "Animasyonlar kodlanıyor", start: 32, end: 62, tau: 300 },
  { id: "stills", label: "Kareler kontrol ediliyor", start: 62, end: 76, tau: 180 },
  { id: "render", label: "Video render ediliyor", start: 76, end: 96, tau: 0 },
  { id: "final", label: "Son kontroller", start: 96, end: 99, tau: 40 },
];

const BASE_SOURCE_FILES = new Set(["index.ts", "Root.tsx", "Video.tsx", "transcript.ts"]);

type Tracker = { stage: number; enteredAt: number; videoMtime: number | null };
const trackers = new Map<string, Tracker>();

async function list(directory: string): Promise<string[]> {
  return fs.readdir(directory).catch(() => [] as string[]);
}

async function mtime(file: string): Promise<number | null> {
  return fs
    .stat(file)
    .then((stat) => stat.mtimeMs)
    .catch(() => null);
}

type RenderProgressFile = { rendered: number; encoded: number; total: number; done: boolean; partial: boolean };

async function readRenderProgress(workspace: string): Promise<RenderProgressFile | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(workspace, "render-progress.json"), "utf8")) as RenderProgressFile;
  } catch {
    return null;
  }
}

async function detectStage(workspace: string, agentStarted: boolean, tracker: Tracker): Promise<number> {
  const analysis = await list(path.join(workspace, "analysis"));
  const src = await list(path.join(workspace, "src"));
  const stills = (await list(path.join(workspace, "analysis", "stills"))).filter((name) => name.endsWith(".png"));
  const out = await list(path.join(workspace, "out"));
  const render = await readRenderProgress(workspace);
  const videoMtime = await mtime(path.join(workspace, "src", "Video.tsx"));
  if (tracker.videoMtime === null) tracker.videoMtime = videoMtime;

  const fullRender = render && !render.partial;
  if (out.includes("final.mp4") && (!fullRender || render.done) && analysis.some((name) => name.startsWith("final-grid"))) {
    return STAGES.findIndex((stage) => stage.id === "final");
  }
  if (fullRender) return STAGES.findIndex((stage) => stage.id === "render");
  if (stills.length > 0 || analysis.some((name) => name.endsWith(".png"))) {
    return STAGES.findIndex((stage) => stage.id === "stills");
  }
  const coded =
    src.some((name) => !BASE_SOURCE_FILES.has(name)) ||
    (videoMtime !== null && tracker.videoMtime !== null && videoMtime > tracker.videoMtime);
  if (coded) return STAGES.findIndex((stage) => stage.id === "code");
  if (analysis.includes("plan.md")) return STAGES.findIndex((stage) => stage.id === "plan");
  if (analysis.some((name) => name.includes("transcript") && name.endsWith(".json"))) {
    return STAGES.findIndex((stage) => stage.id === "transcript");
  }
  if (analysis.some((name) => name.endsWith(".jpg"))) return STAGES.findIndex((stage) => stage.id === "explore");
  return agentStarted ? 1 : 0;
}

export async function estimateProgress(
  jobId: string,
  workspace: string,
  agentStarted: boolean,
  previous: number,
): Promise<{ progress: number; stage: string }> {
  const now = Date.now();
  const tracker = trackers.get(jobId) ?? { stage: 0, enteredAt: now, videoMtime: null };
  trackers.set(jobId, tracker);

  const detected = await detectStage(workspace, agentStarted, tracker);
  if (detected > tracker.stage) {
    tracker.stage = detected;
    tracker.enteredAt = now;
  }
  const stage = STAGES[tracker.stage];
  const span = stage.end - stage.start;
  let value: number;
  if (stage.id === "render") {
    const render = await readRenderProgress(workspace);
    const total = render?.total || 1;
    const fraction = render ? Math.min(1, (render.rendered / total) * 0.85 + (render.encoded / total) * 0.15) : 0;
    value = stage.start + span * fraction;
  } else {
    const elapsed = (now - tracker.enteredAt) / 1000;
    value = stage.start + span * 0.9 * (1 - Math.exp(-elapsed / stage.tau));
  }
  return { progress: Math.max(previous, Math.min(99, Math.round(value))), stage: stage.label };
}

export function forgetProgress(jobId: string): void {
  trackers.delete(jobId);
}
