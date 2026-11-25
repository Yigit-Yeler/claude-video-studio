"use client";

import { useEffect, useRef, useState } from "react";

/** Ses dosyalarını tek tek dinletir: biri çalarken diğerine basılırsa öncekini durdurur. */
export function useAudioPreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  // Sayfadan çıkınca çalan ses durur.
  useEffect(() => () => audio.current?.pause(), []);

  function toggle(id: string, url: string) {
    audio.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    const element = new Audio(url);
    element.onended = () => setPlaying(null);
    audio.current = element;
    setPlaying(id);
    element.play().catch(() => setPlaying(null));
  }

  return { playing, toggle };
}
