"use client";

import { ActionIcon, Group, Loader, Text, Tooltip } from "@mantine/core";
import { IconMicrophone, IconPlayerStopFilled } from "@tabler/icons-react";
import { useDictation, type DictationState } from "@/hooks/useDictation";

const LABELS: Record<DictationState, string> = {
  idle: "Konuşarak yaz",
  recording: "Kaydı bitir ve yazıya dök",
  transcribing: "Yazıya dökülüyor…",
};

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Mikrofonla yazdırma: tıkla → konuş → tekrar tıkla. Kayıt bilgisayardaki Whisper ile yazıya dökülür
 * ve `onText` ile metin alanına eklenir. Token harcamaz.
 */
export function DictationButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const { state, seconds, toggle } = useDictation(onText);
  const recording = state === "recording";

  return (
    <Group gap={6} wrap="nowrap">
      <Tooltip label={LABELS[state]}>
        <ActionIcon
          size="lg"
          radius="xl"
          variant={recording ? "filled" : "light"}
          color={recording ? "red" : "violet"}
          aria-label={LABELS[state]}
          disabled={disabled || state === "transcribing"}
          onClick={toggle}
        >
          {state === "transcribing" ? <Loader size={16} /> : recording ? <IconPlayerStopFilled size={16} /> : <IconMicrophone size={18} />}
        </ActionIcon>
      </Tooltip>
      <Text size="xs" c={recording ? "red" : "dimmed"}>
        {recording ? `Dinleniyor… ${formatClock(seconds)}` : state === "transcribing" ? "Yazıya dökülüyor…" : "Konuşarak yaz"}
      </Text>
    </Group>
  );
}
