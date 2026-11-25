import type { AssetRange, TimeRange } from "@/lib/studio";

export type TimelineClip = { path: string; url: string; duration: number };
export type TimelineAsset = { path: string; name: string; url: string };
export type Track = "animation" | "asset";
export type TrackRange = { track: Track; range: TimeRange | AssetRange };

export const MIN_LENGTH = 0.3;
export const DEFAULT_LENGTH = 2;
export const TRACK_HEIGHT = 44;
export const MAX_ZOOM = 30;
export const FALLBACK_WIDTH = 600;

export const TRACK_COLORS: Record<Track, { fill: string; border: string }> = {
  animation: { fill: "rgba(232,163,61,0.35)", border: "#E8A33D" },
  asset: { fill: "rgba(79,138,139,0.4)", border: "#4F8A8B" },
};

export const TRACK_LABELS: Record<Track, string> = { animation: "Animasyon", asset: "Görsel" };

export function newRangeId(): string {
  return `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Saniyeleri 2 ondalığa yuvarlar. */
export const roundTime = (value: number) => Math.round(value * 100) / 100;

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Cetveldeki etiketler arası saniye: yakınlaştıkça sıklaşır, etiketler en az ~70 px arayla durur. */
export function tickStep(pixelsPerSecond: number): number {
  return [0.5, 1, 2, 5, 10, 15, 30, 60].find((step) => step * pixelsPerSecond >= 70) ?? 120;
}

/** Her klibin, arka arkaya dizilmiş zaman çizelgesindeki başlangıç saniyesi. */
export function clipStarts(clips: TimelineClip[]): number[] {
  let offset = 0;
  return clips.map((clip) => {
    const start = offset;
    offset += clip.duration;
    return start;
  });
}

/** Çizelgedeki bir saniyenin hangi klipte ve o klibin kaçıncı saniyesinde olduğu. */
export function locateTime(clips: TimelineClip[], starts: number[], seconds: number): { index: number; local: number } {
  const found = clips.findIndex((clip, i) => seconds < starts[i] + clip.duration);
  const index = Math.max(0, found === -1 ? clips.length - 1 : found);
  return { index, local: Math.max(0, seconds - (starts[index] ?? 0)) };
}

/** Her iki şeritteki aralıklar, başlangıca göre sıralı. */
export function sortedRanges(animationRanges: TimeRange[], assetRanges: AssetRange[]): TrackRange[] {
  return [
    ...animationRanges.map((range) => ({ track: "animation" as const, range })),
    ...assetRanges.map((range) => ({ track: "asset" as const, range })),
  ].sort((a, b) => a.range.from - b.range.from);
}
