import type { RenderJobState } from "@/lib/render-status";
import type { StudioInputProps } from "@/lib/studio";
import { ApiError, api, sleep } from "./api";
import { STORAGE_KEYS, readStored, removeStored, writeStored } from "./storage-keys";

export type RenderStatus = RenderJobState["status"] | "idle";

const POLL_INTERVAL_MS = 1200;
const NOT_FOUND_RETRY_MS = 400;

const jobUrl = (id: string) => `/api/render?id=${encodeURIComponent(id)}`;

/** İzleme bilerek bırakıldığında (yeni iş, durdurma, sayfadan çıkış) fırlatılır. */
export class PollCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "PollCancelledError";
  }
}

/** İş dosyası yazılırken kısa bir 404 dönebilir; bir kez daha denenir. */
async function fetchJob(id: string): Promise<RenderJobState> {
  try {
    return await api.get<RenderJobState>(jobUrl(id), "Render durumu alınamadı.");
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    await sleep(NOT_FOUND_RETRY_MS);
    return api.get<RenderJobState>(jobUrl(id)).catch(() => Promise.reject(error));
  }
}

/** İş bitene (ya da duraklayana) kadar durumunu sorar. Her yanıtta `onUpdate` çağrılır. */
export async function pollRenderJob(
  id: string,
  isCancelled: () => boolean,
  onUpdate: (job: RenderJobState) => void,
): Promise<RenderJobState> {
  for (;;) {
    if (isCancelled()) throw new PollCancelledError();
    const job = await fetchJob(id);
    onUpdate(job);
    if (job.status === "rendering") {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (job.status === "error") throw new Error(job.error ?? "Render başarısız.");
    return job;
  }
}

export const renderApi = {
  start: (props: StudioInputProps) => api.post<RenderJobState>("/api/render", props, "Render başlatılamadı."),
  revise: (body: { parentId: string; prompt: string; model: string | null; effort: string | null }) =>
    api.post<{ id?: string }>("/api/render", { revise: true, ...body }, "Düzeltme başlatılamadı."),
  pause: (id: string) => api.patch<RenderJobState>("/api/render", { id, action: "pause" }, "Duraklatılamadı."),
  resume: (id: string) => api.patch<RenderJobState>("/api/render", { id, action: "resume" }, "Devam ettirilemedi."),
  cancel: (id: string) => api.delete<RenderJobState>(jobUrl(id)),
  latest: () => api.get<RenderJobState>("/api/render?latest=1"),
};

/** Duraklatmalar düşülerek işin geçen süresi (ms). */
export function elapsedOf(job: RenderJobState, now: number): number {
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now;
  return Math.max(0, end - Date.parse(job.startedAt) - (job.pausedMs ?? 0));
}

const STATUS_LABELS: Record<RenderStatus, string> = {
  idle: "Hazır",
  rendering: "Ajan çalışıyor",
  paused: "Duraklatıldı",
  success: "Başarılı",
  error: "Hata",
  cancelled: "İptal edildi",
};

const STATUS_COLORS: Record<RenderStatus, string> = {
  idle: "gray",
  rendering: "yellow",
  paused: "yellow",
  success: "teal",
  error: "red",
  cancelled: "gray",
};

export const statusLabel = (status: RenderStatus) => STATUS_LABELS[status];
export const statusColor = (status: RenderStatus) => STATUS_COLORS[status];

/** Stüdyonun (bu sekmede) izleyeceği işi hatırlar; geçmiş sayfası da düzeltme başlatınca bunu kullanır. */
export const rememberRenderJob = (id: string) => writeStored(window.sessionStorage, STORAGE_KEYS.renderJob, id);
export const forgetRenderJob = () => removeStored(window.sessionStorage, STORAGE_KEYS.renderJob);
export const readRememberedRenderJob = () => readStored<string | null>(window.sessionStorage, STORAGE_KEYS.renderJob, null);
