import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { IconAdjustments, IconPencil } from "@tabler/icons-react";
import { formatDateTime } from "@/lib/format";
import type { RenderRecordSummary } from "@/lib/render-history";
import { SFX_LABELS } from "./labels";

const REVISION_PREVIEW_LENGTH = 80;

type RecordCardProps = {
  record: RenderRecordSummary;
  /** Düzeltmenin hangi videodan yapıldığını göstermek için o videonun tarihi. */
  parentDate: string | undefined;
  opening: boolean;
  onOpen: () => void;
  onRevise: () => void;
};

export function RecordCard({ record, parentDate, opening, onOpen, onRevise }: RecordCardProps) {
  const revisionPrompt = record.revisionPrompt ?? "";

  return (
    <Card withBorder radius="md" padding="sm">
      <Card.Section>
        <video
          src={`${record.outputUrl}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          controls
          style={{ width: "100%", aspectRatio: "9 / 16", maxHeight: 380, objectFit: "contain", background: "#000", display: "block" }}
        />
      </Card.Section>
      <Stack gap={6} mt="sm">
        <Text size="xs" c="dimmed">
          {formatDateTime(record.finishedAt ?? record.startedAt)}
        </Text>
        {record.revisionOf ? (
          <Text size="xs" c="violet">
            Düzeltme · {parentDate ? formatDateTime(parentDate) : "önceki"} tarihli videodan: &ldquo;
            {revisionPrompt.slice(0, REVISION_PREVIEW_LENGTH)}
            {revisionPrompt.length > REVISION_PREVIEW_LENGTH ? "…" : ""}&rdquo;
          </Text>
        ) : null}
        <Group gap={4}>
          {record.modelName ? (
            <Badge size="xs" variant="light" color="gray">
              {record.modelName}
            </Badge>
          ) : null}
          {record.skills.map((skill) => (
            <Badge key={skill.id} size="xs" variant="light">
              {skill.name}
            </Badge>
          ))}
          {record.hasMusic ? (
            <Badge size="xs" variant="outline">
              Müzik
            </Badge>
          ) : null}
          <Badge size="xs" variant="outline">
            SFX: {SFX_LABELS[record.sfxMode]}
          </Badge>
        </Group>
        <Text size="sm" lineClamp={3} c={record.prompt ? undefined : "dimmed"}>
          {record.prompt || "Prompt yazılmamış."}
        </Text>
        <Group grow gap="xs">
          <Button size="xs" variant="light" leftSection={<IconAdjustments size={14} />} loading={opening} onClick={onOpen}>
            Ayarları gör
          </Button>
          <Button
            size="xs"
            variant="light"
            color="orange"
            leftSection={<IconPencil size={14} />}
            disabled={!record.hasProject}
            title={record.hasProject ? undefined : "Bu videonun kod arşivi yok (eski sistem)"}
            onClick={onRevise}
          >
            Düzelt
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
