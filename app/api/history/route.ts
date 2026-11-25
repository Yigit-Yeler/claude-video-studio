import { getRenderRecord, listRenderRecords } from "@/lib/render-history";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const record = await getRenderRecord(id);
      if (!record) return Response.json({ error: "Kayıt bulunamadı." }, { status: 404 });
      return Response.json(record);
    }
    return Response.json({ records: await listRenderRecords() });
  } catch (error) {
    const message = errorMessage(error, "Geçmiş okunamadı.");
    return Response.json({ records: [], error: message }, { status: 500 });
  }
}
