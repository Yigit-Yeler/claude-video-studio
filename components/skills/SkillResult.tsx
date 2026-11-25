import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import type { StyleSkillSpec } from "@/lib/style-skill";

export function SkillResult({ skill, modelName }: { skill: StyleSkillSpec; modelName: string | null }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="sm">
        <Group gap="sm">
          <Title order={3}>{skill.name}</Title>
          <Badge variant="light" color={skill.strict ? "violet" : "gray"}>
            {skill.strict ? "Bağlayıcı" : "Esinlenme"}
          </Badge>
        </Group>
        <Text>{skill.summary}</Text>
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {skill.analysis}
        </Text>
        <Text size="sm">Kullanılan model: {modelName ?? "bildirilmedi"}</Text>
        <Text size="sm" c="dimmed">
          Dosya: remotion/skills/generated/{skill.id}.tsx
        </Text>
        <Button component={Link} href="/" variant="light">
          Stüdyoda kullan
        </Button>
      </Stack>
    </Paper>
  );
}
