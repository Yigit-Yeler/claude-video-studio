import { errorMessage } from "@/lib/errors";
import { readSkillJob, startSkillJob } from "@/lib/skill-author";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const prompt = String(form.get("prompt") ?? "");
    const skillName = String(form.get("name") ?? "");
    const strict = form.get("strict") !== "false";
    const videos = form.getAll("videos").filter((item): item is File => item instanceof File);
    const job = await startSkillJob(videos, prompt, skillName, strict);
    return Response.json(job);
  } catch (error) {
    const message = errorMessage(error, "Analiz başlatılamadı.");
    const status = message.includes("sürüyor") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "İş kimliği gerekli." }, { status: 400 });
  const job = await readSkillJob(id);
  if (!job) return Response.json({ error: "İş bulunamadı." }, { status: 404 });
  return Response.json(job);
}
