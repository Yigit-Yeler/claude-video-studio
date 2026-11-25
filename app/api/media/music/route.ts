import { listMusic, mediaRoot, safeAudioFilename } from "@/lib/media";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 40 * 1024 * 1024;

export async function GET() {
  const music = await listMusic();
  return Response.json({ music });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Müzik dosyası gerekli." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Müzik dosyası 40 MB sınırını aşıyor." }, { status: 400 });
    }
    const filename = safeAudioFilename(file.name);
    const directory = path.join(mediaRoot(), "music");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
    const music = await listMusic();
    const item = music.find((entry) => entry.name === filename);
    return Response.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Müzik yüklenemedi.";
    return Response.json({ error: message }, { status: 400 });
  }
}
