import type { MediaItem } from "@/lib/media-types";
import { api, withQuery } from "./api";

/** Dosya seçicilerinin kabul ettiği türler. */
export const ACCEPT = {
  video: "video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv",
  image: "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif",
  music: "audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg",
  sfx: "audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac",
} as const;

export type VideoKind = "sources" | "references";

/** Listeye öğeyi ekler (aynı yoldaki eskisinin yerine) ve ada göre sıralar. */
export function upsertMediaItem(list: MediaItem[], item: MediaItem): MediaItem[] {
  return [...list.filter((entry) => entry.relativePath !== item.relativePath), item].sort((a, b) =>
    a.name.localeCompare(b.name, "tr"),
  );
}

export function toSelectOptions(items: MediaItem[]) {
  return items.map((item) => ({ value: item.relativePath, label: item.name }));
}

type UploadResponse = { item?: MediaItem };

function requireItem(payload: UploadResponse, fallback: string): MediaItem {
  if (!payload.item) throw new Error(fallback);
  return payload.item;
}

export async function uploadVideo(kind: VideoKind, file: File): Promise<MediaItem> {
  const fallback = `${file.name} yüklenemedi.`;
  const payload = await api.post<UploadResponse>(withQuery("/api/media/videos", { kind, name: file.name }), file, fallback);
  return requireItem(payload, fallback);
}

async function uploadForm(url: string, file: File, fallback: string): Promise<MediaItem> {
  const body = new FormData();
  body.set("file", file);
  return requireItem(await api.post<UploadResponse>(url, body, fallback), fallback);
}

export const uploadMusic = (file: File) => uploadForm("/api/media/music", file, "Müzik yüklenemedi.");
export const uploadAsset = (file: File) => uploadForm("/api/media/assets", file, "Görsel yüklenemedi.");
