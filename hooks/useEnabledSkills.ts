"use client";

import { useLocalStorage, useMounted } from "@mantine/hooks";
import { useCallback } from "react";
import { STORAGE_KEYS } from "@/lib/client/storage-keys";
import type { SkillId } from "@/lib/studio";

type StoredFlags = Partial<Record<SkillId, boolean>>;

const NO_FLAGS: StoredFlags = {};

/** Yerleşik skill katmanlarından (metin, vignette) hangilerinin stüdyoda görüneceği. Varsayılan: hepsi açık. */
export function useEnabledSkills() {
  const [stored, setStored] = useLocalStorage<StoredFlags>({ key: STORAGE_KEYS.enabledSkills, defaultValue: NO_FLAGS });
  const ready = useMounted();

  const enabled: Record<SkillId, boolean> = {
    textOverlay: stored.textOverlay ?? true,
    vignette: stored.vignette ?? true,
  };

  const setSkillEnabled = useCallback(
    (id: SkillId, value: boolean) => setStored((current) => ({ ...current, [id]: value })),
    [setStored],
  );

  return { enabled, setSkillEnabled, ready };
}
