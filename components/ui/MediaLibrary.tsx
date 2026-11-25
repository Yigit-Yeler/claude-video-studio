"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import type { MediaItem } from "@/lib/media-types";
import { InfoCard } from "./InfoCard";

type MediaResponse = {
  sources: MediaItem[];
  references: MediaItem[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: MediaItem["kind"]): string {
  return kind === "sources" ? "Kaynak" : "Referans";
}

export function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [layout, setLayout] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/media");
      const payload = (await response.json()) as MediaResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Medya listesi alınamadı.");
      setItems([...payload.sources, ...payload.references]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Medya listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = items.filter((item) => filter === "all" || item.kind === filter);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Medya Kütüphanesi</Title>
          <Text c="dimmed" mt={4}>
            Kaynaklar public/media/sources, referanslar public/media/references altında.
          </Text>
        </div>
        <Button leftSection={<IconRefresh size={16} />} variant="light" onClick={() => void load()}>
          Yenile
        </Button>
      </Group>

      <InfoCard
        id="media"
        title="Medya kütüphanesi"
        steps={[
          <><b>Kaynak</b>: videoya dönüşecek ham çekimlerin. Stüdyodan yüklediğin videolar buraya kaydedilir.</>,
          <><b>Referans</b>: tarzını taklit etmek istediğin örnek videolar. Ajan bunları inceler ama çıktıya koymaz.</>,
          <>Dosyaları doğrudan klasöre de kopyalayabilirsin; sonra <b>Yenile</b>&apos;ye bas.</>,
        ]}
        tip="Müzikler public/media/music, ses efektleri public/media/sfx altında. Bu klasörler GitHub'a yüklenmez."
      />

      <Group justify="space-between">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          data={[
            { label: "Tümü", value: "all" },
            { label: "Kaynak", value: "sources" },
            { label: "Referans", value: "references" },
          ]}
        />
        <SegmentedControl
          value={layout}
          onChange={setLayout}
          data={[
            { label: "Izgara", value: "grid" },
            { label: "Tablo", value: "table" },
          ]}
        />
      </Group>

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Liste alınamadı">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Center h={240}>
          <Loader />
        </Center>
      ) : null}

      {!loading && visible.length === 0 ? (
        <PaperEmpty />
      ) : null}

      {!loading && visible.length > 0 && layout === "grid" ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {visible.map((item) => (
            <Card key={item.relativePath} withBorder radius="md" padding="md">
              <Card.Section>
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", background: "#111" }}
                />
              </Card.Section>
              <Group justify="space-between" mt="sm" wrap="nowrap">
                <Text fw={600} lineClamp={1}>
                  {item.name}
                </Text>
                <Badge variant="light" color={item.kind === "sources" ? "violet" : "cyan"}>
                  {kindLabel(item.kind)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" mt={4}>
                {formatBytes(item.size)} · {new Date(item.updatedAt).toLocaleString("tr-TR")}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      ) : null}

      {!loading && visible.length > 0 && layout === "table" ? (
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Önizleme</Table.Th>
                <Table.Th>Ad</Table.Th>
                <Table.Th>Tür</Table.Th>
                <Table.Th>Boyut</Table.Th>
                <Table.Th>Güncelleme</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((item) => (
                <Table.Tr key={item.relativePath}>
                  <Table.Td>
                    <video
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ width: 72, height: 128, objectFit: "cover", borderRadius: 8, background: "#111" }}
                    />
                  </Table.Td>
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td>{kindLabel(item.kind)}</Table.Td>
                  <Table.Td>{formatBytes(item.size)}</Table.Td>
                  <Table.Td>{new Date(item.updatedAt).toLocaleString("tr-TR")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : null}
    </Stack>
  );
}

function PaperEmpty() {
  return (
    <Alert color="violet" title="Henüz video yok">
      mp4, webm, mov veya mkv dosyalarını public/media/sources ve public/media/references klasörlerine
      koyup Yenile&apos;ye bas.
    </Alert>
  );
}
