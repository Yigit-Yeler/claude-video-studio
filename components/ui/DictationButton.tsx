"use client";

import { ActionIcon, Group, Loader, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMicrophone, IconPlayerStopFilled } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 300;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/**
 * Mikrofonla yazdırma: tıkla → konuş → tekrar tıkla. Kayıt bilgisayardaki Whisper ile yazıya dökülür
 * ve onText ile metin alanına eklenir. Token harcamaz.
 */
export function DictationButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function transcribe(blob: Blob) {
    setState("transcribing");
    try {
      const body = new FormData();
      body.append("audio", blob, "kayit.webm");
      body.append("language", "tr");
      const response = await fetch("/api/dictate", { method: "POST", body });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Ses yazıya dökülemedi.");
      if (payload.text) onText(payload.text);
      else notifications.show({ color: "yellow", title: "Ses anlaşılmadı", message: "Kayıtta konuşma bulunamadı, tekrar dene." });
    } catch (error) {
      notifications.show({ color: "red", title: "Yazıya dökülemedi", message: error instanceof Error ? error.message : "Hata" });
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
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void transcribe(blob);
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

  const label =
    state === "recording" ? "Kaydı bitir ve yazıya dök" : state === "transcribing" ? "Yazıya dökülüyor…" : "Konuşarak yaz";

  return (
    <Group gap={6} wrap="nowrap">
      <Tooltip label={label}>
        <ActionIcon
          size="lg"
          radius="xl"
          variant={state === "recording" ? "filled" : "light"}
          color={state === "recording" ? "red" : "violet"}
          aria-label={label}
          disabled={disabled || state === "transcribing"}
          onClick={() => (state === "recording" ? stop() : void start())}
        >
          {state === "transcribing" ? (
            <Loader size={16} />
          ) : state === "recording" ? (
            <IconPlayerStopFilled size={16} />
          ) : (
            <IconMicrophone size={18} />
          )}
        </ActionIcon>
      </Tooltip>
      <Text size="xs" c={state === "recording" ? "red" : "dimmed"}>
        {state === "recording"
          ? `Dinleniyor… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : state === "transcribing"
            ? "Yazıya dökülüyor…"
            : "Konuşarak yaz"}
      </Text>
    </Group>
  );
}

/** Mevcut metnin sonuna, araya boşluk koyarak ekler. */
export function appendDictation(current: string, text: string): string {
  const trimmed = current.replace(/\s+$/, "");
  return trimmed ? `${trimmed} ${text}` : text;
}
