import { cancelRenderJob, createRenderJob, createRevisionJob, pauseRenderJob, readJob, readLatestJob, resumeRenderJob } from "@/lib/render-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    // { revise: true, parentId, prompt, model?, effort? } → önceki videoyu düzelt
    const job = body?.revise === true ? await createRevisionJob(body) : await createRenderJob(body);
    return Response.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render başlatılamadı.";
    const status = message.includes("işleniyor") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("latest") === "1") {
    const latest = await readLatestJob();
    if (!latest) return Response.json({ error: "İş bulunamadı." }, { status: 404 });
    return Response.json(latest);
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "İş kimliği gerekli." }, { status: 400 });
  }

  const job = await readJob(id);
  if (!job) {
    return Response.json({ error: "İş bulunamadı." }, { status: 404 });
  }

  return Response.json(job);
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; action?: string };
    if (!body.id) return Response.json({ error: "İş kimliği gerekli." }, { status: 400 });
    const job = body.action === "resume" ? await resumeRenderJob(body.id) : await pauseRenderJob(body.id);
    if (!job) return Response.json({ error: "İş bulunamadı." }, { status: 404 });
    return Response.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "İş güncellenemedi.";
    const status = message.includes("işleniyor") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "İş kimliği gerekli." }, { status: 400 });
  }

  const job = await cancelRenderJob(id);
  if (!job) {
    return Response.json({ error: "İş bulunamadı." }, { status: 404 });
  }

  return Response.json(job);
}
