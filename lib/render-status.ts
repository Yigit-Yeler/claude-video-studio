export type AgentLogEntry = {
  at: string;
  kind: "text" | "tool" | "status" | "error";
  text: string;
  status?: "completed" | "error";
};

export type AgentUsage = {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type RenderJobState = {
  id: string;
  status: "rendering" | "success" | "error" | "cancelled" | "paused";
  outputUrl: string | null;
  error: string | null;
  detail: string | null;
  progress?: number;
  stage?: string | null;
  modelName: string | null;
  agentId: string | null;
  log: AgentLogEntry[];
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
  pausedMs?: number;
  /** Claude Code kullanımı (devam ettirmeler dahil toplam). */
  usage?: AgentUsage | null;
  /** Düzeltme işi ise düzeltilen videonun kimliği ve istek. */
  revisionOf?: string | null;
  revisionPrompt?: string | null;
};
