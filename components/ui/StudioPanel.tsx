"use client";

import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  FileButton,
  Group,
  MultiSelect,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconMusic,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconUpload,
} from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/media-types";
import type { AgentLogEntry, RenderJobState } from "@/lib/render-status";
import { skillCatalog } from "@/lib/skills";
import {
  FPS_OPTIONS,
  QUALITY_PRESETS,
  RESOLUTION_PRESETS,
  MAX_ASSET_IMAGES,
  MAX_VIDEOS,
  defaultInputProps,
  type StudioInputProps,
} from "@/lib/studio";
import { appendDictation, DictationButton } from "./DictationButton";
import { PromptHistory } from "./PromptHistory";
import { LOAD_TEMPLATE_KEY } from "./RenderHistory";
import { SoundEffectsField } from "./SoundEffectsField";
import { TimelineEditor } from "./TimelineEditor";
import { useEnabledSkills } from "./useEnabledSkills";
import { useGeneratedSkills } from "./useGeneratedSkills";
import { InfoCard } from "./InfoCard";

const StudioPlayer = dynamic(
  () => import("./StudioPlayer").then((mod) => mod.StudioPlayer),
  { ssr: false },
);

const RENDER_JOB_KEY = "video-automation-render-job";

type MediaResponse = {
  sources: MediaItem[];
  references: MediaItem[];
  music?: MediaItem[];
  assets?: MediaItem[];
};

type ModelsResponse = {
  models: { id: string; label: string; description?: string; defaultEffort?: string }[];
  efforts?: { id: string; label: string; description: string }[];
  preferred: string | null;
  preferredEffort?: string;
  error?: string;
};

