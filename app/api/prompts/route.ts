import { deletePrompt, listPrompts } from "@/lib/prompt-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ prompts: await listPrompts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prompt geçmişi okunamadı.";
    return Response.json({ prompts: [], error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Prompt kimliği gerekli." }, { status: 400 });
  return Response.json({ prompts: await deletePrompt(id) });
}
