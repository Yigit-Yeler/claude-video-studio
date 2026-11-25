import { errorMessage } from "@/lib/errors";
import { listMusic, safeAudioFilename, saveMediaFile } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 40 * 1024 * 1024;

export async function GET() {
  return Response.json({ music: await listMusic() });
}

export async function POST(request: Request) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Müzik dosyası gerekli." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Müzik dosyası 40 MB sınırını aşıyor." }, { status: 400 });
    }
    const filename = safeAudioFilename(file.name);
    await saveMediaFile("music", filename, file);
    const item = (await listMusic()).find((entry) => entry.name === filename);
    return Response.json({ item });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Müzik yüklenemedi.") }, { status: 400 });
  }
}
