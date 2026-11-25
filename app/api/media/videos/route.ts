import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { listMedia, mediaRoot, safeVideoFilename } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

// Gövde ham dosyadır; büyük videolar belleğe alınmadan diske akar.
export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const name = params.get("name");
  if (kind !== "sources" && kind !== "references") {
    return Response.json({ error: "Geçersiz video türü." }, { status: 400 });
  }
  if (!name || !request.body) {
    return Response.json({ error: "Video dosyası gerekli." }, { status: 400 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return Response.json({ error: "Video 2 GB sınırını aşıyor." }, { status: 400 });
  }

  let target: string | null = null;
  try {
    const filename = safeVideoFilename(name);
    const directory = path.join(mediaRoot(), kind);
    await fs.mkdir(directory, { recursive: true });
    target = path.join(directory, filename);
    await pipeline(Readable.fromWeb(request.body as WebReadableStream<Uint8Array>), createWriteStream(target));
    const media = await listMedia();
    const item = media[kind].find((entry) => entry.name === filename);
    return Response.json({ item });
  } catch (error) {
    if (target) await fs.rm(target, { force: true });
    const message = error instanceof Error ? error.message : "Video yüklenemedi.";
    return Response.json({ error: message }, { status: 400 });
  }
}
