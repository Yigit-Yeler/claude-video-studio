import { listSfx, mediaRoot, safeCategory, safeSfxFilename, SFX_ROOT_CATEGORY } from "@/lib/media";
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;

export async function GET() {
  try {
    return Response.json(await listSfx());
  } catch (error) {
    const message = errorMessage(error, "Ses kütüphanesi okunamadı.");
    return Response.json({ items: [], categories: [], error: message }, { status: 500 });
  }
}

// Ses efekti yükleme: form alanları "files" (bir veya daha fazla) ve "category".
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length === 0) return Response.json({ error: "Ses dosyası gerekli." }, { status: 400 });
    const category = safeCategory(String(form.get("category") ?? ""));
    const directory = category === SFX_ROOT_CATEGORY ? path.join(mediaRoot(), "sfx") : path.join(mediaRoot(), "sfx", category);
    await fs.mkdir(directory, { recursive: true });
    const saved: string[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} 25 MB sınırını aşıyor.`);
      let name = safeSfxFilename(file.name);
      const extension = path.extname(name);
      const base = name.slice(0, -extension.length);
      for (let index = 2; await fs.access(path.join(directory, name)).then(() => true, () => false); index += 1) {
        name = `${base}-${index}${extension}`;
      }
      await fs.writeFile(path.join(directory, name), Buffer.from(await file.arrayBuffer()));
      saved.push(category === SFX_ROOT_CATEGORY ? `sfx/${name}` : `sfx/${category}/${name}`);
    }
    return Response.json({ ...(await listSfx()), saved });
  } catch (error) {
    const message = errorMessage(error, "Ses yüklenemedi.");
    return Response.json({ error: message }, { status: 400 });
  }
}
