import fs from "node:fs/promises";
import path from "node:path";
import type { MediaItem, MediaKind } from "./media-types";

export type { MediaItem, MediaKind } from "./media-types";

const EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".mkv"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const SFX_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export function mediaRoot(): string {
  return path.resolve(process.cwd(), "public", "media");
}

export function resolveMediaFile(relativePath: string): string {
  const root = mediaRoot();
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Geçersiz medya yolu.");
  }
  return absolute;
}

async function listKind(kind: MediaKind): Promise<MediaItem[]> {
  const dir = path.join(mediaRoot(), kind);
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items: MediaItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.has(extension)) continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    items.push({
      name: entry.name,
      relativePath: `${kind}/${entry.name}`,
      url: `/media/${kind}/${encodeURIComponent(entry.name)}`,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      kind,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function listMusic(): Promise<MediaItem[]> {
  const dir = path.join(mediaRoot(), "music");
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items: MediaItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    items.push({
      name: entry.name,
      relativePath: `music/${entry.name}`,
      url: `/media/music/${encodeURIComponent(entry.name)}`,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      kind: "music",
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function listAssets(): Promise<MediaItem[]> {
  const dir = path.join(mediaRoot(), "assets");
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items: MediaItem[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    items.push({
      name: entry.name,
      relativePath: `assets/${entry.name}`,
      url: `/media/assets/${encodeURIComponent(entry.name)}`,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      kind: "assets",
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export const SFX_ROOT_CATEGORY = "genel";

export function safeCategory(value: string): string {
  const slug = value
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || SFX_ROOT_CATEGORY;
}

/** Ses efekti kütüphanesi: public/media/sfx/<kategori>/<dosya> */
export async function listSfx(): Promise<{ items: MediaItem[]; categories: string[] }> {
  const root = path.join(mediaRoot(), "sfx");
  await fs.mkdir(root, { recursive: true });
  const items: MediaItem[] = [];
  const categories = new Set<string>([SFX_ROOT_CATEGORY]);

  async function collect(directory: string, category: string | null) {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (category === null) {
          categories.add(entry.name);
          await collect(path.join(directory, entry.name), entry.name);
        }
        continue;
      }
      if (!entry.isFile() || !SFX_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = await fs.stat(path.join(directory, entry.name));
      const relative = category ? `sfx/${category}/${entry.name}` : `sfx/${entry.name}`;
      items.push({
        name: entry.name,
        relativePath: relative,
        url: `/media/${relative.split("/").map(encodeURIComponent).join("/")}`,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        kind: "sfx",
        category: category ?? SFX_ROOT_CATEGORY,
      });
    }
  }

  await collect(root, null);
  items.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "", "tr") || a.name.localeCompare(b.name, "tr"));
  return { items, categories: [...categories].sort((a, b) => a.localeCompare(b, "tr")) };
}

export function safeSfxFilename(original: string): string {
  const extension = path.extname(original).toLowerCase();
  if (!SFX_EXTENSIONS.has(extension)) {
    throw new Error("Yalnızca wav, mp3, m4a, aac, ogg veya flac yükle.");
  }
  const base = path
    .basename(original, path.extname(original))
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "ses"}${extension}`;
}

export async function listMedia(): Promise<{
  sources: MediaItem[];
  references: MediaItem[];
  music: MediaItem[];
  assets: MediaItem[];
}> {
  const [sources, references, music, assets] = await Promise.all([
    listKind("sources"),
    listKind("references"),
    listMusic(),
    listAssets(),
  ]);
  return { sources, references, music, assets };
}

export function safeAudioFilename(original: string): string {
  const extension = path.extname(original).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error("Yalnızca mp3, wav, m4a, aac veya ogg yükle.");
  }
  const base = path
    .basename(original, path.extname(original))
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "muzik"}-${Date.now().toString(36)}${extension}`;
}

export function safeVideoFilename(original: string): string {
  const extension = path.extname(original).toLowerCase();
  if (!EXTENSIONS.has(extension)) {
    throw new Error("Yalnızca mp4, webm, mov veya mkv yükle.");
  }
  const base = path
    .basename(original, path.extname(original))
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "video"}-${Date.now().toString(36)}${extension}`;
}

export function safeImageFilename(original: string): string {
  const extension = path.extname(original).toLowerCase() === ".jpeg" ? ".jpg" : path.extname(original).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension) && extension !== ".jpg") {
    throw new Error("Yalnızca png, jpg, webp veya gif yükle.");
  }
  const base = path
    .basename(original, path.extname(original))
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "gorsel"}-${Date.now().toString(36)}${extension === ".jpeg" ? ".jpg" : extension}`;
}

/** Yüklenen dosyayı `public/media/<klasör>/<ad>` olarak kaydeder (klasör yoksa oluşturur). */
export async function saveMediaFile(folder: string, filename: string, file: File): Promise<void> {
  const directory = path.join(mediaRoot(), folder);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
}
