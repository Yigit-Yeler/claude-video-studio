"use client";

import { AppShell, Badge, Burger, Group, NavLink, Stack, Text, ThemeIcon } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconFolder, IconHistory, IconMovie, IconShare, IconSparkles, IconWand } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  {
    href: "/",
    label: "Video Stüdyosu",
    description: "Üretim paneli",
    icon: IconMovie,
  },
  {
    href: "/history",
    label: "Geçmiş",
    description: "Üretilen videolar ve ayarları",
    icon: IconHistory,
  },
  {
    href: "/social",
    label: "Paylaşım Metinleri",
    description: "TikTok, Instagram, YouTube",
    icon: IconShare,
  },
  {
    href: "/media",
    label: "Medya Kütüphanesi",
    description: "Kaynak ve referanslar",
    icon: IconFolder,
  },
  {
    href: "/skills",
    label: "Skiller",
    description: "Efekt katmanları",
    icon: IconSparkles,
  },
  {
    href: "/skills/create",
    label: "Skill Oluştur",
    description: "Referanslardan tarz çıkar",
    icon: IconWand,
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = usePathname();

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
      styles={{
        header: { background: "var(--mantine-color-dark-7)" },
        navbar: { background: "var(--mantine-color-dark-7)" },
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
            {links.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <NavLink
                  key={link.href}
                  component={Link}
                  href={link.href}
                  label={link.label}
                  description={link.description}
                  leftSection={<Icon size={18} />}
                  active={active}
                  variant="light"
                  onClick={close}
                />
              );
            })}
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
