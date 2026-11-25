import { Badge, Button, Group, NumberInput, Paper, Select, TextInput } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { AssetRange, TimeRange } from "@/lib/studio";
import { MIN_LENGTH, roundTime, type TimelineAsset, type Track } from "./timeline-utils";

const MAX_NOTE_LENGTH = 300;

type RangeInspectorProps = {
  track: Track;
  range: TimeRange | AssetRange;
  total: number;
  assets: TimelineAsset[];
  onChange: (patch: Partial<AssetRange>) => void;
  onRemove: () => void;
};

/** Seçili aralığın başlangıç/bitiş saniyesi, görseli ve notu. */
export function RangeInspector({ track, range, total, assets, onChange, onRemove }: RangeInspectorProps) {
  const isAnimation = track === "animation";

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" mb={6}>
        <Badge color={isAnimation ? "orange" : "teal"} variant="light">
          {isAnimation ? "Animasyon aralığı" : "Görsel aralığı"}
        </Badge>
        <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={onRemove}>
          Aralığı sil
        </Button>
      </Group>
      <Group grow gap="xs">
        <NumberInput
          size="xs"
          label="Başlangıç (sn)"
          decimalScale={2}
          step={0.1}
          min={0}
          max={range.to - MIN_LENGTH}
          value={range.from}
          onChange={(value) => onChange({ from: roundTime(Math.min(Number(value) || 0, range.to - MIN_LENGTH)) })}
        />
        <NumberInput
          size="xs"
          label="Bitiş (sn)"
          decimalScale={2}
          step={0.1}
          min={range.from + MIN_LENGTH}
          max={total}
          value={range.to}
          onChange={(value) => onChange({ to: roundTime(Math.max(Number(value) || 0, range.from + MIN_LENGTH)) })}
        />
      </Group>
      {!isAnimation && "asset" in range ? (
        <Select
          size="xs"
          mt={6}
          label="Görsel"
          data={assets.map((item) => ({ value: item.path, label: item.name }))}
          value={range.asset}
          onChange={(value) => value && onChange({ asset: value })}
          allowDeselect={false}
        />
      ) : null}
      <TextInput
        size="xs"
        mt={6}
        label="Not (isteğe bağlı)"
        placeholder={isAnimation ? "Örn: kafamın üstünde ampul yansın" : "Örn: tabloyu sağ üstte göster"}
        value={range.note}
        onChange={(event) => onChange({ note: event.currentTarget.value.slice(0, MAX_NOTE_LENGTH) })}
      />
    </Paper>
  );
}
