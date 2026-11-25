"use client";

import { Badge, Button, Card, Group, SimpleGrid, Stack, Switch, Text } from "@mantine/core";
import { IconWand } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfoCard } from "@/components/common/InfoCard";
import { PageHeader } from "@/components/common/PageHeader";
import { useEnabledSkills } from "@/hooks/useEnabledSkills";
import { useGeneratedSkills } from "@/hooks/useGeneratedSkills";
import { skillCatalog } from "@/lib/skills";

export function SkillsManager() {
  const builtIn = useEnabledSkills();
  const generated = useGeneratedSkills();

  return (
    <Stack gap="lg">
      <PageHeader
        title="Skiller"
        description="Her skill bir React katmanıdır. Stüdyo seçimleri inputProps üretir; Remotion yalnızca açık olan katmanları kaynak videonun üstüne ekler."
      />
      <InfoCard guide="skills" />
      <Button component={Link} href="/skills/create" leftSection={<IconWand size={16} />} variant="light">
        Referans videolardan skill yaz
      </Button>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {skillCatalog.map((skill) => (
          <SkillCard
            key={skill.id}
            name={skill.name}
            summary={skill.summary}
            badges={<Badge variant="light">{skill.layer}</Badge>}
            enabled={builtIn.ready ? builtIn.enabled[skill.id] : true}
            ready={builtIn.ready}
            onToggle={(value) => builtIn.setSkillEnabled(skill.id, value)}
          >
            <Text size="xs" c="dimmed" mb="md">
              {skill.component}
            </Text>
          </SkillCard>
        ))}
        {generated.skills.map((skill) => {
          const binding = skill.strict && skill.guide;
          return (
            <SkillCard
              key={skill.id}
              name={skill.name}
              summary={skill.summary}
              badges={
                <Group gap={6}>
                  <Badge variant="light" color={binding ? "violet" : "gray"}>
                    {binding ? "Bağlayıcı" : "Esinlenme"}
                  </Badge>
                  <Badge variant="light" color="cyan">
                    Üretilen
                  </Badge>
                </Group>
              }
              enabled={generated.ready ? generated.isEnabled(skill.id) : true}
              ready={generated.ready}
              onToggle={(value) => generated.setSkillEnabled(skill.id, value)}
            >
              <Text size="sm" mb="md" lineClamp={4}>
                {skill.analysis}
              </Text>
            </SkillCard>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

type SkillCardProps = {
  name: string;
  summary: string;
  badges: ReactNode;
  enabled: boolean;
  ready: boolean;
  onToggle: (value: boolean) => void;
  children: ReactNode;
};

function SkillCard({ name, summary, badges, enabled, ready, onToggle, children }: SkillCardProps) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" align="flex-start" mb="sm">
        <div>
          <Text fw={700}>{name}</Text>
          <Text size="sm" c="dimmed" mt={4}>
            {summary}
          </Text>
        </div>
        {badges}
      </Group>
      {children}
      <Switch
        label="Stüdyoda kullan"
        checked={enabled}
        disabled={!ready}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
    </Card>
  );
}
