import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { claudeAuthStatus, DEFAULT_CLAUDE_MODEL, DEFAULT_EFFORT, modelLabel, resolveClaudeCommand } from "./claude-cli";
import { resolveMediaFile } from "./media";
import { getRenderRecord, projectArchiveDir } from "./render-history";
import { extractFrames, extractJson, runAgentProcess } from "./skill-author";

// Paylaşım metinleri: bir video için TikTok, Instagram Reels ve YouTube Shorts açıklama/başlık/etiketleri.
// Sonuçlar data/social-copy/<anahtar>.json içinde kalıcıdır; aynı video seçilince son sonuç tekrar gösterilir.

export type SocialSource = { kind: "history"; id: string } | { kind: "video"; path: string };

export type SocialCopy = {
  videoSummary: string;
  tiktok: { caption: string; hashtags: string[]; coverText: string };
  instagram: { caption: string; hashtags: string[]; coverText: string; firstComment: string };
  youtube: { title: string; description: string; hashtags: string[]; tags: string[] };
};

export type SocialRecord = {
  key: string;
  source: SocialSource;
  notes: string;
  copy: SocialCopy;
  modelName: string | null;
  createdAt: string;
};

export type SocialJobState = {
  id: string;
  key: string;
  status: "running" | "success" | "error";
  detail: string;
  error: string | null;
  record: SocialRecord | null;
  startedAt: string;
  finishedAt: string | null;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_PATH = /^sources\/[^/\\]+\.(mp4|webm|mov|mkv)$/i;
const FRAME_COUNT = 10;
const TOOLS = path.join(process.cwd(), "scripts", "video-tools", "vt.mjs");

let activeJobId: string | null = null;

function recordsDir(): string {
  return path.join(process.cwd(), "data", "social-copy");
}

function jobDir(id: string): string {
  return path.join(process.cwd(), "tmp", "social-jobs", id);
}

export function parseSocialSource(value: unknown): SocialSource {
  const raw = (value ?? {}) as Partial<{ kind: string; id: string; path: string }>;
  if (raw.kind === "history" && typeof raw.id === "string" && ID.test(raw.id)) return { kind: "history", id: raw.id };
  if (raw.kind === "video" && typeof raw.path === "string" && !raw.path.includes("..") && VIDEO_PATH.test(raw.path)) {
    return { kind: "video", path: raw.path };
  }
  throw new Error("Geçersiz video seçimi.");
}

export function sourceKey(source: SocialSource): string {
  if (source.kind === "history") return `render-${source.id}`;
  const base = path
    .basename(source.path)
    .toLocaleLowerCase("tr")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, "-");
  return `video-${base}`.slice(0, 120);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readSocialRecord(key: string): Promise<SocialRecord | null> {
  if (!/^[a-z0-9.-]{3,120}$/.test(key)) return null;
  return readJson<SocialRecord>(path.join(recordsDir(), `${key}.json`));
}

export async function readSocialJob(id: string): Promise<SocialJobState | null> {
  if (!ID.test(id)) return null;
  return readJson<SocialJobState>(path.join(jobDir(id), "status.json"));
}

async function writeJob(job: SocialJobState): Promise<void> {
  await fs.mkdir(jobDir(job.id), { recursive: true });
  await fs.writeFile(path.join(jobDir(job.id), "status.json"), JSON.stringify(job, null, 2), "utf8");
}

async function setDetail(id: string, detail: string): Promise<void> {
  const job = await readSocialJob(id);
  if (job && job.status === "running") await writeJob({ ...job, detail });
}

function transcriptText(raw: unknown): string {
  const data = raw as { text?: unknown; words?: { word?: string }[] } | null;
  if (data && typeof data.text === "string" && data.text.trim()) return data.text.trim();
  return (data?.words ?? []).map((word) => word.word ?? "").join(" ").trim();
}

function transcribe(video: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TOOLS, "transcribe", video, output, "--language", "tr"], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || "Transkript çıkarılamadı."))));
  });
}

type VideoContext = { video: string; transcript: string; extra: string[] };

