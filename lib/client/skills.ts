import type { StyleSkillSpec } from "@/lib/style-skill";
import { api, sleep } from "./api";

export type SkillJob = {
  id: string;
  status: "analyzing" | "success" | "error";
  error: string | null;
  skill: StyleSkillSpec | null;
  modelName: string | null;
};

export type SkillRequest = { name: string; prompt: string; strict: boolean; videos: File[] };

const POLL_INTERVAL_MS = 2000;

/** Referans videoları yükleyip analiz işini başlatır, bitene kadar bekler ve sonucu döndürür. */
export async function generateSkill({ name, prompt, strict, videos }: SkillRequest): Promise<SkillJob> {
  const body = new FormData();
  body.set("name", name.trim());
  body.set("prompt", prompt);
  body.set("strict", String(strict));
  for (const video of videos) body.append("videos", video);
  const job = await api.post<SkillJob>("/api/skills/generate", body, "Analiz başlatılamadı.");
  return waitForSkill(job.id);
}

async function waitForSkill(id: string): Promise<SkillJob> {
  for (;;) {
    const job = await api.get<SkillJob>(`/api/skills/generate?id=${encodeURIComponent(id)}`, "Durum alınamadı.");
    if (job.status === "success") return job;
    if (job.status === "error") throw new Error(job.error ?? "Analiz başarısız.");
    await sleep(POLL_INTERVAL_MS);
  }
}
