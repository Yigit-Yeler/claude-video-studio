"use client";

import { useLocalStorage } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/lib/client/storage-keys";
import { takeStudioTemplate } from "@/lib/client/studio-template";
import type { MediaItem } from "@/lib/media-types";
import { omit } from "@/lib/object";
import type { StyleSkillSpec } from "@/lib/style-skill";
import { defaultInputProps, type SfxMode, type StudioInputProps } from "@/lib/studio";
import { useModelSelection } from "./useClaudeModels";
import { useEnabledSkills } from "./useEnabledSkills";
import { useGeneratedSkills } from "./useGeneratedSkills";
import { useVideoDurations } from "./useVideoDurations";

/**
 * Formda doğrudan düzenlenen ayarlar. Model, efor, ses efekti seçimi ve stil skill'leri
 * tarayıcıda hatırlandığı için ayrı tutulur ve `inputProps` içinde birleştirilir.
 */
const DERIVED_FIELDS = ["model", "effort", "sfxMode", "sfxSelection", "soundEffects", "styleSkills"] as const;
export type StudioForm = Omit<StudioInputProps, (typeof DERIVED_FIELDS)[number]>;

export type StudioFormPatch = Partial<StudioForm> | ((current: StudioForm) => Partial<StudioForm>);

type SfxChoice = { sfxMode?: SfxMode; sfxSelection?: string[] };

const SFX_MODES: SfxMode[] = ["library", "free", "off"];
const DEFAULT_SFX: SfxChoice = { sfxMode: defaultInputProps.sfxMode, sfxSelection: [] };
const NO_FLAGS: Record<string, boolean> = {};

const toForm = (props: StudioInputProps): StudioForm => omit(props, DERIVED_FIELDS);

/** Kayıtlı ses efekti seçimi bozuk ya da eskiyse varsayılana döner. */
function readSfx(choice: SfxChoice): { sfxMode: SfxMode; sfxSelection: string[] } {
  const sfxMode = choice.sfxMode && SFX_MODES.includes(choice.sfxMode) ? choice.sfxMode : defaultInputProps.sfxMode;
  const sfxSelection = sfxMode === "library" && Array.isArray(choice.sfxSelection) ? choice.sfxSelection : [];
  return { sfxMode, sfxSelection };
}

/** Model adı Claude Code'un tanıdığı bir değer mi (eski kayıtlarda başka değerler olabilir). */
const isClaudeModel = (model: string | null) => typeof model === "string" && (model.startsWith("claude-") || model === "default");

/**
 * Video Stüdyosu'nun tüm ayarları ve bunlardan üretilen, render'a gönderilecek `inputProps`.
 * Geçmiş sayfasından "Bu ayarları stüdyoya yükle" ile gelindiyse o ayarları da bir kez uygular.
 */
export function useStudioSettings(sources: MediaItem[]) {
  const [form, setForm] = useState<StudioForm>(() => toForm(defaultInputProps));
  const [storedSfx, setStoredSfx] = useLocalStorage<SfxChoice>({ key: STORAGE_KEYS.sfxChoice, defaultValue: DEFAULT_SFX });
  const [appliedStyles, setAppliedStyles] = useLocalStorage<Record<string, boolean>>({
    key: STORAGE_KEYS.appliedStyles,
    defaultValue: NO_FLAGS,
  });
  const builtIn = useEnabledSkills();
  const models = useModelSelection();
  const durations = useVideoDurations(sources);
  const sfx = useMemo(() => readSfx(storedSfx), [storedSfx]);

  /** Formu günceller. Önceki değere göre güncellemek için fonksiyon da verilebilir. */
  const update = useCallback(
    (patch: StudioFormPatch) => setForm((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) })),
    [],
  );

  function applyTemplate(skills: StyleSkillSpec[]) {
    const template = takeStudioTemplate();
    if (!template) return;
    const { settings } = template;
    const wanted = new Set(settings.styleSkills.map((skill) => skill.id));

    setForm((current) => ({ ...current, ...toForm(settings) }));
    models.pickForSession({ model: isClaudeModel(settings.model) ? settings.model : undefined, effort: settings.effort });
    setStoredSfx({ sfxMode: settings.sfxMode, sfxSelection: settings.sfxSelection });
    setAppliedStyles(Object.fromEntries(skills.map((skill) => [skill.id, wanted.has(skill.id)])));

    const missing = settings.styleSkills.filter((skill) => !skills.some((item) => item.id === skill.id));
    notifications.show({
      color: missing.length ? "yellow" : "teal",
      title: "Ayarlar yüklendi",
      message: missing.length
        ? `Geçmişteki ayarlar yüklendi. Artık bulunmayan skill: ${missing.map((skill) => skill.name).join(", ")}.`
        : "Geçmişteki videonun ayarları stüdyoya yüklendi. İstersen değiştirip yeni video üretebilirsin.",
      autoClose: 6000,
    });
  }

  const generated = useGeneratedSkills({ onLoaded: applyTemplate });

  const setSfx = useCallback(
    (sfxMode: SfxMode, sfxSelection: string[]) => setStoredSfx({ sfxMode, sfxSelection }),
    [setStoredSfx],
  );

  /** Bağlayıcı (strict) kılavuzlar birbiriyle çakışır: aynı anda yalnızca biri açık olur. */
  function setStyleApplied(skill: StyleSkillSpec, checked: boolean) {
    setAppliedStyles((current) => {
      const next = { ...current, [skill.id]: checked };
      if (checked && skill.strict) {
        for (const other of generated.skills) {
          if (other.id !== skill.id && other.strict) next[other.id] = false;
        }
      }
      return next;
    });
  }

  // İlk kaynak videonun süresi okununca çıktının süresi o olur.
  const firstDuration = form.sourceVideos[0] ? durations[form.sourceVideos[0]] : undefined;
  const durationInSeconds = firstDuration !== undefined && Number.isFinite(firstDuration) ? firstDuration : form.durationInSeconds;
  const totalSourceDuration = form.sourceVideos.reduce((sum, path) => sum + (Number.isFinite(durations[path]) ? durations[path] : 0), 0);

  const { visibleSkills } = generated;
  const { model, effort } = models;
  const inputProps = useMemo<StudioInputProps>(
    () => ({
      ...form,
      durationInSeconds,
      model,
      effort,
      sfxMode: sfx.sfxMode,
      sfxSelection: sfx.sfxSelection,
      soundEffects: sfx.sfxMode !== "off",
      skills: {
        textOverlay: builtIn.enabled.textOverlay && form.skills.textOverlay,
        vignette: builtIn.enabled.vignette && form.skills.vignette,
      },
      styleSkills: visibleSkills.filter((skill) => appliedStyles[skill.id] === true),
    }),
    [form, durationInSeconds, model, effort, sfx, builtIn.enabled.textOverlay, builtIn.enabled.vignette, visibleSkills, appliedStyles],
  );

  return {
    form,
    update,
    inputProps,
    durations,
    totalSourceDuration,
    models,
    builtIn,
    generated,
    appliedStyles,
    setStyleApplied,
    sfx,
    setSfx,
  };
}
