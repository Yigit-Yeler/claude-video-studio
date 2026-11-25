import { Badge, Group, Paper, Text, Tooltip } from "@mantine/core";
import type { RenderStatus } from "@/lib/client/render";
import { formatTokens, totalTokens } from "@/lib/format";
import type { AgentUsage, RenderJobState } from "@/lib/render-status";
import { AgentLog } from "./AgentLog";
import { RenderProgress } from "./RenderProgress";

function usageBreakdown(usage: AgentUsage): string {
  return [
    `Giriş ${formatTokens(usage.inputTokens)}`,
    `önbellek okuma ${formatTokens(usage.cacheReadTokens)}`,
    `önbelleğe yazma ${formatTokens(usage.cacheWriteTokens)}`,
    `çıktı ${formatTokens(usage.outputTokens)}`,
  ].join(" · ");
}

/** Sağdaki "Ajan" kartı: model, harcanan token, ilerleme ve canlı log. */
export function AgentPanel({ job, status }: { job: RenderJobState | null; status: RenderStatus }) {
  const running = status === "rendering";

  return (
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
          <Tooltip multiline w={260} label={usageBreakdown(job.usage)}>
            <Badge variant="light" color="gray">
              {job.usage.turns} adım · {formatTokens(totalTokens(job.usage))} token
            </Badge>
          </Tooltip>
        ) : null}
      </Group>
      {job ? <RenderProgress job={job} /> : null}
      <AgentLog entries={job?.log ?? []} running={running} />
      {running && job?.detail ? (
        <Text size="xs" c="dimmed" mt="sm">
          Şu an: {job.detail}
        </Text>
      ) : null}
    </Paper>
  );
}
