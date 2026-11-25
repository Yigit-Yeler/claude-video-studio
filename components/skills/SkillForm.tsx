"use client";

import { Button, Checkbox, Group, List, Paper, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconWand } from "@tabler/icons-react";
import { useState } from "react";
import { UploadButton } from "@/components/common/UploadButton";
import type { SkillRequest } from "@/lib/client/skills";
import { formatBytes } from "@/lib/format";

const MAX_VIDEOS = 8;
const SKILL_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mkv";

const STRICT_HELP = {
  on: "Açık: skill bağlayıcı bir kılavuz olur. Ajan videoyu yalnızca bu tarzla editler, kılavuzda olmayan efekt, geçiş veya ses eklemez.",
  off: "Kapalı: skill yine üretilir ama ajan ondan yalnızca esinlenir; kendi yaratıcı kararlarıyla birleştirir.",
};

/** Aynı dosya iki kez seçilirse bir kez eklenir; liste en fazla `MAX_VIDEOS` olur. */
function addFiles(current: File[], picked: File[]): File[] {
  const fresh = picked.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size));
  return [...current, ...fresh].slice(0, MAX_VIDEOS);
}

type SkillFormProps = {
  canSubmit: boolean;
  busy: boolean;
  onSubmit: (request: SkillRequest) => void;
};

export function SkillForm({ canSubmit, busy, onSubmit }: SkillFormProps) {
  const [videos, setVideos] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [strict, setStrict] = useState(true);

  const valid = canSubmit && videos.length > 0 && name.trim().length > 0;

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Group>
          <UploadButton
            multiple
            accept={SKILL_VIDEO_ACCEPT}
            disabled={videos.length >= MAX_VIDEOS}
            onFiles={(picked) => setVideos((current) => addFiles(current, picked))}
          >
            {videos.length ? "Video ekle" : "Videoları seç"}
          </UploadButton>
          <Text size="sm" c="dimmed">
            {videos.length}/{MAX_VIDEOS} video. Aynı anda birden fazla seçebilir veya tekrar tıklayıp ekleyebilirsin. Her biri en
            fazla 150 MB.
          </Text>
        </Group>

        {videos.length > 0 ? (
          <List spacing="xs">
            {videos.map((file, index) => (
              <List.Item key={`${file.name}-${index}`}>
                <Group gap="sm">
                  <Text size="sm">
                    {file.name} · {formatBytes(file.size)}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => setVideos((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Çıkar
                  </Button>
                </Group>
              </List.Item>
            ))}
          </List>
        ) : (
          <Text size="sm" c="dimmed">
            Henüz video seçilmedi.
          </Text>
        )}

        <TextInput
          label="Skill adı"
          description="Bu isim stüdyoda ve skill listesinde görünür."
          placeholder="Örneğin: Sert kesim altyazı"
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Textarea
          label="Prompt"
          description="İsteğe bağlı. Örneğin: altyazılar hep altta, geçişler sert, yazı kalın olsun."
          placeholder="Boş bırakırsan yalnızca videolardaki ortak tarz kullanılır."
          minRows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
        <Checkbox
          label="Video üretilirken bu skill'e tamamen bağlı kalınsın"
          description={strict ? STRICT_HELP.on : STRICT_HELP.off}
          checked={strict}
          onChange={(event) => setStrict(event.currentTarget.checked)}
        />
        <Button
          leftSection={<IconWand size={16} />}
          loading={busy}
          disabled={!valid}
          onClick={() => onSubmit({ name, prompt, strict, videos })}
        >
          Tarzı çıkar ve skill yaz
        </Button>
      </Stack>
    </Paper>
  );
}
