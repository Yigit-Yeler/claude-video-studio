"use client";

import { ActionIcon, Autocomplete, Badge, Button, Checkbox, Group, Paper, ScrollArea, SegmentedControl, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlayerPlay, IconPlayerStop, IconUpload } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { UploadButton } from "@/components/common/UploadButton";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/client/api";
import { ACCEPT } from "@/lib/client/media";
import type { MediaItem } from "@/lib/media-types";
import type { SfxMode } from "@/lib/studio";

type SfxLibrary = { items: MediaItem[]; categories: string[] };

const EMPTY_LIBRARY: SfxLibrary = { items: [], categories: [] };
const DEFAULT_CATEGORY = "genel";

const MODES = [
  { value: "library", label: "Ses kütüphanem" },
  { value: "free", label: "Serbest" },
  { value: "off", label: "Kapalı" },
];

const MODE_HELP: Record<SfxMode, string> = {
  library:
    "Ajan ses efektlerini kütüphanenden kullanır. İşaretlediğin sesleri özellikle kullanır; hiçbirini işaretlemezsen kütüphaneye bakıp uygun olanları kendisi seçer.",
  free: "Kütüphanen dahil edilmez. Ajana ses efektiyle ilgili hiçbir şey söylenmez; kullanıp kullanmamak ve nasıl kullanacağı tamamen ona kalır.",
  off: "Videoya hiç ses efekti eklenmez.",
};

function groupByCategory(items: MediaItem[]): [string, MediaItem[]][] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = item.category ?? DEFAULT_CATEGORY;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

async function uploadSfx(files: File[], category: string) {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  body.set("category", category.trim() || DEFAULT_CATEGORY);
  return api.post<SfxLibrary & { saved?: string[] }>("/api/media/sfx", body, "Ses yüklenemedi.");
}

type SoundEffectsFieldProps = {
  mode: SfxMode;
  selection: string[];
  onChange: (mode: SfxMode, selection: string[]) => void;
};

/** Ses efekti modu ve kütüphaneden ses seçimi (dinleyerek). Kütüphaneye yeni ses de yüklenebilir. */
export function SoundEffectsField({ mode, selection, onChange }: SoundEffectsFieldProps) {
  const [category, setCategory] = useState("");
  const preview = useAudioPreview();

  // Kütüphaneden silinmiş sesler seçimden çıkarılır.
  function pruneSelection(library: SfxLibrary) {
    const known = new Set(library.items.map((item) => item.relativePath));
    const kept = selection.filter((item) => known.has(item));
    if (kept.length !== selection.length) onChange(mode, kept);
  }

  const query = useQuery<SfxLibrary>("/api/media/sfx", {
    fetcher: (url) => api.get<SfxLibrary>(url).catch(() => EMPTY_LIBRARY),
    onSuccess: pruneSelection,
  });
  const library = query.data ?? EMPTY_LIBRARY;
  const loaded = query.data !== undefined;
  const groups = useMemo(() => groupByCategory(library.items), [library.items]);

  const upload = useAsyncTask(async (files: File[]) => {
    if (files.length === 0) return;
    const payload = await uploadSfx(files, category);
    query.setData(() => ({ items: payload.items, categories: payload.categories }));
    notifications.show({ color: "teal", title: "Ses eklendi", message: `${payload.saved?.length ?? files.length} ses kütüphaneye eklendi.` });
  }, "Ses yüklenemedi");

  function toggle(path: string, checked: boolean) {
    const next = checked ? [...selection, path] : selection.filter((item) => item !== path);
    onChange(mode, [...new Set(next)]);
  }

  return (
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={500}>
          Ses efektleri
        </Text>
        <Text size="xs" c="dimmed">
          {MODE_HELP[mode]}
        </Text>
      </div>
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={(value) => onChange(value as SfxMode, value === "library" ? selection : [])}
        data={MODES}
      />

      {mode === "library" ? (
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" gap="xs">
              <Text size="sm" fw={500}>
                Kütüphane{library.items.length ? ` (${library.items.length})` : ""}
              </Text>
              {selection.length ? (
                <Group gap={6}>
                  <Badge variant="light">{selection.length} ses seçili</Badge>
                  <Button size="compact-xs" variant="subtle" onClick={() => onChange(mode, [])}>
                    Temizle
                  </Button>
                </Group>
              ) : (
                <Text size="xs" c="dimmed">
                  Seçim yok: ajan kendisi seçer
                </Text>
              )}
            </Group>

            {loaded && library.items.length === 0 ? (
              <Text size="xs" c="dimmed">
                Kütüphanen boş. Aşağıdan ses yükle. Boş kalırsa ajana ses efektiyle ilgili bir şey söylenmez.
              </Text>
            ) : null}

            {groups.length ? (
              <ScrollArea.Autosize mah={260} type="auto">
                <Stack gap={8}>
                  {groups.map(([group, items]) => (
                    <div key={group}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>
                        {group}
                      </Text>
                      <Stack gap={4}>
                        {items.map((item) => {
                          const playing = preview.playing === item.relativePath;
                          return (
                            <Group key={item.relativePath} gap="xs" wrap="nowrap">
                              <ActionIcon
                                size="sm"
                                variant="light"
                                aria-label={playing ? "Durdur" : "Dinle"}
                                onClick={() => preview.toggle(item.relativePath, item.url)}
                              >
                                {playing ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                              </ActionIcon>
                              <Checkbox
                                size="xs"
                                label={item.name}
                                checked={selection.includes(item.relativePath)}
                                onChange={(event) => toggle(item.relativePath, event.currentTarget.checked)}
                                styles={{ label: { wordBreak: "break-all" } }}
                              />
                            </Group>
                          );
                        })}
                      </Stack>
                    </div>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            ) : null}

            <Group gap="xs" align="flex-end" wrap="nowrap">
              <Autocomplete
                size="xs"
                label="Kategori"
                placeholder="genel, whoosh, shutter…"
                data={library.categories}
                value={category}
                onChange={setCategory}
                style={{ flex: 1 }}
              />
              <UploadButton multiple size="xs" icon={<IconUpload size={14} />} accept={ACCEPT.sfx} loading={upload.pending} onFiles={(files) => void upload.run(files)}>
                Ses yükle
              </UploadButton>
            </Group>
            <Text size="xs" c="dimmed">
              Dosyalara açıklayıcı ad ver (ör. whoosh-yumusak.wav): ajan sesleri duyamaz, adından anlar.
            </Text>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
