import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mikrofonla yazdırma: tarayıcıdan gelen ses kaydını bilgisayardaki Whisper (faster-whisper) ile yazıya döker.
// Tamamen yerel çalışır; Claude aboneliğinden token harcamaz.

const MAX_BYTES = 30 * 1024 * 1024;

function run(binary: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-4000)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

export async function POST(request: Request) {
  const directory = path.join(process.cwd(), "tmp", "dictation", randomUUID());
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ error: "Ses kaydı gelmedi." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) return Response.json({ error: "Kayıt çok uzun." }, { status: 400 });
    if (!ffmpegPath) throw new Error("ffmpeg bulunamadı.");

    await fs.mkdir(directory, { recursive: true });
    const input = path.join(directory, "input.webm");
    const wav = path.join(directory, "input.wav");
    const output = path.join(directory, "output.json");
    await fs.writeFile(input, Buffer.from(await audio.arrayBuffer()));

    const convert = await run(ffmpegPath, ["-hide_banner", "-y", "-i", input, "-ac", "1", "-ar", "16000", wav], 60_000);
    if (convert.code !== 0) throw new Error("Ses kaydı okunamadı.");

    const python = process.env.VIDEO_PYTHON || (process.platform === "win32" ? "python" : "python3");
    const script = path.join(process.cwd(), "scripts", "video-tools", "transcribe.py");
    const language = String(form.get("language") ?? "tr") || "tr";
    const result = await run(python, [script, wav, output, "--language", language], 300_000);
    if (result.code !== 0) {
      const missing = /No module named ['"]?faster_whisper/.test(result.stderr);
      throw new Error(
        missing
          ? "Yazıya dökmek için faster-whisper gerekli: pip install -r scripts/video-tools/requirements.txt"
          : "Ses yazıya dökülemedi.",
      );
    }
    const parsed = JSON.parse(await fs.readFile(output, "utf8")) as { text?: string };
    return Response.json({ text: (parsed.text ?? "").trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ses yazıya dökülemedi.";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
