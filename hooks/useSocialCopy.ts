"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, sleep, withQuery } from "@/lib/client/api";
import { errorMessage } from "@/lib/errors";
import type { SocialJobState, SocialRecord, SocialSource } from "@/lib/social-copy";
import { useQuery } from "./useQuery";

const POLL_INTERVAL_MS = 2000;

function recordUrl(source: SocialSource): string {
  return withQuery("/api/social", { kind: source.kind, ref: source.kind === "history" ? source.id : source.path });
}

/** O video için daha önce üretilmiş metin; hiç üretilmemişse null. */
async function fetchSavedRecord(url: string): Promise<SocialRecord | null> {
  try {
    return await api.get<SocialRecord>(url);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Seçilen video için paylaşım metinleri: kayıtlı sonucu getirir, yeni üretimi başlatır ve bitene kadar izler.
 * Kayıtlı sonuç gelince o üretimde yazılan not da forma geri yüklenir.
 */
export function useSocialCopy(source: SocialSource | null) {
  const [notes, setNotes] = useState("");
  const [job, setJob] = useState<SocialJobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchToken = useRef(0);

  const saved = useQuery<SocialRecord | null>(source ? recordUrl(source) : null, {
    fetcher: fetchSavedRecord,
    onSuccess: (record) => {
      if (record) setNotes(record.notes);
    },
  });

  const setSavedRecord = saved.setData;

  // Sayfadan çıkınca izleme döngüsü durur.
  useEffect(() => () => void (watchToken.current += 1), []);

  const watch = useCallback(
    async (id: string) => {
      const token = ++watchToken.current;
      while (token === watchToken.current) {
        await sleep(POLL_INTERVAL_MS);
        const next = await api.get<SocialJobState>(`/api/social?id=${encodeURIComponent(id)}`).catch(() => null);
        if (!next || token !== watchToken.current) continue;
        setJob(next);
        if (next.status === "success") {
          setSavedRecord(() => next.record);
          return;
        }
        if (next.status === "error") {
          setError(next.error ?? "Metinler üretilemedi.");
          return;
        }
      }
    },
    [setSavedRecord],
  );

  async function generate() {
    if (!source) return;
    setError(null);
    try {
      const started = await api.post<SocialJobState>("/api/social", { source, notes }, "Başlatılamadı.");
      setJob(started);
      void watch(started.id);
    } catch (problem) {
      setError(errorMessage(problem, "Başlatılamadı."));
    }
  }

  return {
    notes,
    setNotes,
    result: saved.data ?? null,
    job,
    running: job?.status === "running",
    error,
    generate,
  };
}
