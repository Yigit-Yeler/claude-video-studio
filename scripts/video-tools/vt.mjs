#!/usr/bin/env node
// Video ajanının komut satırı araçları. Ajan bu dosyayı iş klasöründen çalıştırır:
//   node <repo>/scripts/video-tools/vt.mjs <komut> ...
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ffmpeg = require("ffmpeg-static");

function run(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (options.echo) process.stdout.write(chunk);
      options.onStdout?.(chunk.toString());
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (options.echo) process.stderr.write(chunk);
      options.onStdout?.(chunk.toString());
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function ff(args) {
  const result = await run(ffmpeg, ["-hide_banner", "-y", ...args]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().split(/\r?\n/).slice(-8).join("\n"));
  }
  return result;
}

async function probe(file) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file]);
  const duration = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = stderr.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})[^\n]*/);
  const fps = video?.[0].match(/([\d.]+)\s*fps/);
  const rotation = stderr.match(/rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+)/);
  const audio = /Stream #[^\n]*Audio:/.test(stderr);
  if (!duration) throw new Error(`Medya okunamadı: ${file}`);
  let width = video ? Number(video[1]) : null;
  let height = video ? Number(video[2]) : null;
  const angle = Math.abs(Number(rotation?.[1] ?? rotation?.[2] ?? 0));
  if (angle === 90 || angle === 270) [width, height] = [height, width];
  return {
    file,
    durationInSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    width,
    height,
    fps: fps ? Number(fps[1]) : null,
    hasAudio: audio,
  };
}

function flag(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1];
}

