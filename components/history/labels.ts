import type { SfxMode } from "@/lib/studio";

export const EFFORT_LABELS: Record<string, string> = {
  auto: "Model varsayılanı",
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  xhigh: "Çok yüksek",
  max: "Maksimum",
};

export const SFX_LABELS: Record<SfxMode, string> = {
  library: "Ses kütüphanem",
  free: "Serbest",
  off: "Kapalı",
};
