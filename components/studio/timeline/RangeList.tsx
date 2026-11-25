import { ActionIcon, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { IconPhoto, IconPlus, IconTrash } from "@tabler/icons-react";
import { formatTimecode } from "@/lib/format";
import type { TrackRange, Track } from "./timeline-utils";

type RangeListProps = {
  items: TrackRange[];
  describe: (item: TrackRange) => string;
  onSelect: (item: TrackRange) => void;
  onRemove: (track: Track, id: string) => void;
  onClear: () => void;
};

/** Tüm aralıkların zamana göre sıralı listesi; tıklanınca oraya gidilir. */
export function RangeList({ items, describe, onSelect, onRemove, onClear }: RangeListProps) {
  if (items.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        Henüz aralık yok. Aralık işaretlemezsen ajan animasyon eklemez (promptta yazdığın aralıklar hariç).
      </Text>
    );
  }

  return (
    <Stack gap={4}>
      {items.map((item) => {
        const { track, range } = item;
        const isAnimation = track === "animation";
        return (
          <Group key={range.id} gap="xs" wrap="nowrap" style={{ cursor: "pointer" }} onClick={() => onSelect(item)}>
            <Badge
              size="sm"
              color={isAnimation ? "orange" : "teal"}
              variant="light"
              leftSection={isAnimation ? <IconPlus size={10} /> : <IconPhoto size={10} />}
            >
              {formatTimecode(range.from)}–{formatTimecode(range.to)}
            </Badge>
            <Text size="xs" truncate style={{ flex: 1 }}>
              {describe(item)}
            </Text>
            <ActionIcon
              size="sm"
              color="red"
              variant="subtle"
              aria-label="Aralığı sil"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(track, range.id);
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        );
      })}
      <Button size="compact-xs" variant="subtle" color="red" style={{ alignSelf: "flex-start" }} onClick={onClear}>
        Tüm aralıkları temizle
      </Button>
    </Stack>
  );
}
