"use client";

import {
  Accordion,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAdjustments, IconPencil, IconSearch, IconUpload } from "@tabler/icons-react";
import { appendDictation, DictationButton } from "./DictationButton";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { RenderRecord, RenderRecordSummary } from "@/lib/render-history";
import { QUALITY_PRESETS, type StudioInputProps } from "@/lib/studio";
import { InfoCard } from "./InfoCard";

export const LOAD_TEMPLATE_KEY = "video-automation:load-template";
// Stüdyo sayfasının izlediği aktif iş (StudioPanel ile aynı anahtar).
const RENDER_JOB_KEY = "video-automation-render-job";

const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

const EFFORT_LABELS: Record<string, string> = {
  auto: "Model varsayılanı",
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  xhigh: "Çok yüksek",
  max: "Maksimum",
};

const SFX_LABELS: Record<StudioInputProps["sfxMode"], string> = {
  library: "Ses kütüphanem",
  free: "Serbest",
  off: "Kapalı",
};

function fileName(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} B`;
  return String(value);
}

function duration(record: { startedAt: string; finishedAt: string | null }): string | null {
  if (!record.finishedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(record.finishedAt) - Date.parse(record.startedAt)) / 1000));
  return `${Math.floor(seconds / 60)} dk ${seconds % 60} sn`;
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <Text size="sm" c="dimmed">Yok</Text>;
  return (
    <Stack gap={2}>
      {items.map((item) => (
        <Text key={item} size="sm" style={{ wordBreak: "break-all" }}>
          {item}
        </Text>
      ))}
    </Stack>
  );
}

function Details({ record }: { record: RenderRecord }) {
  const s = record.settings;
  const quality = QUALITY_PRESETS.find((item) => item.id === s.qualityId);
  const rows: [string, React.ReactNode][] = [
    ...(record.revisionPrompt
      ? ([["Düzeltme isteği", <Text key="rev" size="sm" style={{ whiteSpace: "pre-wrap" }}>{record.revisionPrompt}</Text>]] as [string, React.ReactNode][])
      : []),
    ["Üretim", `${dateFormat.format(new Date(record.finishedAt ?? record.startedAt))}${duration(record) ? ` · ${duration(record)}` : ""}`],
    ["Model", record.modelName ?? s.model ?? "—"],
    ["Efor", EFFORT_LABELS[s.effort ?? ""] ?? "—"],
    ["Kaynak videolar", <List key="src" items={s.sourceVideos.map(fileName)} />],
    ["Referans videolar", <List key="ref" items={s.referenceVideos.map(fileName)} />],
    ["Stil skill'leri", <List key="sk" items={s.styleSkills.map((skill) => `${skill.name}${skill.strict ? " (bağlayıcı)" : ""}`)} />],
    ["Çözünürlük / FPS", `${s.width}×${s.height} · ${s.fps} fps`],
    ["Kalite", quality ? `${quality.label} (CRF ${s.crf})` : `CRF ${s.crf}`],
    ["Müzik", s.backgroundMusic ? `${fileName(s.backgroundMusic)} · seviye ${s.musicVolume}` : "Yok"],
    [
      "Ses efektleri",
      s.sfxMode === "library" && s.sfxSelection.length
        ? <Stack key="sfx" gap={4}><Text size="sm">{SFX_LABELS[s.sfxMode]} · seçilenler:</Text><List items={s.sfxSelection.map((item) => item.replace(/^sfx\//, ""))} /></Stack>
        : SFX_LABELS[s.sfxMode],
    ],
    ["Görseller", <List key="img" items={s.assetImages.map(fileName)} />],
  ];
  if (record.usage) {
    const total = record.usage.inputTokens + record.usage.cacheReadTokens + record.usage.cacheWriteTokens + record.usage.outputTokens;
    rows.push(["Kullanım", `${record.usage.turns} adım · ${formatTokens(total)} token`]);
  }

  return (
    <Stack gap="md">
      <video src={record.outputUrl} controls preload="metadata" style={{ width: "100%", maxHeight: 520, background: "#000", borderRadius: 8 }} />
      <div>
        <Text size="sm" fw={600} mb={4}>
          Prompt
        </Text>
        {s.prompt ? (
          <Code block style={{ whiteSpace: "pre-wrap" }}>
            {s.prompt}
          </Code>
        ) : (
          <Text size="sm" c="dimmed">
            Prompt yazılmamış.
          </Text>
        )}
      </div>
      <Table variant="vertical" withTableBorder layout="fixed">
        <Table.Tbody>
          {rows.map(([label, value]) => (
            <Table.Tr key={label}>
              <Table.Th w={150}>{label}</Table.Th>
              <Table.Td>{value}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {record.summary ? (
        <div>
          <Text size="sm" fw={600} mb={4}>
            Ajanın özeti
          </Text>
          <Text size="sm" c="dimmed">
            {record.summary}
          </Text>
        </div>
      ) : null}
      {s.styleSkills.some((skill) => skill.guide) ? (
        <Accordion variant="contained">
          {s.styleSkills
            .filter((skill) => skill.guide)
            .map((skill) => (
              <Accordion.Item key={skill.id} value={skill.id}>
                <Accordion.Control>{skill.name} — o anki kılavuz</Accordion.Control>
                <Accordion.Panel>
                  <Code block style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto" }}>
                    {skill.guide}
                  </Code>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
        </Accordion>
      ) : null}
    </Stack>
  );
}

type ModelsPayload = {
  models?: { id: string; label: string }[];
  efforts?: { id: string; label: string }[];
  error?: string;
};

function RevisionDialog({ record, onClose }: { record: RenderRecord; onClose: () => void }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<ModelsPayload>({});
  const [model, setModel] = useState<string | null>(record.settings.model);
  const [effort, setEffort] = useState<string | null>(record.settings.effort ?? "high");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    void fetch("/api/models")
      .then((response) => response.json())
      .then((payload: ModelsPayload) => {
        if (ignore) return;
        setModels(payload);
        const ids = (payload.models ?? []).map((item) => item.id);
        setModel((current) => (current && ids.includes(current) ? current : (ids[0] ?? null)));
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revise: true, parentId: record.id, prompt, model, effort }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? "Düzeltme başlatılamadı.");
      try {
        window.sessionStorage.setItem(RENDER_JOB_KEY, payload.id);
      } catch {
        // stüdyo yine en son işi kendisi bulur
      }
      notifications.show({ color: "teal", title: "Düzeltme başladı", message: "İlerlemeyi stüdyoda izleyebilirsin." });
      router.push("/");
    } catch (error) {
      notifications.show({ color: "red", title: "Başlatılamadı", message: error instanceof Error ? error.message : "Hata" });
      setBusy(false);
    }
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Ajan bu videonun kodunu açar, yalnızca yazdığın yerleri değiştirir ve videoyu yeniden render eder. Geri kalan her şey
        aynen kalır. Sonuç yeni bir sürüm olarak geçmişe eklenir; bu video silinmez.
      </Text>
      <Textarea
        label="Neyi düzeltmek istiyorsun?"
        description="Mümkünse zamanı ya da sahneyi belirt. Ör: 14. saniyedeki tam ekran animasyonun başlığı daha büyük olsun; kapanışta müzik biraz daha kısık olsun."
        autosize
        minRows={4}
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
        data-autofocus
      />
      <DictationButton onText={(text) => setPrompt((current) => appendDictation(current, text))} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Select
          label="Model"
          data={(models.models ?? []).map((item) => ({ value: item.id, label: item.label }))}
          value={model}
          onChange={setModel}
          allowDeselect={false}
          placeholder={models.error ? "Önce Claude'a bağlan" : "Model seç"}
        />
        <Select
          label="Efor"
          data={(models.efforts ?? []).map((item) => ({ value: item.id, label: item.label }))}
          value={effort}
          onChange={setEffort}
          allowDeselect={false}
        />
      </SimpleGrid>
      {models.error ? (
        <Text size="sm" c="red">
          {models.error}
        </Text>
      ) : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={busy}>
          Vazgeç
        </Button>
        <Button
          leftSection={<IconPencil size={16} />}
          onClick={() => void submit()}
          loading={busy}
          disabled={prompt.trim().length < 3 || !model}
        >
          Düzeltmeyi başlat
        </Button>
      </Group>
    </Stack>
  );
}

export function RenderHistory() {
  const router = useRouter();
  const [records, setRecords] = useState<RenderRecordSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RenderRecord | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [revising, setRevising] = useState<RenderRecord | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetch("/api/history")
      .then((response) => response.json())
      .then((payload: { records?: RenderRecordSummary[] }) => {
        if (!ignore) setRecords(payload.records ?? []);
      })
      .catch(() => !ignore && setRecords([]));
    return () => {
      ignore = true;
    };
  }, []);

  async function fetchRecord(id: string): Promise<RenderRecord | null> {
    setOpening(id);
    try {
      const record = (await fetch(`/api/history?id=${id}`).then((response) => response.json())) as RenderRecord;
      return record?.settings ? record : null;
    } finally {
      setOpening(null);
    }
  }

  async function open(id: string) {
    const record = await fetchRecord(id);
    if (record) setSelected(record);
  }

  async function revise(id: string) {
    const record = await fetchRecord(id);
    if (record) {
      setSelected(null);
      setRevising(record);
    }
  }

  const dates = useMemo(() => new Map((records ?? []).map((record) => [record.id, record.finishedAt ?? record.startedAt])), [records]);
  const projectIds = useMemo(() => new Set((records ?? []).filter((record) => record.hasProject).map((record) => record.id)), [records]);

  function loadIntoStudio(record: RenderRecord) {
    try {
      window.localStorage.setItem(LOAD_TEMPLATE_KEY, JSON.stringify({ id: record.id, settings: record.settings }));
    } catch {
      return;
    }
    router.push("/");
  }

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr");
    if (!records || !term) return records ?? [];
    return records.filter((record) =>
      [record.prompt, record.modelName ?? "", ...record.skills.map((skill) => skill.name), ...record.sourceVideos]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(term),
    );
  }, [query, records]);

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Geçmiş</Title>
        <Text c="dimmed" mt={4}>
          Üretilen her video ve o videoda seçtiğin tüm ayarlar. Bir videoya tıklayıp hangi ayarlarla üretildiğini görebilir, aynı
          ayarları stüdyoya yükleyebilirsin.
        </Text>
      </div>

      <InfoCard
        id="history"
        title="Geçmişi nasıl kullanırım?"
        steps={[
          <>Bir videoya tıklayıp hangi prompt, skill ve modelle üretildiğini gör.</>,
          <><b>Videoyu düzelt</b> ile neyi değiştirmek istediğini yaz (ör. &quot;14. saniyedeki başlık daha büyük olsun&quot;); ajan videoyu baştan yapmadan düzeltir.</>,
          <>Aynı ayarları stüdyoya yükleyip benzer yeni bir video üretebilirsin.</>,
        ]}
      />
      <TextInput
        placeholder="Prompt, skill, model veya kaynak videoda ara"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {records === null ? <Loader /> : null}
      {records && visible.length === 0 ? (
        <Text c="dimmed">{records.length === 0 ? "Henüz üretilmiş video yok." : "Aramaya uyan video yok."}</Text>
      ) : null}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
        {visible.map((record) => (
          <Card key={record.id} withBorder radius="md" padding="sm">
            <Card.Section>
              <video
                src={`${record.outputUrl}#t=0.5`}
                preload="metadata"
                muted
                playsInline
                controls
                style={{ width: "100%", aspectRatio: "9 / 16", maxHeight: 380, objectFit: "contain", background: "#000", display: "block" }}
              />
            </Card.Section>
            <Stack gap={6} mt="sm">
              <Text size="xs" c="dimmed">
                {dateFormat.format(new Date(record.finishedAt ?? record.startedAt))}
              </Text>
              {record.revisionOf ? (
                <Text size="xs" c="violet">
                  Düzeltme · {dates.get(record.revisionOf) ? dateFormat.format(new Date(dates.get(record.revisionOf)!)) : "önceki"} tarihli videodan:{" "}
                  &ldquo;{(record.revisionPrompt ?? "").slice(0, 80)}
                  {(record.revisionPrompt ?? "").length > 80 ? "…" : ""}&rdquo;
                </Text>
              ) : null}
              <Group gap={4}>
                {record.modelName ? (
                  <Badge size="xs" variant="light" color="gray">
                    {record.modelName}
                  </Badge>
                ) : null}
                {record.skills.map((skill) => (
                  <Badge key={skill.id} size="xs" variant="light">
                    {skill.name}
                  </Badge>
                ))}
                {record.hasMusic ? (
                  <Badge size="xs" variant="outline">
                    Müzik
                  </Badge>
                ) : null}
                <Badge size="xs" variant="outline">
                  SFX: {SFX_LABELS[record.sfxMode]}
                </Badge>
              </Group>
              <Text size="sm" lineClamp={3} c={record.prompt ? undefined : "dimmed"}>
                {record.prompt || "Prompt yazılmamış."}
              </Text>
              <Group grow gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconAdjustments size={14} />}
                  loading={opening === record.id}
                  onClick={() => void open(record.id)}
                >
                  Ayarları gör
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  leftSection={<IconPencil size={14} />}
                  disabled={!record.hasProject}
                  title={record.hasProject ? undefined : "Bu videonun kod arşivi yok (eski sistem)"}
                  onClick={() => void revise(record.id)}
                >
                  Düzelt
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      <Modal opened={Boolean(revising)} onClose={() => setRevising(null)} title="Videoyu düzelt" size="lg">
        {revising ? <RevisionDialog record={revising} onClose={() => setRevising(null)} /> : null}
      </Modal>

      <Modal opened={Boolean(selected)} onClose={() => setSelected(null)} title="Video ayarları" size="xl">
        {selected ? (
          <Stack gap="md">
            <Details record={selected} />
            <Group justify="flex-end">
              <Button
                variant="light"
                color="orange"
                leftSection={<IconPencil size={16} />}
                disabled={!projectIds.has(selected.id)}
                onClick={() => {
                  setRevising(selected);
                  setSelected(null);
                }}
              >
                Düzelt
              </Button>
              <Button leftSection={<IconUpload size={16} />} onClick={() => loadIntoStudio(selected)}>
                Bu ayarları stüdyoya yükle
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