/** Videonun dosyasını ve bilinenleri (transkript, ajanın özeti, sahne planı) toplar. */
async function collectContext(id: string, source: SocialSource): Promise<VideoContext> {
  const extra: string[] = [];
  let transcript = "";
  let video: string;
  if (source.kind === "history") {
    const record = await getRenderRecord(source.id);
    if (!record) throw new Error("Geçmişteki video bulunamadı.");
    video = path.join(process.cwd(), "public", "renders", `${source.id}.mp4`);
    if (record.summary) extra.push(`Videoyu üreten ajanın özeti: ${record.summary}`);
    if (record.settings.prompt.trim()) extra.push(`Video üretilirken kullanıcının isteği: ${record.settings.prompt.trim().slice(0, 1500)}`);
    if (record.settings.styleSkills.length) {
      extra.push(`Kullanılan stil: ${record.settings.styleSkills.map((skill) => `${skill.name} (${skill.summary})`).join("; ")}`);
    }
    const analysis = path.join(projectArchiveDir(source.id), "analysis");
    const files = await fs.readdir(analysis).catch(() => [] as string[]);
    // Kurgulanmış videolarda kesilmiş transkript videonun gerçek metnidir.
    const transcriptFile =
      files.find((name) => name === "cut-transcript.json") ?? files.find((name) => /transcript.*\.json$/i.test(name));
    if (transcriptFile) transcript = transcriptText(await readJson(path.join(analysis, transcriptFile)));
    const plan = await fs.readFile(path.join(analysis, "plan.md"), "utf8").catch(() => "");
    if (plan.trim()) extra.push(`Videonun sahne planı (ekrandaki animasyonlar ve yazılar):\n${plan.trim().slice(0, 5000)}`);
  } else {
    video = resolveMediaFile(source.path);
  }
  await fs.access(video).catch(() => {
    throw new Error("Video dosyası bulunamadı.");
  });
  if (!transcript) {
    await setDetail(id, "Konuşma metne çevriliyor");
    const output = path.join(jobDir(id), "transcript.json");
    await transcribe(video, output);
    transcript = transcriptText(await readJson(output));
  }
  return { video, transcript, extra };
}

const SCHEMA =
  '{"videoSummary":"videonun 1-2 cümlelik özeti","tiktok":{"caption":"","hashtags":["#..."],"coverText":""},"instagram":{"caption":"","hashtags":["#..."],"coverText":"","firstComment":""},"youtube":{"title":"","description":"","hashtags":["#Shorts","#..."],"tags":["..."]}}';

