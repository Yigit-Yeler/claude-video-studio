"use client";

import { Group, Stack, Textarea } from "@mantine/core";
import { DictationButton } from "@/components/prompt/DictationButton";
import { PromptHistory } from "@/components/prompt/PromptHistory";
import { appendDictation } from "@/hooks/useDictation";

const PLACEHOLDER =
  'Örn: Arada tam ekran animasyon, arada bölünmüş ekran olsun. Krem/turuncu Claude tarzı tasarım. Script: "Claude Opus 5.5 ile bu videoyu sadece kodla editledim..."';

/** Ajana verilecek istek: yazarak, konuşarak ya da önceki promptlardan seçerek. */
export function PromptField({ value, onChange }: { value: string; onChange: (value: string | ((current: string) => string)) => void }) {
  return (
    <Stack gap={0}>
      <Textarea
        label="Ajana ne istediğini anlat"
        description="Stil skill'i seçtiysen isteğe bağlı. Tarz, tempo, vurgulanacak yerler ve konuşmanın doğru metni (script). Script verirsen altyazılar buna göre düzeltilir."
        placeholder={PLACEHOLDER}
        autosize
        minRows={4}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <Group justify="space-between" mt={8}>
        <DictationButton onText={(text) => onChange((current) => appendDictation(current, text))} />
        <PromptHistory current={value} onSelect={onChange} />
      </Group>
    </Stack>
  );
}
