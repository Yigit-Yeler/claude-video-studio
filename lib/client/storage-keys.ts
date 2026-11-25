/**
 * Tarayıcı depolamasında kullanılan anahtarlar. Hepsi tek yerde durur ki
 * iki sayfa aynı veriyi okurken anahtar adı kaymasın.
 */
export const STORAGE_KEYS = {
  /** sessionStorage: stüdyonun izlediği render işi. */
  renderJob: "video-automation-render-job",
  /** Geçmiş sayfasından stüdyoya taşınan ayarlar (bir kez okunup silinir). */
  loadTemplate: "video-automation:load-template",
  modelChoice: "video-automation:model-choice",
  sfxChoice: "video-automation:sfx-choice",
  appliedStyles: "video-automation:applied-styles",
  enabledSkills: "video-automation-enabled-skills",
  generatedSkills: "video-automation-generated-skills",
  infoCard: (id: string) => `video-automation:info-card:${id}`,
} as const;

/** JSON değerini okur; depolama kapalıysa ya da değer bozuksa `fallback` döner. */
export function readStored<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** JSON değerini yazar; depolama kapalıysa sessizce geçer (seçim yalnızca bu oturumda kalır). */
export function writeStored(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // depolama kapalı ya da dolu
  }
}

export function removeStored(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // depolama kapalı
  }
}
