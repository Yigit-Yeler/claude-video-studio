"use client";

import { Button, Group, Select, SimpleGrid, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencil } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DictationButton } from "@/components/prompt/DictationButton";
import { useClaudeModels } from "@/hooks/useClaudeModels";
import { appendDictation } from "@/hooks/useDictation";
import { rememberRenderJob, renderApi } from "@/lib/client/render";
import { errorMessage } from "@/lib/errors";
import type { RenderRecord } from "@/lib/render-history";

const MIN_PROMPT_LENGTH = 3;

/** Geçmişteki bir videoyu, yazılan isteğe göre ajana düzelttirir. İlerleme stüdyoda izlenir. */
export function RevisionDialog({ record, onClose }: { record: RenderRecord; onClose: () => void }) {
  const router = useRouter();
  const catalog = useClaudeModels();
  const [prompt, setPrompt] = useState("");
  const [pickedModel, setPickedModel] = useState<string | null>(record.settings.model);
  const [effort, setEffort] = useState<string | null>(record.settings.effort ?? "high");
  const [busy, setBusy] = useState(false);

  // Videonun modeli artık listede yoksa ilk model seçilir.
  const modelIds = catalog.models.map((item) => item.id);
  const model = pickedModel && modelIds.includes(pickedModel) ? pickedModel : (modelIds[0] ?? null);

  async function submit() {
    setBusy(true);
    try {
      const { id } = await renderApi.revise({ parentId: record.id, prompt, model, effort });
      if (!id) throw new Error("Düzeltme başlatılamadı.");
      rememberRenderJob(id);
      notifications.show({ color: "teal", title: "Düzeltme başladı", message: "İlerlemeyi stüdyoda izleyebilirsin." });
      router.push("/");
    } catch (error) {
      notifications.show({ color: "red", title: "Başlatılamadı", message: errorMessage(error, "Hata") });
      setBusy(false);
    }
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Ajan bu videonun kodunu açar, yalnızca yazdığın yerleri değiştirir ve videoyu yeniden render eder. Geri kalan her şey aynen
        kalır. Sonuç yeni bir sürüm olarak geçmişe eklenir; bu video silinmez.
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
          data={catalog.models.map((item) => ({ value: item.id, label: item.label }))}
          value={model}
          onChange={setPickedModel}
          allowDeselect={false}
          placeholder={catalog.error ? "Önce Claude'a bağlan" : "Model seç"}
        />
        <Select
          label="Efor"
          data={catalog.efforts.map((item) => ({ value: item.id, label: item.label }))}
          value={effort}
          onChange={setEffort}
          allowDeselect={false}
        />
      </SimpleGrid>
      {catalog.error ? (
        <Text size="sm" c="red">
          {catalog.error}
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
          disabled={prompt.trim().length < MIN_PROMPT_LENGTH || !model}
        >
          Düzeltmeyi başlat
        </Button>
      </Group>
    </Stack>
  );
}