function positional(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) {
      i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

const FONT = "C\\:/Windows/Fonts/arial.ttf";

async function grid(args) {
  const [video, output] = positional(args);
  if (!video || !output) throw new Error("Kullanım: grid <video> <çıktı.jpg> [--count 12] [--cols 4] [--from s] [--to s]");
  const info = await probe(video);
  const count = Number(flag(args, "count", 12));
  const cols = Number(flag(args, "cols", 4));
  const from = Number(flag(args, "from", 0));
  const to = Number(flag(args, "to", info.durationInSeconds));
  const span = Math.max(0.1, to - from);
  const rows = Math.ceil(count / cols);
  const tileWidth = (info.width ?? 1920) >= (info.height ?? 1080) ? 480 : 270;
  const times = Array.from({ length: count }, (_, i) => from + (span * i) / count);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const base = `fps=${count / span},scale=${tileWidth}:-2`;
  const label = `drawtext=fontfile='${FONT}':text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6`;
  const tile = `tile=${cols}x${rows}:padding=6:margin=6:color=0x202020`;
  const common = ["-ss", String(from), "-t", String(span), "-i", video, "-frames:v", "1", "-q:v", "3"];
  try {
    await ff([...common, "-vf", `${base},setpts=PTS+${from}/TB,${label},${tile}`, output]);
  } catch {
    await ff([...common, "-vf", `${base},${tile}`, output]);
  }
  console.log(JSON.stringify({ output, cols, rows, times: times.map((t) => Number(t.toFixed(2))) }, null, 2));
}

// Videonun bir bölgesini yüksek kaliteyle kırpıp hedef boyuta büyütür (Meet/Zoom kayıtlarındaki kişi kareleri için).
// Zaman çizelgesine dokunmaz: --from/--to verilmezse videonun tamamı, aynı süre ve fps ile çıkar.
async function crop(args) {
  const [input, output] = positional(args);
  const x = Number(flag(args, "x", NaN));
  const y = Number(flag(args, "y", NaN));
  const w = Number(flag(args, "w", NaN));
  const h = Number(flag(args, "h", NaN));
  const width = Number(flag(args, "width", NaN));
  const height = Number(flag(args, "height", NaN));
  if (!input || !output || [x, y, w, h, width, height].some((value) => !Number.isFinite(value))) {
    throw new Error("Kullanım: crop <video> <çıktı.mp4> --x X --y Y --w W --h H --width ÇIKIŞ_G --height ÇIKIŞ_Y [--from sn] [--to sn] [--sharpen 0.6]");
  }
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const sharpen = Math.min(1.5, Math.max(0, Number(flag(args, "sharpen", 0.6)) || 0));
  const from = flag(args, "from", null);
  const to = flag(args, "to", null);
  const filters = [
    `crop=${even(w)}:${even(h)}:${Math.round(x)}:${Math.round(y)}`,
    `scale=${even(width)}:${even(height)}:flags=lanczos`,
    ...(sharpen > 0 ? [`unsharp=5:5:${sharpen}:5:5:0`] : []),
    "setsar=1",
  ];
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await ff([
    "-i", input,
    ...(from !== null ? ["-ss", String(from)] : []),
    ...(to !== null ? ["-to", String(to)] : []),
    "-vf", filters.join(","),
    "-an", "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p",
    output,
  ]);
  const info = await probe(output);
  const scaleFactor = (even(width) / even(w)).toFixed(2);
  console.log(JSON.stringify({ output, ...info, upscale: Number(scaleFactor) }));
}

function readJobSafe() {
  try {
    return JSON.parse(readFileSync(path.resolve("job.json"), "utf8"));
  } catch {
    return {};
  }
}

// Müzik ritim analizi: tempo, vuruşlar, ölçü başları, güçlü vurgular ve (müzik uzunsa) en enerjik bölüm.
async function beats(args) {
  const [input, output] = positional(args);
  if (!input || !output) throw new Error("Kullanım: beats <müzik> <çıktı.json> [--max 20] [--min 12]");
  const raw = path.resolve(output.replace(/\.json$/i, "") + ".raw");
  await fs.mkdir(path.dirname(raw), { recursive: true });
  await ff(["-i", input, "-vn", "-ac", "1", "-ar", "22050", "-f", "f32le", raw]);
  const python = process.env.VIDEO_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const script = path.join(repoRoot, "scripts", "video-tools", "beats.py");
  const result = await run(python, [script, raw, output, "--sr", "22050", "--max", String(flag(args, "max", 20)), "--min", String(flag(args, "min", 12))], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  await fs.rm(raw, { force: true });
  if (result.code !== 0) {
    const tail = result.stderr.trim().split(/\r?\n/).slice(-8).join("\n");
    throw new Error(`Ritim analizi başarısız.\n${tail}`);
  }
  process.stdout.write(result.stdout);
}

// Uzun kayıtlarda sahne/kamera değişimlerinin zamanları (kesit seçmek için).
async function scenes(args) {
  const [input] = positional(args);
  if (!input) throw new Error("Kullanım: scenes <video> [--threshold 0.35] [--from sn] [--to sn]");
  const threshold = Number(flag(args, "threshold", 0.35));
  const from = Number(flag(args, "from", 0)) || 0;
  const to = flag(args, "to", null);
  const { stderr } = await run(ffmpeg, [
    "-hide_banner",
    ...(from ? ["-ss", String(from)] : []),
    ...(to !== null ? ["-t", String(Number(to) - from)] : []),
    "-i", input,
    "-an", "-vf", `fps=6,scale=320:-2,select='gt(scene,${threshold})',showinfo`,
    "-f", "null", "-",
  ]);
  const times = [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number((Number(match[1]) + from).toFixed(2)));
  console.log(JSON.stringify({ count: times.length, times: times.slice(0, 300) }));
}

// Kaynağın bir kesitini çıktı boyutuna (dikey) kırpılmış, sessiz, kısa bir klibe çevirir.
async function clip(args) {
  const [input, output] = positional(args);
  const from = Number(flag(args, "from", NaN));
  const to = Number(flag(args, "to", NaN));
  if (!input || !output || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error("Kullanım: clip <video> <public/clips/ad.mp4> --from sn --to sn [--focus 0.5] [--zoom 1] [--width G --height Y --fps F]");
  }
  const job = readJobSafe();
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const width = even(Number(flag(args, "width", job.width ?? 1080)));
  const height = even(Number(flag(args, "height", job.height ?? 1920)));
  const fps = Number(flag(args, "fps", job.fps ?? 30));
  const focus = Math.min(1, Math.max(0, Number(flag(args, "focus", 0.5))));
  const zoom = Math.max(1, Number(flag(args, "zoom", 1)) || 1);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await ff([
    "-ss", String(from), "-t", String(to - from), "-i", input,
    "-vf", `scale=${even(width * zoom)}:${even(height * zoom)}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}:(iw-${width})*${focus}:(ih-${height})/2,fps=${fps},setsar=1`,
    "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-g", String(Math.round(fps)), "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    output,
  ]);
  const info = await probe(output);
  console.log(JSON.stringify({ output, durationInSeconds: info.durationInSeconds, width: info.width, height: info.height }));
}

// Kurgu planı: kelime zamanlarından tutulacak aralıkları çıkarır. Kelimeler arasındaki kısa duraklamalar
// korunur; uzun sessizlikler atılır ama her konuşma bloğunun sonunda --tail kadar nefes payı kalır,
// böylece kelimeler yutulmaz ve bir cümle biter bitmez diğeri yapışmaz.
//   cutplan <cuts.json> <video1> <transkript1.json> [<video2> <transkript2.json> ...]
async function cutplan(args) {
  const [output, ...pairs] = positional(args);
  if (!output || pairs.length < 2 || pairs.length % 2 !== 0) {
    throw new Error("Kullanım: cutplan <cuts.json> <video> <transkript.json> [<video2> <transkript2.json> ...] [--lead 0.12] [--tail 0.45] [--gap 0.55] [--drop 1:3.2-5.8,2:0-1.5]");
  }
  const job = readJobSafe();
  const fps = Number(job.fps) || 30;
  const lead = Number(flag(args, "lead", 0.12));
  const tail = Number(flag(args, "tail", 0.45));
  const gap = Math.max(lead + tail, Number(flag(args, "gap", 0.55)));
  const minKeep = Number(flag(args, "min-keep", 0.25));
  // --drop "kaynakNo:başlangıç-bitiş" (kaynakNo 1'den başlar, yoksa 1). Ortası bu aralıkta kalan kelimeler atılır.
  const drops = String(flag(args, "drop", ""))
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^(?:(\d+):)?(-?[\d.]+)-(-?[\d.]+)$/);
      if (!match) throw new Error(`--drop biçimi hatalı: ${raw}`);
      return { source: Number(match[1] ?? 1) - 1, from: Number(match[2]), to: Number(match[3]) };
    });
  const snap = (value) => Math.round(value * fps) / fps;
  const segments = [];
  let originalSeconds = 0;
  let droppedWords = 0;
  for (let index = 0; index < pairs.length; index += 2) {
    const file = pairs[index];
    const source = index / 2;
    const info = await probe(file);
    originalSeconds += info.durationInSeconds;
    const transcript = JSON.parse(await fs.readFile(pairs[index + 1], "utf8"));
    const words = (transcript.words ?? []).filter((word) => {
      const mid = (word.start + word.end) / 2;
      const dropped = drops.some((drop) => drop.source === source && mid >= drop.from && mid <= drop.to);
      if (dropped) droppedWords += 1;
      return !dropped;
    });
    const groups = [];
    for (const word of words) {
      const last = groups[groups.length - 1];
      const droppedBetween = last && drops.some((drop) => drop.source === source && drop.from < word.start && drop.to > last.end);
      if (last && word.start - last.end <= gap && !droppedBetween) last.end = Math.max(last.end, word.end);
      else groups.push({ start: word.start, end: word.end });
    }
    for (const group of groups) {
      let from = snap(Math.max(0, group.start - lead));
      let to = snap(Math.min(info.durationInSeconds, group.end + tail));
      const previous = segments[segments.length - 1];
      if (previous && previous.source === source && from <= previous.to) {
        previous.to = Math.max(previous.to, to);
        continue;
      }
      if (to - from < minKeep) to = snap(Math.min(info.durationInSeconds, from + minKeep));
      segments.push({ source, file, transcript: pairs[index + 1], from, to });
    }
  }
  const round = (value) => Number(value.toFixed(3));
  const keptSeconds = segments.reduce((sum, segment) => sum + segment.to - segment.from, 0);
  const plan = {
    fps,
    settings: { lead, tail, gap, drops },
    originalSeconds: round(originalSeconds),
    keptSeconds: round(keptSeconds),
    removedSeconds: round(originalSeconds - keptSeconds),
    segments: segments.map((segment) => ({ ...segment, from: round(segment.from), to: round(segment.to) })),
  };
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, JSON.stringify(plan, null, 2), "utf8");
  console.log(
    JSON.stringify({
      output,
      segments: segments.length,
      originalSeconds: plan.originalSeconds,
      keptSeconds: plan.keptSeconds,
      removedSeconds: plan.removedSeconds,
      droppedWords,
    }),
  );
}

