"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { api } from "@/lib/client/api";
import { errorMessage } from "@/lib/errors";

type QueryResult<T> = { key: string; data?: T; error?: string };

type QueryOptions<T> = {
  /** Sunucu mesaj vermezse gösterilecek hata. */
  fallbackError?: string;
  /** Varsayılan: `api.get(key)`. Özel bir istek gerekiyorsa verilir. */
  fetcher?: (key: string) => Promise<T>;
  onSuccess?: (data: T) => void;
};

/**
 * Bileşenler veriyi `useEffect` yazmadan bu hook ile çeker. `key` değişince (ya da `refetch` çağrılınca)
 * yeniden ister; `key` null ise hiçbir şey istemez. Yeni istek sürerken önceki veri ekranda kalır.
 */
export function useQuery<T>(key: string | null, { fallbackError = "Veri alınamadı.", fetcher, onSuccess }: QueryOptions<T> = {}) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<QueryResult<T> | null>(null);
  const requestKey = key === null ? null : `${key}#${version}`;

  const load = useEffectEvent((url: string) => (fetcher ? fetcher(url) : api.get<T>(url, fallbackError)));
  const handleSuccess = useEffectEvent((data: T) => onSuccess?.(data));

  useEffect(() => {
    if (key === null || requestKey === null) return;
    let ignore = false;
    load(key).then(
      (data) => {
        if (ignore) return;
        setResult({ key: requestKey, data });
        handleSuccess(data);
      },
      (error: unknown) => {
        if (!ignore) setResult((current) => ({ key: requestKey, data: current?.data, error: errorMessage(error, fallbackError) }));
      },
    );
    return () => {
      ignore = true;
    };
  }, [key, requestKey, fallbackError]);

  const refetch = useCallback(() => setVersion((current) => current + 1), []);

  /** Sunucuya gitmeden veriyi yerelde günceller (ör. yükleme sonrası listeye ekleme). */
  const setData = useCallback(
    (update: (current: T | undefined) => T) =>
      setResult((current) => ({ key: current?.key ?? "", data: update(current?.data) })),
    [],
  );

  return {
    data: result?.data,
    error: result?.key === requestKey ? (result?.error ?? null) : null,
    loading: requestKey !== null && result?.key !== requestKey,
    refetch,
    setData,
  };
}
