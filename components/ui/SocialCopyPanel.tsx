"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  FileButton,
  Grid,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck, IconCopy, IconRefresh, IconSparkles, IconUpload } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/media-types";
import type { RenderRecordSummary } from "@/lib/render-history";
import type { SocialCopy, SocialJobState, SocialRecord, SocialSource } from "@/lib/social-copy";
import { InfoCard } from "./InfoCard";

type Mode = "history" | "video";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CopyField({ label, value, limit, multiline }: { label: string; value: string; limit?: number; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <Group justify="space-between" gap={4} mb={4}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {label}
        </Text>
        <Group gap={6}>
          {limit ? (
            <Text size="xs" c={value.length > limit ? "red" : "dimmed"}>
              {value.length}/{limit}
            </Text>
          ) : null}
          <CopyButton value={value} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Kopyalandı" : "Kopyala"} withArrow>
                <ActionIcon size="sm" variant="subtle" color={copied ? "teal" : "gray"} onClick={copy} aria-label={`${label} kopyala`}>
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      </Group>
      <Paper p="xs" radius="sm" bg="var(--mantine-color-dark-6)">
        <Text size="sm" style={{ whiteSpace: multiline ? "pre-wrap" : "normal", wordBreak: "break-word" }}>
          {value}
        </Text>
      </Paper>
    </div>
  );
}

