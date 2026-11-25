"use client";

import { Badge, Group, Paper, Text } from "@mantine/core";
import dynamic from "next/dynamic";
import type { StudioInputProps } from "@/lib/studio";

// Remotion oynatıcısı yalnızca tarayıcıda çalışır.
const StudioPlayer = dynamic(() => import("./StudioPlayer").then((mod) => mod.StudioPlayer), { ssr: false });

/** Oynatıcıyı yeniden kurmayı gerektiren ayarlar değişince değişen anahtar. */
function playerKey(props: StudioInputProps): string {
  return [props.sourceVideos[0] ?? "empty", props.durationInSeconds, props.cover, props.resolutionId, props.fps, props.backgroundMusic ?? "nomusic"].join("-");
}

function sfxBadge({ sfxMode, sfxSelection }: StudioInputProps): string | null {
  if (sfxMode === "off") return null;
  if (sfxMode === "free") return "SFX: serbest";
  return sfxSelection.length ? `SFX: ${sfxSelection.length} seçili` : "SFX: kütüphane";
}

/** İlk kaynak videonun ham önizlemesi ve seçili ayarların özeti. */
export function SourcePreview({ inputProps }: { inputProps: StudioInputProps }) {
  const sfx = sfxBadge(inputProps);
  const badges = [
    inputProps.skills.textOverlay && "Metin",
    inputProps.skills.vignette && "Vignette",
    inputProps.sourceVideos.length > 1 && `${inputProps.sourceVideos.length} kaynak`,
    inputProps.referenceVideos.length > 0 && `${inputProps.referenceVideos.length} referans`,
    inputProps.backgroundMusic && "Müzik",
    sfx,
    `${inputProps.width}×${inputProps.height} · ${inputProps.fps} fps`,
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <Paper withBorder p="lg" radius="md">
      <Text fw={600} mb="sm">
        Kaynak önizleme
      </Text>
      <div style={{ maxWidth: 340, margin: "0 auto" }}>
        <StudioPlayer key={playerKey(inputProps)} inputProps={inputProps} />
      </div>
      <Text size="sm" c="dimmed" mt="sm">
        İlk kaynak videoyu ham hâliyle gösterir. Kurgu, animasyon ve altyazıları ajan yapar.
      </Text>
      <Group gap="xs" mt="md">
        {badges.map((badge) => (
          <Badge key={badge} variant="outline">
            {badge}
          </Badge>
        ))}
      </Group>
    </Paper>
  );
}