function instruction(context: VideoContext, frames: string[], notes: string): string {
  return [
    "Sen Türkiye'deki kısa video platformlarını çok iyi bilen bir sosyal medya editörüsün.",
    "Görevin: aşağıdaki dikey kısa video için TikTok, Instagram Reels ve YouTube Shorts'a ayrı ayrı, yüklemeye hazır paylaşım metinleri yazmak.",
    "",
    "## Video",
    "Videodan eşit aralıklarla alınmış kareler. Hepsini Read aracıyla aç ve gerçekten bak (ekrandaki yazılar, görseller, kişi, ortam, ürünler). Yollar:",
    ...frames.map((frame) => `- ${frame}`),
    "",
    `Konuşmanın metni (otomatik transkript, özel isimlerde hata olabilir):\n${context.transcript || "(konuşma yok)"}`,
    ...(context.extra.length ? ["", ...context.extra] : []),
    "",
    notes.trim() ? `## Kullanıcının notu (buna mutlaka uy)\n${notes.trim().slice(0, 2000)}` : "",
    "",
    "## Hesap ve ton",
    "Hesap kısa video (Reels/TikTok/Shorts) üreten bir içerik üreticisine ait; konu ve hedef kitleyi videonun kendisinden çıkar. Ton: samimi, esprili, hafif sarkastik; kurumsal, abartılı reklam dili ve klişe ('Bu videoyu sakın kaçırma!') yok. Türkçe yaz, Türkçe karakterleri doğru kullan.",
    "Metinler videonun **gerçek içeriğine özel** olsun: videoda söylenen somut bir şeye, sayıya, espriye dayan. Videoda olmayan bir şeyi vaat etme.",
    "",
    "## Platform kuralları",
    "TikTok:",
    "- caption: ilk satır 70 karakteri geçmeyen güçlü bir kanca (akışta görünen kısım). Toplam 150–400 karakter; kısa, sohbet eder gibi, sonunda yorum yazdıracak bir soru. Hashtag'leri caption'a yazma.",
    "- hashtags: 3–5 adet; 1–2 geniş (#keşfet gibi değil, konuya uygun geniş: #girişimcilik, #eticaret), 2–3 niş. '#' ile başlar, boşluk ve Türkçe dışı gereksiz karakter yok. #fyp/#keşfet gibi anlamsız etiketler kullanma.",
    "- coverText: kapak görseline yazılacak en fazla 5 kelimelik merak uyandıran başlık.",
    "Instagram Reels:",
    "- caption: ilk 125 karakter kanca (devamı 'daha fazla' arkasında kalır). Toplam 300–900 karakter; 2–4 kısa paragraf, gerekirse 1–3 emoji, sonunda net bir çağrı (kaydet / arkadaşına gönder / yorum yaz). Hashtag'leri caption'a yazma.",
    "- hashtags: 3–5 adet, konuya özel (Instagram en fazla 5 hashtag'i öneriyor).",
    "- coverText: Reels kapağı için en fazla 5 kelime.",
    "- firstComment: hesabın kendi videosuna atacağı ilk yorum (sohbeti başlatan, esprili, 1 cümle).",
    "YouTube Shorts:",
    "- title: en fazla 70 karakter (100 sınır ama mobilde ~40–60 karakter görünür), merak uyandıran, anahtar kelime içeren, clickbait yalanı yok. Başlıkta hashtag yok.",
    "- description: 2–4 cümle, ilk cümlede ana anahtar kelimeler (arama için), sonra kısa bir çağrı. Hashtag'leri description'a yazma.",
    "- hashtags: 3 adet, ilki #Shorts; bunlar açıklamanın sonuna eklenecek.",
    "- tags: 8–15 arama etiketi (hashtag değil, '#' yok), Türkçe; toplam 450 karakteri geçmesin.",
    "",
    "## Çıktı",
    "Dosya oluşturma. Yalnızca tek bir geçerli JSON nesnesi döndür, başka hiçbir şey yazma; parantezleri şemadaki gibi kapat. Şema:",
    SCHEMA,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hashtags(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => `#${item.trim().replace(/^#+/, "").replace(/\s+/g, "")}`)
    .filter((item) => item.length > 1);
  return [...new Set(tags)].slice(0, max);
}

function parseCopy(raw: unknown): SocialCopy {
  const data = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const tiktok = data.tiktok ?? {};
  const instagram = data.instagram ?? {};
  const youtube = data.youtube ?? {};
  const tags = Array.isArray(youtube.tags)
    ? youtube.tags.filter((item): item is string => typeof item === "string").map((item) => item.replace(/^#+/, "").trim()).filter(Boolean)
    : [];
  // YouTube etiketlerinin toplamı 500 karakteri geçemez.
  const limitedTags: string[] = [];
  for (const tag of tags) {
    if ([...limitedTags, tag].join(",").length > 480) break;
    limitedTags.push(tag);
  }
  const copy: SocialCopy = {
    videoSummary: text((raw as { videoSummary?: unknown })?.videoSummary, 600),
    tiktok: { caption: text(tiktok.caption, 2200), hashtags: hashtags(tiktok.hashtags, 8), coverText: text(tiktok.coverText, 80) },
    instagram: {
      caption: text(instagram.caption, 2000),
      hashtags: hashtags(instagram.hashtags, 8),
      coverText: text(instagram.coverText, 80),
      // Model bazen bu alanı instagram nesnesinin dışına yazıyor.
      firstComment: text(instagram.firstComment ?? (raw as { firstComment?: unknown })?.firstComment, 300),
    },
    youtube: {
      title: text(youtube.title, 100),
      description: text(youtube.description, 4500),
      hashtags: hashtags(youtube.hashtags, 5),
      tags: limitedTags,
    },
  };
  if (!copy.tiktok.caption || !copy.instagram.caption || !copy.youtube.title) throw new Error("Model eksik metin döndürdü. Tekrar dene.");
  return copy;
}

type ModelOutput = { status?: string; result?: string | null; error?: string | null; model?: { id: string } | null };

async function runModel(inputPath: string, outputPath: string): Promise<ModelOutput & { result: string }> {
  await runAgentProcess(inputPath, outputPath);
  const output = await readJson<ModelOutput>(outputPath);
  if (!output?.result || output.status !== "finished") throw new Error(output?.error || "Metinler üretilemedi.");
  return { ...output, result: output.result };
}

async function generate(id: string, source: SocialSource, notes: string): Promise<void> {
  const context = await collectContext(id, source);
  await setDetail(id, "Videodan kareler alınıyor");
  const frames = await extractFrames(context.video, path.join(jobDir(id), "frames"), FRAME_COUNT);
  await setDetail(id, "Claude metinleri yazıyor");
  const inputPath = path.join(jobDir(id), "agent-input.json");
  const outputPath = path.join(jobDir(id), "agent-output.json");
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      instruction: instruction(context, frames, notes),
      claude: resolveClaudeCommand(),
      model: DEFAULT_CLAUDE_MODEL,
      effort: DEFAULT_EFFORT,
    }),
    "utf8",
  );
  const output = await runModel(inputPath, outputPath);
  let parsed: unknown;
  try {
    parsed = extractJson(output.result);
  } catch {
    // Model bazen parantezleri yanlış kapatıyor; bozuk çıktıyı bir kez düzelttir.
    await setDetail(id, "Çıktı düzeltiliyor");
    const fixInput = path.join(jobDir(id), "fix-input.json");
    await fs.writeFile(
      fixInput,
      JSON.stringify({
        instruction: [
          "Aşağıdaki metin geçersiz bir JSON. İçeriğini değiştirmeden şu şemaya oturt ve yalnızca geçerli tek bir JSON nesnesi döndür:",
          SCHEMA,
          "",
          output.result,
        ].join("\n"),
        claude: resolveClaudeCommand(),
        model: DEFAULT_CLAUDE_MODEL,
        effort: "low",
      }),
      "utf8",
    );
    parsed = extractJson((await runModel(fixInput, path.join(jobDir(id), "fix-output.json"))).result);
  }
  const copy = parseCopy(parsed);
  const record: SocialRecord = {
    key: sourceKey(source),
    source,
    notes,
    copy,
    modelName: modelLabel(output.model?.id),
    createdAt: new Date().toISOString(),
  };
  await fs.mkdir(recordsDir(), { recursive: true });
  await fs.writeFile(path.join(recordsDir(), `${record.key}.json`), JSON.stringify(record, null, 2), "utf8");
  const job = await readSocialJob(id);
  if (job) await writeJob({ ...job, status: "success", detail: "Hazır", record, finishedAt: new Date().toISOString() });
}

