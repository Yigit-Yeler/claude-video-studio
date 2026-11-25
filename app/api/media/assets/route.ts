import { listAssets, mediaRoot, safeImageFilename } from "@/lib/media";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Görsel dosyası gerekli." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Görsel 20 MB sınırını aşıyor." }, { status: 400 });
    }
    const filename = safeImageFilename(file.name);
    const directory = path.join(mediaRoot(), "assets");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
    const assets = await listAssets();
    const item = assets.find((entry) => entry.name === filename);
    return Response.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Görsel yüklenemedi.";
    return Response.json({ error: message }, { status: 400 });
  }
}
