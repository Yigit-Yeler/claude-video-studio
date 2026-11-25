import { SimpleGrid, Stack, Text } from "@mantine/core";
import type { SocialCopy } from "@/lib/social-copy";
import { CopyField, PlatformCard } from "./CopyField";

/** Platform sınırları (karakter). */
const LIMITS = {
  tiktokCaption: 4000,
  instagramCaption: 2200,
  youtubeTitle: 100,
  youtubeDescription: 5000,
  youtubeTags: 500,
} as const;

const joinParagraphs = (...parts: string[]) => parts.filter(Boolean).join("\n\n");

export function SocialResults({ copy }: { copy: SocialCopy }) {
  const { tiktok, instagram, youtube } = copy;
  const tiktokText = joinParagraphs(tiktok.caption, tiktok.hashtags.join(" "));
  const instagramText = joinParagraphs(instagram.caption, instagram.hashtags.join(" "));
  const youtubeDescription = joinParagraphs(youtube.description, youtube.hashtags.join(" "));

  return (
    <Stack gap="md">
      {copy.videoSummary ? (
        <Text size="sm" c="dimmed">
          {copy.videoSummary}
        </Text>
      ) : null}
      <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="md">
        <PlatformCard title="TikTok" color="pink" fullText={tiktokText}>
          <CopyField label="Açıklama + hashtag" value={tiktokText} limit={LIMITS.tiktokCaption} multiline />
          <CopyField label="Hashtag'ler" value={tiktok.hashtags.join(" ")} />
          <CopyField label="Kapak yazısı" value={tiktok.coverText} />
        </PlatformCard>
        <PlatformCard title="Instagram Reels" color="grape" fullText={instagramText}>
          <CopyField label="Açıklama + hashtag" value={instagramText} limit={LIMITS.instagramCaption} multiline />
          <CopyField label="Hashtag'ler" value={instagram.hashtags.join(" ")} />
          <CopyField label="Kapak yazısı" value={instagram.coverText} />
          <CopyField label="İlk yorum" value={instagram.firstComment} />
        </PlatformCard>
        <PlatformCard title="YouTube Shorts" color="red" fullText={`${youtube.title}\n\n${youtubeDescription}`}>
          <CopyField label="Başlık" value={youtube.title} limit={LIMITS.youtubeTitle} />
          <CopyField label="Açıklama + hashtag" value={youtubeDescription} limit={LIMITS.youtubeDescription} multiline />
          <CopyField label="Etiketler (virgülle)" value={youtube.tags.join(", ")} limit={LIMITS.youtubeTags} />
        </PlatformCard>
      </SimpleGrid>
    </Stack>
  );
}
