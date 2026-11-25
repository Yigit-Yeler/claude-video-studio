import { Button, Paper, Text } from "@mantine/core";

/** Biten videonun oynatıcısı, ajanın özeti ve indirme butonu. */
export function RenderResult({ outputUrl, summary }: { outputUrl: string; summary: string | null }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Text fw={600} mb="sm">
        Sonuç
      </Text>
      <video
        key={outputUrl}
        src={outputUrl}
        controls
        style={{ display: "block", width: "100%", maxHeight: 640, borderRadius: 12, background: "#000" }}
      />
      {summary ? (
        <Text size="sm" mt="sm" style={{ whiteSpace: "pre-wrap" }}>
          {summary}
        </Text>
      ) : null}
      <Button component="a" href={outputUrl} download variant="light" mt="sm">
        MP4 indir
      </Button>
    </Paper>
  );
}
