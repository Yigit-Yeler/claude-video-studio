"use client";

import { ActionIcon, Alert, Anchor, Collapse, Group, List, Text } from "@mantine/core";
import { IconBulb, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useLocalStorage } from "@mantine/hooks";

type InfoCardProps = {
  /** Kartın açık/kapalı durumunun tarayıcıda hatırlanması için benzersiz anahtar. */
  id: string;
  title: string;
  steps: React.ReactNode[];
  tip?: React.ReactNode;
};

const storageKey = (id: string) => `video-automation:info-card:${id}`;

/** Sayfanın başında "Nasıl kullanılır?" bilgilendirme kartı. Kapatılırsa tarayıcıda hatırlanır. */
export function InfoCard({ id, title, steps, tip }: InfoCardProps) {
  const [state, setState] = useLocalStorage<"open" | "closed">({ key: storageKey(id), defaultValue: "open" });
  const open = state !== "closed";

  function toggle() {
    setState(open ? "closed" : "open");
  }

  return (
    <Alert color="cyan" variant="light" icon={<IconBulb size={18} />} p="sm">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Group gap={4} wrap="nowrap">
          {!open ? (
            <Anchor component="button" size="xs" onClick={toggle}>
              Göster
            </Anchor>
          ) : null}
          <ActionIcon variant="subtle" color="cyan" size="sm" onClick={toggle} aria-label={open ? "Gizle" : "Göster"}>
            {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>
      </Group>
      <Collapse expanded={open}>
        <List type="ordered" size="sm" spacing={4} mt="xs">
          {steps.map((step, index) => (
            <List.Item key={index}>{step}</List.Item>
          ))}
        </List>
        {tip ? (
          <Text size="xs" c="dimmed" mt="xs">
            💡 {tip}
          </Text>
        ) : null}
      </Collapse>
    </Alert>
  );
}
