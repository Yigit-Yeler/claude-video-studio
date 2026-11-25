export const TEXT_ANIMATIONS = ["fade-up", "pop", "slide", "typewriter"] as const;
export const TRANSITIONS = ["none", "flash", "dip", "zoom"] as const;
export const GRADES = ["neutral", "warm", "cool", "cinematic", "vhs"] as const;
export const MOTIONS = ["static", "slow-zoom", "drift", "shake"] as const;
export const SUBTITLE_POSITIONS = ["bottom", "center", "top"] as const;

export type TextAnimation = (typeof TEXT_ANIMATIONS)[number];
export type TransitionStyle = (typeof TRANSITIONS)[number];
export type GradeStyle = (typeof GRADES)[number];
export type MotionStyle = (typeof MOTIONS)[number];
export type SubtitlePosition = (typeof SUBTITLE_POSITIONS)[number];

export type StyleSkillSpec = {
  id: string;
  name: string;
  summary: string;
  analysis: string;
  guide?: string;
  strict?: boolean;
  outroSeconds?: number;
  /**
   * "music": video süresini müzik belirler; kaynaklar yalnızca malzemedir (kesilip kullanılır), ses yalnızca müziktir.
   * "cut": konuşma kaynağı kurgulanır (sessizlikler ve kötü çekimler atılır); süre kesimden sonra belirlenir.
   */
  timeline?: "music" | "cut";
  /** timeline "music" iken videonun en fazla süresi (sn). */
  maxSeconds?: number;
  /** Stüdyoda zaman çizelgesi editörünü açar: kullanıcı animasyon ve görsel aralıklarını işaretler. */
  timelineEditor?: boolean;
  style: {
    fontFamily: string;
    primaryText: string;
    accent: string;
    sampleText: string;
    textAnimation: TextAnimation;
    transition: TransitionStyle;
    grade: GradeStyle;
    motion: MotionStyle;
    subtitlePosition: SubtitlePosition;
  };
};

const FONT_STACKS = [
  "Arial, Helvetica, sans-serif",
  "Impact, Haettenschweiler, sans-serif",
  "Georgia, serif",
  '"Courier New", monospace',
  '"Segoe UI", sans-serif',
  '"Trebuchet MS", sans-serif',
];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function text(value: unknown, max: number, fallback: string): string {
  const cleaned = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (cleaned || fallback).slice(0, max);
}

export function parseStyleSkillSpec(value: unknown): StyleSkillSpec | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StyleSkillSpec>;
  const style = raw.style;
  if (!style || typeof style !== "object") return null;
  if (typeof raw.id !== "string" || !/^[a-z0-9-]{3,80}$/.test(raw.id)) return null;

  const fontFamily = FONT_STACKS.includes(style.fontFamily) ? style.fontFamily : FONT_STACKS[0];
  const guide = typeof raw.guide === "string" ? raw.guide.trim().slice(0, 30000) : "";
  const outro = Number(raw.outroSeconds);
  const maxSeconds = Number(raw.maxSeconds);

  return {
    id: raw.id,
    name: text(raw.name, 60, "Stil skill"),
    summary: text(raw.summary, 220, "Referans videolardan çıkarılan ortak tarz."),
    analysis: text(raw.analysis, 4000, "Ortak tarz notu yok."),
    ...(guide ? { guide } : {}),
    ...(raw.strict === true ? { strict: true } : {}),
    ...(Number.isFinite(outro) && outro > 0 ? { outroSeconds: Math.min(8, outro) } : {}),
    ...(raw.timeline === "music" || raw.timeline === "cut" ? { timeline: raw.timeline } : {}),
    ...(raw.timelineEditor === true ? { timelineEditor: true } : {}),
    ...(raw.timeline === "music" && Number.isFinite(maxSeconds) && maxSeconds > 0 ? { maxSeconds: Math.min(60, Math.max(5, maxSeconds)) } : {}),
    style: {
      fontFamily,
      primaryText: color(style.primaryText, "#f8fafc"),
      accent: color(style.accent, "#c4b5fd"),
      sampleText: text(style.sampleText, 80, "Örnek altyazı"),
      textAnimation: oneOf(style.textAnimation, TEXT_ANIMATIONS, "fade-up"),
      transition: oneOf(style.transition, TRANSITIONS, "none"),
      grade: oneOf(style.grade, GRADES, "neutral"),
      motion: oneOf(style.motion, MOTIONS, "static"),
      subtitlePosition: oneOf(style.subtitlePosition, SUBTITLE_POSITIONS, "bottom"),
    },
  };
}
