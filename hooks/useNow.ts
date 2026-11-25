"use client";

import { useEffect, useState } from "react";

/** Şu anki zaman; `ticking` açıkken her saniye yenilenir (geçen süre sayaçları için). */
export function useNow(ticking: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [ticking, intervalMs]);

  return now;
}
