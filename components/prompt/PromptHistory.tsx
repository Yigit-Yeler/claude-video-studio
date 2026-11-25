"use client";

import { ActionIcon, Badge, Button, Group, Modal, Paper, ScrollArea, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconHistory, IconSearch, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { formatDateTime } from "@/lib/format";
import type { PromptEntry } from "@/lib/prompt-history";

type PromptsResponse = { prompts?: PromptEntry[] };

const matches = (entry: PromptEntry, term: string) => entry.text.toLocaleLowerCase("tr").includes(term);

/** "Önceki promptlar" butonu ve penceresi: daha önce kullanılan promptları arayıp tekrar kullanmayı sağlar. */
export function PromptHistory({ current, onSelect }: { current: string; onSelect: (text: string) => void }) {
  const [opened, setOpened] = useState(false);
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  async function open() {
    setOpened(true);
    setLoading(true);
    const payload = await api.get<PromptsResponse>("/api/prompts").catch((): PromptsResponse => ({}));
    setPrompts(payload.prompts ?? []);
    setLoading(false);
  }

  async function remove(id: string) {
    const payload = await api.delete<PromptsResponse>(`/api/prompts?id=${encodeURIComponent(id)}`).catch((): PromptsResponse => ({}));
    if (payload.prompts) setPrompts(payload.prompts);
  }

  function choose(text: string) {
    onSelect(text);
    setOpened(false);
    notifications.show({ color: "teal", title: "Prompt yüklendi", message: "Önceki prompt alana yazıldı; istersen düzenleyebilirsin.", autoClose: 3000 });
  }

  const term = query.trim().toLocaleLowerCase("tr");
  const visible = term ? prompts.filter((entry) => matches(entry, term)) : prompts;

  return (
    <>
      <Button size="xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => void open()}>
        Önceki promptlar
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Önceki promptlar" size="lg">
        <Stack gap="sm">
          <TextInput
            placeholder="Promptlarda ara"
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {!loading && visible.length === 0 ? (
            <Text size="sm" c="dimmed">
              {prompts.length === 0
                ? "Henüz kayıtlı prompt yok. Prompt yazıp video ürettiğinde burada görünecek."
                : "Aramaya uyan prompt yok."}
            </Text>
          ) : null}
          <ScrollArea.Autosize mah="60vh" type="auto">
            <Stack gap="xs">
              {visible.map((entry) => (
                <PromptCard
                  key={entry.id}
                  entry={entry}
                  active={entry.text.trim() === current.trim()}
                  onUse={() => choose(entry.text)}
                  onRemove={() => void remove(entry.id)}
                />
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>
    </>
  );
}

type PromptCardProps = { entry: PromptEntry; active: boolean; onUse: () => void; onRemove: () => void };

function PromptCard({ entry, active, onUse, onRemove }: PromptCardProps) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap={6}>
        <Group justify="space-between" gap="xs">
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              {formatDateTime(entry.lastUsedAt)}
            </Text>
            {entry.useCount > 1 ? (
              <Badge size="xs" variant="light">
                {entry.useCount} kez kullanıldı
              </Badge>
            ) : null}
            {active ? (
              <Badge size="xs" color="teal" variant="light">
                Şu an alanda
              </Badge>
            ) : null}
          </Group>
          <Group gap={4}>
            <Button size="compact-xs" onClick={onUse}>
              Kullan
            </Button>
            <Tooltip label="Geçmişten sil">
              <ActionIcon size="sm" variant="subtle" color="red" aria-label="Sil" onClick={onRemove}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }} lineClamp={6}>
          {entry.text}
        </Text>
      </Stack>
    </Paper>
  );
}
