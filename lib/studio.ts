import type { StyleSkillSpec } from "./style-skill";
import { parseStyleSkillSpec } from "./style-skill";

export const FPS_OPTIONS = [24, 30, 60] as const;
export type FpsOption = (typeof FPS_OPTIONS)[number];

export const RESOLUTION_PRESETS = [
  { id: "720x1280", label: "720×1280", width: 720, height: 1280 },
  { id: "1080x1920", label: "1080×1920", width: 1080, height: 1920 },
  { id: "1440x2560", label: "1440×2560", width: 1440, height: 2560 },
] as const;

export type ResolutionId = (typeof RESOLUTION_PRESETS)[number]["id"];

export const QUALITY_PRESETS = [
  { id: "draft", label: "Taslak", description: "Hızlı, daha küçük dosya", crf: 28 },
  { id: "standard", label: "Dengeli", description: "Günlük üretim", crf: 23 },
  { id: "high", label: "Yüksek", description: "Daha az sıkıştırma", crf: 18 },
  { id: "max", label: "Maksimum", description: "En yüksek kalite", crf: 12 },
] as const;

export type QualityId = (typeof QUALITY_PRESETS)[number]["id"];

export const COMPOSITION = {
  id: "VideoStudio",
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

export type SkillId = "textOverlay" | "vignette";

/** Zaman çizelgesinde işaretlenen aralık. Saniyeler, kaynak videoların arka arkaya dizildiği zamandır. */
export type TimeRange = { id: string; from: number; to: number; note: string };
/** Bir görselin gösterilebileceği aralık. */
export type AssetRange = TimeRange & { asset: string };

export type StudioInputProps = {
  sourceVideos: string[];
  referenceVideos: string[];
  durationInSeconds: number;
  resolutionId: ResolutionId;
  width: number;
  height: number;
  fps: FpsOption;
  qualityId: QualityId;
  crf: number;
  cover: boolean;
  skills: Record<SkillId, boolean>;
  textOverlay: {
    text: string;
    fontSize: number;
  };
  vignette: {
    intensity: number;
  };
  styleSkills: StyleSkillSpec[];
  backgroundMusic: string | null;
  musicVolume: number;
  /** sfxMode'dan türetilir: "off" dışında true. */
  soundEffects: boolean;
  /** library: ses kütüphanemi kullan · free: kütüphane yok, ajan serbest · off: ses efekti yok */
  sfxMode: SfxMode;
  /** library modunda özellikle istenen sesler (sfx/<kategori>/<dosya>). Boşsa ajan kütüphaneden kendisi seçer. */
  sfxSelection: string[];
  prompt: string;
  assetImages: string[];
  /** Kullanıcının animasyon istediği aralıklar (zaman çizelgesi editörü). */
  animationRanges: TimeRange[];
  /** Görsellerin gösterileceği aralıklar (zaman çizelgesi editörü). */
  assetRanges: AssetRange[];
  model: string | null;
  /** Claude Code efor seviyesi: auto | low | medium | high | xhigh | max */
  effort: string | null;
};

export type SfxMode = "library" | "free" | "off";

export const defaultInputProps: StudioInputProps = {
  sourceVideos: [],
  referenceVideos: [],
  durationInSeconds: 10,
  resolutionId: "1080x1920",
  width: 1080,
  height: 1920,
  fps: 30,
  qualityId: "standard",
  crf: 23,
  cover: true,
  skills: {
    textOverlay: true,
    vignette: true,
  },
  textOverlay: {
    text: "Video Stüdyosu",
    fontSize: 72,
  },
  vignette: {
    intensity: 0.72,
  },
  styleSkills: [],
  backgroundMusic: null,
  musicVolume: 0.35,
  soundEffects: true,
  sfxMode: "library",
  sfxSelection: [],
  prompt: "",
  assetImages: [],
  animationRanges: [],
  assetRanges: [],
  model: null,
  effort: null,
};

const MEDIA_PATH = /^(sources|references)\/[^/\\]+\.(mp4|webm|mov|mkv)$/i;
const MUSIC_PATH = /^music\/[^/\\]+\.(mp3|wav|m4a|aac|ogg)$/i;
const SFX_PATH = /^sfx\/([^/\\]+\/)?[^/\\]+\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const ASSET_PATH = /^assets\/[^/\\]+\.(png|jpe?g|webp|gif)$/i;
export const MAX_SOURCE_SECONDS = 600;
// Kaynak ve referans videoların ayrı ayrı en fazla sayısı.
export const MAX_VIDEOS = 30;
export const MAX_ASSET_IMAGES = 30;

export function durationInFrames(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readVideoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.includes("..") || !MEDIA_PATH.test(item)) {
      throw new Error("Geçersiz medya yolu.");
    }
    if (!paths.includes(item)) paths.push(item);
  }
  return paths.slice(0, MAX_VIDEOS);
}

function readMusicPath(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.includes("..") || !MUSIC_PATH.test(value)) {
    throw new Error("Geçersiz müzik yolu.");
  }
  return value;
}

function readAssetImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && !item.includes("..") && ASSET_PATH.test(item))
    .slice(0, MAX_ASSET_IMAGES);
}

const MAX_RANGES = 40;

