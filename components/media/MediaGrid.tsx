import { Badge, Card, Group, SimpleGrid, Text } from "@mantine/core";
import { formatBytes, formatTimestamp } from "@/lib/format";
import type { MediaItem } from "@/lib/media-types";
import { kindLabel } from "./media-labels";

export function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
      {items.map((item) => (
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
            {formatBytes(item.size)} · {formatTimestamp(item.updatedAt)}
          </Text>
        </Card>
      ))}
    </SimpleGrid>
  );
}
