import type { AgentUsage } from "./render-status";

const LOCALE = "tr-TR";

export const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

const shortDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "12 Kas 2026 14:05" */
export function formatDateTime(value: string | number | Date): string {
  return dateTimeFormat.format(new Date(value));
}

/** "12 Kas 14:05" */
export function formatShortDate(value: string | number | Date): string {
  return shortDateFormat.format(new Date(value));
}

/** "12.11.2026 14:05:31" */
export function formatTimestamp(value: string | number | Date): string {
  return new Date(value).toLocaleString(LOCALE);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Token sayısını kısaltır: 950 → "950", 12 400 → "12 B", 3 400 000 → "3,4 M". */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} B`;
  return String(value);
}

export function totalTokens(usage: AgentUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
}

/** Milisaniyeyi okunur süreye çevirir: "1 sa 4 dk", "3 dk 12 sn", "45 sn". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  if (minutes > 0) return `${minutes} dk ${seconds} sn`;
  return `${seconds} sn`;
}

/** İki zaman damgası arasındaki süre: "3 dk 12 sn". Bitmemişse null. */
export function formatDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000));
  return `${Math.floor(seconds / 60)} dk ${seconds % 60} sn`;
}

/** Saniyeyi zaman çizelgesi biçimine çevirir: 75.4 → "1:15.4". */
export function formatTimecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** "sources/klip.mp4" → "klip.mp4" */
export function fileName(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}
