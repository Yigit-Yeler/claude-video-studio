"use client";

import { Button, Group, Loader, Modal, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { IconPencil, IconSearch, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InfoCard } from "@/components/common/InfoCard";
import { PageHeader } from "@/components/common/PageHeader";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/client/api";
import { saveStudioTemplate } from "@/lib/client/studio-template";
import type { RenderRecord, RenderRecordSummary } from "@/lib/render-history";
import { RecordCard } from "./RecordCard";
import { RecordDetails } from "./RecordDetails";
import { RevisionDialog } from "./RevisionDialog";

const NO_RECORDS: RenderRecordSummary[] = [];

function matchesSearch(record: RenderRecordSummary, term: string): boolean {
  return [record.prompt, record.modelName ?? "", ...record.skills.map((skill) => skill.name), ...record.sourceVideos]
    .join(" ")
    .toLocaleLowerCase("tr")
    .includes(term);
}

export function RenderHistory() {
  const router = useRouter();
  const history = useQuery<{ records?: RenderRecordSummary[] }>("/api/history", { fallbackError: "Geçmiş okunamadı." });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RenderRecord | null>(null);
  const [revising, setRevising] = useState<RenderRecord | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const records = history.data?.records ?? NO_RECORDS;
  const loaded = !history.loading;
  const recordDates = useMemo(() => new Map(records.map((record) => [record.id, record.finishedAt ?? record.startedAt])), [records]);
  const term = query.trim().toLocaleLowerCase("tr");
  const visible = term ? records.filter((record) => matchesSearch(record, term)) : records;

  async function fetchRecord(id: string): Promise<RenderRecord | null> {
    setOpening(id);
    try {
      const record = await api.get<RenderRecord>(`/api/history?id=${encodeURIComponent(id)}`).catch(() => null);
      return record?.settings ? record : null;
    } finally {
      setOpening(null);
    }
  }

  async function openDetails(id: string) {
    const record = await fetchRecord(id);
    if (record) setSelected(record);
  }

  async function openRevision(id: string) {
    const record = await fetchRecord(id);
    if (!record) return;
    setSelected(null);
    setRevising(record);
  }

  function loadIntoStudio(record: RenderRecord) {
    if (saveStudioTemplate({ id: record.id, settings: record.settings })) router.push("/");
  }

  const hasProject = (id: string) => records.some((record) => record.id === id && record.hasProject);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Geçmiş"
        description="Üretilen her video ve o videoda seçtiğin tüm ayarlar. Bir videoya tıklayıp hangi ayarlarla üretildiğini görebilir, aynı ayarları stüdyoya yükleyebilirsin."
      />
      <InfoCard guide="history" />
      <TextInput
        placeholder="Prompt, skill, model veya kaynak videoda ara"
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      {!loaded ? <Loader /> : null}
      {loaded && visible.length === 0 ? (
        <Text c="dimmed">{records.length === 0 ? "Henüz üretilmiş video yok." : "Aramaya uyan video yok."}</Text>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
        {visible.map((record) => (
          <RecordCard
            key={record.id}
            record={record}
            parentDate={record.revisionOf ? recordDates.get(record.revisionOf) : undefined}
            opening={opening === record.id}
            onOpen={() => void openDetails(record.id)}
            onRevise={() => void openRevision(record.id)}
          />
        ))}
      </SimpleGrid>

      <Modal opened={Boolean(revising)} onClose={() => setRevising(null)} title="Videoyu düzelt" size="lg">
        {revising ? <RevisionDialog record={revising} onClose={() => setRevising(null)} /> : null}
      </Modal>

      <Modal opened={Boolean(selected)} onClose={() => setSelected(null)} title="Video ayarları" size="xl">
        {selected ? (
          <Stack gap="md">
            <RecordDetails record={selected} />
            <Group justify="flex-end">
              <Button
                variant="light"
                color="orange"
                leftSection={<IconPencil size={16} />}
                disabled={!hasProject(selected.id)}
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
