"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { UploadButton } from "@/components/common/UploadButton";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { ACCEPT, uploadAsset } from "@/lib/client/media";
import type { MediaItem } from "@/lib/media-types";
import { MAX_ASSET_IMAGES } from "@/lib/studio";

type AssetImagesFieldProps = {
  assets: MediaItem[];
  selected: string[];
  /** Her yüklenen görsel için (kütüphaneye eklemek için). */
  onUploaded: (item: MediaItem) => void;
  /** Hepsi yüklenince seçime eklenecek yollar. */
  onSelect: (paths: string[]) => void;
  onRemove: (path: string) => void;
};

/** Videoda gösterilecek ekran görüntüsü, logo ve ikonlar. */
export function AssetImagesField({ assets, selected, onUploaded, onSelect, onRemove }: AssetImagesFieldProps) {
  const upload = useAsyncTask(async (files: File[]) => {
    const paths: string[] = [];
    for (const file of files.slice(0, MAX_ASSET_IMAGES)) {
      const item = await uploadAsset(file);
      onUploaded(item);
      paths.push(item.relativePath);
    }
    onSelect(paths);
  }, "Görsel yüklenemedi");

  const nameOf = (path: string) => assets.find((item) => item.relativePath === path)?.name ?? path;

  return (
    <Stack gap="md">
      <UploadButton
        multiple
        accept={ACCEPT.image}
        icon={<IconPhoto size={16} />}
        loading={upload.pending}
        onFiles={(files) => void upload.run(files)}
      >
        Kaynak görsel yükle
      </UploadButton>
      <Text size="sm" c="dimmed">
        Ekran görüntüsü, logo ve ikon. Yüklemediğin şekilleri animasyon kodu çizer.
      </Text>
      {selected.length > 0 ? (
        <Stack gap={4}>
          {selected.map((path) => (
            <Group key={path} justify="space-between">
              <Text size="sm">{nameOf(path)}</Text>
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => onRemove(path)}>
                Kaldır
              </Button>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Henüz görsel seçilmedi.
        </Text>
      )}
    </Stack>
  );
}
