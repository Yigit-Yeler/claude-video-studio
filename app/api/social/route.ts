import { parseSocialSource, readSocialJob, readSocialRecord, sourceKey, startSocialJob } from "@/lib/social-copy";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const job = await startSocialJob(await request.json());
    return Response.json(job);
  } catch (error) {
    const message = errorMessage(error, "Metin üretimi başlatılamadı.");
    return Response.json({ error: message }, { status: message.includes("sürüyor") ? 409 : 400 });
  }
}

// ?id=<iş> durumu; ?kind=history|video&ref=<kimlik|yol> o video için kayıtlı son sonucu döndürür.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const kind = params.get("kind");
  const ref = params.get("ref");
  if (id) {
    const job = await readSocialJob(id);
    return job ? Response.json(job) : Response.json({ error: "İş bulunamadı." }, { status: 404 });
  }
  if (kind && ref) {
    let key: string;
    try {
      key = sourceKey(parseSocialSource(kind === "history" ? { kind, id: ref } : { kind, path: ref }));
    } catch (error) {
      return Response.json({ error: errorMessage(error, "Geçersiz video.") }, { status: 400 });
    }
    const record = await readSocialRecord(key);
    return record ? Response.json(record) : Response.json({ error: "Kayıt yok." }, { status: 404 });
  }
  return Response.json({ error: "id ya da kind ve ref gerekli." }, { status: 400 });
}
