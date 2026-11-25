"use client";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconKey, IconUpload, IconWand } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { StyleSkillSpec } from "@/lib/style-skill";
import { InfoCard } from "./InfoCard";

type AuthState = { ready: boolean; email: string | null; plan?: string | null; error?: string | null };
type SkillJob = {
  id: string;
  status: "analyzing" | "success" | "error";
  error: string | null;
  skill: StyleSkillSpec | null;
  modelName: string | null;
};

const MAX_VIDEOS = 8;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SkillCreator() {
  const [auth, setAuth] = useState<AuthState>({ ready: false, email: null });
  const [authLoaded, setAuthLoaded] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [skillName, setSkillName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [strict, setStrict] = useState(true);
  const [status, setStatus] = useState<"idle" | "analyzing" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [skill, setSkill] = useState<StyleSkillSpec | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/skills/auth")
        .then((response) => response.json())
        .then((payload: AuthState) => {
          setAuth({ ready: Boolean(payload.ready), email: payload.email ?? null, plan: payload.plan ?? null, error: payload.error ?? null });
          setAuthLoaded(true);
        })
        .catch(() => setAuthLoaded(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/skills/auth", { method: "POST" });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Claude girişi başlatılamadı.");
      if (payload.message) notifications.show({ color: "violet", title: "Claude girişi", message: payload.message, autoClose: 10000 });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = (await fetch("/api/skills/auth?refresh=1").then((item) => item.json())) as AuthState;
        if (status.ready) {
          setAuth({ ready: true, email: status.email ?? null, plan: status.plan ?? null, error: status.error ?? null });
          notifications.show({ color: "teal", title: "Bağlandı", message: "Claude aboneliğin hazır." });
          return;
        }
      }
      throw new Error("Giriş tamamlanmadı. Terminalde `claude` yazıp `/login` ile tekrar dene.");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Bağlantı kurulamadı.");
    } finally {
      setConnecting(false);
    }
  }

  async function createSkill() {
    setError(null);
    setSkill(null);
    setModelName(null);
    const notificationId = "skill-job";
    notifications.show({
      id: notificationId,
      loading: true,
      title: "Skill",
      message: "Videolar inceleniyor.",
      autoClose: false,
      withCloseButton: false,
    });
    try {
      const body = new FormData();
      body.set("name", skillName.trim());
      body.set("prompt", prompt);
      body.set("strict", String(strict));
      for (const file of files) body.append("videos", file);
      const response = await fetch("/api/skills/generate", { method: "POST", body });
      const payload = (await response.json()) as SkillJob & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Analiz başlatılamadı.");
      setStatus("analyzing");
      const finished = await poll(payload.id);
      setSkill(finished.skill);
      setModelName(finished.modelName);
      setStatus("success");
      notifications.update({
        id: notificationId,
        loading: false,
        color: "teal",
        title: "Skill hazır",
        message: finished.modelName
          ? `${finished.skill?.name ?? "Skill"} · ${finished.modelName}`
          : (finished.skill?.name ?? "Ortak tarz yazıldı."),
        autoClose: 5000,
      });
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Analiz başarısız.";
      setStatus("error");
      setError(message);
      notifications.update({
        id: notificationId,
        loading: false,
        color: "red",
        title: "Hata",
        message: message.length > 280 ? `${message.slice(0, 280)}…` : message,
        autoClose: 8000,
      });
    }
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Skill Oluştur</Title>
        <Text c="dimmed" mt={4}>
          Referans videoları yükle. İsteğe bağlı bir not ekle. Sistem kareleri inceler, ortak geçiş,
          hareket, renk, yazı ve altyazı tarzını bir skill olarak yazar.
        </Text>
      </div>

      <InfoCard
        id="skill-create"
        title="Başkasının tarzını nasıl kopyalarım?"
        steps={[
          <>Tarzını beğendiğin videoları indir (2–3 video en iyi sonucu verir; aynı tarzda olmaları önemli).</>,
          <><b>Videoları seç</b> ile yükle ve skill&apos;e bir isim ver.</>,
          <>İstersen <b>Prompt</b> kutusuna ekstra kurallar yaz: &quot;altyazı hep altta olsun&quot;, &quot;geçişler sert olsun&quot; gibi.</>,
          <><b>Tarzı çıkar ve skill yaz</b> butonuna bas. Claude kareleri inceler ve tarzı tarif eden bir skill yazar (birkaç dakika sürebilir).</>,
          <>Bitince skill Video Stüdyosu&apos;nda seçilebilir olur. Artık kendi videolarını o tarzda üretebilirsin.</>,
        ]}
        tip="Skill satın almana gerek yok: herhangi bir videonun tarzını birkaç dakikada kendi skill'ine çevirebilirsin."
      />

      <Alert color="violet" title="Model erişimi">
        Analiz, bilgisayarındaki Claude Code ile yerelde çalışır ve Claude aboneliğini (Pro/Max)
        kullanır; API anahtarı gerekmez. Claude Code&apos;a bir kez giriş yapman yeterli: aşağıdaki
        butona bas ya da terminalde <code>claude</code> yazıp <code>/login</code> komutunu çalıştır.
        {auth.error ? <><br />{auth.error}</> : null}
      </Alert>

      {authLoaded && !auth.ready ? (
        <Button
          leftSection={<IconKey size={16} />}
          variant="light"
          loading={connecting}
          onClick={() => void connect()}
        >
          Claude ile bağlan
        </Button>
      ) : null}
      {auth.ready ? (
        <Text size="sm" c="dimmed">
          Claude hazır{auth.email ? `: ${auth.email}` : ""}{auth.plan ? ` (${auth.plan})` : ""}.
        </Text>
      ) : null}

      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group>
            <FileButton
              multiple
              accept="video/mp4,video/webm,video/quicktime,.mkv"
              onChange={(picked) =>
                setFiles((current) => {
                  const fresh = picked.filter(
                    (file) => !current.some((item) => item.name === file.name && item.size === file.size),
                  );
                  return [...current, ...fresh].slice(0, MAX_VIDEOS);
                })
              }
            >
              {(props) => (
                <Button
                  {...props}
                  leftSection={<IconUpload size={16} />}
                  variant="light"
                  disabled={files.length >= MAX_VIDEOS}
                >
                  {files.length ? "Video ekle" : "Videoları seç"}
                </Button>
              )}
            </FileButton>
            <Text size="sm" c="dimmed">
              {files.length}/{MAX_VIDEOS} video. Aynı anda birden fazla seçebilir veya tekrar tıklayıp ekleyebilirsin.
              Her biri en fazla 150 MB.
            </Text>
          </Group>
          {files.length > 0 ? (
            <List spacing="xs">
              {files.map((file, index) => (
                <List.Item key={`${file.name}-${index}`}>
                  <Group gap="sm">
                    <Text size="sm">
                      {file.name} · {formatBytes(file.size)}
                    </Text>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
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
            value={skillName}
            onChange={(event) => setSkillName(event.currentTarget.value)}
            maxLength={60}
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
            description={
              strict
                ? "Açık: skill bağlayıcı bir kılavuz olur. Ajan videoyu yalnızca bu tarzla editler, kılavuzda olmayan efekt, geçiş veya ses eklemez."
                : "Kapalı: skill yine üretilir ama ajan ondan yalnızca esinlenir; kendi yaratıcı kararlarıyla birleştirir."
            }
            checked={strict}
            onChange={(event) => setStrict(event.currentTarget.checked)}
          />
          <Button
            leftSection={<IconWand size={16} />}
            loading={status === "analyzing" || connecting}
            disabled={!auth.ready || files.length === 0 || skillName.trim().length === 0}
            onClick={() => void createSkill()}
          >
            Tarzı çıkar ve skill yaz
          </Button>
        </Stack>
      </Paper>

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Analiz hatası">
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {error}
          </Text>
        </Alert>
      ) : null}

      {skill ? (
        <Paper withBorder p="lg" radius="md">
          <Stack gap="sm">
            <Group gap="sm">
              <Title order={3}>{skill.name}</Title>
              <Badge variant="light" color={skill.strict ? "violet" : "gray"}>
                {skill.strict ? "Bağlayıcı" : "Esinlenme"}
              </Badge>
            </Group>
            <Text>{skill.summary}</Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {skill.analysis}
            </Text>
            <Text size="sm">Kullanılan model: {modelName ?? "bildirilmedi"}</Text>
            <Text size="sm" c="dimmed">
              Dosya: remotion/skills/generated/{skill.id}.tsx
            </Text>
            <Button component={Link} href="/" variant="light">
              Stüdyoda kullan
            </Button>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}

async function poll(id: string): Promise<SkillJob> {
  for (;;) {
    const response = await fetch(`/api/skills/generate?id=${encodeURIComponent(id)}`);
    const payload = (await response.json()) as SkillJob & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Durum alınamadı.");
    if (payload.status === "analyzing") {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      continue;
    }
    if (payload.status === "error") throw new Error(payload.error ?? "Analiz başarısız.");
    return payload;
  }
}
