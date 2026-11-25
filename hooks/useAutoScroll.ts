"use client";

import { useEffect, useRef } from "react";

/** Liste uzadıkça kaydırma alanını en alta indirir (canlı log gibi). Dönen ref, kaydırılan öğeye verilir. */
export function useAutoScroll<T extends HTMLElement>(itemCount: number) {
  const viewport = useRef<T>(null);

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [itemCount]);

  return viewport;
}
