"use client";

import { Select, Slider, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMusic } from "@tabler/icons-react";
import { UploadButton } from "@/components/common/UploadButton";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { ACCEPT, toSelectOptions, uploadMusic } from "@/lib/client/media";
import type { MediaItem } from "@/lib/media-types";

type MusicFieldProps = {
  music: MediaItem[];
  value: string | null;
  volume: number;
  onChange: (value: string | null) => void;
  onVolumeChange: (volume: number) => void;
  onUploaded: (item: MediaItem) => void;
};

/** Arka plan müziği: yükleme, seçim ve ses düzeyi. */
export function MusicField({ music, value, volume, onChange, onVolumeChange, onUploaded }: MusicFieldProps) {
  const upload = useAsyncTask(async ([file]: File[]) => {
    if (!file) return;
    onUploaded(await uploadMusic(file));
    notifications.show({ color: "teal", title: "Müzik eklendi", message: "Parça arka planda kullanılacak." });
  }, "Müzik yüklenemedi");

  return (
    <Stack gap="md">
      <UploadButton accept={ACCEPT.music} icon={<IconMusic size={16} />} loading={upload.pending} onFiles={(files) => void upload.run(files)}>
        Arka plan müziği yükle
      </UploadButton>
      <Select
        label="Arka plan müziği"
        description="İsteğe bağlı. Konuşmanın altında, konuşma varken kısılarak çalar."
        placeholder="Müzik yok"
        data={toSelectOptions(music)}
        value={value}
        onChange={onChange}
        searchable
        clearable
        nothingFoundMessage="Henüz müzik yok"
      />
      {value ? (
        <div>
          <Text size="sm" fw={500} mb={6}>
            Müzik düzeyi: {Math.round(volume * 100)}%
          </Text>
          <Slider min={0} max={1} step={0.05} value={volume} onChange={onVolumeChange} />
        </div>
      ) : null}
    </Stack>
  );
}
