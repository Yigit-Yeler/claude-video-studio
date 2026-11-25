"use client";

import {
  ActionIcon,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlayerPlay, IconPlayerStop, IconUpload } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/media-types";
import type { SfxMode } from "@/lib/studio";

type SfxResponse = { items: MediaItem[]; categories: string[]; error?: string };

const MODE_HELP: Record<SfxMode, string> = {
  library:
    "Ajan ses efektlerini kütüphanenden kullanır. İşaretlediğin sesleri özellikle kullanır; hiçbirini işaretlemezsen kütüphaneye bakıp uygun olanları kendisi seçer.",
  free: "Kütüphanen dahil edilmez. Ajana ses efektiyle ilgili hiçbir şey söylenmez; kullanıp kullanmamak ve nasıl kullanacağı tamamen ona kalır.",
  off: "Videoya hiç ses efekti eklenmez.",
};

export function SoundEffectsField({
  mode,
  selection,
  onChange,
}: {
  mode: SfxMode;
  selection: string[];
  onChange: (mode: SfxMode, selection: string[]) => void;
}) {
  const [library, setLibrary] = useState<SfxResponse>({ items: [], categories: [] });
  const [loaded, setLoaded] = useState(false);
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  async function load() {
    try {
      const payload = (await fetch("/api/media/sfx").then((response) => response.json())) as SfxResponse;
      setLibrary({ items: payload.items ?? [], categories: payload.categories ?? [] });
    } catch {
      setLibrary({ items: [], categories: [] });
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      audio.current?.pause();
    };
  }, []);

  // Kütüphaneden silinmiş sesleri seçimden çıkar.
  useEffect(() => {
    if (!loaded) return;
    const known = new Set(library.items.map((item) => item.relativePath));
    const kept = selection.filter((item) => known.has(item));
    if (kept.length !== selection.length) onChange(mode, kept);
  }, [library.items, loaded, mode, onChange, selection]);

  const groups = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of library.items) {
      const key = item.category ?? "genel";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [library.items]);

  function toggle(relativePath: string, checked: boolean) {
    const next = checked ? [...selection, relativePath] : selection.filter((item) => item !== relativePath);
    onChange(mode, [...new Set(next)]);
  }

  function preview(item: MediaItem) {
    audio.current?.pause();
    if (playing === item.relativePath) {
      setPlaying(null);
      return;
    }
    const element = new Audio(item.url);
    element.onended = () => setPlaying(null);
    audio.current = element;
    setPlaying(item.relativePath);
    void element.play().catch(() => setPlaying(null));
  }

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      body.set("category", category.trim() || "genel");
      const response = await fetch("/api/media/sfx", { method: "POST", body });
      const payload = (await response.json()) as SfxResponse & { saved?: string[] };
      if (!response.ok) throw new Error(payload.error ?? "Ses yüklenemedi.");
      setLibrary({ items: payload.items, categories: payload.categories });
      notifications.show({ color: "teal", title: "Ses eklendi", message: `${payload.saved?.length ?? files.length} ses kütüphaneye eklendi.` });
    } catch (error) {
      notifications.show({ color: "red", title: "Ses yüklenemedi", message: error instanceof Error ? error.message : "Ses yüklenemedi." });
    } finally {
      setUploading(false);
    }
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
        data={[
          { value: "library", label: "Ses kütüphanem" },
          { value: "free", label: "Serbest" },
          { value: "off", label: "Kapalı" },
        ]}
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
                        {items.map((item) => (
                          <Group key={item.relativePath} gap="xs" wrap="nowrap">
                            <ActionIcon
                              size="sm"
                              variant="light"
                              aria-label={playing === item.relativePath ? "Durdur" : "Dinle"}
                              onClick={() => preview(item)}
                            >
                              {playing === item.relativePath ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                            </ActionIcon>
                            <Checkbox
                              size="xs"
                              label={item.name}
                              checked={selection.includes(item.relativePath)}
                              onChange={(event) => toggle(item.relativePath, event.currentTarget.checked)}
                              styles={{ label: { wordBreak: "break-all" } }}
                            />
                          </Group>
                        ))}
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
              <FileButton multiple accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac" onChange={(files) => void upload(files)}>
                {(props) => (
                  <Button {...props} size="xs" variant="light" leftSection={<IconUpload size={14} />} loading={uploading}>
                    Ses yükle
                  </Button>
                )}
              </FileButton>
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
