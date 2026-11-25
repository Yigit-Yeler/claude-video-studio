import { Checkbox, Select, Stack } from "@mantine/core";
import type { StudioForm, StudioFormPatch } from "@/hooks/useStudioSettings";
import { FPS_OPTIONS, QUALITY_PRESETS, RESOLUTION_PRESETS, type FpsOption } from "@/lib/studio";

const RESOLUTION_OPTIONS = RESOLUTION_PRESETS.map((item) => ({ value: item.id, label: item.label }));
const FPS_SELECT_OPTIONS = FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` }));
const QUALITY_OPTIONS = QUALITY_PRESETS.map((item) => ({ value: item.id, label: `${item.label} — ${item.description}` }));

const isFps = (value: number): value is FpsOption => (FPS_OPTIONS as readonly number[]).includes(value);

/** Çıktı videosunun çözünürlüğü, kare hızı, kalitesi ve kadraj davranışı. */
export function OutputFields({ form, update }: { form: StudioForm; update: (patch: StudioFormPatch) => void }) {
  return (
    <Stack gap="md">
      <Select
        label="Çözünürlük"
        data={RESOLUTION_OPTIONS}
        value={form.resolutionId}
        allowDeselect={false}
        onChange={(value) => {
          const preset = RESOLUTION_PRESETS.find((item) => item.id === value) ?? RESOLUTION_PRESETS[1];
          update({ resolutionId: preset.id, width: preset.width, height: preset.height });
        }}
      />
      <Select
        label="Kare hızı"
        data={FPS_SELECT_OPTIONS}
        value={String(form.fps)}
        allowDeselect={false}
        onChange={(value) => {
          const fps = Number(value);
          if (isFps(fps)) update({ fps });
        }}
      />
      <Select
        label="Kalite"
        data={QUALITY_OPTIONS}
        value={form.qualityId}
        allowDeselect={false}
        onChange={(value) => {
          const preset = QUALITY_PRESETS.find((item) => item.id === value) ?? QUALITY_PRESETS[1];
          update({ qualityId: preset.id, crf: preset.crf });
        }}
      />
      <Checkbox
        label="Çerçeveyi doldur"
        description="Kapalıyken video seçilen karenin içine sığdırılır."
        checked={form.cover}
        onChange={(event) => update({ cover: event.currentTarget.checked })}
      />
    </Stack>
  );
}
