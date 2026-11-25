import { errorMessage } from "@/lib/errors";
import { listMedia } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const media = await listMedia();
    return Response.json(media);
  } catch (error) {
    const message = errorMessage(error, "Medya klasörü okunamadı.");
    return Response.json({ error: message }, { status: 500 });
  }
}
