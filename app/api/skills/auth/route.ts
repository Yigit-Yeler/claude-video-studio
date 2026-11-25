import { claudeAuthReady, loginClaude } from "@/lib/skill-author";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const auth = await claudeAuthReady(force);
    return Response.json(auth);
  } catch (error) {
    const message = errorMessage(error, "Oturum durumu alınamadı.");
    return Response.json({ ready: false, email: null, error: message }, { status: 500 });
  }
}

// Claude Code giriş penceresini açar (abonelik hesabıyla /login).
export async function POST() {
  try {
    const result = await loginClaude();
    return Response.json(result);
  } catch (error) {
    const message = errorMessage(error, "Claude girişi başlatılamadı.");
    return Response.json({ error: message }, { status: 400 });
  }
}
