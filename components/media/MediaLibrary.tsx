"use client";

import { Alert, Button, Center, Group, Loader, SegmentedControl, Stack } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { InfoCard } from "@/components/common/InfoCard";
import { PageHeader } from "@/components/common/PageHeader";
import { useQuery } from "@/hooks/useQuery";
import type { MediaItem } from "@/lib/media-types";
import { MediaGrid } from "./MediaGrid";
import { MediaTable } from "./MediaTable";

type Filter = "all" | "sources" | "references";
type Layout = "grid" | "table";
type MediaResponse = { sources: MediaItem[]; references: MediaItem[] };

const FILTERS = [
  { label: "Tümü", value: "all" },
  { label: "Kaynak", value: "sources" },
  { label: "Referans", value: "references" },
];

const LAYOUTS = [
  { label: "Izgara", value: "grid" },
  { label: "Tablo", value: "table" },
];

export function MediaLibrary() {
  const [filter, setFilter] = useState<Filter>("all");
  const [layout, setLayout] = useState<Layout>("grid");
  const media = useQuery<MediaResponse>("/api/media", { fallbackError: "Medya listesi alınamadı." });

  const items = media.data ? [...media.data.sources, ...media.data.references] : [];
  const visible = items.filter((item) => filter === "all" || item.kind === filter);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Medya Kütüphanesi"
        description="Kaynaklar public/media/sources, referanslar public/media/references altında."
        actions={
          <Button leftSection={<IconRefresh size={16} />} variant="light" onClick={media.refetch}>
            Yenile
          </Button>
        }
      />
      <InfoCard guide="media" />

      <Group justify="space-between">
        <SegmentedControl value={filter} onChange={(value) => setFilter(value as Filter)} data={FILTERS} />
        <SegmentedControl value={layout} onChange={(value) => setLayout(value as Layout)} data={LAYOUTS} />
      </Group>

      <ErrorAlert title="Liste alınamadı" message={media.error} />

      {media.loading ? (
        <Center h={240}>
          <Loader />
        </Center>
      ) : visible.length === 0 ? (
        <Alert color="violet" title="Henüz video yok">
          mp4, webm, mov veya mkv dosyalarını public/media/sources ve public/media/references klasörlerine koyup Yenile&apos;ye bas.
        </Alert>
      ) : layout === "grid" ? (
        <MediaGrid items={visible} />
      ) : (
        <MediaTable items={visible} />
      )}
    </Stack>
  );
}
