"use client";

import { Group, MultiSelect, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadButton } from "@/components/common/UploadButton";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { ACCEPT, toSelectOptions, uploadVideo, type VideoKind } from "@/lib/client/media";
import type { MediaItem } from "@/lib/media-types";
import { MAX_VIDEOS } from "@/lib/studio";

type VideoListFieldProps = {
  kind: VideoKind;
  label: string;
  description: string;
  uploadLabel: string;
  nothingFoundMessage: string;
  items: MediaItem[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Yüklenen her video için çağrılır (listeye ve seçime eklemek için). */
  onUploaded: (item: MediaItem) => void;
  required?: boolean;
  /** Yükleme butonunun yanında gösterilir (ör. toplam süre). */
  aside?: ReactNode;
};

/** Kütüphaneden çoklu video seçimi ve bilgisayardan video yükleme. */
export function VideoListField({ kind, label, description, uploadLabel, nothingFoundMessage, items, value, onChange, onUploaded, required, aside }: VideoListFieldProps) {
  const upload = useAsyncTask(async (files: File[]) => {
    for (const file of files.slice(0, MAX_VIDEOS)) onUploaded(await uploadVideo(kind, file));
  }, "Video yüklenemedi");

  const button = (
    <UploadButton multiple accept={ACCEPT.video} loading={upload.pending} onFiles={(files) => void upload.run(files)}>
      {uploadLabel}
    </UploadButton>
  );

  return (
    <Stack gap="md">
      <MultiSelect
        label={label}
        description={description}
        placeholder={value.length ? undefined : "Seç veya bilgisayardan yükle"}
        data={toSelectOptions(items)}
        value={value}
        onChange={(next) => onChange(next.slice(0, MAX_VIDEOS))}
        searchable
        clearable
        nothingFoundMessage={nothingFoundMessage}
        required={required}
      />
      {aside ? (
        <Group gap="xs">
          {button}
          {aside}
        </Group>
      ) : (
        button
      )}
    </Stack>
  );
}
