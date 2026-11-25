"use client";

import { useCallback, useEffect, useState } from "react";
import { ENABLED_SKILLS_KEY, defaultEnabledSkills } from "@/lib/skills";
import type { SkillId } from "@/lib/studio";

export function useEnabledSkills() {
  const [enabled, setEnabled] = useState<Record<SkillId, boolean>>(defaultEnabledSkills);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(ENABLED_SKILLS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Record<SkillId, boolean>>;
          setEnabled({
            textOverlay: parsed.textOverlay ?? true,
            vignette: parsed.vignette ?? true,
          });
        }
      } catch {
        setEnabled(defaultEnabledSkills());
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setSkillEnabled = useCallback((id: SkillId, value: boolean) => {
    setEnabled((current) => {
      const next = { ...current, [id]: value };
      window.localStorage.setItem(ENABLED_SKILLS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { enabled, setSkillEnabled, ready };
}
