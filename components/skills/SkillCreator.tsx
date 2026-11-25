"use client";

import { Alert, Button, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconKey } from "@tabler/icons-react";
import { useState } from "react";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { InfoCard } from "@/components/common/InfoCard";
import { PageHeader } from "@/components/common/PageHeader";
import { useClaudeLogin } from "@/hooks/useClaudeLogin";
import { useQuery } from "@/hooks/useQuery";
import { fetchClaudeAuth, type ClaudeAuthState } from "@/lib/client/claude-auth";
import { generateSkill, type SkillJob, type SkillRequest } from "@/lib/client/skills";
import { errorMessage } from "@/lib/errors";
import { SkillForm } from "./SkillForm";
import { SkillResult } from "./SkillResult";

const NOTIFICATION_ID = "skill-job";
const MAX_NOTIFICATION_LENGTH = 280;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function SkillCreator() {
  const auth = useQuery<ClaudeAuthState>("/api/skills/auth", { fetcher: () => fetchClaudeAuth() });
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SkillJob | null>(null);
  const login = useClaudeLogin({ onConnected: (state) => auth.setData(() => state), onError: setError });

  const ready = auth.data?.ready === true;

  async function createSkill(request: SkillRequest) {
    setError(null);
    setResult(null);
    setAnalyzing(true);
    notifications.show({ id: NOTIFICATION_ID, loading: true, title: "Skill", message: "Videolar inceleniyor.", autoClose: false, withCloseButton: false });
    try {
      const finished = await generateSkill(request);
      setResult(finished);
      const name = finished.skill?.name;
      notifications.update({
        id: NOTIFICATION_ID,
        loading: false,
        color: "teal",
        title: "Skill hazır",
        message: finished.modelName ? `${name ?? "Skill"} · ${finished.modelName}` : (name ?? "Ortak tarz yazıldı."),
        autoClose: 5000,
      });
    } catch (problem) {
      const message = errorMessage(problem, "Analiz başarısız.");
      setError(message);
      notifications.update({
        id: NOTIFICATION_ID,
        loading: false,
        color: "red",
        title: "Hata",
        message: truncate(message, MAX_NOTIFICATION_LENGTH),
        autoClose: 8000,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Skill Oluştur"
        description="Referans videoları yükle. İsteğe bağlı bir not ekle. Sistem kareleri inceler, ortak geçiş, hareket, renk, yazı ve altyazı tarzını bir skill olarak yazar."
      />
      <InfoCard guide="skillCreate" />

      <Alert color="violet" title="Model erişimi">
        Analiz, bilgisayarındaki Claude Code ile yerelde çalışır ve Claude aboneliğini (Pro/Max) kullanır; API anahtarı
        gerekmez. Claude Code&apos;a bir kez giriş yapman yeterli: aşağıdaki butona bas ya da terminalde <code>claude</code>{" "}
        yazıp <code>/login</code> komutunu çalıştır.
        {auth.data?.error ? (
          <>
            <br />
            {auth.data.error}
          </>
        ) : null}
      </Alert>

      {!auth.loading && !ready ? (
        <Button leftSection={<IconKey size={16} />} variant="light" loading={login.connecting} onClick={() => {
            setError(null);
            void login.connect();
          }}>
          Claude ile bağlan
        </Button>
      ) : null}
      {ready ? (
        <Text size="sm" c="dimmed">
          Claude hazır{auth.data?.email ? `: ${auth.data.email}` : ""}
          {auth.data?.plan ? ` (${auth.data.plan})` : ""}.
        </Text>
      ) : null}

      <SkillForm canSubmit={ready} busy={analyzing || login.connecting} onSubmit={(request) => void createSkill(request)} />

      <ErrorAlert title="Analiz hatası" message={error} />
      {result?.skill ? <SkillResult skill={result.skill} modelName={result.modelName} /> : null}
    </Stack>
  );
}
