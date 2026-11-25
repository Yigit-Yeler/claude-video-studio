"use client";

import { useLocalStorage } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "@/lib/client/storage-keys";
import type { StyleSkillSpec } from "@/lib/style-skill";
import { useQuery } from "./useQuery";

const NO_SKILLS: StyleSkillSpec[] = [];
const NO_FLAGS: Record<string, boolean> = {};

/**
 * Kullanıcının oluşturduğu stil skill'leri ve hangilerinin stüdyoda gösterileceği.
 * Yeni bir skill varsayılan olarak görünür; kapatılanlar tarayıcıda hatırlanır.
 */
export function useGeneratedSkills({ onLoaded }: { onLoaded?: (skills: StyleSkillSpec[]) => void } = {}) {
  const query = useQuery<{ skills?: StyleSkillSpec[] }>("/api/skills", {
    fallbackError: "Skiller okunamadı.",
    onSuccess: (payload) => onLoaded?.(payload.skills ?? []),
  });
  const [flags, setFlags] = useLocalStorage<Record<string, boolean>>({
    key: STORAGE_KEYS.generatedSkills,
    defaultValue: NO_FLAGS,
  });

  const skills = query.data?.skills ?? NO_SKILLS;
  const isEnabled = useCallback((id: string) => flags[id] !== false, [flags]);
  const visibleSkills = useMemo(() => skills.filter((skill) => isEnabled(skill.id)), [skills, isEnabled]);
  const setSkillEnabled = useCallback(
    (id: string, value: boolean) => setFlags((current) => ({ ...current, [id]: value })),
    [setFlags],
  );

  return {
    skills,
    /** Stüdyoda görünen skill'ler. */
    visibleSkills,
    isEnabled,
    setSkillEnabled,
    ready: query.data !== undefined || query.error !== null,
  };
}
