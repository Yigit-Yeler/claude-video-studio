"use client";

import { useEffect, useState } from "react";
import type { MediaItem } from "@/lib/media-types";

function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Video süresi okunamadı."));
    video.src = url;
  });
}

/** Videoların süresini (sn) tarayıcıda metadata'dan okur. Okunamayanlar NaN olur. Her video bir kez okunur. */
export function useVideoDurations(videos: MediaItem[]): Record<string, number> {
  const [durations, setDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    const missing = videos.filter((item) => durations[item.relativePath] === undefined);
    if (missing.length === 0) return;
    let ignore = false;
    Promise.all(
      missing.map(async (item) => [item.relativePath, await readVideoDuration(item.url).catch(() => NaN)] as const),
    ).then((entries) => {
      if (!ignore) setDurations((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      ignore = true;
    };
  }, [durations, videos]);

  return durations;
}
