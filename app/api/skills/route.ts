import { errorMessage } from "@/lib/errors";
import { listGeneratedSkills } from "@/lib/skill-author";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const skills = await listGeneratedSkills();
    return Response.json({ skills });
  } catch (error) {
    const message = errorMessage(error, "Skiller okunamadı.");
    return Response.json({ error: message }, { status: 500 });
  }
}
