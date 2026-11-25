import { Select, SimpleGrid } from "@mantine/core";
import type { useModelSelection } from "@/hooks/useClaudeModels";

type ModelSelection = ReturnType<typeof useModelSelection>;

/** Claude modeli ve efor (düşünme seviyesi) seçimi. */
export function ModelFields({ selection }: { selection: ModelSelection }) {
  const { models, efforts, model, effort, selectedModel, error } = selection;

  const effortDescription =
    effort === "auto"
      ? `Modelin varsayılanı: ${selectedModel?.defaultEffort ?? "medium"}`
      : (efforts.find((item) => item.id === effort)?.description ?? "Yüksek efor daha iyi sonuç, daha çok limit.");

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <Select
        label="Model"
        description={selectedModel?.description ?? "Claude Code ajanının modeli (aboneliğinden kullanılır)."}
        placeholder={error ? "Önce Claude'a bağlan" : "Model seç"}
        data={models.map((item) => ({ value: item.id, label: item.label }))}
        value={model}
        onChange={selection.setModel}
        allowDeselect={false}
        nothingFoundMessage="Model yok"
      />
      <Select
        label="Efor (düşünme seviyesi)"
        description={effortDescription}
        placeholder="Efor seç"
        data={efforts.map((item) => ({ value: item.id, label: item.label }))}
        value={effort}
        onChange={selection.setEffort}
        allowDeselect={false}
        disabled={Boolean(error)}
      />
    </SimpleGrid>
  );
}