function readRange(item: unknown): TimeRange | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<TimeRange>;
  const from = clamp(Number(raw.from), 0, MAX_SOURCE_SECONDS);
  const to = clamp(Number(raw.to), 0, MAX_SOURCE_SECONDS);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 0.1) return null;
  const id = typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : `r${Math.round(from * 1000)}`;
  const note = typeof raw.note === "string" ? raw.note.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return { id, from: Math.round(from * 100) / 100, to: Math.round(to * 100) / 100, note };
}

function readAnimationRanges(value: unknown): TimeRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readRange)
    .filter((item): item is TimeRange => item !== null)
    .sort((a, b) => a.from - b.from)
    .slice(0, MAX_RANGES);
}

function readAssetRanges(value: unknown, assets: string[]): AssetRange[] {
  if (!Array.isArray(value)) return [];
  const ranges: AssetRange[] = [];
  for (const item of value) {
    const range = readRange(item);
    const asset = (item as Partial<AssetRange> | null)?.asset;
    if (range && typeof asset === "string" && assets.includes(asset)) ranges.push({ ...range, asset });
  }
  return ranges.sort((a, b) => a.from - b.from).slice(0, MAX_RANGES);
}

function readPrompt(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 4000) : "";
}

function readModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[\w.:-]{1,80}$/.test(id) ? id : null;
}

const EFFORTS = new Set(["auto", "low", "medium", "high", "xhigh", "max"]);

function readEffort(value: unknown): string | null {
  return typeof value === "string" && EFFORTS.has(value) ? value : null;
}

function readSfxMode(value: unknown, legacy: unknown): SfxMode {
  if (value === "library" || value === "free" || value === "off") return value;
  return legacy === false ? "off" : "library";
}

function readSfxSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths = value.filter(
    (item): item is string => typeof item === "string" && !item.includes("..") && SFX_PATH.test(item),
  );
  return [...new Set(paths)].slice(0, 40);
}

function readVolume(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultInputProps.musicVolume;
  return clamp(number, 0, 1);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readResolution(value: unknown): (typeof RESOLUTION_PRESETS)[number] {
  const preset = RESOLUTION_PRESETS.find((item) => item.id === value);
  return preset ?? RESOLUTION_PRESETS[1];
}

function readFps(value: unknown): FpsOption {
  return FPS_OPTIONS.find((item) => item === value) ?? 30;
}

function readQuality(value: unknown): (typeof QUALITY_PRESETS)[number] {
  const preset = QUALITY_PRESETS.find((item) => item.id === value);
  return preset ?? QUALITY_PRESETS[1];
}

export function parseStudioInput(value: unknown): StudioInputProps {
  if (!value || typeof value !== "object") {
    throw new Error("Geçersiz konfigürasyon.");
  }

  const raw = value as Partial<StudioInputProps>;
  const skills = raw.skills ?? defaultInputProps.skills;
  const textOverlay = raw.textOverlay ?? defaultInputProps.textOverlay;
  const vignette = raw.vignette ?? defaultInputProps.vignette;
  const resolution = readResolution(raw.resolutionId);
  const quality = readQuality(raw.qualityId);
  const duration = Number(raw.durationInSeconds);

  const assetImages = readAssetImages(raw.assetImages);
  const styleSkills = Array.isArray(raw.styleSkills)
    ? raw.styleSkills
        .map((item) => parseStyleSkillSpec(item))
        .filter((item): item is StyleSkillSpec => item !== null)
        .slice(0, 6)
    : [];

  return {
    sourceVideos: readVideoPaths(raw.sourceVideos),
    referenceVideos: readVideoPaths(raw.referenceVideos),
    durationInSeconds: Number.isFinite(duration)
      ? clamp(duration, 1, MAX_SOURCE_SECONDS)
      : defaultInputProps.durationInSeconds,
    resolutionId: resolution.id,
    width: resolution.width,
    height: resolution.height,
    fps: readFps(raw.fps),
    qualityId: quality.id,
    crf: quality.crf,
    cover: readBoolean(raw.cover, true),
    skills: {
      textOverlay: readBoolean(skills.textOverlay, false),
      vignette: readBoolean(skills.vignette, false),
    },
    textOverlay: {
      text: String(textOverlay.text ?? "").trim().slice(0, 180) || " ",
      fontSize: clamp(Number(textOverlay.fontSize) || 72, 32, 140),
    },
    vignette: {
      intensity: clamp(Number(vignette.intensity) || 0, 0, 1),
    },
    styleSkills,
    backgroundMusic: readMusicPath(raw.backgroundMusic),
    musicVolume: readVolume(raw.musicVolume),
    soundEffects: readSfxMode(raw.sfxMode, raw.soundEffects) !== "off",
    sfxMode: readSfxMode(raw.sfxMode, raw.soundEffects),
    sfxSelection: readSfxMode(raw.sfxMode, raw.soundEffects) === "library" ? readSfxSelection(raw.sfxSelection) : [],
    prompt: readPrompt(raw.prompt),
    assetImages,
    animationRanges: readAnimationRanges(raw.animationRanges),
    assetRanges: readAssetRanges(raw.assetRanges, assetImages),
    model: readModel(raw.model),
    effort: readEffort(raw.effort),
  };
}
