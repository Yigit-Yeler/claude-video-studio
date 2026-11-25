"use client";

import { useLocalStorage } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { STORAGE_KEYS } from "@/lib/client/storage-keys";
import { useQuery } from "./useQuery";

export type ModelOption = { id: string; label: string; description?: string; defaultEffort?: string };
export type EffortOption = { id: string; label: string; description: string };

type ModelsResponse = {
  models: ModelOption[];
  efforts?: EffortOption[];
  preferred: string | null;
  preferredEffort?: string;
  error?: string;
};

type ModelChoice = { model?: string | null; effort?: string | null };

const NO_CHOICE: ModelChoice = {};
const NO_MODELS: ModelOption[] = [];
const NO_EFFORTS: EffortOption[] = [];

/** Claude Code'un sunduğu modeller ve efor seviyeleri. Claude'a giriş yapılmamışsa `error` dolu gelir. */
export function useClaudeModels() {
  const query = useQuery<ModelsResponse>("/api/models", { fallbackError: "Model listesi alınamadı." });
  const models = query.data?.models ?? NO_MODELS;
  const error = query.error ?? (query.data && models.length === 0 ? (query.data.error ?? "Model listesi boş.") : null);

  return {
    models,
    efforts: query.data?.efforts ?? NO_EFFORTS,
    preferred: query.data?.preferred ?? null,
    preferredEffort: query.data?.preferredEffort,
    error,
    reload: query.refetch,
  };
}

/**
 * Seçili model ve efor. Kullanıcının son seçimi tarayıcıda hatırlanır; geçmişten yüklenen
 * ayarlar yalnızca bu oturum için seçilir. Listede olmayan bir değer seçiliyse önerilen kullanılır.
 */
export function useModelSelection() {
  const catalog = useClaudeModels();
  const [saved, setSaved] = useLocalStorage<ModelChoice>({ key: STORAGE_KEYS.modelChoice, defaultValue: NO_CHOICE });
  const [picked, setPicked] = useState<ModelChoice>(NO_CHOICE);

  const isModel = (id: string | null | undefined): id is string => Boolean(id) && catalog.models.some((item) => item.id === id);
  const isEffort = (id: string | null | undefined): id is string => Boolean(id) && catalog.efforts.some((item) => item.id === id);

  const model = [picked.model, saved.model].find(isModel) ?? catalog.preferred;
  const effort = [picked.effort, saved.effort].find(isEffort) ?? catalog.preferredEffort ?? "high";

  const choose = useCallback(
    (choice: ModelChoice) => {
      setPicked((current) => ({ ...current, ...choice }));
      setSaved((current) => ({ ...current, ...choice }));
    },
    [setSaved],
  );

  return {
    ...catalog,
    model,
    effort,
    selectedModel: catalog.models.find((item) => item.id === model),
    setModel: (value: string | null) => choose({ model: value }),
    setEffort: (value: string | null) => choose({ effort: value }),
    /** Kaydetmeden yalnızca bu oturum için seçer (geçmişten yüklenen ayarlar). */
    pickForSession: (choice: ModelChoice) => setPicked(choice),
  };
}
