import { errorMessage } from "@/lib/errors";
import { listAssets, safeImageFilename, saveMediaFile } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Görsel dosyası gerekli." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Görsel 20 MB sınırını aşıyor." }, { status: 400 });
    }
    const filename = safeImageFilename(file.name);
    await saveMediaFile("assets", filename, file);
    const item = (await listAssets()).find((entry) => entry.name === filename);
    return Response.json({ item });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Görsel yüklenemedi.") }, { status: 400 });
  }
}
