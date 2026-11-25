import { notifications } from "@mantine/notifications";
import { api, sleep } from "./api";

export type ClaudeAuthState = {
  ready: boolean;
  email: string | null;
  plan?: string | null;
  error?: string | null;
};

const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 60; // 3 dakika

export const fetchClaudeAuth = (refresh = false) =>
  api.get<ClaudeAuthState>(refresh ? "/api/skills/auth?refresh=1" : "/api/skills/auth");

/**
 * Claude Code giriş penceresini açar ve kullanıcı girişi bitirene kadar (en fazla 3 dakika) bekler.
 * Giriş tamamlanırsa güncel oturum bilgisini döndürür, tamamlanmazsa hata fırlatır.
 */
export async function loginToClaude(): Promise<ClaudeAuthState> {
  const { message } = await api.post<{ message?: string }>("/api/skills/auth", undefined, "Claude girişi başlatılamadı.");
  if (message) notifications.show({ color: "violet", title: "Claude girişi", message, autoClose: 10000 });

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const auth = await fetchClaudeAuth(true).catch(() => null);
    if (auth?.ready) {
      notifications.show({ color: "teal", title: "Bağlandı", message: "Claude aboneliğin hazır." });
      return auth;
    }
  }
  throw new Error("Giriş tamamlanmadı. Terminalde `claude` yazıp `/login` ile tekrar dene.");
}
