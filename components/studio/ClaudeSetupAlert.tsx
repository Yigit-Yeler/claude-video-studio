import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

type ClaudeSetupAlertProps = {
  message: string;
  connecting: boolean;
  onConnect: () => void;
  onRetry: () => void;
};

/** Claude Code'a giriş yapılmamışsa ya da model listesi alınamadıysa gösterilir. */
export function ClaudeSetupAlert({ message, connecting, onConnect, onRetry }: ClaudeSetupAlertProps) {
  return (
    <Alert color="yellow" icon={<IconAlertCircle size={16} />} title="Claude Code hazır değil">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{message}</Text>
        <Text size="sm" c="dimmed">
          Ajan bilgisayarındaki Claude Code ile çalışır ve Claude aboneliğini kullanır; API anahtarı gerekmez.
        </Text>
        <Group gap="xs">
          <Button size="xs" onClick={onConnect} loading={connecting}>
            Claude ile bağlan
          </Button>
          <Button size="xs" variant="subtle" onClick={onRetry}>
            Tekrar kontrol et
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