function PlatformCard({ title, color, fullText, children }: { title: string; color: string; fullText: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Badge size="lg" variant="light" color={color}>
          {title}
        </Badge>
        <CopyButton value={fullText} timeout={1500}>
          {({ copied, copy }) => (
            <Button size="xs" variant="light" color={copied ? "teal" : color} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />} onClick={copy}>
              {copied ? "Kopyalandı" : "Hepsini kopyala"}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

function Results({ copy }: { copy: SocialCopy }) {
  const tiktokText = [copy.tiktok.caption, copy.tiktok.hashtags.join(" ")].filter(Boolean).join("\n\n");
  const instagramText = [copy.instagram.caption, copy.instagram.hashtags.join(" ")].filter(Boolean).join("\n\n");
  const youtubeDescription = [copy.youtube.description, copy.youtube.hashtags.join(" ")].filter(Boolean).join("\n\n");
  return (
    <Stack gap="md">
      {copy.videoSummary ? (
        <Text size="sm" c="dimmed">
          {copy.videoSummary}
        </Text>
      ) : null}
      <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="md">
        <PlatformCard title="TikTok" color="pink" fullText={tiktokText}>
          <CopyField label="Açıklama + hashtag" value={tiktokText} limit={4000} multiline />
          <CopyField label="Hashtag'ler" value={copy.tiktok.hashtags.join(" ")} />
          <CopyField label="Kapak yazısı" value={copy.tiktok.coverText} />
        </PlatformCard>
        <PlatformCard title="Instagram Reels" color="grape" fullText={instagramText}>
          <CopyField label="Açıklama + hashtag" value={instagramText} limit={2200} multiline />
          <CopyField label="Hashtag'ler" value={copy.instagram.hashtags.join(" ")} />
          <CopyField label="Kapak yazısı" value={copy.instagram.coverText} />
          <CopyField label="İlk yorum" value={copy.instagram.firstComment} />
        </PlatformCard>
        <PlatformCard title="YouTube Shorts" color="red" fullText={`${copy.youtube.title}\n\n${youtubeDescription}`}>
          <CopyField label="Başlık" value={copy.youtube.title} limit={100} />
          <CopyField label="Açıklama + hashtag" value={youtubeDescription} limit={5000} multiline />
          <CopyField label="Etiketler (virgülle)" value={copy.youtube.tags.join(", ")} limit={500} />
        </PlatformCard>
      </SimpleGrid>
    </Stack>
  );
}

export function SocialCopyPanel() {
  const [mode, setMode] = useState<Mode>("history");
  const [records, setRecords] = useState<RenderRecordSummary[]>([]);
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState<SocialJobState | null>(null);
  const [result, setResult] = useState<SocialRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchToken = useRef(0);

  useEffect(() => {
    void fetch("/api/history")
      .then((response) => response.json())
      .then((payload: { records?: RenderRecordSummary[] }) => {
        const list = payload.records ?? [];
        setRecords(list);
        setHistoryId((current) => current ?? list[0]?.id ?? null);
      })
      .catch(() => setRecords([]));
    void fetch("/api/media")
      .then((response) => response.json())
      .then((payload: { sources?: MediaItem[] }) => setVideos(payload.sources ?? []))
      .catch(() => setVideos([]));
  }, []);

  const source = useMemo<SocialSource | null>(() => {
    if (mode === "history") return historyId ? { kind: "history", id: historyId } : null;
    return videoPath ? { kind: "video", path: videoPath } : null;
  }, [historyId, mode, videoPath]);

  const previewUrl =
    source?.kind === "history"
      ? (records.find((item) => item.id === source.id)?.outputUrl ?? null)
      : source
        ? (videos.find((item) => item.relativePath === source.path)?.url ?? null)
        : null;

  // Seçilen video için daha önce üretilmiş metin varsa göster.
  useEffect(() => {
    if (!source) return;
    let ignore = false;
    const ref = source.kind === "history" ? source.id : source.path;
    void fetch(`/api/social?kind=${source.kind}&ref=${encodeURIComponent(ref)}`)
      .then(async (response) => (response.ok ? ((await response.json()) as SocialRecord) : null))
      .then((record) => {
        if (ignore) return;
        setResult(record);
        if (record) setNotes(record.notes);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [source]);

  const watch = useCallback(async (id: string) => {
    const token = ++watchToken.current;
    while (token === watchToken.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const response = await fetch(`/api/social?id=${encodeURIComponent(id)}`).catch(() => null);
      if (!response?.ok || token !== watchToken.current) continue;
      const next = (await response.json()) as SocialJobState;
      setJob(next);
      if (next.status === "success") {
        setResult(next.record);
        return;
      }
      if (next.status === "error") {
        setError(next.error ?? "Metinler üretilemedi.");
        return;
      }
    }
  }, []);

  useEffect(() => () => void (watchToken.current += 1), []);

  async function generate() {
    if (!source) return;
    setError(null);
    try {
      const response = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, notes }),
      });
      const payload = (await response.json()) as SocialJobState & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Başlatılamadı.");
      setJob(payload);
      void watch(payload.id);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Başlatılamadı.");
    }
  }

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const query = new URLSearchParams({ kind: "sources", name: file.name });
      const response = await fetch(`/api/media/videos?${query}`, { method: "POST", body: file });
      const payload = (await response.json()) as { item?: MediaItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? "Video yüklenemedi.");
      const item = payload.item;
      setVideos((current) => [...current.filter((entry) => entry.relativePath !== item.relativePath), item].sort((a, b) => a.name.localeCompare(b.name, "tr")));
      setVideoPath(item.relativePath);
    } catch (problem) {
      notifications.show({ color: "red", title: "Video yüklenemedi", message: problem instanceof Error ? problem.message : "Video yüklenemedi." });
    } finally {
      setUploading(false);
    }
  }

  const running = job?.status === "running";
  const historyOptions = records.map((record) => ({
    value: record.id,
    label: `${formatDate(record.finishedAt ?? record.startedAt)} · ${record.skills.map((skill) => skill.name).join(", ") || "Skill yok"}${record.revisionOf ? " (düzeltme)" : ""}`,
  }));
  const selectedRecord = source?.kind === "history" ? records.find((item) => item.id === source.id) : null;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Paylaşım Metinleri</Title>
        <Text c="dimmed" mt={4}>
          Bir video seç; Claude videoyu inceleyip TikTok, Instagram Reels ve YouTube Shorts için açıklama, başlık ve etiketleri birlikte yazsın.
        </Text>
      </div>

      <InfoCard
        id="social"
        title="Paylaşım metni nasıl yazdırılır?"
        steps={[
          <>Bu sistemle ürettiğin bir videoyu seç ya da dışarıdan bir video yükle.</>,
          <>İstersen not ekle: &quot;linki bio&apos;ya koydum de&quot;, &quot;daha kısa olsun&quot; gibi.</>,
          <><b>Metinleri üret</b> butonuna bas; TikTok, Instagram ve YouTube için açıklama, başlık ve etiketler hazırlanır. Kopyala butonuyla al.</>,
        ]}
      />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 4 }}>
        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <SegmentedControl
              fullWidth
              value={mode}
              onChange={(value) => setMode(value as Mode)}
              data={[
                { value: "history", label: "Geçmişten" },
                { value: "video", label: "Başka video" },
              ]}
            />
            {mode === "history" ? (
              <Select
                label="Üretilen video"
                description="Bu sistemle üretilmiş videolar. Ajanın transkripti ve sahne planı da kullanılır."
                placeholder={records.length ? "Video seç" : "Geçmişte video yok"}
                data={historyOptions}
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
                  data={videos.map((item) => ({ value: item.relativePath, label: item.name }))}
                  value={videoPath}
                  onChange={setVideoPath}
                  searchable
                  nothingFoundMessage="Video yok"
                />
                <FileButton accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv" onChange={(file) => void upload(file)}>
                  {(props) => (
                    <Button {...props} variant="light" leftSection={<IconUpload size={16} />} loading={uploading}>
                      Bilgisayardan video yükle
                    </Button>
                  )}
                </FileButton>
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
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
            <Button
              leftSection={result ? <IconRefresh size={16} /> : <IconSparkles size={16} />}
              onClick={() => void generate()}
              loading={running}
              disabled={!source}
            >
              {result ? "Yeniden üret" : "Metinleri üret"}
            </Button>
            {running ? (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  {job?.detail ?? "Çalışıyor"}…
                </Text>
              </Group>
            ) : null}
            {error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title="Üretilemedi">
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {error}
                </Text>
              </Alert>
            ) : null}
          </Stack>
        </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          {result ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  {formatDate(result.createdAt)}
                  {result.modelName ? ` · ${result.modelName}` : ""}
                </Text>
              </Group>
              <Results copy={result.copy} />
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
