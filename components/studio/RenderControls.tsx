import { Button, Group, Stack, Text } from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import type { RenderStatus } from "@/lib/client/render";

type RenderControlsProps = {
  status: RenderStatus;
  hasJob: boolean;
  canRender: boolean;
  error: string | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
};

/** Ajanı başlat / duraklat / devam et / durdur butonları ve render hatası. */
export function RenderControls({ status, hasJob, canRender, error, onStart, onPause, onResume, onCancel }: RenderControlsProps) {
  const rendering = status === "rendering";
  const paused = status === "paused";

  return (
    <Stack gap="md">
      <Group grow>
        {paused && hasJob ? (
          <Button leftSection={<IconPlayerPlay size={16} />} onClick={onResume}>
            Devam et
          </Button>
        ) : (
          <Button leftSection={<IconPlayerPlay size={16} />} onClick={onStart} loading={rendering} disabled={!canRender}>
            Ajanı başlat
          </Button>
        )}
        {rendering ? (
          <Button color="yellow" variant="light" leftSection={<IconPlayerPause size={16} />} onClick={onPause}>
            Duraklat
          </Button>
        ) : null}
        {rendering || paused ? (
          <Button color="red" variant="light" leftSection={<IconPlayerStop size={16} />} onClick={onCancel}>
            Durdur
          </Button>
        ) : null}
      </Group>
      {!canRender && !rendering ? (
        <Text size="sm" c="dimmed">
          Başlatmak için en az bir kaynak video, bir model ve bir stil skill&apos;i ya da ne istediğini anlatan bir prompt gerekir.
        </Text>
      ) : null}
      <ErrorAlert title="Render hatası" message={error} />
    </Stack>
  );
}
