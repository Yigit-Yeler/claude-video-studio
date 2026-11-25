"use client";

import { Badge, Button, Card, Group, SimpleGrid, Stack, Switch, Text, Title } from "@mantine/core";
import { IconWand } from "@tabler/icons-react";
import Link from "next/link";
import { skillCatalog } from "@/lib/skills";
import { useEnabledSkills } from "./useEnabledSkills";
import { useGeneratedSkills } from "./useGeneratedSkills";
import { InfoCard } from "./InfoCard";

export function SkillsManager() {
  const { enabled, setSkillEnabled, ready } = useEnabledSkills();
  const generated = useGeneratedSkills();

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Skiller</Title>
        <Text c="dimmed" mt={4}>
          Her skill bir React katmanıdır. Stüdyo seçimleri inputProps üretir; Remotion yalnızca açık
          olan katmanları kaynak videonun üstüne ekler.
        </Text>
      </div>

      <InfoCard
        id="skills"
        title="Skiller ne işe yarar?"
        steps={[
          <>Skill, videonun tarzını (altyazı, renk, geçiş, animasyon, ses efekti) tarif eden hazır bir kalıptır.</>,
          <><b>Stüdyoda kullan</b> anahtarı açık olan skiller Video Stüdyosu sayfasında seçilebilir.</>,
          <>Kendi skill&apos;ini oluşturmak için <b>Skill Oluştur</b> sayfasına git: tarzını beğendiğin videoları yükle, sistem tarzı çıkarsın.</>,
        ]}
        tip="Üretilen skiller data/generated-skills klasörüne kaydedilir ve yalnızca senin bilgisayarında durur."
      />
      <Button component={Link} href="/skills/create" leftSection={<IconWand size={16} />} variant="light">
        Referans videolardan skill yaz
      </Button>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {skillCatalog.map((skill) => (
          <Card key={skill.id} withBorder radius="md" padding="lg">
            <Group justify="space-between" align="flex-start" mb="sm">
              <div>
                <Text fw={700}>{skill.name}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {skill.summary}
                </Text>
              </div>
              <Badge variant="light">{skill.layer}</Badge>
            </Group>
            <Text size="xs" c="dimmed" mb="md">
              {skill.component}
            </Text>
            <Switch
              label="Stüdyoda kullan"
              checked={ready ? enabled[skill.id] : true}
              disabled={!ready}
              onChange={(event) => setSkillEnabled(skill.id, event.currentTarget.checked)}
            />
          </Card>
        ))}
        {generated.skills.map((skill) => (
          <Card key={skill.id} withBorder radius="md" padding="lg">
            <Group justify="space-between" align="flex-start" mb="sm">
              <div>
                <Text fw={700}>{skill.name}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {skill.summary}
                </Text>
              </div>
              <Group gap={6}>
                <Badge variant="light" color={skill.strict && skill.guide ? "violet" : "gray"}>
                  {skill.strict && skill.guide ? "Bağlayıcı" : "Esinlenme"}
                </Badge>
                <Badge variant="light" color="cyan">
                  Üretilen
                </Badge>
              </Group>
            </Group>
            <Text size="sm" mb="md" lineClamp={4}>
              {skill.analysis}
            </Text>
            <Switch
              label="Stüdyoda kullan"
              checked={generated.ready ? generated.enabled[skill.id] !== false : true}
              disabled={!generated.ready}
              onChange={(event) => generated.setSkillEnabled(skill.id, event.currentTarget.checked)}
            />
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