// cutplan çıktısını uygular: aralıkları tek bir videoda birleştirir (ses uçlarında tık olmasın diye 15 ms
// yumuşatma), kelime zamanlarını yeni zaman çizelgesine taşır ve kompozisyon süresini (job.json + src/Root.tsx) günceller.
//   cut <cuts.json> <public/cut.mp4> [--transcript-out analysis/cut-transcript.json] [--focus 0.5]
async function cut(args) {
  const [planFile, output] = positional(args);
  if (!planFile || !output) throw new Error("Kullanım: cut <cuts.json> <public/cut.mp4> [--transcript-out analysis/cut-transcript.json] [--focus 0.5]");
  const plan = JSON.parse(await fs.readFile(planFile, "utf8"));
  const segments = plan.segments ?? [];
  if (segments.length === 0) throw new Error("cuts.json içinde aralık yok.");
  const job = readJobSafe();
  const fps = Number(job.fps) || Number(plan.fps) || 30;
  const files = [...new Set(segments.map((segment) => segment.file))];
  const infos = await Promise.all(files.map((file) => probe(file)));
  const sameSize = infos.every((info) => info.width === infos[0].width && info.height === infos[0].height);
  const even = (value) => Math.max(2, Math.round(value / 2) * 2);
  const width = even(sameSize ? infos[0].width ?? job.width ?? 1080 : job.width ?? 1080);
  const height = even(sameSize ? infos[0].height ?? job.height ?? 1920 : job.height ?? 1920);
  const focus = Math.min(1, Math.max(0, Number(flag(args, "focus", 0.5))));
  const fade = 0.015;

  const parts = [];
  const labels = [];
  segments.forEach((segment, index) => {
    const input = files.indexOf(segment.file);
    const duration = segment.to - segment.from;
    const fit = sameSize
      ? ""
      : `,scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}:(iw-${width})*${focus}:(ih-${height})/2`;
    parts.push(`[${input}:v]trim=start=${segment.from}:end=${segment.to},setpts=PTS-STARTPTS,fps=${fps}${fit},setsar=1[v${index}]`);
    parts.push(
      `[${input}:a]atrim=start=${segment.from}:end=${segment.to},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=${fade},afade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade}[a${index}]`,
    );
    labels.push(`[v${index}][a${index}]`);
  });
  parts.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=1[v][a]`);
  const script = path.resolve(planFile).replace(/\.json$/i, "") + ".filter.txt";
  await fs.writeFile(script, parts.join(";\n"), "utf8");
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await ff([
    ...files.flatMap((file) => ["-i", file]),
    "-filter_complex_script", script,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "15", "-preset", "medium", "-g", String(Math.round(fps)), "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart",
    output,
  ]);
  const info = await probe(output);

  // Kelime zamanlarını kesilmiş videoya taşı.
  const transcriptOut = flag(args, "transcript-out", null);
  if (transcriptOut) {
    const words = [];
    let offset = 0;
    const cache = new Map();
    for (const segment of segments) {
      const transcriptFile = segment.transcript ?? null;
      let transcript = transcriptFile ? cache.get(transcriptFile) : null;
      if (transcriptFile && !transcript) {
        transcript = JSON.parse(await fs.readFile(transcriptFile, "utf8"));
        cache.set(transcriptFile, transcript);
      }
      for (const word of transcript?.words ?? []) {
        const mid = (word.start + word.end) / 2;
        if (mid < segment.from || mid > segment.to) continue;
        const map = (t) => Number((Math.min(segment.to, Math.max(segment.from, t)) - segment.from + offset).toFixed(3));
        words.push({ word: word.word, start: map(word.start), end: map(word.end), probability: word.probability });
      }
      offset += segment.to - segment.from;
    }
    const lines = [
      "{",
      `  "duration": ${Number(info.durationInSeconds.toFixed(3))},`,
      `  "text": ${JSON.stringify(words.map((word) => word.word).join(" "))},`,
      '  "words": [',
      words.map((word) => "    " + JSON.stringify(word)).join(",\n"),
      "  ]",
      "}",
    ];
    await fs.mkdir(path.dirname(path.resolve(transcriptOut)), { recursive: true });
    await fs.writeFile(transcriptOut, lines.join("\n") + "\n", "utf8");
  }

  // Kompozisyon süresi = kesilmiş video + (varsa) kapanış kartı.
  const outroFrames = Number(job.outroFrames) || 0;
  const frames = Math.max(1, Math.floor(info.durationInSeconds * fps)) + outroFrames;
  if (existsSync(path.resolve("job.json"))) {
    await fs.writeFile(path.resolve("job.json"), JSON.stringify({ ...job, durationInFrames: frames, cutFrames: frames - outroFrames }, null, 2), "utf8");
  }
  const rootFile = path.resolve("src", "Root.tsx");
  if (existsSync(rootFile)) {
    const root = await fs.readFile(rootFile, "utf8");
    await fs.writeFile(rootFile, root.replace(/durationInFrames=\{\d+\}/, `durationInFrames={${frames}}`), "utf8");
  }
  console.log(
    JSON.stringify({
      output,
      durationInSeconds: Number(info.durationInSeconds.toFixed(3)),
      width: info.width,
      height: info.height,
      cutFrames: frames - outroFrames,
      compositionFrames: frames,
      transcript: transcriptOut,
    }),
  );
}

// Konuşmanın bir anını komik ses efektiyle yeniden üretir (yankı, kalın/ince ses, bozuk hoparlör...).
// Kompozisyonda o aralıkta ana konuşma sesi kısılır, yerine bu dosya çalınır.
const VOICE_FX = {
  echo: { filter: "aecho=0.8:0.88:220|440|660|880:0.55|0.4|0.28|0.18", tail: 1.4 },
  reverb: { filter: "aecho=0.8:0.9:35|70|115|170|240:0.45|0.38|0.3|0.22|0.15", tail: 0.9 },
  deep: { filter: "asetrate=48000*0.75,aresample=48000,atempo=1.3333", tail: 0 },
  chipmunk: { filter: "asetrate=48000*1.4,aresample=48000,atempo=0.7143", tail: 0 },
  slow: { filter: "asetrate=48000*0.7,aresample=48000", tail: 0 },
  loud: { filter: "volume=6dB,acrusher=bits=6:mode=log:aa=1:mix=0.6,bass=g=10,alimiter=limit=0.9", tail: 0 },
  radio: { filter: "highpass=f=500,lowpass=f=3000,acrusher=bits=10:mix=0.3,volume=3dB", tail: 0 },
};

async function voicefx(args) {
  const [input, output] = positional(args);
  const effect = flag(args, "effect", "echo");
  const from = Number(flag(args, "from", NaN));
  const to = Number(flag(args, "to", NaN));
  if (!input || !output || !VOICE_FX[effect] || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error(`Kullanım: voicefx <video> <public/fx/ad.wav> --from sn --to sn --effect <${Object.keys(VOICE_FX).join("|")}> [--volume 1]`);
  }
  const volume = Number(flag(args, "volume", 1));
  const { filter, tail } = VOICE_FX[effect];
  const ending = tail > 0 ? `,apad=pad_dur=${tail}` : "";
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await ff([
    "-ss", String(from), "-t", String(to - from), "-i", input, "-vn",
    "-af", `aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:st=0:d=0.01${ending},${filter},volume=${volume}${tail > 0 ? `,afade=t=out:st=${(to - from + tail - 0.25).toFixed(3)}:d=0.25` : ""}`,
    "-ac", "2", "-ar", "48000", output,
  ]);
  const info = await probe(output);
  console.log(JSON.stringify({ output, effect, durationInSeconds: Number(info.durationInSeconds.toFixed(3)), note: "Bu aralıkta ana konuşma sesini kıs (volume 0), bu dosyayı from karesinde çal." }));
}

// Müzikten bir bölüm keser (yumuşak giriş/çıkışla).
async function musiccut(args) {
  const [input, output] = positional(args);
  const from = Number(flag(args, "from", 0)) || 0;
  const duration = Number(flag(args, "duration", NaN));
  if (!input || !output || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Kullanım: musiccut <müzik> <çıktı.m4a> --from sn --duration sn [--fade-out 0.4]");
  }
  const fadeIn = Number(flag(args, "fade-in", from > 0 ? 0.03 : 0)) || 0;
  const fadeOut = Math.min(duration / 2, Number(flag(args, "fade-out", 0.4)) || 0);
  const filters = [
    ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${fadeIn}`] : []),
    ...(fadeOut > 0 ? [`afade=t=out:st=${(duration - fadeOut).toFixed(3)}:d=${fadeOut}`] : []),
  ];
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await ff([
    "-ss", String(from), "-t", String(duration), "-i", input, "-vn",
    ...(filters.length ? ["-af", filters.join(",")] : []),
    "-ac", "2", "-ar", "48000", "-c:a", "aac", "-b:a", "256k", output,
  ]);
  console.log(output);
}

