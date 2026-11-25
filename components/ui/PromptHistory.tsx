"use client";

import { ActionIcon, Badge, Button, Group, Modal, Paper, ScrollArea, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconHistory, IconSearch, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { PromptEntry } from "@/lib/prompt-history";

const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

export function PromptHistory({ current, onSelect }: { current: string; onSelect: (text: string) => void }) {
  const [opened, setOpened] = useState(false);
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  async function open() {
    setOpened(true);
    setLoading(true);
    try {
      const payload = (await fetch("/api/prompts").then((response) => response.json())) as { prompts?: PromptEntry[] };
      setPrompts(payload.prompts ?? []);
    } catch {
      setPrompts([]);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/prompts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = (await response.json()) as { prompts?: PromptEntry[] };
    if (payload.prompts) setPrompts(payload.prompts);
  }

  function choose(text: string) {
    onSelect(text);
    setOpened(false);
    notifications.show({ color: "teal", title: "Prompt yüklendi", message: "Önceki prompt alana yazıldı; istersen düzenleyebilirsin.", autoClose: 3000 });
  }

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr");
    return term ? prompts.filter((entry) => entry.text.toLocaleLowerCase("tr").includes(term)) : prompts;
  }, [prompts, query]);

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
              {visible.map((entry) => {
                const active = entry.text.trim() === current.trim();
                return (
                  <Paper key={entry.id} withBorder p="sm" radius="md">
                    <Stack gap={6}>
                      <Group justify="space-between" gap="xs">
                        <Group gap={6}>
                          <Text size="xs" c="dimmed">
                            {dateFormat.format(new Date(entry.lastUsedAt))}
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
                          <Button size="compact-xs" onClick={() => choose(entry.text)}>
                            Kullan
                          </Button>
                          <Tooltip label="Geçmişten sil">
                            <ActionIcon size="sm" variant="subtle" color="red" aria-label="Sil" onClick={() => void remove(entry.id)}>
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
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>
    </>
  );
}
