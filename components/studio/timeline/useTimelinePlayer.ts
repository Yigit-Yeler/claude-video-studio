"use client";

import { useRef, useState } from "react";
import { clipStarts, locateTime, type TimelineClip } from "./timeline-utils";

/**
 * Arka arkaya dizilmiş kaynak videoları tek bir oynatıcıda oynatır. `time`, tüm çizelgedeki saniyedir;
 * oynatma bir klibin sonuna gelince sıradakine geçer. Oynatırken her ilerlemede `onPlaybackTime` çağrılır.
 */
export function useTimelinePlayer(clips: TimelineClip[], onPlaybackTime?: (seconds: number) => void) {
  const video = useRef<HTMLVideoElement | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Kaynak listesi değişince ilk klibe dönülür (render sırasında ayarlanır, effect gerekmez).
  const clipKey = clips.map((clip) => clip.url).join("|");
  const [cursor, setCursor] = useState({ clipKey, index: 0 });
  if (cursor.clipKey !== clipKey) setCursor({ clipKey, index: 0 });
  const clipIndex = cursor.clipKey === clipKey ? cursor.index : 0;

  const starts = clipStarts(clips);
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);

  function seek(seconds: number) {
    const target = Math.min(Math.max(0, seconds), Math.max(0, total - 0.01));
    setTime(target);
    const element = video.current;
    if (!element || clips.length === 0) return;
    const { index, local } = locateTime(clips, starts, target);
    if (index !== clipIndex) {
      // Klip değişiyor: yeni video yüklenince (onLoadedMetadata) bu saniyeye gidilir.
      pendingSeek.current = local;
      setCursor({ clipKey, index });
    } else {
      element.currentTime = local;
    }
  }

  function togglePlay() {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      setPlaying(true);
      element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
      setPlaying(false);
    }
  }

  function pause() {
    const element = video.current;
    if (element && !element.paused) element.pause();
  }

  const videoProps = {
    ref: video,
    src: clips[clipIndex]?.url,
    playsInline: true,
    onTimeUpdate: () => {
      const element = video.current;
      if (!element) return;
      const seconds = (starts[clipIndex] ?? 0) + element.currentTime;
      setTime(seconds);
      if (playing) onPlaybackTime?.(seconds);
    },
    onLoadedMetadata: () => {
      const element = video.current;
      if (!element) return;
      if (pendingSeek.current !== null) {
        element.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
      if (playing) element.play().catch(() => setPlaying(false));
    },
    onEnded: () => {
      const next = clipIndex + 1;
      if (next < clips.length) seek(starts[next]);
      else setPlaying(false);
    },
    onPause: () => setPlaying(false),
  };

  return { time, total, starts, playing, seek, togglePlay, pause, videoProps };
}
