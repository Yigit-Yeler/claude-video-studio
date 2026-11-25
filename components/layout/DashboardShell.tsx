"use client";

import { AppShell, Badge, Burger, Group, NavLink, Stack, Text, ThemeIcon } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconMovie } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV_LINKS } from "./nav-links";

const SURFACE = "var(--mantine-color-dark-7)";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
      styles={{
        header: { background: SURFACE },
        navbar: { background: SURFACE },
        main: { background: "var(--mantine-color-dark-8)", minHeight: "100vh" },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon size="lg" radius="md" variant="gradient" gradient={{ from: "violet", to: "cyan" }}>
              <IconMovie size={18} />
            </ThemeIcon>
            <div>
              <Text fw={700} lh={1.15}>
                Creator Dashboard
              </Text>
              <Text size="xs" c="dimmed">
                Video Automation
              </Text>
            </div>
          </Group>
          <Badge variant="light" color="violet">
            Lokal render
          </Badge>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow>
          <Stack gap={6}>
            {NAV_LINKS.map(({ href, label, description, icon: Icon }) => (
              <NavLink
                key={href}
                component={Link}
                href={href}
                label={label}
                description={description}
                leftSection={<Icon size={18} />}
                active={pathname === href}
                variant="light"
                onClick={close}
              />
            ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <Text size="xs" c="dimmed">
            Çözünürlük, kare hızı ve kalite stüdyodan seçilir. Render yerel makinede çalışır.
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
