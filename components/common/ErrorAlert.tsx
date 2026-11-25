import { Alert, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

/** Kırmızı hata kutusu. Mesaj boşsa hiçbir şey çizmez; çok satırlı mesajlar korunur. */
export function ErrorAlert({ title, message }: { title: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} />} title={title}>
      <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
        {message}
      </Text>
    </Alert>
  );
}
