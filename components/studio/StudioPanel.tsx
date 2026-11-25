"use client";

import { Badge, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { InfoCard } from "@/components/common/InfoCard";
import { PageHeader } from "@/components/common/PageHeader";
import { useClaudeLogin } from "@/hooks/useClaudeLogin";
import { useRenderJob } from "@/hooks/useRenderJob";
import { useStudioMedia } from "@/hooks/useStudioMedia";
import { useStudioSettings } from "@/hooks/useStudioSettings";
import { statusColor, statusLabel } from "@/lib/client/render";
import { MAX_ASSET_IMAGES, MAX_VIDEOS, type StudioInputProps } from "@/lib/studio";
import { AgentPanel } from "./agent/AgentPanel";
import { RenderResult } from "./agent/RenderResult";
import { ClaudeSetupAlert } from "./ClaudeSetupAlert";
import { AssetImagesField } from "./form/AssetImagesField";
import { ModelFields } from "./form/ModelFields";
import { MusicField } from "./form/MusicField";
import { OutputFields } from "./form/OutputFields";
import { PromptField } from "./form/PromptField";
import { SkillFields } from "./form/SkillFields";
import { SoundEffectsField } from "./form/SoundEffectsField";
import { VideoListField } from "./form/VideoListField";
import { InputPropsInspector } from "./preview/InputPropsInspector";
import { SourcePreview } from "./preview/SourcePreview";
import { RenderControls } from "./RenderControls";

const MIN_PROMPT_LENGTH = 3;

/** Prompt yoksa en az bir stil skill'i seçili olmalı. */
function canStartRender(props: StudioInputProps): boolean {
  return (
    props.sourceVideos.length > 0 &&
    Boolean(props.model) &&
    (props.prompt.trim().length >= MIN_PROMPT_LENGTH || props.styleSkills.length > 0)
  );
}

/** Eklenen yolu listenin sonuna taşır (zaten varsa tekrarlamaz) ve sınırı korur. */
function appendUnique(list: string[], paths: string[], max: number): string[] {
  return [...list.filter((entry) => !paths.includes(entry)), ...paths].slice(0, max);
}

export function StudioPanel() {
  const media = useStudioMedia();
  const settings = useStudioSettings(media.sources);
  const render = useRenderJob();
  const { form, update, inputProps, models } = settings;
  const login = useClaudeLogin({ onConnected: models.reload });

  const timelineSkill = inputProps.styleSkills.find((skill) => skill.timelineEditor) ?? null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Video Stüdyosu"
        description="Videolarını ve ayarlarını seç. Kurgu, altyazı, animasyon, ses efekti ve render işini ajan yapar."
        actions={
          <Badge color={statusColor(render.status)} variant="light" size="lg">
            {statusLabel(render.status)}
          </Badge>
        }
      />
      <InfoCard guide="studio" />
      <ErrorAlert title="Medya okunamadı" message={media.error} />
      {models.error ? (
        <ClaudeSetupAlert message={models.error} connecting={login.connecting} onConnect={() => void login.connect()} onRetry={models.reload} />
      ) : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <VideoListField
              kind="sources"
              label="Kaynak videolar"
              description="Seçtiğin sırayla arka arkaya kurgulanır. Çıktının süresi bunların toplamıdır."
              uploadLabel="Bilgisayardan kaynak video seç"
              nothingFoundMessage="Kaynak video yok"
              required
              items={media.sources}
              value={form.sourceVideos}
              onChange={(sourceVideos) => update({ sourceVideos })}
              onUploaded={(item) => {
                media.add("sources", item);
                update((current) => ({ sourceVideos: appendUnique(current.sourceVideos, [item.relativePath], MAX_VIDEOS) }));
              }}
              aside={
                settings.totalSourceDuration > 0 ? (
                  <Text size="sm" c="dimmed">
                    Toplam {settings.totalSourceDuration.toFixed(1)} sn
                  </Text>
                ) : null
              }
            />
            <PromptField
              value={form.prompt}
              onChange={(next) => update((current) => ({ prompt: typeof next === "function" ? next(current.prompt) : next }))}
            />
            <ModelFields selection={models} />
            <AssetImagesField
              assets={media.assets}
              selected={form.assetImages}
              onUploaded={(item) => media.add("assets", item)}
              onSelect={(paths) => update((current) => ({ assetImages: [...new Set([...current.assetImages, ...paths])].slice(0, MAX_ASSET_IMAGES) }))}
              onRemove={(path) =>
                update((current) => ({
                  assetImages: current.assetImages.filter((item) => item !== path),
                  assetRanges: current.assetRanges.filter((range) => range.asset !== path),
                }))
              }
            />
            <VideoListField
              kind="references"
              label="Referans videolar"
              description="İsteğe bağlı. Ajan bunların tarzını inceler ve taklit eder; çıktıya koymaz."
              uploadLabel="Bilgisayardan referans video seç"
              nothingFoundMessage="Referans video yok"
              items={media.references}
              value={form.referenceVideos}
              onChange={(referenceVideos) => update({ referenceVideos })}
              onUploaded={(item) => {
                media.add("references", item);
                update((current) => ({ referenceVideos: appendUnique(current.referenceVideos, [item.relativePath], MAX_VIDEOS) }));
              }}
            />
            <SoundEffectsField mode={settings.sfx.sfxMode} selection={settings.sfx.sfxSelection} onChange={settings.setSfx} />
            <MusicField
              music={media.music}
              value={form.backgroundMusic}
              volume={form.musicVolume}
              onChange={(backgroundMusic) => update({ backgroundMusic })}
              onVolumeChange={(musicVolume) => update({ musicVolume })}
              onUploaded={(item) => {
                media.add("music", item);
                update({ backgroundMusic: item.relativePath });
              }}
            />
            <OutputFields form={form} update={update} />
            <SkillFields
              form={form}
              update={update}
              styleSkills={settings.generated.visibleSkills}
              appliedStyles={settings.appliedStyles}
              onStyleToggle={settings.setStyleApplied}
              timelineSkill={timelineSkill}
              builtInEnabled={settings.builtIn.enabled}
              builtInReady={settings.builtIn.ready}
              activeLayers={inputProps.skills}
              sources={media.sources}
              assets={media.assets}
              durations={settings.durations}
            />
            <RenderControls
              status={render.status}
              hasJob={render.job !== null}
              canRender={canStartRender(inputProps)}
              error={render.error}
              onStart={() => void render.start(inputProps)}
              onPause={() => void render.pause()}
              onResume={() => void render.resume()}
              onCancel={() => void render.cancel()}
            />
          </Stack>
        </Paper>

        <Stack>
          <AgentPanel job={render.job} status={render.status} />
          {render.job?.outputUrl ? <RenderResult outputUrl={render.job.outputUrl} summary={render.job.summary} /> : null}
          <SourcePreview inputProps={inputProps} />
          <InputPropsInspector inputProps={inputProps} />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