async function frames(args) {
  const [video, directory, list] = positional(args);
  if (!video || !directory || !list) throw new Error("Kullanım: frames <video> <klasör> <s1,s2,...> [--width 720]");
  const width = Number(flag(args, "width", 720));
  await fs.mkdir(directory, { recursive: true });
  const written = [];
  for (const raw of list.split(",")) {
    const second = Number(raw);
    if (!Number.isFinite(second)) continue;
    const file = path.join(directory, `t${second.toFixed(2).replace(".", "_")}.jpg`);
    await ff(["-ss", String(second), "-i", video, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "3", file]);
    written.push(file);
  }
  console.log(JSON.stringify(written, null, 2));
}

async function audio(args) {
  const [video, output] = positional(args);
  if (!video || !output) throw new Error("Kullanım: audio <video> <çıktı.wav>");
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await ff(["-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
  console.log(output);
}

async function transcribe(args) {
  const [input, output] = positional(args);
  if (!input || !output) throw new Error("Kullanım: transcribe <video|ses> <çıktı.json> [--language tr] [--model large-v3-turbo]");
  const wav = output.replace(/\.json$/i, "") + ".wav";
  await audio([input, wav]);
  const script = path.join(repoRoot, "scripts", "video-tools", "transcribe.py");
  const python = process.env.VIDEO_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const extra = [];
  const language = flag(args, "language", null);
  const model = flag(args, "model", null);
  if (language) extra.push("--language", language);
  if (model) extra.push("--model", model);
  // Whisper'ın uyarı/indirme logları (stderr) ajana basılmaz; yalnızca sonuç özeti (stdout) gösterilir.
  const result = await run(python, [script, wav, output, ...extra], {
    echo: false,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (result.code !== 0) {
    const missing = /No module named ['"]?faster_whisper/.test(result.stderr);
    const tail = result.stderr.trim().split(/\r?\n/).slice(-12).join("\n");
    throw new Error(
      missing
        ? `Transkript başarısız: ${python} içinde faster_whisper kurulu değil. Paket kurmaya çalışma; kullanıcıya "pip install -r scripts/video-tools/requirements.txt" çalıştırmasını söyle.`
        : `Transkript başarısız.\n${tail}`,
    );
  }
  process.stdout.write(result.stdout);
}

// Ses efektleri.
// 1) "Ses kütüphanemi kullan" modunda (job.json sfxLibrary) önce public/media/sfx/<tür>/ klasörüne bakılır.
// 2) Yoksa gürültü tabanlı basit sentez kullanılır (ton/sinüs yok; kulağa lazer gibi gelmesin).
const SFX_LIBRARY = path.join(repoRoot, "public", "media", "sfx");

function libraryEnabled() {
  try {
    const job = JSON.parse(readFileSync(path.resolve("job.json"), "utf8"));
    return job.sfxLibrary !== false;
  } catch {
    return true;
  }
}
const AUDIO_FILE = /\.(wav|mp3|ogg|m4a|flac|aac)$/i;

// Gauss zarfı: t anında c merkezli, s genişlikli tepe.
const bell = (c, s) => `volume=eval=frame:volume='exp(-pow((t-${c})/${s}\\,2))'`;

// 8-bit (chiptune) sesler: kare dalga ve kırpılmış gürültü. Piksel art animasyonlar için.
function chip(expression, d, extra = "") {
  return [
    "-f", "lavfi", "-i", `aevalsrc='${expression.replaceAll(",", "\\,")}':d=${d}:s=48000`,
    "-af", `${extra}lowpass=f=7000,volume=2.2,afade=t=out:st=${(d * 0.85).toFixed(3)}:d=${(d * 0.15).toFixed(3)},alimiter=limit=0.8:level=disabled`,
  ];
}
const square = (phase) => `sgn(sin(2*PI*(${phase})))`;
// Basamaklı arpej: notalar sırayla `step` saniye çalar, sonuncusu kalır.
function arpeggio(notes, step) {
  let expression = String(notes[notes.length - 1]);
  for (let index = notes.length - 2; index >= 0; index -= 1) {
    expression = `if(lt(t,${(step * (index + 1)).toFixed(3)}),${notes[index]},${expression})`;
  }
  return expression;
}

const CHIPTUNE = {
  coin: (d) => chip(`0.3*${square(`${arpeggio([988, 1319], 0.08)}*t`)}*if(lt(t,0.08),1,exp(-(t-0.08)*7))`, d),
  jump: (d) => chip(`0.28*${square(`260*t+320*t*t/${d}`)}*exp(-t*4)`, d),
  powerup: (d) => chip(`0.26*${square(`392*pow(1.122,floor(t/0.045))*t`)}`, d),
  levelup: (d) => chip(`0.28*${square(`${arpeggio([523, 659, 784, 1047], 0.08)}*t`)}*if(lt(t,0.32),1,exp(-(t-0.32)*5))`, d),
  blip: (d) => chip(`0.28*${square("880*t")}*exp(-t*18)`, d),
  select: (d) => chip(`0.26*${square(`${arpeggio([660, 990], 0.05)}*t`)}*exp(-t*12)`, d),
  hurt: (d) => chip(`0.32*${square(`620*t-260*t*t/${d}`)}*(1-t/${d})`, d),
  explode: (d) => chip(`0.6*(2*random(0)-1)*exp(-t*4.5)`, d, "acrusher=bits=4:samples=24:mix=1,"),
};

const SYNTH = {
  ...CHIPTUNE,
  // Hava akımı: üç bant gürültü, tepe noktaları kaydırılmış -> doğal "vuuş" (perde yükselip iner, ton yok).
  whoosh: (d) => [
    "-f", "lavfi", "-i", `anoisesrc=d=${d}:c=pink:a=0.9:r=48000`,
    "-filter_complex",
    `[0:a]asplit=3[a][b][c];` +
      `[a]bandpass=f=350:width_type=o:w=1.4,${bell(d * 0.42, d * 0.28)},volume=1.6[lo];` +
      `[b]bandpass=f=1100:width_type=o:w=1.2,${bell(d * 0.5, d * 0.2)},volume=1.3[mid];` +
      `[c]bandpass=f=3200:width_type=o:w=1.0,${bell(d * 0.55, d * 0.13)},volume=0.9[hi];` +
      `[lo][mid][hi]amix=inputs=3:normalize=0,highpass=f=120,lowpass=f=7000,afade=t=out:st=${d * 0.85}:d=${d * 0.15},volume=1.8`,
  ],
  // Daha kısa ve parlak hava geçişi.
  swoosh: (d) => [
    "-f", "lavfi", "-i", `anoisesrc=d=${d}:c=white:a=0.7:r=48000`,
    "-filter_complex",
    `[0:a]asplit=2[a][b];` +
      `[a]bandpass=f=1400:width_type=o:w=1.3,${bell(d * 0.4, d * 0.2)}[m];` +
      `[b]bandpass=f=3800:width_type=o:w=1.0,${bell(d * 0.48, d * 0.12)},volume=0.45[h];` +
      `[m][h]amix=inputs=2:normalize=0,highpass=f=300,afade=t=out:st=${d * 0.8}:d=${d * 0.2},volume=2.2`,
  ],
  // Fotoğraf makinesi deklanşörü: ayna "klik" + perde "klak" (iki mekanik gürültü darbesi).
  shutter: (d) => [
    "-f", "lavfi", "-i",
    `aevalsrc='(2*random(0)-1)*(exp(-t*320)+0.75*gte(t\\,0.085)*exp(-(t-0.085)*260)+0.25*gte(t\\,0.012)*exp(-(t-0.012)*90))':d=${d}:s=48000`,
    "-af", "highpass=f=500,equalizer=f=2600:t=q:w=1.2:g=6,equalizer=f=900:t=q:w=1.5:g=3,lowpass=f=9000,volume=1.0,alimiter=limit=0.85:level=disabled",
  ],
  // Mekanik klavye tuşları: her vuruşta düzensiz güçte gürültü darbesi + alçak "tok" gövde sesi.
  keys: (d, interval) => [
    "-f", "lavfi", "-i",
    `aevalsrc='(2*random(0)-1)*(0.55+0.45*abs(sin(floor(t/${interval})*12.9898)))*(exp(-mod(t\\,${interval})*520)+0.35*exp(-mod(t\\,${interval})*120))':d=${d}:s=48000`,
    "-af", "highpass=f=350,equalizer=f=3000:t=q:w=1:g=4,equalizer=f=600:t=q:w=1:g=4,lowpass=f=7000,volume=0.8,alimiter=limit=0.8:level=disabled",
  ],
  // Arayüz tıkı: kısa, kuru gürültü darbesi.
  click: (d) => [
    "-f", "lavfi", "-i", `aevalsrc='(2*random(0)-1)*exp(-t*700)':d=${d}:s=48000`,
    "-af", "highpass=f=1200,equalizer=f=3500:t=q:w=1:g=5,lowpass=f=8000,volume=1.1,alimiter=limit=0.8:level=disabled",
  ],
  // Alçak "bum": inen bas gövde + kısa gürültü. Ölçülü kullan.
  impact: (d) => [
    "-f", "lavfi", "-i", `aevalsrc='0.9*sin(2*PI*(42*t+50*(1-exp(-t*9))/9))*exp(-t*5)':d=${d}:s=48000`,
    "-f", "lavfi", "-i", `anoisesrc=d=${Math.min(d, 0.25)}:c=brown:a=0.8:r=48000`,
    "-filter_complex", "[0:a]lowpass=f=160[b];[1:a]lowpass=f=700,afade=t=out:st=0:d=0.25[n];[b][n]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95",
  ],
};
SYNTH.typing = SYNTH.keys;

// Yalnızca kütüphanede gerçek kaydı varsa kullanılabilen türler (sentezi kulağa kötü geliyor).
const LIBRARY_ONLY = ["pop", "ding", "riser", "transition", "camera", "paper", "money", "notification"];
const SFX_KINDS = [...Object.keys(SYNTH).filter((kind) => kind !== "typing"), ...LIBRARY_ONLY];
const LOOPING = new Set(["keys", "typing"]);

const SFX_DURATION = { coin: 0.45, jump: 0.3, powerup: 0.6, levelup: 0.9, blip: 0.12, select: 0.18, hurt: 0.35, explode: 0.8, whoosh: 0.7, swoosh: 0.45, shutter: 0.3, keys: 1.2, typing: 1.2, click: 0.06, impact: 1.0 };

async function libraryFiles(kind) {
  if (!libraryEnabled()) return [];
  const folders = kind === "typing" ? ["typing", "keys"] : kind === "keys" ? ["keys", "typing"] : [kind];
  for (const folder of folders) {
    const directory = path.join(SFX_LIBRARY, folder);
    const names = await fs.readdir(directory).catch(() => []);
    const files = names.filter((name) => AUDIO_FILE.test(name)).sort().map((name) => path.join(directory, name));
    if (files.length) return files;
  }
  return [];
}

function hashOf(text) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

async function sfxLibrary() {
  const rows = [];
  for (const kind of [...new Set([...SFX_KINDS, "typing"])]) {
    const files = await libraryFiles(kind);
    rows.push({ kind, library: files.map((file) => path.basename(file)), synth: Boolean(SYNTH[kind]) });
  }
  console.log(JSON.stringify(rows.filter((row) => row.library.length || row.synth), null, 2));
}

async function sfx(args) {
  const [kind, output] = positional(args);
  if (kind === "list") return sfxLibrary();
  if (!kind || !output || !(SYNTH[kind] || LIBRARY_ONLY.includes(kind))) {
    throw new Error(`Kullanım: sfx <${SFX_KINDS.join("|")}> <çıktı.wav> [--duration sn] [--volume 1] [--interval sn] [--variant n]   (sfx list: mevcut sesler)`);
  }
  const volume = Number(flag(args, "volume", 1));
  const requested = flag(args, "duration", null);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });

  const files = await libraryFiles(kind);
  if (files.length) {
    const variantFlag = flag(args, "variant", null);
    const index = variantFlag !== null ? Math.abs(Number(variantFlag) || 0) % files.length : hashOf(path.basename(output)) % files.length;
    const source = files[index];
    const input = LOOPING.has(kind) && requested ? ["-stream_loop", "-1", "-i", source] : ["-i", source];
    const filters = [`volume=${volume}`];
    const trim = [];
    if (requested) {
      const duration = Number(requested);
      filters.push(`afade=t=out:st=${Math.max(0, duration - 0.04)}:d=0.04`);
      trim.push("-t", String(duration));
    }
    await ff([...input, "-vn", "-af", filters.join(","), "-ac", "2", "-ar", "48000", ...trim, output]);
    console.log(`${output} (kütüphane: ${path.basename(path.dirname(source))}/${path.basename(source)})`);
    return;
  }

  if (!SYNTH[kind]) {
    throw new Error(`"${kind}" için kütüphanede ses yok. Yerleşik türler: ${Object.keys(SYNTH).join(", ")}.`);
  }
  const duration = Number(requested ?? SFX_DURATION[kind]);
  const interval = Math.min(0.5, Math.max(0.03, Number(flag(args, "interval", 0.08)) || 0.08));
  const parts = SYNTH[kind](duration, interval);
  const filterIndex = parts.findIndex((part) => part === "-af" || part === "-filter_complex");
  if (filterIndex === -1) parts.push("-af", `volume=${volume}`);
  else parts[filterIndex + 1] += `,volume=${volume}`;
  await ff([...parts, "-ac", "2", "-ar", "48000", "-t", String(duration), output]);
  console.log(`${output} (sentez)`);
}

async function loudness(args) {
  const [file] = positional(args);
  if (!file) throw new Error("Kullanım: loudness <dosya>");
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const integrated = summary.match(/I:\s*(-?[\d.]+) LUFS/);
  const peak = summary.match(/Peak:\s*(-?[\d.]+) dBFS/);
  console.log(JSON.stringify({ integratedLufs: integrated ? Number(integrated[1]) : null, truePeakDb: peak ? Number(peak[1]) : null }));
}

async function measureLufs(file) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file, "-vn", "-af", "ebur128", "-f", "null", "-"]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const match = summary.match(/I:\s*(-?[\d.]+) LUFS/);
  return match ? Number(match[1]) : null;
}

// Müzik seviyesi planı: konuşmanın ve müziğin gerçek ses yüksekliğini ölçer, müziğin
// konuşma altında kalması için Remotion <Audio volume> değerlerini hesaplar.
async function mixplan(args) {
  const [speech, music] = positional(args);
  if (!speech || !music) throw new Error("Kullanım: mixplan <konuşma videosu> <müzik> [--max 0.35]");
  let max = Number(flag(args, "max", NaN));
  if (!Number.isFinite(max)) {
    const job = existsSync(path.resolve("job.json")) ? JSON.parse(readFileSync(path.resolve("job.json"), "utf8")) : {};
    max = Number(job.musicVolume) || 0.35;
  }
  const [speechLufs, musicLufs, info] = await Promise.all([measureLufs(speech), measureLufs(music), probe(music)]);
  if (speechLufs === null || musicLufs === null) throw new Error("Ses yüksekliği ölçülemedi.");
  // Müzik, konuşmanın X dB altında kalsın diye gereken çarpan.
  const gainBelow = (db) => Math.pow(10, (speechLufs - db - musicLufs) / 20);
  const round = (value) => Number(value.toFixed(3));
  const openVolume = round(Math.min(max, gainBelow(8)));
  // Konuşma sırasında en fazla açık seviyenin %60'ı: aralarda ve kapanışta yükseliş her zaman duyulur.
  const duckVolume = round(Math.min(openVolume * 0.6, gainBelow(20)));
  console.log(
    JSON.stringify({
      speechLufs,
      musicLufs,
      musicSeconds: round(info.durationInSeconds),
      maxVolume: max,
      duckVolume,
      openVolume,
      note: "Konuşma varken duckVolume (konuşmanın ~20 dB altı), konuşmasız aralarda ve kapanışta openVolume (en fazla maxVolume).",
    }),
  );
}

async function readJob() {
  const file = path.resolve("job.json");
  if (!existsSync(file)) throw new Error("job.json bulunamadı. Komutu iş klasöründen çalıştır.");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function remotionCli() {
  const pkg = require.resolve("@remotion/cli/package.json", { paths: [repoRoot] });
  return path.join(path.dirname(pkg), "remotion-cli.js");
}

// Remotion'ın ilerleme logları ajanın bağlamına yazılmaz (token tasarrufu); yalnızca hata halinde son satırlar gösterilir.
async function remotion(args, onStdout) {
  const result = await run(process.execPath, [remotionCli(), ...args], { cwd: repoRoot, echo: false, onStdout });
  if (result.code !== 0) {
    const tail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(-25).join("\n");
    throw new Error(`Remotion hata verdi:\n${tail}`);
  }
}

async function still(args) {
  const [frame, output] = positional(args);
  if (!frame || !output) throw new Error("Kullanım: still <kare> <çıktı.png> [--scale 0.5]");
  const job = await readJob();
  const scale = flag(args, "scale", "0.5");
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await remotion([
    "still",
    path.resolve(job.entry),
    job.compositionId,
    path.resolve(output),
    `--frame=${frame}`,
    `--scale=${scale}`,
    `--public-dir=${path.resolve(job.publicDir)}`,
    "--log=error",
  ]);
  console.log(path.resolve(output));
}

async function render(args) {
  const [outputArg] = positional(args);
  const job = await readJob();
  const output = path.resolve(outputArg ?? job.output);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const range = flag(args, "frames", null);
  // Stüdyo paneli yüzdeyi bu dosyadan okur.
  const progressFile = path.resolve("render-progress.json");
  const progress = { rendered: 0, encoded: 0, total: job.durationInFrames ?? 0, done: false, partial: Boolean(range) };
  let lastWrite = 0;
  const writeProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 500) return;
    lastWrite = now;
    void fs.writeFile(progressFile, JSON.stringify({ ...progress, at: new Date().toISOString() })).catch(() => undefined);
  };
  writeProgress(true);
  const startedAt = Date.now();
  const onStdout = (text) => {
    const clean = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    for (const match of clean.matchAll(/(Render(?:ing|ed)|Encod(?:ing|ed))(?: frames| video)?\s+[^\d\n]*?(\d+)\/(\d+)/g)) {
      const value = Number(match[2]);
      progress.total = Number(match[3]) || progress.total;
      if (match[1].startsWith("Render")) progress.rendered = Math.max(progress.rendered, value);
      else progress.encoded = Math.max(progress.encoded, value);
    }
    writeProgress();
  };
  await remotion([
    "render",
    path.resolve(job.entry),
    job.compositionId,
    output,
    `--crf=${job.crf}`,
    `--public-dir=${path.resolve(job.publicDir)}`,
    "--codec=h264",
    "--audio-codec=aac",
    "--log=warn",
    ...(range ? [`--frames=${range}`] : []),
  ], onStdout);
  progress.done = true;
  progress.rendered = progress.encoded = progress.total;
  await fs.writeFile(progressFile, JSON.stringify({ ...progress, at: new Date().toISOString() }));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`${output}\nRender tamam: ${progress.total} kare, ${seconds} sn.`);
}