const MODEL_CHOICE_KEY = "video-automation:model-choice";

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} B`;
  return String(value);
}
const SFX_CHOICE_KEY = "video-automation:sfx-choice";
const APPLIED_STYLES_KEY = "video-automation:applied-styles";

function readModelChoice(): { model?: string; effort?: string } {
  try {
    return JSON.parse(window.localStorage.getItem(MODEL_CHOICE_KEY) ?? "{}") as { model?: string; effort?: string };
  } catch {
    return {};
  }
}

function saveModelChoice(choice: { model?: string | null; effort?: string | null }): void {
  try {
    window.localStorage.setItem(MODEL_CHOICE_KEY, JSON.stringify({ ...readModelChoice(), ...choice }));
  } catch {
    // tarayıcı depolaması kapalıysa seçim sadece bu oturumda kalır
  }
}

function statusLabel(status: RenderJobState["status"] | "idle"): string {
  if (status === "rendering") return "Ajan çalışıyor";
  if (status === "paused") return "Duraklatıldı";
  if (status === "success") return "Başarılı";
  if (status === "error") return "Hata";
  if (status === "cancelled") return "İptal edildi";
  return "Hazır";
}

function statusColor(status: RenderJobState["status"] | "idle"): string {
  if (status === "rendering" || status === "paused") return "yellow";
  if (status === "success") return "teal";
  if (status === "error") return "red";
  return "gray";
}

function readVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Video süresi okunamadı."));
    video.src = url;
  });
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  if (minutes > 0) return `${minutes} dk ${seconds} sn`;
  return `${seconds} sn`;
}

function elapsedOf(job: RenderJobState, now: number): number {
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now;
  return Math.max(0, end - Date.parse(job.startedAt) - (job.pausedMs ?? 0));
}

function RenderProgress({ job }: { job: RenderJobState }) {
  const running = job.status === "rendering";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const elapsed = formatElapsed(elapsedOf(job, now));
  const percent = job.status === "success" ? 100 : (job.progress ?? 0);

  if (job.status === "success") {
    return (
      <Alert color="teal" variant="light" mb="md" title="Video hazır">
        Video {elapsed} içinde hazırlandı.
      </Alert>
    );
  }

  return (
    <Stack gap={6} mb="md">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          %{percent} tamamlandı
        </Text>
        <Text size="sm" c="dimmed">
          {job.status === "paused" ? "Duraklatıldı" : running ? "Geçen süre" : "Toplam süre"}: {elapsed}
        </Text>
      </Group>
      <Progress
        value={percent}
        size="lg"
        radius="xl"
        animated={running}
        striped={running}
        color={job.status === "error" ? "red" : job.status === "paused" ? "yellow" : job.status === "cancelled" ? "gray" : "violet"}
      />
      {job.stage ? (
        <Text size="xs" c="dimmed">
          {running ? job.stage : statusLabel(job.status)}
        </Text>
      ) : null}
    </Stack>
  );
}

function AgentLog({ entries, running }: { entries: AgentLogEntry[]; running: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {running ? "Ajan hazırlanıyor…" : "Render başlayınca ajanın adımları burada görünür."}
      </Text>
    );
  }

  return (
    <ScrollArea h={420} viewportRef={viewport} type="auto">
      <Stack gap={8} pr="sm">
        {entries.map((entry, index) =>
          entry.kind === "text" ? (
            <Text key={index} size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {entry.text}
            </Text>
          ) : (
            <Text
              key={index}
              size="xs"
              c={entry.kind === "error" || entry.status === "error" ? "red" : "dimmed"}
              ff="monospace"
              style={{ wordBreak: "break-all" }}
            >
              {entry.kind === "tool" ? "› " : "• "}
              {entry.text}
            </Text>
          ),
        )}
      </Stack>
    </ScrollArea>
  );
}

async function pollRenderJob(
  id: string,
  isCancelled: () => boolean,
  onUpdate?: (job: RenderJobState) => void,
): Promise<RenderJobState> {
  for (;;) {
    if (isCancelled()) {
      throw new Error("cancelled");
    }
    const response = await fetch(`/api/render?id=${encodeURIComponent(id)}`);
    const payload = (await response.json()) as RenderJobState & { error?: string };
    if (!response.ok) {
      if (response.status === 404) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        const retry = await fetch(`/api/render?id=${encodeURIComponent(id)}`);
        const again = (await retry.json()) as RenderJobState & { error?: string };
        if (retry.ok) {
          onUpdate?.(again);
          if (again.status === "rendering") {
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
            continue;
          }
          if (again.status === "error") throw new Error(again.error ?? "Render başarısız.");
          return again;
        }
      }
      throw new Error(payload.error ?? "Render durumu alınamadı.");
    }
    onUpdate?.(payload);
    if (payload.status === "rendering") {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      continue;
    }
    if (payload.status === "error") {
      throw new Error(payload.error ?? "Render başarısız.");
    }
    return payload;
  }
}

export function StudioPanel() {
  const { enabled, ready } = useEnabledSkills();
  const generated = useGeneratedSkills();
  const [appliedStyles, setAppliedStyles] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<StudioInputProps>(defaultInputProps);
  const [sources, setSources] = useState<MediaItem[]>([]);
  const [references, setReferences] = useState<MediaItem[]>([]);
  const [music, setMusic] = useState<MediaItem[]>([]);
  const [assets, setAssets] = useState<MediaItem[]>([]);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [status, setStatus] = useState<RenderJobState["status"] | "idle">("idle");
  const [job, setJob] = useState<RenderJobState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [models, setModels] = useState<ModelsResponse["models"]>([]);
  const [efforts, setEfforts] = useState<NonNullable<ModelsResponse["efforts"]>>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [uploadingVideos, setUploadingVideos] = useState<"sources" | "references" | null>(null);
  const watchToken = useRef(0);

  const handleSfxChange = useCallback((sfxMode: StudioInputProps["sfxMode"], sfxSelection: string[]) => {
    setForm((current) => ({ ...current, sfxMode, sfxSelection, soundEffects: sfxMode !== "off" }));
    try {
      window.localStorage.setItem(SFX_CHOICE_KEY, JSON.stringify({ sfxMode, sfxSelection }));
    } catch {
      // depolama kapalıysa seçim sadece bu oturumda kalır
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(SFX_CHOICE_KEY) ?? "null") as {
          sfxMode?: StudioInputProps["sfxMode"];
          sfxSelection?: string[];
        } | null;
        if (saved?.sfxMode === "library" || saved?.sfxMode === "free" || saved?.sfxMode === "off") {
          const sfxMode = saved.sfxMode;
          setForm((current) => ({
            ...current,
            sfxMode,
            sfxSelection: sfxMode === "library" && Array.isArray(saved.sfxSelection) ? saved.sfxSelection : [],
            soundEffects: sfxMode !== "off",
          }));
        }
      } catch {
        // kayıtlı seçim yoksa varsayılan kalır
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const watchJob = useCallback((id: string) => {
    const token = ++watchToken.current;
    let sawRendering = false;
    window.sessionStorage.setItem(RENDER_JOB_KEY, id);
    void pollRenderJob(
      id,
      () => watchToken.current !== token,
      (update) => {
        if (watchToken.current !== token) return;
        setJob(update);
        setErrorMessage(null);
        if (update.status === "rendering") sawRendering = true;
        if (update.status === "rendering" || update.status === "paused" || update.status === "success") setStatus(update.status);
      },
    )
      .then((finished) => {
        if (watchToken.current !== token) return;
        setJob(finished);
        setStatus(finished.status);
        if (finished.status === "cancelled") window.sessionStorage.removeItem(RENDER_JOB_KEY);
        else window.sessionStorage.setItem(RENDER_JOB_KEY, id);
        if (finished.status === "success" && finished.outputUrl && sawRendering) {
          notifications.show({
            color: "teal",
            title: "Video hazır",
            message: `${formatElapsed(elapsedOf(finished, Date.now()))} içinde hazırlandı${finished.modelName ? ` · ${finished.modelName}` : ""}.`,
            autoClose: 6000,
          });
        }
      })
      .catch((error: unknown) => {
        if (watchToken.current !== token || (error instanceof Error && error.message === "cancelled")) return;
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Render başarısız.");
        window.sessionStorage.removeItem(RENDER_JOB_KEY);
      });
  }, []);

  async function loadModels() {
    try {
      const response = await fetch("/api/models");
      const payload = (await response.json()) as ModelsResponse;
      setModels(payload.models);
      setEfforts(payload.efforts ?? []);
      setModelsError(payload.models.length === 0 ? (payload.error ?? "Model listesi boş.") : null);
      const saved = readModelChoice();
      const known = (id: string | null | undefined) => Boolean(id) && payload.models.some((item) => item.id === id);
      const knownEffort = (id: string | null | undefined) => Boolean(id) && (payload.efforts ?? []).some((item) => item.id === id);
      setForm((current) => ({
        ...current,
        model: known(current.model) ? current.model : known(saved.model) ? saved.model! : payload.preferred,
        effort: knownEffort(current.effort) ? current.effort : knownEffort(saved.effort) ? saved.effort! : (payload.preferredEffort ?? "high"),
      }));
      return payload.models.length > 0;
    } catch (error) {
      setModelsError(error instanceof Error ? error.message : "Model listesi alınamadı.");
      return false;
    }
  }

  async function connectClaude() {
    setConnecting(true);
    try {
      const response = await fetch("/api/skills/auth", { method: "POST" });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Claude girişi başlatılamadı.");
      if (payload.message) notifications.show({ color: "violet", title: "Claude girişi", message: payload.message, autoClose: 10000 });
      // Girişin tamamlanmasını 3 dakikaya kadar bekle.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = (await fetch("/api/skills/auth?refresh=1").then((item) => item.json())) as { ready?: boolean };
        if (status.ready) {
          await loadModels();
          notifications.show({ color: "teal", title: "Bağlandı", message: "Claude aboneliğin hazır." });
          return;
        }
      }
      throw new Error("Giriş tamamlanmadı. Terminalde `claude` yazıp `/login` ile tekrar dene.");
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Claude bağlanamadı",
        message: error instanceof Error ? error.message : "Claude girişi tamamlanamadı.",
      });
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadModels(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const missing = sources.filter((item) => durations[item.relativePath] === undefined);
    if (missing.length === 0) return;
    let ignore = false;
    void Promise.all(
      missing.map(async (item) => [item.relativePath, await readVideoDuration(item.url).catch(() => NaN)] as const),
    ).then((entries) => {
      if (!ignore) setDurations((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      ignore = true;
    };
  }, [durations, sources]);

  const firstSourceDuration = form.sourceVideos[0] ? durations[form.sourceVideos[0]] : undefined;
  const totalSourceDuration = form.sourceVideos.reduce(
    (sum, item) => sum + (Number.isFinite(durations[item]) ? durations[item] : 0),
    0,
  );

  useEffect(() => {
    if (firstSourceDuration === undefined || !Number.isFinite(firstSourceDuration)) return;
    const timer = window.setTimeout(
      () => setForm((current) => ({ ...current, durationInSeconds: firstSourceDuration })),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [firstSourceDuration]);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const response = await fetch("/api/media");
        const payload = (await response.json()) as MediaResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Medya listesi alınamadı.");
        if (ignore) return;
        setSources(payload.sources);
        setReferences(payload.references);
        setMusic(payload.music ?? []);
        setAssets(payload.assets ?? []);
      } catch (error) {
        if (!ignore) {
          setMediaError(error instanceof Error ? error.message : "Medya listesi alınamadı.");
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let saved: Record<string, boolean> = {};
      try {
        saved = JSON.parse(window.localStorage.getItem(APPLIED_STYLES_KEY) ?? "{}") as Record<string, boolean>;
      } catch {
        saved = {};
      }
      setAppliedStyles((current) => {
        const next = { ...current };
        // Stil skill'leri varsayılan olarak kapalı; kullanıcının son seçimi hatırlanır.
        for (const skill of generated.skills) {
          if (next[skill.id] === undefined) next[skill.id] = saved[skill.id] === true;
        }
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [generated.skills]);

  // Geçmiş sayfasından "Bu ayarları stüdyoya yükle" ile gelen ayarları uygula.
  useEffect(() => {
    if (!generated.ready) return;
    const timer = window.setTimeout(() => {
      let template: { id?: string; settings?: StudioInputProps } | null = null;
      try {
        template = JSON.parse(window.localStorage.getItem(LOAD_TEMPLATE_KEY) ?? "null");
        window.localStorage.removeItem(LOAD_TEMPLATE_KEY);
      } catch {
        template = null;
      }
      const settings = template?.settings;
      if (!settings) return;
      const { styleSkills: templateSkills, ...rest } = settings;
      const wanted = new Set(templateSkills.map((skill) => skill.id));
      const knownModel = typeof rest.model === "string" && (rest.model.startsWith("claude-") || rest.model === "default");
      setForm((current) => ({ ...current, ...rest, model: knownModel ? rest.model : current.model }));
      const applied: Record<string, boolean> = {};
      for (const skill of generated.skills) applied[skill.id] = wanted.has(skill.id);
      setAppliedStyles(applied);
      try {
        window.localStorage.setItem(APPLIED_STYLES_KEY, JSON.stringify(applied));
        window.localStorage.setItem(SFX_CHOICE_KEY, JSON.stringify({ sfxMode: rest.sfxMode, sfxSelection: rest.sfxSelection }));
      } catch {
        // depolama kapalıysa ayarlar yine de bu sayfaya uygulanır
      }
      const missing = templateSkills.filter((skill) => !generated.skills.some((item) => item.id === skill.id));
      notifications.show({
        color: missing.length ? "yellow" : "teal",
        title: "Ayarlar yüklendi",
        message: missing.length
          ? `Geçmişteki ayarlar yüklendi. Artık bulunmayan skill: ${missing.map((skill) => skill.name).join(", ")}.`
          : "Geçmişteki videonun ayarları stüdyoya yüklendi. İstersen değiştirip yeni video üretebilirsin.",
        autoClose: 6000,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [generated.ready, generated.skills]);

  const inputProps = useMemo<StudioInputProps>(() => {
    const styleSkills = generated.skills.filter(
      (skill) => generated.enabled[skill.id] !== false && appliedStyles[skill.id] === true,
    );
    return {
      ...form,
      skills: {
        textOverlay: enabled.textOverlay && form.skills.textOverlay,
        vignette: enabled.vignette && form.skills.vignette,
      },
      styleSkills,
    };
  }, [appliedStyles, enabled.textOverlay, enabled.vignette, form, generated.enabled, generated.skills]);

  useEffect(() => {
    const savedId = window.sessionStorage.getItem(RENDER_JOB_KEY);
    if (savedId) {
      watchJob(savedId);
      return;
    }
    let cancelled = false;
    void fetch("/api/render?latest=1")
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const job = (await response.json()) as RenderJobState;
        if (!cancelled && job.id) watchJob(job.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [watchJob]);

  const canRender =
    inputProps.sourceVideos.length > 0 &&
    Boolean(inputProps.model) &&
    (inputProps.prompt.trim().length >= 3 || inputProps.styleSkills.length > 0);
  const sourceOptions = sources.map((item) => ({ value: item.relativePath, label: item.name }));
  const referenceOptions = references.map((item) => ({ value: item.relativePath, label: item.name }));
  const musicOptions = music.map((item) => ({ value: item.relativePath, label: item.name }));
  const visibleSkills = skillCatalog.filter((skill) => enabled[skill.id]);
  const timelineSkill = inputProps.styleSkills.find((skill) => skill.timelineEditor) ?? null;
  const timelineClips = useMemo(
    () =>
      form.sourceVideos.flatMap((path) => {
        const item = sources.find((entry) => entry.relativePath === path);
        const duration = durations[path];
        return item && Number.isFinite(duration) && duration > 0 ? [{ path, url: item.url, duration }] : [];
      }),
    [durations, form.sourceVideos, sources],
  );
  const timelineAssets = useMemo(
    () =>
      form.assetImages.flatMap((path) => {
        const item = assets.find((entry) => entry.relativePath === path);
        return item ? [{ path, name: item.name, url: item.url }] : [];
      }),
    [assets, form.assetImages],
  );

  async function uploadMusic(file: File | null) {
    if (!file) return;
    setUploadingMusic(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/media/music", { method: "POST", body });
      const payload = (await response.json()) as { item?: MediaItem; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? "Müzik yüklenemedi.");
      const item = payload.item;
      setMusic((current) =>
        [...current.filter((entry) => entry.relativePath !== item.relativePath), item].sort((a, b) =>
          a.name.localeCompare(b.name, "tr"),
        ),
      );
      setForm((current) => ({ ...current, backgroundMusic: item.relativePath }));
      notifications.show({
        color: "teal",
        title: "Müzik eklendi",
        message: "Parça arka planda kullanılacak.",
      });
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Müzik yüklenemedi",
        message: error instanceof Error ? error.message : "Müzik yüklenemedi.",
      });
    } finally {
      setUploadingMusic(false);
    }
  }

  async function uploadVideos(kind: "sources" | "references", files: File[]) {
    if (files.length === 0) return;
    setUploadingVideos(kind);
    const field = kind === "sources" ? "sourceVideos" : "referenceVideos";
    try {
      for (const file of files.slice(0, MAX_VIDEOS)) {
        const query = new URLSearchParams({ kind, name: file.name });
        const response = await fetch(`/api/media/videos?${query}`, { method: "POST", body: file });
        const payload = (await response.json()) as { item?: MediaItem; error?: string };
        if (!response.ok || !payload.item) throw new Error(payload.error ?? `${file.name} yüklenemedi.`);
        const item = payload.item;
        const update = (current: MediaItem[]) =>
          [...current.filter((entry) => entry.relativePath !== item.relativePath), item].sort((a, b) =>
            a.name.localeCompare(b.name, "tr"),
          );
        if (kind === "sources") setSources(update);
        else setReferences(update);
        setForm((current) => ({
          ...current,
          [field]: [...current[field].filter((entry) => entry !== item.relativePath), item.relativePath].slice(0, MAX_VIDEOS),
        }));
      }
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Video yüklenemedi",
        message: error instanceof Error ? error.message : "Video yüklenemedi.",
      });
    } finally {
      setUploadingVideos(null);
    }
  }

  async function cancelRender() {
    if (!job) return;
    const response = await fetch(`/api/render?id=${encodeURIComponent(job.id)}`, { method: "DELETE" });
    const payload = (await response.json()) as RenderJobState & { error?: string };
    if (!response.ok) return;
    watchToken.current += 1;
    setJob(payload);
    setStatus("cancelled");
    window.sessionStorage.removeItem(RENDER_JOB_KEY);
  }

  async function pauseRender() {
    if (!job) return;
    const response = await fetch("/api/render", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, action: "pause" }),
    });
    const payload = (await response.json()) as RenderJobState & { error?: string };
    if (!response.ok) {
      setErrorMessage(payload.error ?? "Duraklatılamadı.");
      return;
    }
    setJob(payload);
    setStatus("paused");
    window.sessionStorage.setItem(RENDER_JOB_KEY, payload.id);
  }

  async function resumeRender() {
    if (!job) return;
    setErrorMessage(null);
    const response = await fetch("/api/render", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, action: "resume" }),
    });
    const payload = (await response.json()) as RenderJobState & { error?: string };
    if (!response.ok) {
      setErrorMessage(payload.error ?? "Devam ettirilemedi.");
      return;
    }
    setJob(payload);
    setStatus("rendering");
    watchJob(payload.id);
  }

  async function uploadAssets(files: File[]) {
    if (files.length === 0) return;
    setUploadingAssets(true);
    try {
      const added: string[] = [];
      for (const file of files.slice(0, MAX_ASSET_IMAGES)) {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/media/assets", { method: "POST", body });
        const payload = (await response.json()) as { item?: MediaItem; error?: string };
        if (!response.ok || !payload.item) throw new Error(payload.error ?? "Görsel yüklenemedi.");
        const item = payload.item;
        added.push(item.relativePath);
        setAssets((current) =>
          [...current.filter((entry) => entry.relativePath !== item.relativePath), item].sort((a, b) =>
            a.name.localeCompare(b.name, "tr"),
          ),
        );
      }
      setForm((current) => ({
        ...current,
        assetImages: [...current.assetImages, ...added].filter((path, index, list) => list.indexOf(path) === index).slice(0, MAX_ASSET_IMAGES),
      }));
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Görsel yüklenemedi",
        message: error instanceof Error ? error.message : "Görsel yüklenemedi.",
      });
    } finally {
      setUploadingAssets(false);
    }
  }

  async function startRender() {
    setErrorMessage(null);
    setJob(null);

    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputProps),
      });
      const payload = (await response.json()) as RenderJobState & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Render başlatılamadı.");
      }

      setJob(payload);
      setStatus("rendering");
      watchJob(payload.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render başarısız.";
      setStatus("error");
      setErrorMessage(message);
      window.sessionStorage.removeItem(RENDER_JOB_KEY);
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Video Stüdyosu</Title>
          <Text c="dimmed" mt={4}>
            Videolarını ve ayarlarını seç. Kurgu, altyazı, animasyon, ses efekti ve render işini ajan yapar.
          </Text>
        </div>
        <Badge color={statusColor(status)} variant="light" size="lg">
          {statusLabel(status)}
        </Badge>
      </Group>

      <InfoCard
        id="studio"
        title="Nasıl video üretilir?"
        steps={[
          <>Kaynak videolarını seç ya da <b>Bilgisayardan kaynak video seç</b> ile yükle. Birden fazla seçersen sırayla arka arkaya kurgulanır.</>,
          <>İstersen bir <b>stil skill&apos;i</b> seç (Skill Oluştur sayfasında kendi tarzını çıkarabilirsin) ya da kutuya ne istediğini yaz. Mikrofon butonuyla sesli de yazdırabilirsin.</>,
          <>Model ve efor seç. Opus en iyi sonucu verir; Haiku daha hızlı ve aboneliğinden daha az harcar.</>,
          <>İsteğe bağlı: referans video, arka plan müziği, ses efektleri, çözünürlük ve kaliteyi ayarla.</>,
          <><b>Ajanı başlat</b> butonuna bas. Ajan kurguyu, altyazıyı, animasyonları ve render&apos;ı kendisi yapar; bitince video burada ve Geçmiş sayfasında görünür.</>,
        ]}
        tip="Müzik ve ses efekti listeleri boşsa public/media/music ve public/media/sfx klasörlerine kendi telifsiz seslerini koy."
      />

      {mediaError ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Medya okunamadı">
          {mediaError}
        </Alert>
      ) : null}

      {modelsError ? (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />} title="Claude Code hazır değil">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{modelsError}</Text>
            <Text size="sm" c="dimmed">
              Ajan bilgisayarındaki Claude Code ile çalışır ve Claude aboneliğini kullanır; API anahtarı gerekmez.
            </Text>
            <Group gap="xs">
              <Button size="xs" onClick={() => void connectClaude()} loading={connecting}>
                Claude ile bağlan
              </Button>
              <Button size="xs" variant="subtle" onClick={() => void loadModels()}>
                Tekrar kontrol et
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <MultiSelect
              label="Kaynak videolar"
              description="Seçtiğin sırayla arka arkaya kurgulanır. Çıktının süresi bunların toplamıdır."
              placeholder={form.sourceVideos.length ? undefined : "Seç veya bilgisayardan yükle"}
              data={sourceOptions}
              value={form.sourceVideos}
              onChange={(value) => setForm((current) => ({ ...current, sourceVideos: value.slice(0, MAX_VIDEOS) }))}
              searchable
              clearable
              nothingFoundMessage="Kaynak video yok"
              required
            />
            <Group gap="xs">
              <FileButton
                multiple
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
                onChange={(files) => void uploadVideos("sources", files)}
              >
                {(props) => (
                  <Button
                    {...props}
                    variant="light"
                    leftSection={<IconUpload size={16} />}
                    loading={uploadingVideos === "sources"}
                  >
                    Bilgisayardan kaynak video seç
                  </Button>
                )}
              </FileButton>
              {totalSourceDuration > 0 ? (
                <Text size="sm" c="dimmed">
                  Toplam {totalSourceDuration.toFixed(1)} sn
                </Text>
              ) : null}
            </Group>
            <Textarea
              label="Ajana ne istediğini anlat"
              description="Stil skill'i seçtiysen isteğe bağlı. Tarz, tempo, vurgulanacak yerler ve konuşmanın doğru metni (script). Script verirsen altyazılar buna göre düzeltilir."
              placeholder='Örn: Arada tam ekran animasyon, arada bölünmüş ekran olsun. Krem/turuncu Claude tarzı tasarım. Script: "Claude Opus 5.5 ile bu videoyu sadece kodla editledim..."'
              autosize
              minRows={4}
              value={form.prompt}
              onChange={(event) => {
                const prompt = event.currentTarget.value;
                setForm((current) => ({ ...current, prompt }));
              }}
            />
            <Group justify="space-between" mt={-8}>
              <DictationButton
                onText={(text) => setForm((current) => ({ ...current, prompt: appendDictation(current.prompt, text) }))}
              />
              <PromptHistory current={form.prompt} onSelect={(prompt) => setForm((current) => ({ ...current, prompt }))} />
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Select
                label="Model"
                description={
                  models.find((item) => item.id === form.model)?.description ??
                  "Claude Code ajanının modeli (aboneliğinden kullanılır)."
                }
                placeholder={modelsError ? "Önce Claude'a bağlan" : "Model seç"}
                data={models.map((item) => ({ value: item.id, label: item.label }))}
                value={form.model}
                onChange={(value) => {
                  setForm((current) => ({ ...current, model: value }));
                  saveModelChoice({ model: value });
                }}
                allowDeselect={false}
                nothingFoundMessage="Model yok"
              />
              <Select
                label="Efor (düşünme seviyesi)"
                description={
                  form.effort === "auto"
                    ? `Modelin varsayılanı: ${models.find((item) => item.id === form.model)?.defaultEffort ?? "medium"}`
                    : (efforts.find((item) => item.id === form.effort)?.description ?? "Yüksek efor daha iyi sonuç, daha çok limit.")
                }
                placeholder="Efor seç"
                data={efforts.map((item) => ({ value: item.id, label: item.label }))}
                value={form.effort}
                onChange={(value) => {
                  setForm((current) => ({ ...current, effort: value }));
                  saveModelChoice({ effort: value });
                }}
                allowDeselect={false}
                disabled={Boolean(modelsError)}
              />
            </SimpleGrid>
            <FileButton
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(files) => void uploadAssets(files)}
            >
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconPhoto size={16} />} loading={uploadingAssets}>
                  Kaynak görsel yükle
                </Button>
              )}
            </FileButton>
            <Text size="sm" c="dimmed">
              Ekran görüntüsü, logo ve ikon. Yüklemediğin şekilleri animasyon kodu çizer.
            </Text>
            {form.assetImages.length > 0 ? (
              <Stack gap={4}>
                {form.assetImages.map((assetPath) => (
                  <Group key={assetPath} justify="space-between">
                    <Text size="sm">{assets.find((item) => item.relativePath === assetPath)?.name ?? assetPath}</Text>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          assetImages: current.assetImages.filter((item) => item !== assetPath),
                          assetRanges: current.assetRanges.filter((range) => range.asset !== assetPath),
                        }))
                      }
                    >
                      Kaldır
                    </Button>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Henüz görsel seçilmedi.
              </Text>
            )}
            <MultiSelect
              label="Referans videolar"
              description="İsteğe bağlı. Ajan bunların tarzını inceler ve taklit eder; çıktıya koymaz."
              placeholder={form.referenceVideos.length ? undefined : "Seç veya bilgisayardan yükle"}
              data={referenceOptions}
              value={form.referenceVideos}
              onChange={(value) => setForm((current) => ({ ...current, referenceVideos: value.slice(0, MAX_VIDEOS) }))}
              searchable
              clearable
              nothingFoundMessage="Referans video yok"
            />
            <FileButton
              multiple
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
              onChange={(files) => void uploadVideos("references", files)}
            >
              {(props) => (
                <Button
                  {...props}
                  variant="light"
                  leftSection={<IconUpload size={16} />}
                  loading={uploadingVideos === "references"}
                >
                  Bilgisayardan referans video seç
                </Button>
              )}
            </FileButton>
            <SoundEffectsField
              mode={form.sfxMode}
              selection={form.sfxSelection}
              onChange={handleSfxChange}
            />
            <FileButton
              accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.aac,.ogg"
              onChange={(file) => void uploadMusic(file)}
            >
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconMusic size={16} />} loading={uploadingMusic}>
                  Arka plan müziği yükle
                </Button>
              )}
            </FileButton>
            <Select
              label="Arka plan müziği"
              description="İsteğe bağlı. Konuşmanın altında, konuşma varken kısılarak çalar."
              placeholder="Müzik yok"
              data={musicOptions}
              value={form.backgroundMusic}
              onChange={(value) => setForm((current) => ({ ...current, backgroundMusic: value }))}
              searchable
              clearable
              nothingFoundMessage="Henüz müzik yok"
            />
            {form.backgroundMusic ? (
              <div>
                <Text size="sm" fw={500} mb={6}>
                  Müzik düzeyi: {Math.round(form.musicVolume * 100)}%
                </Text>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.musicVolume}
                  onChange={(value) => setForm((current) => ({ ...current, musicVolume: value }))}
                />
              </div>
            ) : null}
            <Select
              label="Çözünürlük"
              data={RESOLUTION_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
              value={form.resolutionId}
              allowDeselect={false}
              onChange={(value) => {
                const preset = RESOLUTION_PRESETS.find((item) => item.id === value) ?? RESOLUTION_PRESETS[1];
                setForm((current) => ({
                  ...current,
                  resolutionId: preset.id,
                  width: preset.width,
                  height: preset.height,
                }));
              }}
            />
            <Select
              label="Kare hızı"
              data={FPS_OPTIONS.map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
              value={String(form.fps)}
              allowDeselect={false}
              onChange={(value) => {
                const fps = Number(value);
                if (fps !== 24 && fps !== 30 && fps !== 60) return;
                setForm((current) => ({ ...current, fps }));
              }}
            />
            <Select
              label="Kalite"
              data={QUALITY_PRESETS.map((item) => ({
                value: item.id,
                label: `${item.label} — ${item.description}`,
              }))}
              value={form.qualityId}
              allowDeselect={false}
              onChange={(value) => {
                const preset = QUALITY_PRESETS.find((item) => item.id === value) ?? QUALITY_PRESETS[1];
                setForm((current) => ({ ...current, qualityId: preset.id, crf: preset.crf }));
              }}
            />
            <Checkbox
              label="Çerçeveyi doldur"
              description="Kapalıyken video seçilen karenin içine sığdırılır."
              checked={form.cover}
              onChange={(event) => {
                const cover = event.currentTarget.checked;
                setForm((current) => ({ ...current, cover }));
              }}
            />
            <Text fw={600}>Skiller</Text>
            {ready && visibleSkills.length === 0 ? (
              <Text size="sm" c="dimmed">
                Stüdyoda açık skill yok. Skiller sayfasından etkinleştir.
              </Text>
            ) : null}
            {generated.skills
              .filter((skill) => generated.enabled[skill.id] !== false)
              .map((skill) => (
                <Switch
                  key={skill.id}
                  label={skill.name}
                  description={skill.summary}
                  checked={appliedStyles[skill.id] === true}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setAppliedStyles((current) => {
                      const next = { ...current, [skill.id]: checked };
                      // Bağlayıcı (strict) kılavuzlar birbiriyle çakışır: aynı anda yalnızca biri açık olsun.
                      if (checked && skill.strict) {
                        for (const other of generated.skills) {
                          if (other.id !== skill.id && other.strict) next[other.id] = false;
                        }
                      }
                      try {
                        window.localStorage.setItem(APPLIED_STYLES_KEY, JSON.stringify(next));
                      } catch {
                        // depolama kapalıysa seçim sadece bu oturumda kalır
                      }
                      return next;
                    });
                  }}
                />
              ))}

            {timelineSkill ? (
              <Paper withBorder p="md" radius="md">
                <Text fw={600}>Zaman çizelgesi</Text>
                <Text size="sm" c="dimmed" mb="sm">
                  {timelineSkill.name}: ajan animasyonları yalnızca işaretlediğin aralıklara koyar; görselleri kendi aralığında,
                  konuşmaya göre gösterir.
                </Text>
                <TimelineEditor
                  clips={timelineClips}
                  assets={timelineAssets}
                  animationRanges={form.animationRanges}
                  assetRanges={form.assetRanges}
                  onChange={(next) => setForm((current) => ({ ...current, ...next }))}
                />
              </Paper>
            ) : null}

            {visibleSkills.map((skill) => (
              <Switch
                key={skill.id}
                label={skill.name}
                description={skill.summary}
                checked={form.skills[skill.id]}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setForm((current) => ({
                    ...current,
                    skills: { ...current.skills, [skill.id]: checked },
                  }));
                }}
              />
            ))}

            {inputProps.skills.textOverlay ? (
              <Stack gap="sm">
                <TextInput
                  label="Katman metni"
                  value={form.textOverlay.text}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    setForm((current) => ({
                      ...current,
                      textOverlay: { ...current.textOverlay, text },
                    }));
                  }}
                />
                <div>
                  <Text size="sm" fw={500} mb={6}>
                    Yazı boyutu: {form.textOverlay.fontSize}px
                  </Text>
                  <Slider
                    min={32}
                    max={140}
                    step={2}
                    value={form.textOverlay.fontSize}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        textOverlay: { ...current.textOverlay, fontSize: value },
                      }))
                    }
                  />
                </div>
              </Stack>
            ) : null}

            {inputProps.skills.vignette ? (
              <div>
                <Text size="sm" fw={500} mb={6}>
                  Vignette yoğunluğu: {Math.round(form.vignette.intensity * 100)}%
                </Text>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.vignette.intensity}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      vignette: { intensity: value },
                    }))
                  }
                />
              </div>
            ) : null}

            <Group grow>
              {status === "paused" && job ? (
                <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => void resumeRender()}>
                  Devam et
                </Button>
              ) : (
                <Button
                  leftSection={<IconPlayerPlay size={16} />}
                  onClick={() => void startRender()}
                  loading={status === "rendering"}
                  disabled={!canRender}
                >
                  Ajanı başlat
                </Button>
              )}
              {status === "rendering" ? (
                <Button
                  color="yellow"
                  variant="light"
                  leftSection={<IconPlayerPause size={16} />}
                  onClick={() => void pauseRender()}
                >
                  Duraklat
                </Button>
              ) : null}
              {status === "rendering" || status === "paused" ? (
                <Button
                  color="red"
                  variant="light"
                  leftSection={<IconPlayerStop size={16} />}
                  onClick={() => void cancelRender()}
                >
                  Durdur
                </Button>
              ) : null}
            </Group>
            {!canRender && status !== "rendering" ? (
              <Text size="sm" c="dimmed">
                Başlatmak için en az bir kaynak video, bir model ve bir stil skill&apos;i ya da ne istediğini anlatan bir prompt gerekir.
              </Text>
            ) : null}
            {errorMessage ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title="Render hatası">
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {errorMessage}
                </Text>
              </Alert>
            ) : null}
          </Stack>
        </Paper>

        <Stack>
          <Paper withBorder p="lg" radius="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Ajan</Text>
              {job?.revisionOf ? (
                <Tooltip multiline w={300} label={job.revisionPrompt ?? ""}>
                  <Badge variant="light" color="orange">
                    Düzeltme
                  </Badge>
                </Tooltip>
              ) : null}
              {job?.modelName ? (
                <Badge variant="light" color="gray">
                  {job.modelName}
                </Badge>
              ) : null}
              {job?.usage ? (
                <Tooltip
                  multiline
                  w={260}
                  label={`Giriş ${formatTokens(job.usage.inputTokens)} · önbellek okuma ${formatTokens(job.usage.cacheReadTokens)} · önbelleğe yazma ${formatTokens(job.usage.cacheWriteTokens)} · çıktı ${formatTokens(job.usage.outputTokens)}`}
                >
                  <Badge variant="light" color="gray">
                    {job.usage.turns} adım ·{" "}
                    {formatTokens(
                      job.usage.inputTokens + job.usage.cacheReadTokens + job.usage.cacheWriteTokens + job.usage.outputTokens,
                    )}{" "}
                    token
                  </Badge>
                </Tooltip>
              ) : null}
            </Group>
            {job ? <RenderProgress job={job} /> : null}
            <AgentLog entries={job?.log ?? []} running={status === "rendering"} />
            {status === "rendering" && job?.detail ? (
              <Text size="xs" c="dimmed" mt="sm">
                Şu an: {job.detail}
              </Text>
            ) : null}
          </Paper>

          {job?.outputUrl ? (
            <Paper withBorder p="lg" radius="md">
              <Text fw={600} mb="sm">
                Sonuç
              </Text>
              <video
                key={job.outputUrl}
                src={job.outputUrl}
                controls
                style={{ display: "block", width: "100%", maxHeight: 640, borderRadius: 12, background: "#000" }}
              />
              {job.summary ? (
                <Text size="sm" mt="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {job.summary}
                </Text>
              ) : null}
              <Button component="a" href={job.outputUrl} download variant="light" mt="sm">
                MP4 indir
              </Button>
            </Paper>
          ) : null}

          <Paper withBorder p="lg" radius="md">
            <Text fw={600} mb="sm">
              Kaynak önizleme
            </Text>
            <div style={{ maxWidth: 340, margin: "0 auto" }}>
              <StudioPlayer
                key={`${inputProps.sourceVideos[0] ?? "empty"}-${inputProps.durationInSeconds}-${inputProps.cover}-${inputProps.resolutionId}-${inputProps.fps}-${inputProps.backgroundMusic ?? "nomusic"}`}
                inputProps={inputProps}
              />
            </div>
            <Text size="sm" c="dimmed" mt="sm">
              İlk kaynak videoyu ham hâliyle gösterir. Kurgu, animasyon ve altyazıları ajan yapar.
            </Text>
            <Group gap="xs" mt="md">
              {inputProps.skills.textOverlay ? (
                <Badge variant="outline">Metin</Badge>
              ) : null}
              {inputProps.skills.vignette ? (
                <Badge variant="outline">Vignette</Badge>
              ) : null}
              {inputProps.sourceVideos.length > 1 ? (
                <Badge variant="outline">{inputProps.sourceVideos.length} kaynak</Badge>
              ) : null}
              {inputProps.referenceVideos.length ? (
                <Badge variant="outline">{inputProps.referenceVideos.length} referans</Badge>
              ) : null}
              {inputProps.backgroundMusic ? <Badge variant="outline">Müzik</Badge> : null}
              {inputProps.sfxMode !== "off" ? (
                <Badge variant="outline">
                  {inputProps.sfxMode === "free"
                    ? "SFX: serbest"
                    : inputProps.sfxSelection.length
                      ? `SFX: ${inputProps.sfxSelection.length} seçili`
                      : "SFX: kütüphane"}
                </Badge>
              ) : null}
              <Badge variant="outline">
                {inputProps.width}×{inputProps.height} · {inputProps.fps} fps
              </Badge>
            </Group>
          </Paper>
          <Accordion variant="contained">
            <Accordion.Item value="props">
              <Accordion.Control>inputProps</Accordion.Control>
              <Accordion.Panel>
                <Code block>{JSON.stringify(inputProps, null, 2)}</Code>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}
