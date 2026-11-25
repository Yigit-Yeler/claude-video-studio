"use client";

import { ActionIcon, Alert, Anchor, Collapse, Group, List, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconBulb, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { STORAGE_KEYS } from "@/lib/client/storage-keys";
import { PAGE_GUIDES, type PageGuide, type PageGuideId } from "./guides";

/** Sayfanın başında "Nasıl kullanılır?" bilgilendirme kartı. Kapatılırsa tarayıcıda hatırlanır. */
export function InfoCard({ guide }: { guide: PageGuideId }) {
  const { title, steps, tip }: PageGuide = PAGE_GUIDES[guide];
  const [state, setState] = useLocalStorage<"open" | "closed">({ key: STORAGE_KEYS.infoCard(guide), defaultValue: "open" });
  const open = state !== "closed";
  const toggle = () => setState(open ? "closed" : "open");

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

