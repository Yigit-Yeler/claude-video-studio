import { Accordion, Code, Stack, Table, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { fileName, formatDateTime, formatDuration, formatTokens, totalTokens } from "@/lib/format";
import type { RenderRecord } from "@/lib/render-history";
import { QUALITY_PRESETS } from "@/lib/studio";
import { EFFORT_LABELS, SFX_LABELS } from "./labels";

function ValueList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Yok
      </Text>
    );
  }
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

/** Ayar tablosunun satırları: [etiket, değer]. */
function settingRows(record: RenderRecord): [string, ReactNode][] {
  const s = record.settings;
  const quality = QUALITY_PRESETS.find((item) => item.id === s.qualityId);
  const duration = formatDuration(record.startedAt, record.finishedAt);
  const sfx =
    s.sfxMode === "library" && s.sfxSelection.length ? (
      <Stack gap={4}>
        <Text size="sm">{SFX_LABELS[s.sfxMode]} · seçilenler:</Text>
        <ValueList items={s.sfxSelection.map((item) => item.replace(/^sfx\//, ""))} />
      </Stack>
    ) : (
      SFX_LABELS[s.sfxMode]
    );

  return [
    ...(record.revisionPrompt
      ? [["Düzeltme isteği", <Text key="rev" size="sm" style={{ whiteSpace: "pre-wrap" }}>{record.revisionPrompt}</Text>] as [string, ReactNode]]
      : []),
    ["Üretim", `${formatDateTime(record.finishedAt ?? record.startedAt)}${duration ? ` · ${duration}` : ""}`],
    ["Model", record.modelName ?? s.model ?? "—"],
    ["Efor", EFFORT_LABELS[s.effort ?? ""] ?? "—"],
    ["Kaynak videolar", <ValueList key="src" items={s.sourceVideos.map(fileName)} />],
    ["Referans videolar", <ValueList key="ref" items={s.referenceVideos.map(fileName)} />],
    ["Stil skill'leri", <ValueList key="sk" items={s.styleSkills.map((skill) => `${skill.name}${skill.strict ? " (bağlayıcı)" : ""}`)} />],
    ["Çözünürlük / FPS", `${s.width}×${s.height} · ${s.fps} fps`],
    ["Kalite", quality ? `${quality.label} (CRF ${s.crf})` : `CRF ${s.crf}`],
    ["Müzik", s.backgroundMusic ? `${fileName(s.backgroundMusic)} · seviye ${s.musicVolume}` : "Yok"],
    ["Ses efektleri", sfx],
    ["Görseller", <ValueList key="img" items={s.assetImages.map(fileName)} />],
    ...(record.usage
      ? [["Kullanım", `${record.usage.turns} adım · ${formatTokens(totalTokens(record.usage))} token`] as [string, ReactNode]]
      : []),
  ];
}

/** Geçmişteki bir videonun tüm ayarları, prompt'u ve o anki skill kılavuzları. */
export function RecordDetails({ record }: { record: RenderRecord }) {
  const { prompt, styleSkills } = record.settings;
  const guides = styleSkills.filter((skill) => skill.guide);

  return (
    <Stack gap="md">
      <video src={record.outputUrl} controls preload="metadata" style={{ width: "100%", maxHeight: 520, background: "#000", borderRadius: 8 }} />
      <div>
        <Text size="sm" fw={600} mb={4}>
          Prompt
        </Text>
        {prompt ? (
          <Code block style={{ whiteSpace: "pre-wrap" }}>
            {prompt}
          </Code>
        ) : (
          <Text size="sm" c="dimmed">
            Prompt yazılmamış.
          </Text>
        )}
      </div>
      <Table variant="vertical" withTableBorder layout="fixed">
        <Table.Tbody>
          {settingRows(record).map(([label, value]) => (
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
      {guides.length ? (
        <Accordion variant="contained">
          {guides.map((skill) => (
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
