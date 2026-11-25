"use client";

import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PollCancelledError,
  elapsedOf,
  forgetRenderJob as forgetJob,
  pollRenderJob,
  readRememberedRenderJob,
  rememberRenderJob as rememberJob,
  renderApi,
  type RenderStatus,
} from "@/lib/client/render";
import { errorMessage } from "@/lib/errors";
import { formatElapsed } from "@/lib/format";
import type { RenderJobState } from "@/lib/render-status";
import type { StudioInputProps } from "@/lib/studio";

function notifyFinished(job: RenderJobState) {
  notifications.show({
    color: "teal",
    title: "Video hazır",
    message: `${formatElapsed(elapsedOf(job, Date.now()))} içinde hazırlandı${job.modelName ? ` · ${job.modelName}` : ""}.`,
    autoClose: 6000,
  });
}

/**
 * Stüdyonun render işi: başlatma, duraklatma, devam ettirme, durdurma ve canlı durum takibi.
 * Sayfa yenilense de süren iş bulunup izlenmeye devam edilir.
 */
export function useRenderJob() {
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [job, setJob] = useState<RenderJobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Her yeni izleme bir öncekini geçersiz kılar; eski döngü kendi kendine durur.
  const watchToken = useRef(0);

  const watch = useCallback((id: string) => {
    const token = ++watchToken.current;
    const isStale = () => watchToken.current !== token;
    let sawRendering = false;
    rememberJob(id);

    pollRenderJob(id, isStale, (update) => {
      if (isStale()) return;
      setJob(update);
      setError(null);
      if (update.status === "rendering") sawRendering = true;
      if (update.status === "rendering" || update.status === "paused" || update.status === "success") setStatus(update.status);
    })
      .then((finished) => {
        if (isStale()) return;
        setJob(finished);
        setStatus(finished.status);
        if (finished.status === "cancelled") forgetJob();
        else rememberJob(id);
        // Sayfa açıldığında zaten bitmiş bir işi bulduysak tekrar bildirim gösterme.
        if (finished.status === "success" && finished.outputUrl && sawRendering) notifyFinished(finished);
      })
      .catch((problem: unknown) => {
        if (isStale() || problem instanceof PollCancelledError) return;
        setStatus("error");
        setError(errorMessage(problem, "Render başarısız."));
        forgetJob();
      });
  }, []);

  // Sayfa açılınca bu sekmenin izlediği işi, yoksa sunucudaki son işi izlemeye başla.
  useEffect(() => {
    const savedId = readRememberedRenderJob();
    let ignore = false;
    if (savedId) watch(savedId);
    else
      renderApi
        .latest()
        .then((latest) => !ignore && latest.id && watch(latest.id))
        .catch(() => undefined);
    return () => {
      ignore = true;
      watchToken.current += 1;
    };
  }, [watch]);

  const start = useCallback(
    async (props: StudioInputProps) => {
      setError(null);
      setJob(null);
      try {
        const started = await renderApi.start(props);
        setJob(started);
        setStatus("rendering");
        watch(started.id);
      } catch (problem) {
        setStatus("error");
        setError(errorMessage(problem, "Render başarısız."));
        forgetJob();
      }
    },
    [watch],
  );

  const pause = useCallback(async () => {
    if (!job) return;
    try {
      const paused = await renderApi.pause(job.id);
      setJob(paused);
      setStatus("paused");
      rememberJob(paused.id);
    } catch (problem) {
      setError(errorMessage(problem, "Duraklatılamadı."));
    }
  }, [job]);

  const resume = useCallback(async () => {
    if (!job) return;
    setError(null);
    try {
      const resumed = await renderApi.resume(job.id);
      setJob(resumed);
      setStatus("rendering");
      watch(resumed.id);
    } catch (problem) {
      setError(errorMessage(problem, "Devam ettirilemedi."));
    }
  }, [job, watch]);

  const cancel = useCallback(async () => {
    if (!job) return;
    try {
      const cancelled = await renderApi.cancel(job.id);
      watchToken.current += 1;
      setJob(cancelled);
      setStatus("cancelled");
      forgetJob();
    } catch {
      // iş zaten bitmiş ya da silinmişse durum aynen kalır
    }
  }, [job]);

  return { status, job, error, start, pause, resume, cancel };
}
