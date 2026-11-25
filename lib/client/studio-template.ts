import type { StudioInputProps } from "@/lib/studio";
import { STORAGE_KEYS, readStored, removeStored, writeStored } from "./storage-keys";

/**
 * Geçmiş sayfasındaki "Bu ayarları stüdyoya yükle" butonu ayarları buraya bırakır;
 * stüdyo açılınca bir kez okur ve siler.
 */
export type StudioTemplate = { id: string; settings: StudioInputProps };

export function saveStudioTemplate(template: StudioTemplate): boolean {
  writeStored(window.localStorage, STORAGE_KEYS.loadTemplate, template);
  return readStored<StudioTemplate | null>(window.localStorage, STORAGE_KEYS.loadTemplate, null) !== null;
}

export function takeStudioTemplate(): StudioTemplate | null {
  const template = readStored<StudioTemplate | null>(window.localStorage, STORAGE_KEYS.loadTemplate, null);
  removeStored(window.localStorage, STORAGE_KEYS.loadTemplate);
  return template?.settings ? template : null;
}
