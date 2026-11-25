"use client";

import { Button, Grid, Group, Loader, Paper, SegmentedControl, Select, Stack, Text, Textarea } from "@mantine/core";
import { IconRefresh, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { InfoCard } from "@/components/common/InfoCard";
import { PageHeader } from "@/components/common/PageHeader";
import { UploadButton } from "@/components/common/UploadButton";
import { useAsyncTask } from "@/hooks/useAsyncTask";
import { useQuery } from "@/hooks/useQuery";
import { useSocialCopy } from "@/hooks/useSocialCopy";
import { ACCEPT, toSelectOptions, uploadVideo, upsertMediaItem } from "@/lib/client/media";
import { formatShortDate } from "@/lib/format";
import type { MediaItem } from "@/lib/media-types";
import type { RenderRecordSummary } from "@/lib/render-history";
import type { SocialSource } from "@/lib/social-copy";
import { SocialResults } from "./SocialResults";

type Mode = "history" | "video";

const MODES = [
  { value: "history", label: "Geçmişten" },
  { value: "video", label: "Başka video" },
];

const NO_RECORDS: RenderRecordSummary[] = [];
const NO_VIDEOS: MediaItem[] = [];

function historyLabel(record: RenderRecordSummary): string {
  const skills = record.skills.map((skill) => skill.name).join(", ") || "Skill yok";
  return `${formatShortDate(record.finishedAt ?? record.startedAt)} · ${skills}${record.revisionOf ? " (düzeltme)" : ""}`;
}

export function SocialCopyPanel() {
  const [mode, setMode] = useState<Mode>("history");
  const [pickedHistoryId, setHistoryId] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);

  const history = useQuery<{ records?: RenderRecordSummary[] }>("/api/history");
  const media = useQuery<{ sources?: MediaItem[] }>("/api/media");
  const records = history.data?.records ?? NO_RECORDS;
  const videos = media.data?.sources ?? NO_VIDEOS;

  // Seçim yapılmadıysa en son üretilen video seçili gelir.
  const historyId = pickedHistoryId ?? records[0]?.id ?? null;
  const source: SocialSource | null =
    mode === "history" ? (historyId ? { kind: "history", id: historyId } : null) : videoPath ? { kind: "video", path: videoPath } : null;

  const social = useSocialCopy(source);
  const selectedRecord = source?.kind === "history" ? records.find((item) => item.id === source.id) : undefined;
  const previewUrl =
    source?.kind === "history"
      ? (selectedRecord?.outputUrl ?? null)
      : source
        ? (videos.find((item) => item.relativePath === source.path)?.url ?? null)
        : null;

  const upload = useAsyncTask(async (files: File[]) => {
    const [file] = files;
    if (!file) return;
    const item = await uploadVideo("sources", file);
    media.setData((current) => ({ sources: upsertMediaItem(current?.sources ?? [], item) }));
    setVideoPath(item.relativePath);
  }, "Video yüklenemedi");

  const { result, running } = social;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Paylaşım Metinleri"
        description="Bir video seç; Claude videoyu inceleyip TikTok, Instagram Reels ve YouTube Shorts için açıklama, başlık ve etiketleri birlikte yazsın."
      />
      <InfoCard guide="social" />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper withBorder p="lg" radius="md">
            <Stack gap="md">
              <SegmentedControl fullWidth value={mode} onChange={(value) => setMode(value as Mode)} data={MODES} />
              {mode === "history" ? (
                <Select
                  label="Üretilen video"
                  description="Bu sistemle üretilmiş videolar. Ajanın transkripti ve sahne planı da kullanılır."
                  placeholder={records.length ? "Video seç" : "Geçmişte video yok"}
                  data={records.map((record) => ({ value: record.id, label: historyLabel(record) }))}
                  value={historyId}
                  onChange={setHistoryId}
                  searchable
                  allowDeselect={false}
                />
              ) : (
                <>
                  <Select
                    label="Video"
                    description="Bu sistemle yapılmamış bir video. Konuşması metne çevrilip kareleri incelenir."
                    placeholder="Kütüphaneden seç veya yükle"
                    data={toSelectOptions(videos)}
                    value={videoPath}
                    onChange={setVideoPath}
                    searchable
                    nothingFoundMessage="Video yok"
                  />
                  <UploadButton accept={ACCEPT.video} loading={upload.pending} onFiles={(files) => void upload.run(files)}>
                    Bilgisayardan video yükle
                  </UploadButton>
                </>
              )}
              {previewUrl ? (
                <video
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  playsInline
                  style={{ display: "block", width: "100%", maxHeight: 420, background: "#000", borderRadius: 8 }}
                />
              ) : null}
              {selectedRecord?.summary ? (
                <Text size="xs" c="dimmed" lineClamp={3}>
                  {selectedRecord.summary}
                </Text>
              ) : null}
              <Textarea
                label="Not (isteğe bağlı)"
                description="Örn: linki bio'ya koydum de, şu kelimeyi geçir, daha kısa olsun."
                autosize
                minRows={2}
                maxRows={6}
                value={social.notes}
                onChange={(event) => social.setNotes(event.currentTarget.value)}
              />
              <Button
                leftSection={result ? <IconRefresh size={16} /> : <IconSparkles size={16} />}
                onClick={() => void social.generate()}
                loading={running}
                disabled={!source}
              >
                {result ? "Yeniden üret" : "Metinleri üret"}
              </Button>
              {running ? (
                <Group gap="xs">
                  <Loader size="xs" />
                  <Text size="sm" c="dimmed">
                    {social.job?.detail ?? "Çalışıyor"}…
                  </Text>
                </Group>
              ) : null}
              <ErrorAlert title="Üretilemedi" message={social.error} />
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          {result ? (
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                {formatShortDate(result.createdAt)}
                {result.modelName ? ` · ${result.modelName}` : ""}
              </Text>
              <SocialResults copy={result.copy} />
            </Stack>
          ) : (
            <Paper withBorder p="xl" radius="md">
              <Text c="dimmed" ta="center">
                {running ? "Video inceleniyor; metinler birkaç dakika içinde burada olacak." : "Bu video için henüz metin üretilmedi."}
              </Text>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
