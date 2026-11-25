import type { SkillId } from "./studio";

export type SkillDefinition = {
  id: SkillId;
  name: string;
  summary: string;
  layer: string;
  component: string;
};

export const skillCatalog: SkillDefinition[] = [
  {
    id: "vignette",
    name: "Vignette Filtresi",
    summary: "Kenarları karartan radyal bir renk katmanı ekler. Metnin altında durur.",
    layer: "Renk katmanı",
    component: "remotion/skills/VignetteFilter.tsx",
  },
  {
    id: "textOverlay",
    name: "Metin Katmanı",
    summary: "Kısa bir metni alt ortaya yerleştirir ve girişte yumuşakça belirir.",
    layer: "Ön plan",
    component: "remotion/skills/TextOverlay.tsx",
  },
];

export const ENABLED_SKILLS_KEY = "video-automation-enabled-skills";

export function defaultEnabledSkills(): Record<SkillId, boolean> {
  return { textOverlay: true, vignette: true };
}
