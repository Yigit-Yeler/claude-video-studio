"use client";

import { Paper, Slider, Stack, Switch, Text, TextInput } from "@mantine/core";
import type { StudioForm, StudioFormPatch } from "@/hooks/useStudioSettings";
import type { MediaItem } from "@/lib/media-types";
import { skillCatalog } from "@/lib/skills";
import type { StyleSkillSpec } from "@/lib/style-skill";
import type { SkillId } from "@/lib/studio";
import { TimelineEditor, type TimelineAsset, type TimelineClip } from "../timeline/TimelineEditor";

type SkillFieldsProps = {
  form: StudioForm;
  update: (patch: StudioFormPatch) => void;
  /** Stüdyoda gösterilen, kullanıcının oluşturduğu stil skill'leri. */
  styleSkills: StyleSkillSpec[];
  appliedStyles: Record<string, boolean>;
  onStyleToggle: (skill: StyleSkillSpec, checked: boolean) => void;
  /** Zaman çizelgesi isteyen seçili skill (varsa). */
  timelineSkill: StyleSkillSpec | null;
  /** Skiller sayfasında açık olan yerleşik katmanlar. */
  builtInEnabled: Record<SkillId, boolean>;
  builtInReady: boolean;
  /** Katmanın hem açık hem seçili olup olmadığı (ayar kaydırıcıları için). */
  activeLayers: Record<SkillId, boolean>;
  sources: MediaItem[];
  assets: MediaItem[];
  durations: Record<string, number>;
};

/** Stil skill'leri, zaman çizelgesi ve yerleşik katmanlar (metin, vignette) ile ayarları. */
export function SkillFields(props: SkillFieldsProps) {
  const { form, update, styleSkills, appliedStyles, onStyleToggle, timelineSkill, builtInEnabled, builtInReady, activeLayers } = props;
  const builtInSkills = skillCatalog.filter((skill) => builtInEnabled[skill.id]);

  return (
    <Stack gap="md">
      <Text fw={600}>Skiller</Text>
      {builtInReady && builtInSkills.length === 0 ? (
        <Text size="sm" c="dimmed">
          Stüdyoda açık skill yok. Skiller sayfasından etkinleştir.
        </Text>
      ) : null}

      {styleSkills.map((skill) => (
        <Switch
          key={skill.id}
          label={skill.name}
          description={skill.summary}
          checked={appliedStyles[skill.id] === true}
          onChange={(event) => onStyleToggle(skill, event.currentTarget.checked)}
        />
      ))}

      {timelineSkill ? <TimelinePanel skill={timelineSkill} {...props} /> : null}

      {builtInSkills.map((skill) => (
        <Switch
          key={skill.id}
          label={skill.name}
          description={skill.summary}
          checked={form.skills[skill.id]}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            update((current) => ({ skills: { ...current.skills, [skill.id]: checked } }));
          }}
        />
      ))}

      {activeLayers.textOverlay ? (
        <Stack gap="sm">
          <TextInput
            label="Katman metni"
            value={form.textOverlay.text}
            onChange={(event) => {
              const text = event.currentTarget.value;
              update((current) => ({ textOverlay: { ...current.textOverlay, text } }));
            }}
          />
          <LabeledSlider
            label={`Yazı boyutu: ${form.textOverlay.fontSize}px`}
            min={32}
            max={140}
            step={2}
            value={form.textOverlay.fontSize}
            onChange={(fontSize) => update((current) => ({ textOverlay: { ...current.textOverlay, fontSize } }))}
          />
        </Stack>
      ) : null}

      {activeLayers.vignette ? (
        <LabeledSlider
          label={`Vignette yoğunluğu: ${Math.round(form.vignette.intensity * 100)}%`}
          min={0}
          max={1}
          step={0.05}
          value={form.vignette.intensity}
          onChange={(intensity) => update({ vignette: { intensity } })}
        />
      ) : null}
    </Stack>
  );
}

function TimelinePanel({ skill, form, update, sources, assets, durations }: SkillFieldsProps & { skill: StyleSkillSpec }) {
  const clips: TimelineClip[] = form.sourceVideos.flatMap((path) => {
    const item = sources.find((entry) => entry.relativePath === path);
    const duration = durations[path];
    return item && Number.isFinite(duration) && duration > 0 ? [{ path, url: item.url, duration }] : [];
  });
  const timelineAssets: TimelineAsset[] = form.assetImages.flatMap((path) => {
    const item = assets.find((entry) => entry.relativePath === path);
    return item ? [{ path, name: item.name, url: item.url }] : [];
  });

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600}>Zaman çizelgesi</Text>
      <Text size="sm" c="dimmed" mb="sm">
        {skill.name}: ajan animasyonları yalnızca işaretlediğin aralıklara koyar; görselleri kendi aralığında, konuşmaya göre
        gösterir.
      </Text>
      <TimelineEditor
        clips={clips}
        assets={timelineAssets}
        animationRanges={form.animationRanges}
        assetRanges={form.assetRanges}
        onChange={update}
      />
    </Paper>
  );
}

type LabeledSliderProps = { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void };

function LabeledSlider({ label, ...slider }: LabeledSliderProps) {
  return (
    <div>
      <Text size="sm" fw={500} mb={6}>
        {label}
      </Text>
      <Slider {...slider} />
    </div>
  );
}
