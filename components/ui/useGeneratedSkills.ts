"use client";

import { useCallback, useEffect, useState } from "react";
import type { StyleSkillSpec } from "@/lib/style-skill";

const STORAGE_KEY = "video-automation-generated-skills";

export function useGeneratedSkills() {
  const [skills, setSkills] = useState<StyleSkillSpec[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch("/api/skills");
    const payload = (await response.json()) as { skills?: StyleSkillSpec[] };
    const nextSkills = payload.skills ?? [];
    setSkills(nextSkills);
    let stored: Record<string, boolean> = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, boolean>;
    } catch {
      stored = {};
    }
    const nextEnabled: Record<string, boolean> = {};
    for (const skill of nextSkills) {
      nextEnabled[skill.id] = typeof stored[skill.id] === "boolean" ? stored[skill.id] : true;
    }
    setEnabled(nextEnabled);
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const setSkillEnabled = useCallback((id: string, value: boolean) => {
    setEnabled((current) => {
      const next = { ...current, [id]: value };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { skills, enabled, setSkillEnabled, ready, reload };
}
