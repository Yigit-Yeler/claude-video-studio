"use client";

import { ScrollArea, Stack, Text } from "@mantine/core";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { AgentLogEntry } from "@/lib/render-status";

/** Ajanın canlı adım listesi; yeni adım geldikçe en alta kayar. */
export function AgentLog({ entries, running }: { entries: AgentLogEntry[]; running: boolean }) {
  const viewport = useAutoScroll<HTMLDivElement>(entries.length);

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
