import { CLAUDE_MODELS, claudeAuthStatus, DEFAULT_CLAUDE_MODEL, DEFAULT_EFFORT, EFFORT_LEVELS } from "@/lib/claude-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Modeller Claude Code'un takma adlarıdır; abonelik planın hangilerine izin veriyorsa onlar çalışır.
export async function GET() {
  try {
    const auth = await claudeAuthStatus();
    if (!auth.ready) {
      return Response.json({ models: [], efforts: EFFORT_LEVELS, preferred: null, preferredEffort: DEFAULT_EFFORT, error: auth.error ?? "Claude Code hazır değil." });
    }
    return Response.json({
      models: CLAUDE_MODELS,
      efforts: EFFORT_LEVELS,
      preferred: DEFAULT_CLAUDE_MODEL,
      preferredEffort: DEFAULT_EFFORT,
      account: { email: auth.email, plan: auth.plan, version: auth.version },
      warning: auth.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claude Code durumu alınamadı.";
    return Response.json({ models: [], preferred: null, error: message }, { status: 200 });
  }
}
