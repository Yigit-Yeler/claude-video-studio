import { Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: ReactNode;
  /** Sağ üstte duran butonlar ya da rozetler. */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end">
      <div>
        <Title order={2}>{title}</Title>
        <Text c="dimmed" mt={4}>
          {description}
        </Text>
      </div>
      {actions}
    </Group>
  );
}