export async function startSocialJob(input: unknown): Promise<SocialJobState> {
  const raw = (input ?? {}) as { source?: unknown; notes?: unknown };
  const source = parseSocialSource(raw.source);
  const notes = typeof raw.notes === "string" ? raw.notes.slice(0, 2000) : "";
  const auth = await claudeAuthStatus().catch(() => ({ ready: false, error: null as string | null }));
  if (!auth.ready) throw new Error(auth.error ?? "Claude Code hazır değil. Video Stüdyosu'ndan \"Claude ile bağlan\".");
  if (activeJobId) {
    const current = await readSocialJob(activeJobId);
    if (current?.status === "running") throw new Error("Başka bir metin üretimi sürüyor.");
    activeJobId = null;
  }
  const id = randomUUID();
  const job: SocialJobState = {
    id,
    key: sourceKey(source),
    status: "running",
    detail: "Video hazırlanıyor",
    error: null,
    record: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  await writeJob(job);
  activeJobId = id;
  void generate(id, source, notes)
    .catch(async (error: unknown) => {
      const current = await readSocialJob(id);
      if (!current) return;
      await writeJob({
        ...current,
        status: "error",
        detail: "Hata",
        error: error instanceof Error ? error.message : "Metinler üretilemedi.",
        finishedAt: new Date().toISOString(),
      });
    })
    .finally(() => {
      if (activeJobId === id) activeJobId = null;
    });
  return job;
}
