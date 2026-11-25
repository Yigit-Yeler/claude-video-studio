"use client";

import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { errorMessage } from "@/lib/errors";

export type DictationState = "idle" | "recording" | "transcribing";

const MAX_SECONDS = 300;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

async function transcribe(blob: Blob): Promise<string> {
  const body = new FormData();
  body.append("audio", blob, "kayit.webm");
  body.append("language", "tr");
  const { text } = await api.post<{ text?: string }>("/api/dictate", body, "Ses yazıya dökülemedi.");
  return text ?? "";
}

/**
 * Mikrofondan kayıt alır, bitince bilgisayardaki Whisper ile yazıya döker ve `onText` ile verir.
 * En fazla 5 dakika kaydeder; sayfadan çıkılırsa mikrofon kapanır.
 */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function finish(blob: Blob) {
    setState("transcribing");
    try {
      const text = await transcribe(blob);
      if (text) onText(text);
      else notifications.show({ color: "yellow", title: "Ses anlaşılmadı", message: "Kayıtta konuşma bulunamadı, tekrar dene." });
    } catch (error) {
      notifications.show({ color: "red", title: "Yazıya dökülemedi", message: errorMessage(error, "Hata") });
    } finally {
      setState("idle");
    }
  }

  function stop() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      notifications.show({ color: "red", title: "Mikrofon yok", message: "Bu tarayıcı ses kaydını desteklemiyor. Chrome veya Edge kullan." });
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = media;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      rec.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void finish(blob);
        else setState("idle");
      };
      recorder.current = rec;
      rec.start(1000);
      setSeconds(0);
      setState("recording");
      const startedAt = Date.now();
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      notifications.show({
        color: "red",
        title: "Mikrofona erişilemedi",
        message: "Tarayıcıda mikrofon izni ver (adres çubuğundaki kilit simgesi → Mikrofon → İzin ver).",
      });
      setState("idle");
    }
  }

  const toggle = () => (state === "recording" ? stop() : void start());

  return { state, seconds, toggle };
}

/** Mevcut metnin sonuna, araya boşluk koyarak ekler. */
export function appendDictation(current: string, text: string): string {
  const trimmed = current.replace(/\s+$/, "");
  return trimmed ? `${trimmed} ${text}` : text;
}
