import { ActionIcon, Button, CopyButton, Group, Paper, Text, Tooltip, Badge, Stack } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import type { ReactNode } from "react";

const COPY_FEEDBACK_MS = 1500;

type CopyFieldProps = { label: string; value: string; limit?: number; multiline?: boolean };

/** Kopyalanabilir tek bir metin; platform sınırı verilirse karakter sayacı gösterir. */
export function CopyField({ label, value, limit, multiline }: CopyFieldProps) {
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
          <CopyButton value={value} timeout={COPY_FEEDBACK_MS}>
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

type PlatformCardProps = { title: string; color: string; fullText: string; children: ReactNode };

/** Bir platformun (TikTok, Instagram, YouTube) metinleri ve "Hepsini kopyala" butonu. */
export function PlatformCard({ title, color, fullText, children }: PlatformCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Badge size="lg" variant="light" color={color}>
          {title}
        </Badge>
        <CopyButton value={fullText} timeout={COPY_FEEDBACK_MS}>
          {({ copied, copy }) => (
            <Button
              size="xs"
              variant="light"
              color={copied ? "teal" : color}
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              onClick={copy}
            >
              {copied ? "Kopyalandı" : "Hepsini kopyala"}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}