const HELP = `Video araçları:
  probe <dosya>                                  süre, boyut, fps, ses bilgisi (JSON)
  grid <video> <çıktı.jpg> [--count 12] [--cols 4] [--from s] [--to s]
                                                 zaman damgalı kare kontak sayfası
  frames <video> <klasör> <s1,s2,...> [--width 720]
                                                 belirli saniyelerden tek kareler
  audio <video> <çıktı.wav>                      16 kHz mono ses
  transcribe <video> <çıktı.json> [--language tr] [--model large-v3-turbo]
                                                 kelime zamanlı transkript (faster-whisper)
  sfx <${SFX_KINDS.join("|")}> <çıktı.wav> [--duration s] [--volume 1] [--interval s] [--variant n]
                                                 ses efekti: kütüphane modunda önce public/media/sfx, yoksa basit sentez
  sfx list                                       kullanılabilir efektleri ve kütüphanedeki dosyaları göster
  clip <video> <çıktı.mp4> --from sn --to sn [--focus 0.5] [--zoom 1]
                                                 kesit → çıktı boyutunda, sessiz klip
  scenes <video> [--threshold 0.35] [--from sn] [--to sn]
                                                 sahne değişimi zamanları
  beats <müzik> <çıktı.json> [--max 20] [--min 12]
                                                 tempo, vuruşlar, ölçü başları, güçlü vurgular, en iyi bölüm
  musiccut <müzik> <çıktı.m4a> --from sn --duration sn [--fade-out 0.4]
  cutplan <cuts.json> <video> <transkript.json> [...] [--lead 0.12] [--tail 0.45] [--gap 0.55] [--drop 1:3.2-5.8]
                                                 kurgu planı: sessizlikleri at, konuşma bloklarının sonunda nefes payı bırak
  cut <cuts.json> <public/cut.mp4> [--transcript-out analysis/cut-transcript.json]
                                                 planı uygula, kelime zamanlarını taşı, kompozisyon süresini güncelle
  voicefx <video> <çıktı.wav> --from sn --to sn --effect <${Object.keys(VOICE_FX).join("|")}>
                                                 konuşmanın bir anına komik ses efekti (yankı, kalın/ince ses...)
  crop <video> <çıktı.mp4> --x --y --w --h --width --height [--from sn] [--to sn] [--sharpen 0.6]
                                                 bölge kırp + yüksek kaliteli büyütme (sessiz video)
  loudness <dosya>                               entegre LUFS ve true peak
  mixplan <konuşma> <müzik> [--max 0.35]         müzik için konuşma altı (duck) ve açık ses seviyeleri
  still <kare> <çıktı.png> [--scale 0.5]         kompozisyondan tek kare render
  render [çıktı.mp4] [--frames 0-89]             tam render (varsayılan job.json output)`;

const [command, ...rest] = process.argv.slice(2);
const commands = { probe: async (a) => console.log(JSON.stringify(await probe(positional(a)[0]), null, 2)), grid, frames, crop, clip, scenes, beats, musiccut, cutplan, cut, voicefx, audio, transcribe, sfx, loudness, mixplan, still, render };

if (!command || !commands[command]) {
  console.log(HELP);
  process.exit(command ? 1 : 0);
}

try {
  await commands[command](rest);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
