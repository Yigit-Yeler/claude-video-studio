"use client";

import { Alert, Group, Progress, Stack, Text } from "@mantine/core";
import { useNow } from "@/hooks/useNow";
import { elapsedOf, statusLabel } from "@/lib/client/render";
import { formatElapsed } from "@/lib/format";
import type { RenderJobState } from "@/lib/render-status";

const PROGRESS_COLORS: Partial<Record<RenderJobState["status"], string>> = {
  error: "red",
  paused: "yellow",
  cancelled: "gray",
};

/** İşin yüzdesi, geçen süre ve o anki aşama. İş bitince "Video hazır" kutusuna döner. */
export function RenderProgress({ job }: { job: RenderJobState }) {
  const running = job.status === "rendering";
  const now = useNow(running);
  const elapsed = formatElapsed(elapsedOf(job, now));

  if (job.status === "success") {
    return (
      <Alert color="teal" variant="light" mb="md" title="Video hazır">
        Video {elapsed} içinde hazırlandı.
      </Alert>
    );
  }

  const percent = job.progress ?? 0;
  const timeLabel = job.status === "paused" ? "Duraklatıldı" : running ? "Geçen süre" : "Toplam süre";

  return (
    <Stack gap={6} mb="md">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          %{percent} tamamlandı
        </Text>
        <Text size="sm" c="dimmed">
          {timeLabel}: {elapsed}
        </Text>
      </Group>
      <Progress
        value={percent}
        size="lg"
        radius="xl"
        animated={running}
        striped={running}
        color={PROGRESS_COLORS[job.status] ?? "violet"}
      />
      {job.stage ? (
        <Text size="xs" c="dimmed">
          {running ? job.stage : statusLabel(job.status)}
        </Text>
      ) : null}
    </Stack>
  );
}
