import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { claudeEnv, resolveClaudeCommand } from "./claude-cli";
import type { AgentUsage } from "./render-status";
import { listSfx, resolveMediaFile } from "./media";

const MAX_SFX_BYTES = 300 * 1024 * 1024;
import { MAX_SOURCE_SECONDS, type StudioInputProps } from "./studio";
import type { StyleSkillSpec } from "./style-skill";

export type MediaProbe = {
  durationInSeconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
};

export type AgentEvent = {
  at: string;
  kind: "text" | "tool" | "status" | "error";
  text: string;
  status?: "completed" | "error";
  agentId?: string;
  model?: string;
};

export type AgentOutput = {
  status: string;
  result: string | null;
  error: string | null;
  model: { id: string; params?: { id: string; value: string }[] } | null;
  /** Claude Code oturum kimliği (--resume ile devam etmek için). */
  agentId: string | null;
  usage?: AgentUsage;
};

export type PreparedWorkspace = {
  workspace: string;
  finalOutput: string;
  eventsPath: string;
  outputPath: string;
  prompt: string;
};

const REPO = process.cwd();
const TOOLS = path.join(REPO, "scripts", "video-tools", "vt.mjs");
const PROGRAM = path.join(REPO, "scripts", "video-agent.mjs");

function slash(value: string): string {
  return value.replace(/\\/g, "/");
}

export function jobDirectory(id: string): string {
  return path.join(REPO, "tmp", "jobs", id);
}

export async function probeMedia(file: string): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TOOLS, "probe", file], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || "Medya okunamadı."));
      try {
        resolve(JSON.parse(stdout) as MediaProbe);
      } catch {
        reject(new Error("Medya bilgisi okunamadı."));
      }
    });
  });
}

function describeProbe(info: MediaProbe): string {
  const size = info.width && info.height ? `${info.width}x${info.height}` : "boyut bilinmiyor";
  const fps = info.fps ? `${info.fps} fps` : "fps bilinmiyor";
  return `${size}, ${info.durationInSeconds.toFixed(2)} sn, ${fps}, ${info.hasAudio ? "ses var" : "ses yok"}`;
}

async function copyMedia(relativePath: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(resolveMediaFile(relativePath), destination);
}

function rootSource(props: StudioInputProps, frames: number): string {
  return `import React from "react";
import { Composition } from "remotion";
import { Video } from "./Video";

// Bu dosyayı değiştirme. Boyut, fps ve süre kullanıcının ayarlarıdır.
export const Root: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={Video}
      durationInFrames={${frames}}
      fps={${props.fps}}
      width={${props.width}}
      height={${props.height}}
    />
  );
};
`;
}

function placeholderVideo(sources: SourceClip[]): string {
  const sequences = sources
    .map(
      (clip) => `      <Sequence from={${clip.from}} durationInFrames={${clip.frames}}>
        <OffthreadVideo src={staticFile("${clip.name}")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Sequence>`,
    )
    .join("\n");
  return `import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";

export const Video: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
${sequences}
    </AbsoluteFill>
  );
};
`;
}

const WORKSPACE_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "esnext"],
    module: "esnext",
    moduleResolution: "bundler",
    jsx: "react-jsx",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    types: [],
  },
  include: ["src"],
};

type SourceClip = { name: string; info: MediaProbe; from: number; frames: number };
type ReferenceClip = { name: string; info: MediaProbe };

type BriefInput = {
  props: StudioInputProps;
  frames: number;
  outroFrames: number;
  sources: SourceClip[];
  references: ReferenceClip[];
  music: string | null;
  musicSeconds: number | null;
  assets: string[];
  sfx: SfxClip[];
  cut: boolean;
};

type SfxClip = { name: string; category: string; seconds: number | null; selected: boolean };

function describeSfxLibrary(sfx: SfxClip[], selectedOnly: boolean): string {
  const rows = sfx
    .filter((clip) => !selectedOnly || clip.selected)
    .map(
      (clip) =>
        `  - \`staticFile("${clip.name}")\` — kategori: ${clip.category}${clip.seconds !== null ? `, ${clip.seconds.toFixed(2)} sn` : ""}`,
    );
  return rows.join("\n");
}

function sfxSection(props: StudioInputProps, sfx: SfxClip[], strict: boolean, heading: string): string {
  if (props.sfxMode !== "library" || sfx.length === 0) return "";
  const selected = sfx.filter((clip) => clip.selected);
  const lines = [`\n### ${heading}. Ses efektleri`];
  if (selected.length) {
    lines.push(
      `- Kullanıcı bu video için **özellikle şu sesleri seçti**. Bunları videoda anlamlarına uygun anlarda kullan${strict ? " (bu seçim stil kılavuzunun ses efektleri bölümünden önceliklidir)" : ""}:`,
      describeSfxLibrary(sfx, true),
    );
    if (sfx.length > selected.length) {
      lines.push("- Gerekirse kullanıcının kütüphanesindeki diğer sesleri de kullanabilirsin:", describeSfxLibrary(sfx.filter((clip) => !clip.selected), false));
    }
  } else {
    lines.push(
      strict
        ? "- Stil kılavuzunun istediği ses efektleri için kullanıcının ses kütüphanesindeki en uygun sesleri kullan. Kütüphane:"
        : "- Kullanıcının ses kütüphanesi aşağıda. Videoya hangi seslerin nerede yakıştığına sen karar ver ve ses efektlerini bu kütüphaneden seç:",
      describeSfxLibrary(sfx, false),
    );
  }
  lines.push(
    "- Sesleri duyamazsın; ne olduklarını dosya adından, kategorisinden ve süresinden çıkar.",
    "- Kullanım: `<Sequence from={kare}><Audio src={staticFile(\"sfx-library/...\")} volume={...} /></Sequence>`. Uzun bir sesin bir kısmı gerekiyorsa `trimAfter` ile kısalt. Efektler konuşmayı bastırmasın.",
  );
  return lines.join("\n") + "\n";
}

function describeSources(sources: SourceClip[], fps: number): string {
  if (sources.length === 1) {
    const [clip] = sources;
    return `- Kaynak video: \`public/${clip.name}\` → \`staticFile("${clip.name}")\` (${describeProbe(clip.info)})`;
  }
  const lines = sources.map(
    (clip, index) =>
      `  ${index + 1}. \`staticFile("${clip.name}")\` — kare ${clip.from}–${clip.from + clip.frames - 1} (${(clip.from / fps).toFixed(2)}–${((clip.from + clip.frames) / fps).toFixed(2)} sn), ${describeProbe(clip.info)}`,
  );
  return `- Kaynak videolar (${sources.length} adet). Bu sırayla arka arkaya oynar; toplam süre hepsinin toplamıdır. Her kaynağın başlangıç karesi sabittir:\n${lines.join("\n")}\n  Kaynaklar arası geçişleri yaratıcı yap (kesme, whoosh'lu kaydırma, grafik ara kart), ama konuşmayı kırpma veya üst üste bindirme.`;
}

function describeCutSources(sources: SourceClip[]): string {
  const lines = sources.map((clip, index) => `  ${index + 1}. \`public/${clip.name}\` — ${describeProbe(clip.info)}`);
  return `- Ham kaynak video${sources.length > 1 ? "lar (bu sırayla)" : ""}:\n${lines.join("\n")}\n  **Bu skill'de kaynak kurgulanır** (bkz. İş akışı → Kurgu). Kompozisyonda ham kaynağı kullanma; görüntü ve ses yalnızca kurgudan çıkan \`staticFile("cut.mp4")\` dosyasından gelir.`;
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function rangesSection(props: StudioInputProps): string {
  if (props.animationRanges.length === 0 && props.assetRanges.length === 0) return "";
  const frame = (seconds: number) => Math.round(seconds * props.fps);
  const span = (range: { from: number; to: number }) =>
    `${range.from.toFixed(2)}–${range.to.toFixed(2)} sn (${formatSeconds(range.from)}–${formatSeconds(range.to)}, kare ${frame(range.from)}–${frame(range.to)})`;
  const lines = [
    "\n## Zaman çizelgesinde işaretlenen aralıklar",
    "",
    "Kullanıcı bu aralıkları stüdyodaki zaman çizelgesinde kendi eliyle işaretledi. Zamanlar çıktı videosunun zamanıdır (kaynaklar arka arkaya, 0'dan başlar). Bunlar, promptta yazılmış aralıklarla aynı değerdedir ve bağlayıcıdır.",
  ];
  if (props.animationRanges.length) {
    lines.push(
      "",
      "### Animasyon aralıkları",
      "Animasyonları **yalnızca** bu aralıklara (ve promptta ayrıca yazılmışsa oradakilere) koy. Not yazılmışsa ne istendiği odur; not yoksa o aralıkta konuşulana bakıp uygun animasyonu sen seç.",
      ...props.animationRanges.map((range, index) => `${index + 1}. ${span(range)}${range.note ? ` — not: "${range.note}"` : ""}`),
    );
  }
  if (props.assetRanges.length) {
    lines.push(
      "",
      "### Görsel aralıkları",
      "Her görseli kendi aralığının **içinde** göster. Aralığın neresinde, ne kadar süre ve nasıl gösterileceğine transkripte bakarak sen karar ver: görselin konusu konuşmada geçtiği an girsin, o konu bitince çıksın; animasyonlu giriş/çıkışla. Aralığın dışına taşma. Not yazılmışsa ona uy.",
      ...props.assetRanges.map(
        (range, index) =>
          `${index + 1}. \`staticFile("assets/${path.basename(range.asset)}")\` — ${span(range)}${range.note ? ` — not: "${range.note}"` : ""}`,
      ),
    );
    const unplaced = props.assetImages.filter((asset) => !props.assetRanges.some((range) => range.asset === asset));
    if (unplaced.length) {
      lines.push(
        `- Aralık verilmeyen görseller (${unplaced.map((asset) => `\`assets/${path.basename(asset)}\``).join(", ")}) için yeri transkripte göre sen seç.`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

function describeReferences(references: ReferenceClip[], strict: boolean): string {
  if (references.length === 0) {
    return strict
      ? "- Referans video yok. Tarz, aşağıdaki zorunlu stil kılavuzunda eksiksiz tarif edildi."
      : "- Referans video yok. Tarzı kullanıcının isteğine göre kendin tasarla: modern, temiz, premium.";
  }
  const lines = references.map((clip) => `  - \`public/${clip.name}\` (${describeProbe(clip.info)})`);
  return `- Referans video${references.length > 1 ? "lar" : ""}. **Çıktıya koyma**; sadece tarzını incele ve taklit et:\n${lines.join("\n")}`;
}

function buildBrief({ props, frames, outroFrames, sources, references, music, musicSeconds, assets, sfx, cut }: BriefInput): string {
  const vt = `node "${slash(TOOLS)}"`;
  const tsc = `node "${slash(path.join(REPO, "node_modules", "typescript", "bin", "tsc"))}" -p tsconfig.json`;
  const seconds = frames / props.fps;
  const sourceFrames = frames - outroFrames;
  const portrait = props.height > props.width;
  const hasReference = references.length > 0;
  const multi = sources.length > 1;
  const strictSkills = props.styleSkills.filter((skill) => skill.strict && skill.guide);
  const strict = strictSkills.length > 0;
  const landscapeSource = sources.some((clip) => (clip.info.width ?? 0) > (clip.info.height ?? 0));
  const audioRule = cut
    ? `konuşma sesini kökte **tek** bir \`<Audio src={staticFile("cut.mp4")} />\` ile ver (\`voicefx\` kullandığın aralıklarda bu sesin \`volume\`'u 2–3 karelik rampayla 0'a iner, efekt dosyası onun yerine çalar)`
    : multi
    ? `her kaynağın sesini kendi başlangıç karesinde **tek** bir \`<Sequence from={başlangıç}><Audio src={staticFile("source-N...")} /></Sequence>\` ile ver`
    : `konuşma sesini kökte **tek** bir \`<Audio src={staticFile("${sources[0].name}")} />\` ile ver`;
  const styleNotes = props.styleSkills
    .filter((skill) => !strictSkills.includes(skill))
    .map(
      (skill) =>
        `### ${skill.name}\n${skill.summary}\n\n${skill.analysis}${skill.guide ? `\n\n${skill.guide}` : ""}\n\nİpuçları: yazı tipi hissi ${skill.style.fontFamily}, ana renk ${skill.style.primaryText}, vurgu ${skill.style.accent}, yazı animasyonu ${skill.style.textAnimation}, geçiş ${skill.style.transition}, renk ${skill.style.grade}, kamera ${skill.style.motion}, altyazı konumu ${skill.style.subtitlePosition}.`,
    );
  const guides = strictSkills.map((skill) => `### ${skill.name}\n\n${skill.guide}`);
  const outroLine = cut
    ? outroFrames
      ? `\n- Son ${outroFrames} kare (${(outroFrames / props.fps).toFixed(2)} sn) kapanış kartıdır: kurgulanmış konuşma bitti, konuşma yok.`
      : ""
    : outroFrames
    ? `\n- Kare ${sourceFrames}–${frames - 1} (${(sourceFrames / props.fps).toFixed(2)}–${seconds.toFixed(2)} sn): kaynak video bitti, konuşma yok. Bu bölüm stil kılavuzundaki kapanış kartı içindir.`
    : "";
  const extras: string[] = [];
  if (!strict && props.skills.textOverlay && props.textOverlay.text.trim()) {
    extras.push(`- Videoda bir yerde şu metin mutlaka görünsün: "${props.textOverlay.text.trim()}"`);
  }
  if (!strict && props.skills.vignette) {
    extras.push(`- Kenarlara hafif karartma (vignette) uygula, yoğunluk yaklaşık ${props.vignette.intensity}.`);
  }

  return `# Görev

${
  strict
    ? `Sen bir kısa video editörüsün. Bu klasör tek bir videonun Remotion projesi. Kaynak video${multi ? "ları" : "yu"}, aşağıdaki **zorunlu stil kılavuzuna birebir uyarak** kodla editle ve render et. Amaç yeni bir tarz yaratmak değil; kullanıcının kendi videolarındaki tarzı aynen tekrar etmek. İzleyici çıktıyı kullanıcının önceki videolarının yanına koyduğunda aynı editörün elinden çıktığını düşünmeli.

Kullanıcı şu an burada değil, soru soramazsın. Kılavuzun bıraktığı boşluklarda (hangi cümlede hangi sahne, vurgu kartında hangi metin) kararı sen ver, ama kılavuzda olmayan efekt, geçiş, grafik türü veya ses **ekleme**. İşi bitene kadar sürdür.`
    : `Sen üst düzey bir kısa video editörü ve motion designer'sın. Bu klasör tek bir videonun Remotion projesi. Kaynak video${multi ? "ları" : "yu"}, kullanıcının isteğine${hasReference ? " ve referans videoların tarzına" : ""} göre **tamamen kodla** animasyonlu, kelime kelime altyazılı, profesyonel bir ${portrait ? "dikey reels/shorts" : "yatay"} videoya dönüştür ve render et.

Kullanıcı şu an burada değil, soru soramazsın. Bütün yaratıcı ve teknik kararları sen ver, işi bitene kadar sürdür. Sonuç sıradan değil, sosyal medyada paylaşılabilecek kalitede olmalı.`
}

## Kullanıcının isteği

${props.prompt.trim() || "Kullanıcı ek bir istek yazmadı. Videoyu seçilen stil skill'ine göre editle; konuyu ve vurgulanacak yerleri transkriptten sen çıkar."}
${rangesSection(props)}
## Sabit ayarlar (değiştirme)

${
  cut
    ? `- Çıktı: ${props.width}x${props.height}, ${props.fps} fps. **Süreyi kurgu belirler.** Şu an ${frames} kare (kesilmemiş kaynak${outroFrames ? " + kapanış" : ""}); \`cut\` aracı kesilmiş videonun süresine göre \`job.json\` ve \`src/Root.tsx\` içindeki kare sayısını kendisi günceller${outroFrames ? ` (kapanış için ${outroFrames} kare ekler)` : ""}. Bu iki dosyayı elle düzenleme.`
    : `- Çıktı: ${props.width}x${props.height}, ${props.fps} fps, ${frames} kare (${seconds.toFixed(2)} sn = kaynak video${multi ? "ların toplam" : "nun"} süresi${outroFrames ? ` + ${(outroFrames / props.fps).toFixed(2)} sn kapanış` : ""})`
}${outroLine}
- Kalite: CRF ${props.crf}
- Kompozisyon: \`src/Root.tsx\` (id "Main"). **Root.tsx ve index.ts dosyalarına dokunma.** Ana bileşen \`src/Video.tsx\` içindeki \`export const Video\`. Diğer bileşenleri \`src/\` altında istediğin gibi böl.
${cut ? describeCutSources(sources) : describeSources(sources, props.fps)}
${describeReferences(references, strict)}
${music ? `- Arka plan müziği: \`staticFile("${music}")\` (${(musicSeconds ?? 0).toFixed(2)} sn). Kullanıcı müziği kendisi ayarlayıp verdi. Kurallar:
  - Müzik kompozisyonun **0. karesinde, müziğin 0. saniyesinden** başlar. \`trimBefore\` kullanma, "daha iyi" bir başlangıç noktası arama, müziği kendi kararınla kırpma.
  - Video boyunca **kesintisiz** çalar, kapanış kartı dahil. Müzik videodan kısaysa sonunda başa sarar; iki tur ~1 sn yumuşak geçişle birbirine bağlanır, arada sessizlik olmaz. Müzik uzunsa videonun bitişinde kesilir: son 1.5–2 sn'de yumuşakça 0'a iner (son karede müzik sesi 0).
  - Girişte 0.5–1 sn'lik yumuşak açılış (0 → seviye).
  - Seviye: \`${vt} mixplan public/${cut ? "cut.mp4" : sources[0].name} ${"public/" + music}\` çalıştır ve verdiği değerleri kullan. Konuşma varken \`duckVolume\` (konuşmanın ~20 dB altında, arkadan hafifçe duyulur). 0.6 sn'den uzun konuşmasız aralarda \`openVolume\`. Konuşma bittikten sonra kapanış kartı / bitiş bölümünde müzik 1–1.5 sn içinde yumuşakça \`openVolume\`'a yükselir, sonra yukarıdaki bitiş kısılmasıyla kapanır.
  - Seviye değişimleri 8–12 karelik yumuşak rampalarla olur; ani zıplama yok. \`<Audio volume={(f) => ...} />\` ile transkriptin kelime zamanlarından hesapla. Müzik hiçbir zaman \`openVolume\`'u aşmaz (kullanıcının panel ayarı ${props.musicVolume} üst sınırdır) ve konuşmayı asla bastırmaz.` : "- Arka plan müziği yok. Müzik sentezlemeye çalışma."}
${assets.length ? `- Kullanıcının yüklediği görseller (ekran görüntüsü, logo vb.). Her birini Read ile aç, ne olduklarını anla ve videoda anlamlı yerlerde kullan:\n${assets.map((name) => `  - \`staticFile("${name}")\``).join("\n")}` : "- Yüklenmiş görsel yok. Gereken her görseli (arayüz, ikon, logo benzeri şekil, grafik) SVG/CSS ile kodla çiz."}
${props.sfxMode === "off" ? "- Ses efektleri: kapalı. Ses efekti ekleme.\n" : props.sfxMode === "library" && sfx.length ? "- Kullanıcının ses efekti kütüphanesi `public/sfx-library/` altına kopyalandı (ayrıntı: Ses efektleri bölümü).\n" : ""}${extras.join("\n")}
${guides.length ? `\n## Zorunlu stil kılavuzu\n\nBu bölüm bağlayıcıdır. Aşağıdaki genel iş akışıyla çeliştiği her yerde kılavuz geçerlidir. Ölçüler 1080x1920 içindir; farklı çözünürlükte \`width / 1080\` ile ölçekle.\n\n${guides.join("\n\n")}\n` : ""}${styleNotes.length ? `\n## Kullanıcının seçtiği stil notları\n\nBu notlar esinlenme içindir, bağlayıcı değildir. Beğendiğin fikirleri al, kendi yorumunla birleştir.\n\n${styleNotes.join("\n\n")}\n` : ""}
## Araçlar

Hepsini bu klasörden (cwd) çalıştır:

\`\`\`
${vt} probe <dosya>
${vt} grid <video> <çıktı.jpg> [--count 12] [--cols 4] [--from sn] [--to sn]   # zaman damgalı kare sayfası
${vt} frames <video> <klasör> <sn1,sn2,...>                                   # belirli anlardan tam kare
${vt} crop <video> <çıktı.mp4> --x X --y Y --w G --h Y --width ÇG --height ÇY [--from sn] [--to sn]   # bölge kırp + kaliteli büyütme
${vt} transcribe <video> <çıktı.json> [--language tr]                          # kelime zamanlı transkript (faster-whisper, yerel)
${vt} sfx <whoosh|swoosh|shutter|keys|click|impact|coin|jump|powerup|levelup|blip|select|hurt|explode> <public/sfx/ad.wav> [--duration sn] [--volume 1] [--interval sn] [--variant n]   # basit ses efekti üretici
${cut ? `${vt} cutplan analysis/cuts.json <video> <transkript.json> [...] [--lead 0.12] [--tail 0.45] [--gap 0.55] [--drop 1:3.2-5.8,1:12-14.5]   # kurgu planı
${vt} cut analysis/cuts.json public/cut.mp4 --transcript-out analysis/cut-transcript.json   # planı uygula + süreyi güncelle
` : ""}${vt} voicefx <video> <public/fx/ad.wav> --from sn --to sn --effect <echo|reverb|deep|chipmunk|slow|loud|radio> [--volume 1]   # konuşmanın bir anına ses efekti
${vt} still <kare> <çıktı.png> [--scale 0.5]                                   # kompozisyondan tek kare render
${vt} render                                                                     # tam render -> out/final.mp4
${vt} loudness <dosya>                                                           # LUFS ölçümü
${vt} mixplan <konuşma videosu> <müzik>                                         # müzik için konuşma altı / açık ses seviyeleri
${tsc}                                                                            # tip kontrolü
\`\`\`

Görselleri (jpg/png) **Read aracıyla açıp gerçekten bak**. Kullanılabilir npm paketleri (yenisini kurma): \`remotion\`, \`@remotion/transitions\`, \`@remotion/google-fonts\`, \`@remotion/shapes\`, \`@remotion/paths\`, \`@remotion/noise\`, \`@remotion/layout-utils\`, \`@remotion/media-utils\`, \`@remotion/motion-blur\`, \`react\`. İnternetten dosya indirme (Google Fonts hariç). Remotion'ın "zod" sürüm uyarısı zararsızdır, yok say.

## İş akışı

### 1. Keşif
- Her kaynak için \`${vt} grid public/<kaynak> analysis/<kaynak>-grid.jpg --count 16\` ve aç. Kişi nerede duruyor (yüzün yatay konumu), arka plan, ışık, kadrajda boş alan var mı? ${portrait && landscapeSource ? "Kaynak yatay, çıktı dikey: yüzü merkezde tutacak `objectPosition` değerini buradan belirle." : ""}
- Her kaynak için \`${vt} transcribe public/<kaynak> analysis/<kaynak>-transcript.json\` çalıştır ve oku.${multi ? " Zamanlar her kaynağın kendi başına göredir; kompozisyondaki yere taşımak için kaynağın başlangıç saniyesini ekle." : ""} Whisper özel isimleri yanlış yazabilir (ör. "Claude", "Opus 5.5", marka adları). Kullanıcının isteğindeki metinle ve bağlamla karşılaştırıp düzelt${cut ? ". " : "; düzeltilmiş kelime listesini \`src/transcript.ts\` içine kompozisyon zamanlarıyla birlikte sabit veri olarak yaz. "}Kullanıcı isteğinde bir "script" verilmişse doğru yazım odur.
${
  cut
    ? `- **Kurgu (bu skill'de zorunlu):**
  1. Transkripti baştan sona oku ve atılacak yerleri belirle: aynı cümlenin tekrar çekimleri (en son ve en temiz olanı kalır, öncekiler atılır), yarım kalıp baştan söylenen cümleler, "ııı / eee" ile dolu takılmalar, kameraya "tamam başlıyorum" gibi konu dışı konuşmalar. Kuşkuluysan \`grid --from/--to\` ile o ana bak. Espriyi, tepkiyi veya bilerek bırakılmış komik duraklamayı **atma**.
  2. \`${vt} cutplan analysis/cuts.json ${sources.map((clip) => `public/${clip.name} analysis/${clip.name}-transcript.json`).join(" ")} --drop <atılacak aralıklar>\` çalıştır. Varsayılan ayarlar stil kılavuzunun ritmidir; kılavuz farklı değer veriyorsa onu kullan. Uzun sessizlikleri araç zaten atar, sen yalnızca içerik kararlarını \`--drop\` ile ver (\`kaynakNo:başlangıç-bitiş\`, saniye, kaynağın kendi zamanı).
  3. \`${vt} cut analysis/cuts.json public/cut.mp4 --transcript-out analysis/cut-transcript.json\` çalıştır. Çıktıdaki \`compositionFrames\` artık videonun süresidir.
  4. Kesim noktalarını kontrol et: \`cut-transcript.json\` içinde bir kesmenin iki yanındaki kelimeler arasında boşluk kalmamışsa (biri biter bitmez diğeri başlıyorsa) \`--tail\`/\`--lead\` değerini büyüt veya o yeri \`--drop\` ile düzelt ve tekrar kes. Yutulan kelime ve yarım hece kabul edilmez.
  5. Bundan sonra **bütün zamanlar \`cut.mp4\`'ün zamanıdır.** Düzeltilmiş kelime listesini \`analysis/cut-transcript.json\`'dan \`src/transcript.ts\` içine sabit veri olarak yaz. Görüntüde \`<OffthreadVideo src={staticFile("cut.mp4")} muted />\` kullan.
`
    : ""
}${hasReference ? (strict ? `
### 2. Referans kontrolü
- Her referans için \`${vt} grid public/<referans> analysis/<referans>-grid.jpg --count 24 --cols 6\` ile akışa bak. Kılavuzdaki ölçü ve stilleri bu karelerle doğrula. Referans ile kılavuz arasında fark görürsen referansa uy, ama kılavuzda olmayan yeni bir efekt türü ekleme.
` : `
### 2. Referans analizi
- Her referans için \`${vt} grid public/<referans> analysis/<referans>-grid.jpg --count 24 --cols 6\` ile tüm akışa bak, sonra ilginç anlara \`--from/--to\` ile yakınlaş veya \`frames\` ile tam kare al.
- \`analysis/reference.md\` dosyasına somut olarak yaz${references.length > 1 ? " (önce her referansı ayrı, sonra hepsinde ortak olan dili)" : ""}: sahne düzenleri (tam yüz, bölünmüş ekran, tam ekran grafik, resim içinde resim...), sahne süreleri ve kesme ritmi, yazı tipi karakteri, renk paleti (hex), altyazı stili (konum, boyut, aktif kelime vurgusu, kaç kelime birden), geçiş türleri, grafik öğeleri, kamera hareketi.
- Bu tarzı birebir kopyalamaya değil, aynı hissi ve kaliteyi vermeye çalış.
`) : ""}
### ${hasReference ? 3 : 2}. Sahne planı
${strict ? `\`analysis/plan.md\` yaz: transkripte bağlı sahne listesi (kare aralığı, söylenen cümle, sahne türü, metin${props.sfxMode === "library" ? ", ses efekti" : ""}). Sahne türlerini, ritmi, sahne sayısını ve kapanışı **yalnızca stil kılavuzundan** al. Kılavuzdaki sahne türleri dışında düzen (bölünmüş ekran, resim içinde resim, mockup vb.) kullanma.` : `\`analysis/plan.md\` yaz: transkripte bağlı sahne listesi (kare aralığı, söylenen cümle, düzen, animasyon${props.sfxMode === "library" ? ", ses efekti" : ""}). Kurallar:
- İlk 1 saniye kanca: güçlü bir giriş (punch-in zoom, büyük başlık, hızlı grafik).
- Görsel her 1.5–3 saniyede bir değişsin: tam yüz ↔ bölünmüş ekran (üstte grafik/ekran, altta kişi) ↔ tam ekran animasyon ↔ yüz + büyük vurgu kelimesi. Konuşmanın anlamı ne gösterileceğini belirlesin (bahsedilen ürün, sayı, işlem, araç).
- Tam ekran animasyon sahnelerinde konuşma sesi devam eder; kişi görünmeyebilir.
- Kapanış: net bir çağrı (ör. yorum yaz) ile güçlü bitiş.`}

### ${hasReference ? 4 : 3}. Kodlama
- **Determinizm:** her hareket \`useCurrentFrame()\`'den türesin. \`Math.random\`, CSS transition/animation, setTimeout, useEffect ile animasyon yok. Rastgelelik gerekirse \`random("tohum")\` (remotion).
- **Ses:** ${audioRule}. Görüntüdeki bütün \`<OffthreadVideo>\` örnekleri \`muted\` olsun. Böylece sahne geçişlerinde ses kesilmez veya çiftlenmez.
- **Senkron:** \`<Sequence from={X}>\` içine konan video baştan başlar. Kaynağın X. karesinden devam etmesi için \`trimBefore={X}\` ver. Aynı anda birden fazla kadraj (ör. bölünmüş ekranda yüz) gerekirse aynı kaynağı farklı kırpma ile tekrar kullan.
- **Yazı tipleri:** \`@remotion/google-fonts/<Font>\` ile yükle; Türkçe karakterler için \`subsets: ["latin", "latin-ext"]\`. Metin ölçen kod (\`measureText\`, \`fitText\`) font yüklenmeden çalışırsa yanlış ölçer: \`loadFont().waitUntilDone()\` ile \`delayRender/continueRender\` kullan, ya da ölçümsüz esnek CSS (inline-flex, padding) ile tasarla.
${strict ? `- **Stil:** kılavuzda tarif edilen her öğe (altyazı, başlık, paneller, kartlar, animasyonlar, geçişler, kapanış) kılavuzdaki ölçü ve zamanlamalarla yapılır. Kılavuzun yasakladığı hiçbir şeyi ekleme. Kılavuzda tekrar eden her parçayı ayrı bir bileşen yap ve her sahnede aynısını kullan.${assets.length ? " Yüklenen görsellerin hepsini kullan; nasıl ve nerede kullanılacağını kılavuz söylüyorsa ona uy, söylemiyorsa kılavuzun tarzına uyan, konuşmayla ilgili bir sahnede kullan." : ""}` : `- **Altyazı:** kelime zamanlarına göre 1–4 kelimelik gruplar; aktif kelime vurgulu (renk/kutu/ölçek), girişte spring "pop". Altyazı ${portrait ? "dikey videoda alt %18'lik ve üst %10'luk güvenli alanın dışında kalmasın (platform arayüzü orayı kapatır), genelde ekranın %62–72 yüksekliği" : "alt üçte birde"}. Okunaklı: büyük, kalın, kontur veya gölge. Vurgu kutusu/arka planı kelime görünmeden önce asla boş görünmesin.
- **Hareket kalitesi:** girişler \`spring()\` (damping 12–20), çıkışlar hızlı \`interpolate\` + \`Easing\`. Öğeleri sırayla (stagger) getir. Yüz çekimlerinde yavaş zoom (1.0→1.06), vurgu kelimelerinde ani punch-in (1.0→1.15). Geçişlerde \`@remotion/transitions\` (slide, wipe, fade) veya kendi maskelerin, gerekirse motion blur.
- **Grafikler:** konuya uygun arayüzleri kodla çiz: sohbet baloncukları, terminal/kod penceresi ve yazılan kod, tarayıcı/uygulama mockup'ı, sayaçlar, ilerleme çubukları, oklar, ikonlar (SVG), parçacıklar, ışıltılar. Düz bir renk kutusuna yazı koyup bırakma; katman, derinlik, gölge, ince detay ekle.${assets.length ? " Yüklenen ekran görüntülerini cihaz/pencere çerçevesi içinde, giriş animasyonu, yakınlaşma ve vurgu kutularıyla göster." : ""}`}
- Bileşenleri küçük dosyalara böl. Her değişiklikten sonra tip kontrolünü çalıştır ve hataları düzelt.
${sfxSection(props, sfx, strict, String(hasReference ? 5 : 4))}
### Kontrol döngüsü (zorunlu, atlama)
1. Tip kontrolü temiz olsun.
2. Her sahnenin başından ve ortasından \`still\` al (\`analysis/stills/\`), PNG'leri Read ile aç ve eleştirel gözle bak: taşan veya kesilen yazı, üst üste binen öğeler, boş kutular, yanlış kırpılmış yüz, düşük kontrast, güvenli alan ihlali, Türkçe karakter sorunları, sıkıcı/boş kareler.${strict ? " Ayrıca her still'i stil kılavuzuyla ve kılavuzun kendi kontrol listesiyle madde madde karşılaştır (yazı tipleri, boyutlar, konumlar, köşe yarıçapları, renkler, kapanış kartı); kılavuzdan sapan her şeyi düzelt." : ""} Sorunları düzelt ve tekrar bak.
3. \`${vt} render\` ile tam render al. Render uzun sürer; still'lerle iterasyon yap, tam render'ı mümkünse 1–2 kez al.
4. \`${vt} grid out/final.mp4 analysis/final-grid.jpg --count 16\` ile çıktıya bak, \`${vt} loudness out/final.mp4\` ile ses seviyesini ölç (hedef yaklaşık -14 LUFS, true peak -1 dB altında; gerekirse ses düzeylerini ayarla).${music ? " Müzik varsa: müziğin 0. saniyeden başladığını, baştan sona çaldığını, konuşma sırasında mixplan'ın duckVolume değerinde kaldığını ve kapanışta yumuşakça yükseldiğini kodda kontrol et." : ""} Sorun varsa düzelt ve yeniden render et.

### Bitiş
- \`out/final.mp4\` mutlaka var olmalı.
- \`result.json\` yaz: \`{ "summary": "kullanıcıya 2–4 cümlelik Türkçe özet", "scenes": [{ "from": kare, "to": kare, "description": "..." }] }\`
- Son mesajın kısa bir Türkçe özet olsun.
`;
}

export async function prepareWorkspace(jobId: string, props: StudioInputProps): Promise<PreparedWorkspace> {
  if (props.sourceVideos.length === 0) throw new Error("Kaynak video gerekli.");
  // Süresini müziğin belirlediği skill'ler (ör. Kısa Motivasyonel Video) ayrı akışla hazırlanır; diğer işler etkilenmez.
  const musicSkill = musicTimelineSkill(props);
  if (musicSkill) return prepareMusicWorkspace(jobId, props, musicSkill);
  const root = jobDirectory(jobId);
  const workspace = path.join(root, "workspace");
  const publicDir = path.join(workspace, "public");
  await fs.mkdir(path.join(workspace, "src"), { recursive: true });
  await fs.mkdir(path.join(workspace, "analysis"), { recursive: true });
  await fs.mkdir(path.join(workspace, "out"), { recursive: true });
  await fs.mkdir(path.join(publicDir, "sfx"), { recursive: true });

  const multi = props.sourceVideos.length > 1;
  const cut = Boolean(cutTimelineSkill(props));
  const sources: SourceClip[] = [];
  let frames = 0;
  for (const [index, relativePath] of props.sourceVideos.entries()) {
    const extension = path.extname(relativePath).toLowerCase() || ".mp4";
    const name = multi ? `source-${index + 1}${extension}` : `source${extension}`;
    await copyMedia(relativePath, path.join(publicDir, name));
    const info = await probeMedia(path.join(publicDir, name));
    const clipFrames = Math.max(1, Math.floor(info.durationInSeconds * props.fps));
    sources.push({ name, info, from: frames, frames: clipFrames });
    frames += clipFrames;
  }
  if (frames / props.fps > MAX_SOURCE_SECONDS) {
    throw new Error(`Kaynak videoların toplam süresi en fazla ${MAX_SOURCE_SECONDS} sn olabilir.`);
  }
  const outroSeconds = Math.max(
    0,
    ...props.styleSkills.filter((skill) => skill.strict && skill.guide).map((skill) => skill.outroSeconds ?? 0),
  );
  const outroFrames = Math.round(outroSeconds * props.fps);
  frames += outroFrames;

  const references: ReferenceClip[] = [];
  for (const [index, relativePath] of props.referenceVideos.entries()) {
    const extension = path.extname(relativePath).toLowerCase() || ".mp4";
    const name = props.referenceVideos.length > 1 ? `reference-${index + 1}${extension}` : `reference${extension}`;
    await copyMedia(relativePath, path.join(publicDir, name));
    references.push({ name, info: await probeMedia(path.join(publicDir, name)) });
  }

  let music: string | null = null;
  let musicSeconds: number | null = null;
  if (props.backgroundMusic) {
    music = `music${path.extname(props.backgroundMusic).toLowerCase() || ".mp3"}`;
    await copyMedia(props.backgroundMusic, path.join(publicDir, music));
    musicSeconds = await probeMedia(path.join(publicDir, music))
      .then((info) => info.durationInSeconds)
      .catch(() => null);
  }

  const assets: string[] = [];
  for (const relativePath of props.assetImages) {
    const name = `assets/${path.basename(relativePath)}`;
    await copyMedia(relativePath, path.join(publicDir, name));
    assets.push(name);
  }

  const sfx: SfxClip[] = [];
  if (props.sfxMode === "library") {
    const library = await listSfx();
    const selected = new Set(props.sfxSelection);
    let bytes = 0;
    const ordered = [...library.items].sort((a, b) => Number(selected.has(b.relativePath)) - Number(selected.has(a.relativePath)));
    for (const item of ordered) {
      const isSelected = selected.has(item.relativePath);
      if (!isSelected && bytes + item.size > MAX_SFX_BYTES) continue;
      bytes += item.size;
      const name = `sfx-library/${item.relativePath.slice("sfx/".length)}`;
      await copyMedia(item.relativePath, path.join(publicDir, name));
      const seconds = await probeMedia(path.join(publicDir, name))
        .then((info) => info.durationInSeconds)
        .catch(() => null);
      sfx.push({ name, category: item.category ?? "genel", seconds, selected: isSelected });
    }
    sfx.sort((a, b) => a.category.localeCompare(b.category, "tr") || a.name.localeCompare(b.name, "tr"));
  }

  const finalOutput = path.join(workspace, "out", "final.mp4");
  const job = {
    entry: "src/index.ts",
    compositionId: "Main",
    publicDir: "public",
    output: "out/final.mp4",
    crf: props.crf,
    width: props.width,
    height: props.height,
    fps: props.fps,
    durationInFrames: frames,
    // vt sfx, kullanıcının kütüphanesini yalnızca "Ses kütüphanemi kullan" modunda kullanır.
    sfxLibrary: props.sfxMode === "library",
    musicVolume: props.musicVolume,
    // Kurgu skill'inde vt cut, kesilmiş süreye bu kadar kapanış karesi ekler.
    ...(cut ? { timeline: "cut", outroFrames } : {}),
  };

  await fs.writeFile(path.join(workspace, "job.json"), JSON.stringify(job, null, 2), "utf8");
  await fs.writeFile(path.join(workspace, "tsconfig.json"), JSON.stringify(WORKSPACE_TSCONFIG, null, 2), "utf8");
  await fs.writeFile(
    path.join(workspace, "src", "index.ts"),
    `import { registerRoot } from "remotion";\nimport { Root } from "./Root";\n\nregisterRoot(Root);\n`,
    "utf8",
  );
  await fs.writeFile(path.join(workspace, "src", "Root.tsx"), rootSource(props, frames), "utf8");
  await fs.writeFile(path.join(workspace, "src", "Video.tsx"), placeholderVideo(sources), "utf8");

  const brief = buildBrief({ props, frames, outroFrames, sources, references, music, musicSeconds, assets, sfx, cut });
  await fs.writeFile(path.join(workspace, "BRIEF.md"), brief, "utf8");

  const prompt = `${brief}\n\n---\nBu talimat \`BRIEF.md\` dosyasında da duruyor; uzun çalışmada gerekirse tekrar oku. Şimdi başla.`;
  return {
    workspace,
    finalOutput,
    eventsPath: path.join(root, "events.jsonl"),
    outputPath: path.join(root, "agent-output.json"),
    prompt,
  };
}

// ---------------------------------------------------------------------------
// Müzik zaman çizelgeli akış (timeline: "music"): kaynaklar malzeme, süre müzikten, tek ses müzik.
// Yalnızca bu tür bir skill seçildiğinde kullanılır.

export function cutTimelineSkill(props: StudioInputProps): StyleSkillSpec | null {
  return props.styleSkills.find((skill) => skill.strict && skill.guide && skill.timeline === "cut") ?? null;
}

export function musicTimelineSkill(props: StudioInputProps): StyleSkillSpec | null {
  return props.styleSkills.find((skill) => skill.strict && skill.guide && skill.timeline === "music") ?? null;
}

function runTool(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TOOLS, ...args], { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || "Araç hatası."))));
  });
}

type BeatsFile = {
  bpm: number;
  beatInterval: number;
  musicDuration: number;
  segment: { start: number; end: number; duration: number };
  beats: number[];
  downbeats: number[];
  hits: { t: number; strength: number }[];
};

async function prepareMusicWorkspace(jobId: string, props: StudioInputProps, skill: StyleSkillSpec): Promise<PreparedWorkspace> {
  if (!props.backgroundMusic) throw new Error(`"${skill.name}" skill'i için müzik seçmelisin.`);
  const maxSeconds = skill.maxSeconds ?? 20;
  const root = jobDirectory(jobId);
  const workspace = path.join(root, "workspace");
  const publicDir = path.join(workspace, "public");
  for (const dir of ["src", "analysis", "out", path.join("public", "clips"), path.join("public", "sfx")]) {
    await fs.mkdir(path.join(workspace, dir), { recursive: true });
  }

  // Malzeme videolar kopyalanmaz (çok büyük olabilir); ajan doğrudan kütüphanedeki dosyadan klip çıkarır.
  const materials: { file: string; name: string; info: MediaProbe }[] = [];
  for (const relativePath of props.sourceVideos) {
    const file = resolveMediaFile(relativePath);
    materials.push({ file, name: path.basename(relativePath), info: await probeMedia(file) });
  }

  // Müzik: ritim analizi + en fazla maxSeconds'lık bölüm.
  const musicFile = resolveMediaFile(props.backgroundMusic);
  const musicInfo = await probeMedia(musicFile);
  const beatsPath = path.join(workspace, "analysis", "beats.json");
  let beats: BeatsFile | null = null;
  try {
    await runTool(["beats", musicFile, beatsPath, "--max", String(maxSeconds), "--min", String(Math.min(12, maxSeconds))], workspace);
    beats = JSON.parse(await fs.readFile(beatsPath, "utf8")) as BeatsFile;
  } catch {
    beats = null;
  }
  const segmentStart = beats?.segment.start ?? 0;
  const segmentDuration = Math.min(maxSeconds, beats?.segment.duration ?? musicInfo.durationInSeconds);
  await runTool(
    ["musiccut", musicFile, path.join(publicDir, "soundtrack.m4a"), "--from", String(segmentStart), "--duration", segmentDuration.toFixed(3), "--fade-out", "0.35"],
    workspace,
  );

  const assets: string[] = [];
  for (const relativePath of props.assetImages) {
    const name = `assets/${path.basename(relativePath)}`;
    await copyMedia(relativePath, path.join(publicDir, name));
    assets.push(name);
  }

  const frames = Math.max(1, Math.round(segmentDuration * props.fps));
  const job = {
    entry: "src/index.ts",
    compositionId: "Main",
    publicDir: "public",
    output: "out/final.mp4",
    crf: props.crf,
    width: props.width,
    height: props.height,
    fps: props.fps,
    durationInFrames: frames,
    sfxLibrary: props.sfxMode === "library",
    timeline: "music",
  };
  await fs.writeFile(path.join(workspace, "job.json"), JSON.stringify(job, null, 2), "utf8");
  await fs.writeFile(path.join(workspace, "tsconfig.json"), JSON.stringify(WORKSPACE_TSCONFIG, null, 2), "utf8");
  await fs.writeFile(
    path.join(workspace, "src", "index.ts"),
    `import { registerRoot } from "remotion";\nimport { Root } from "./Root";\n\nregisterRoot(Root);\n`,
    "utf8",
  );
  await fs.writeFile(path.join(workspace, "src", "Root.tsx"), rootSource(props, frames), "utf8");
  await fs.writeFile(
    path.join(workspace, "src", "Video.tsx"),
    `import React from "react";\nimport { AbsoluteFill, Audio, staticFile } from "remotion";\n\nexport const Video: React.FC = () => {\n  return (\n    <AbsoluteFill style={{ backgroundColor: "black" }}>\n      <Audio src={staticFile("soundtrack.m4a")} />\n    </AbsoluteFill>\n  );\n};\n`,
    "utf8",
  );

  const brief = buildMusicBrief({ props, skill, frames, segmentStart, segmentDuration, musicInfo, beats, materials, assets });
  await fs.writeFile(path.join(workspace, "BRIEF.md"), brief, "utf8");
  return {
    workspace,
    finalOutput: path.join(workspace, "out", "final.mp4"),
    eventsPath: path.join(root, "events.jsonl"),
    outputPath: path.join(root, "agent-output.json"),
    prompt: `${brief}\n\n---\nBu talimat \`BRIEF.md\` dosyasında da duruyor; uzun çalışmada gerekirse tekrar oku. Şimdi başla.`,
  };
}

function buildMusicBrief(input: {
  props: StudioInputProps;
  skill: StyleSkillSpec;
  frames: number;
  segmentStart: number;
  segmentDuration: number;
  musicInfo: MediaProbe;
  beats: BeatsFile | null;
  materials: { file: string; name: string; info: MediaProbe }[];
  assets: string[];
}): string {
  const { props, skill, frames, segmentStart, segmentDuration, beats, materials, assets } = input;
  const vt = `node "${slash(TOOLS)}"`;
  const tsc = `node "${slash(path.join(REPO, "node_modules", "typescript", "bin", "tsc"))}" -p tsconfig.json`;
  const materialLines = materials
    .map((item, index) => `  ${index + 1}. \`${slash(item.file)}\` — ${describeProbe(item.info)}`)
    .join("\n");
  const musicLine = beats
    ? `- Müzik: \`staticFile("soundtrack.m4a")\` — kullanıcının müziğinin ${segmentStart > 0 ? `${segmentStart.toFixed(2)}–${(segmentStart + segmentDuration).toFixed(2)} sn arasındaki en enerjik bölümü (otomatik seçildi, ölçü başından başlar)` : "tamamı"}; ${segmentDuration.toFixed(2)} sn. **${beats.bpm} BPM**, vuruş aralığı ${beats.beatInterval} sn (${(beats.beatInterval * props.fps).toFixed(1)} kare).
- Ritim verisi: \`analysis/beats.json\` — \`beats\` (her vuruş), \`downbeats\` (ölçü başları), \`hits\` (en güçlü vurgular ve güçleri), \`energy\` (vuruş başına 0–1). **Zamanlar videonun saniyesidir** (soundtrack'in başı = 0). Kare = saniye × ${props.fps}, en yakın kareye yuvarla.`
    : `- Müzik: \`staticFile("soundtrack.m4a")\` — ${segmentDuration.toFixed(2)} sn. Otomatik ritim analizi yapılamadı: \`${vt} beats public/soundtrack.m4a analysis/beats.json --max ${Math.ceil(segmentDuration) + 1}\` ile kendin çıkar (Python/numpy gerekir); o da olmazsa geçişleri müziğin temposuna göre eşit aralıklarla yerleştir.`;

  return `# Görev

Sen üst düzey bir kısa video editörüsün. Bu klasör tek bir videonun Remotion projesi. Kullanıcının yüklediği **malzeme videolardan** en iyi anları seçip, **müziğin ritmine senkron** geçişlerle birleştirerek ve üzerine motivasyonel yazı ekleyerek **sözsüz, kısa bir motivasyon videosu** yapacaksın. Aşağıdaki **zorunlu stil kılavuzu** bağlayıcıdır.

Kullanıcı şu an burada değil, soru soramazsın. Bütün kararları sen ver, işi bitene kadar sürdür.

## Kullanıcının isteği

${props.prompt.trim() || "Kullanıcı ek bir istek yazmadı. Yazıları kılavuzdaki temalara göre (e-ticaret, başarı, zenginlik, disiplin) sen yaz."}

## Sabit ayarlar (değiştirme)

- Çıktı: ${props.width}x${props.height}, ${props.fps} fps, **${frames} kare (${segmentDuration.toFixed(2)} sn)** — en fazla ${skill.maxSeconds ?? 20} sn. Süre müzik bölümüne eşittir.
- Kalite: CRF ${props.crf}
- Kompozisyon: \`src/Root.tsx\` (id "Main"). **Root.tsx ve index.ts dosyalarına dokunma.** Ana bileşen \`src/Video.tsx\` içindeki \`export const Video\`.
${musicLine}
- **Tek ses müziktir.** Kökte tek \`<Audio src={staticFile("soundtrack.m4a")} />\` (volume 1). Malzeme videoların sesi hiçbir yerde kullanılmaz; bütün videolar \`muted\`. Müzik zaten kesilmiş ve sonu yumuşatılmış; ayrıca kırpma.
- Malzeme videolar (kütüphanedeki orijinaller; **zaman çizelgesinde değiller**, sadece kesit almak için):
${materialLines}
  Bu dosyalar büyük olabilir: kompozisyonda doğrudan kullanma. Seçtiğin her kesiti \`clip\` aracıyla \`public/clips/\` altına küçük, dikey, sessiz bir klip olarak çıkar ve kompozisyonda yalnızca bu klipleri kullan.
${assets.length ? `- Kullanıcının yüklediği görseller (kılavuz söylüyorsa kullan):\n${assets.map((name) => `  - \`staticFile("${name}")\``).join("\n")}` : ""}
- Ses efektleri: ${props.sfxMode === "off" ? "kapalı, ekleme." : "kılavuzun ses bölümüne göre."}

## Zorunlu stil kılavuzu

Bu bölüm bağlayıcıdır. Ölçüler 1080x1920 içindir; farklı çözünürlükte \`width / 1080\` ile ölçekle.

### ${skill.name}

${skill.guide}

## Araçlar

Hepsini bu klasörden (cwd) çalıştır:

\`\`\`
${vt} probe <dosya>
${vt} grid <video> <çıktı.jpg> [--count 12] [--cols 4] [--from sn] [--to sn]   # zaman damgalı kare sayfası
${vt} frames <video> <klasör> <sn1,sn2,...>                                   # belirli anlardan tam kare
${vt} scenes <video> [--threshold 0.35] [--from sn] [--to sn]                 # sahne/kamera değişimi zamanları
${vt} clip <video> public/clips/<ad>.mp4 --from sn --to sn [--focus 0-1] [--zoom 1]   # kesit → ${props.width}x${props.height} sessiz klip (focus: yatay kadraj merkezi)
${vt} beats <müzik> <çıktı.json>                                               # ritim analizi (zaten yapıldı)
${vt} sfx <whoosh|swoosh|shutter|keys|click|impact|coin|jump|powerup|levelup|blip|select|hurt|explode> <public/sfx/ad.wav> [--duration sn] [--volume 1]
${vt} still <kare> <çıktı.png> [--scale 0.5]                                   # kompozisyondan tek kare
${vt} render                                                                     # tam render -> out/final.mp4
${vt} loudness <dosya>                                                           # LUFS ölçümü
${tsc}                                                                            # tip kontrolü
\`\`\`

Görselleri (jpg/png) Read aracıyla açıp gerçekten bak. Kullanılabilir npm paketleri (yenisini kurma): \`remotion\`, \`@remotion/transitions\`, \`@remotion/google-fonts\`, \`@remotion/shapes\`, \`@remotion/paths\`, \`@remotion/noise\`, \`@remotion/layout-utils\`, \`@remotion/media-utils\`, \`@remotion/motion-blur\`, \`react\`. Transkript çıkarma yok (video sözsüz).

## İş akışı

1. **Müzik:** \`analysis/beats.json\` dosyasını oku. Kesme noktalarını ve vurguları kılavuzdaki ritim kurallarına göre seç.
2. **Malzeme keşfi:** her malzeme için önce \`grid --count 24 --cols 6\` ile tüm akışa bak, ilginç bölgelere \`--from/--to\` ile yakınlaş; gerekirse \`scenes\` ile kamera değişimlerini bul. En güçlü anları (kılavuzdaki "iyi an" tanımına göre) zaman damgalarıyla not et. Kişinin/öznenin yatay konumunu ölç (\`--focus\` için).
3. **Plan:** \`analysis/plan.md\` yaz: her plan için kare aralığı (vuruşa oturan), hangi malzemenin hangi saniyesinden, hareket/geçiş türü, ekrandaki yazı ve hangi vuruşta belirdiği.
4. **Klipler:** her plan için \`clip\` ile klip çıkar (plan süresi + geçiş için her iki uçta ~0.3 sn pay).
5. **Kodlama:** her hareket \`useCurrentFrame()\`'den türesin; \`Math.random\`, CSS transition/animation, setTimeout yok. Yazı tiplerini \`@remotion/google-fonts\` ile yükle (subsets: latin, latin-ext). Klipler \`<OffthreadVideo muted>\`; bir klibi \`<Sequence from={X}>\` içine koyduğunda klip baştan başlar.

## Kontrol döngüsü (zorunlu)

1. Tip kontrolü temiz olsun.
2. Her planın ortasından ve her geçişin ortasından \`still\` al (\`analysis/stills/\`), Read ile bak: kadraj, yazı okunaklılığı, Türkçe karakterler, siyah/boş kare, taşan yazı. Düzelt ve tekrar bak.
3. Plan tablosunda her kesmenin bir \`beats\`/\`downbeats\`/\`hits\` zamanına (±1 kare) denk geldiğini kontrol et.
4. \`${vt} render\` ile tam render al; \`${vt} grid out/final.mp4 analysis/final-grid.jpg --count 16\` ile akışa bak; \`${vt} loudness out/final.mp4\` (hedef ≈ -14 LUFS, true peak -1 dB altı; gerekirse müzik volume'unu ayarla).

## Bitiş

- \`out/final.mp4\` mutlaka var olmalı.
- \`result.json\` yaz: \`{ "summary": "kullanıcıya 2–4 cümlelik Türkçe özet", "scenes": [{ "from": kare, "to": kare, "description": "..." }] }\`
- Son mesajın kısa bir Türkçe özet olsun.
`;
}

/** Ayarlardaki medyayı (kaynak, referans, müzik, görseller) prepareWorkspace ile aynı adlarla public/ altına kopyalar. */
async function restoreSettingsMedia(props: StudioInputProps, publicDir: string): Promise<void> {
  if (musicTimelineSkill(props)) {
    // Müzik akışında kaynaklar yalnızca malzemedir; kullanılan klipler ve müzik bölümü arşivden gelir.
    for (const relativePath of props.assetImages) {
      await copyMedia(relativePath, path.join(publicDir, "assets", path.basename(relativePath)));
    }
    return;
  }
  const multi = props.sourceVideos.length > 1;
  for (const [index, relativePath] of props.sourceVideos.entries()) {
    const extension = path.extname(relativePath).toLowerCase() || ".mp4";
    await copyMedia(relativePath, path.join(publicDir, multi ? `source-${index + 1}${extension}` : `source${extension}`));
  }
  for (const [index, relativePath] of props.referenceVideos.entries()) {
    const extension = path.extname(relativePath).toLowerCase() || ".mp4";
    const name = props.referenceVideos.length > 1 ? `reference-${index + 1}${extension}` : `reference${extension}`;
    await copyMedia(relativePath, path.join(publicDir, name));
  }
  if (props.backgroundMusic) {
    await copyMedia(props.backgroundMusic, path.join(publicDir, `music${path.extname(props.backgroundMusic).toLowerCase() || ".mp3"}`));
  }
  for (const relativePath of props.assetImages) {
    await copyMedia(relativePath, path.join(publicDir, "assets", path.basename(relativePath)));
  }
  // Kurgulanmış video arşivlenmez; kayıtlı kurgu planından yeniden üretilir.
  const workspace = path.dirname(publicDir);
  const plan = path.join(workspace, "analysis", "cuts.json");
  if (cutTimelineSkill(props) && (await fs.access(plan).then(() => true, () => false))) {
    await runTool(["cut", "analysis/cuts.json", "public/cut.mp4"], workspace);
  }
}

function buildRevisionBrief(request: string, fps: number, musicMode = false, cutMode = false): string {
  const vt = `node "${slash(TOOLS)}"`;
  const tsc = `node "${slash(path.join(REPO, "node_modules", "typescript", "bin", "tsc"))}" -p tsconfig.json`;
  return `# Düzeltme görevi

Bu klasör, daha önce ürettiğin bir videonun Remotion projesi. Kullanıcı videoyu genel olarak beğendi; **yalnızca aşağıdaki düzeltmeleri** istiyor. Kullanıcı şu an burada değil, soru soramazsın; istek belirsizse en makul yorumu seç.

## Kullanıcının düzeltme isteği

${request.trim()}

## Kurallar

- **Sadece istenen yerleri değiştir.** Diğer sahneler, zamanlamalar, tasarım, renkler, yazılar, altyazılar, ses efektleri ve müzik aynen kalır. Projeyi baştan yazma, yeni bir plan yapma, transkripti yeniden çıkarma.
- \`src/Root.tsx\` ve \`src/index.ts\` dosyalarına dokunma (süre, boyut, fps sabit). ${musicMode ? "Bu sözsüz bir müzik videosu: tek ses \`soundtrack.m4a\`, geçişler müziğin vuruşlarına (\`analysis/beats.json\`) oturur. Yeni bir kesit gerekiyorsa malzeme videonun yolu BRIEF.md'de; \`clip\` aracıyla \`public/clips/\` altına çıkar." : cutMode ? "Video kurgulanmış \`public/cut.mp4\` üstüne kurulu; bütün zamanlar onun zamanıdır. Kullanıcı kurguyla ilgili bir şey (bir yeri atma, geri getirme, boşlukları açma/kısaltma) istemedikçe \`analysis/cuts.json\`'a dokunma. İsterse planı düzenle (ya da \`cutplan\`'ı yeniden çalıştır), \`cut analysis/cuts.json public/cut.mp4 --transcript-out analysis/cut-transcript.json\` ile yeniden kes ve kayan bütün sahne/altyazı/efekt zamanlarını yeni transkripte göre güncelle." : "Kaynak video yine hiçbir yerde kesilmez."}
- Önce yalnızca gerekenleri oku: \`analysis/plan.md\` (sahneler ve kare aralıkları) ve istekle ilgili \`src/\` dosyaları. Kullanıcı saniye verdiyse kare = saniye × ${fps}. Kelime zamanları gerekirse \`analysis/\` altındaki transkript JSON'unda.
- Videonun orijinal görevi ve varsa stil kılavuzu \`BRIEF.md\` içinde. Düzeltme stil kurallarına dokunuyorsa yalnızca ilgili bölümü oku ve ona uy.
- Kullanıcının isteği kılavuzla çelişirse kullanıcının isteği geçerlidir.

## Araçlar

Hepsini bu klasörden (cwd) çalıştır:

\`\`\`
${vt} still <kare> <çıktı.png> [--scale 0.5]          # kompozisyondan tek kare${musicMode ? `\n${vt} clip <video> public/clips/<ad>.mp4 --from sn --to sn [--focus 0-1] [--zoom 1]\n${vt} scenes <video> [--from sn] [--to sn]` : ""}
${vt} render                                            # tam render -> out/final.mp4
${vt} grid <video> <çıktı.jpg> [--count 12] [--from sn] [--to sn]
${vt} frames <video> <klasör> <sn1,sn2,...>
${vt} probe <dosya>
${vt} loudness <dosya>
${vt} mixplan <konuşma videosu> <müzik>
${vt} sfx <whoosh|swoosh|shutter|keys|click|impact|coin|jump|powerup|levelup|blip|select|hurt|explode> <public/sfx/ad.wav>
${vt} voicefx <video> <public/fx/ad.wav> --from sn --to sn --effect <echo|reverb|deep|chipmunk|slow|loud|radio>${cutMode ? `\n${vt} cutplan analysis/cuts.json <video> <transkript.json> [--tail 0.45] [--drop 1:a-b]\n${vt} cut analysis/cuts.json public/cut.mp4 --transcript-out analysis/cut-transcript.json` : ""}
${tsc}                                                   # tip kontrolü
\`\`\`

Görselleri Read aracıyla açıp gerçekten bak. Yeni npm paketi kurma.

## Kontrol

1. Tip kontrolü temiz olsun.
2. Değiştirdiğin her anın başından, ortasından ve (geçişse) bitişinden \`still\` al (\`analysis/stills/\`) ve bak: düzeltme doğru mu, çevresi bozulmadı mı.
3. \`${vt} render\` ile tam render al.
4. \`${vt} grid out/final.mp4 analysis/final-grid.jpg --count 16\` ile genel akışa bak. Ses veya müzik değiştiyse \`loudness\` ölç.

## Bitiş

- \`out/final.mp4\` mutlaka var olmalı.
- \`analysis/plan.md\` içinde değişen sahneleri güncelle.
- \`result.json\` yaz: \`{ "summary": "yapılan düzeltmelerin 1–3 cümlelik Türkçe özeti", "scenes": [...] }\`
- Son mesajın kısa bir Türkçe özet olsun.
`;
}

/** Arşivlenmiş bir videonun projesinden düzeltme çalışma klasörü kurar. */
export async function prepareRevisionWorkspace(
  jobId: string,
  archiveDir: string,
  props: StudioInputProps,
  request: string,
): Promise<PreparedWorkspace> {
  const root = jobDirectory(jobId);
  const workspace = path.join(root, "workspace");
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.cp(archiveDir, workspace, { recursive: true });
  for (const stale of ["out", path.join("analysis", "stills")]) {
    await fs.rm(path.join(workspace, stale), { recursive: true, force: true });
  }
  await fs.rm(path.join(workspace, "analysis", "final-grid.jpg"), { force: true });
  await fs.rm(path.join(workspace, "render-progress.json"), { force: true });
  await fs.rm(path.join(workspace, "result.json"), { force: true });
  await fs.mkdir(path.join(workspace, "out"), { recursive: true });
  const publicDir = path.join(workspace, "public");
  await fs.mkdir(publicDir, { recursive: true });
  await restoreSettingsMedia(props, publicDir);

  const brief = buildRevisionBrief(request, props.fps, Boolean(musicTimelineSkill(props)), Boolean(cutTimelineSkill(props)));
  await fs.writeFile(path.join(workspace, "REVISION.md"), brief, "utf8");
  return {
    workspace,
    finalOutput: path.join(workspace, "out", "final.mp4"),
    eventsPath: path.join(root, "events.jsonl"),
    outputPath: path.join(root, "agent-output.json"),
    prompt: `${brief}\n\n---\nBu talimat \`REVISION.md\` dosyasında da duruyor. Şimdi başla.`,
  };
}

export function bindWorkspace(id: string): PreparedWorkspace {
  const root = jobDirectory(id);
  const workspace = path.join(root, "workspace");
  return {
    workspace,
    finalOutput: path.join(workspace, "out", "final.mp4"),
    eventsPath: path.join(root, "events.jsonl"),
    outputPath: path.join(root, "agent-output.json"),
    prompt: "",
  };
}

const RESUME_PROMPT = [
  "İş duraklatılmıştı. Kaldığın yerden devam et.",
  "Çalışma klasöründeki mevcut dosyaları (src/, analysis/, plan) silme ve sıfırdan başlama.",
  "Görev dosyasındaki işi (REVISION.md varsa o, yoksa BRIEF.md) out/final.mp4 üretilene kadar bitir.",
  "Kullanıcıya soru sorma; kararları sen ver.",
].join("\n");

export async function spawnVideoAgent(
  prepared: PreparedWorkspace,
  model: string,
  options?: { agentId?: string | null; keepEvents?: boolean; pausePath?: string; effort?: string | null },
): Promise<{ child: ChildProcess; done: Promise<number | null> }> {
  const inputPath = path.join(path.dirname(prepared.eventsPath), "agent-input.json");
  const payload = JSON.stringify({
    prompt: options?.agentId || options?.keepEvents ? RESUME_PROMPT : prepared.prompt,
    resumeAgentId: options?.agentId ?? null,
    pausePath: options?.pausePath ?? null,
    cwd: prepared.workspace,
    model,
    effort: options?.effort ?? null,
    claude: resolveClaudeCommand(),
    eventsPath: prepared.eventsPath,
    outputPath: prepared.outputPath,
    finalOutput: prepared.finalOutput,
  });
  await fs.writeFile(inputPath, payload, "utf8");
  if (!options?.keepEvents) await fs.writeFile(prepared.eventsPath, "", "utf8");
  // Önceki çalıştırmanın çıktısı kalmasın (kullanım iki kez sayılmasın).
  await fs.rm(prepared.outputPath, { force: true });
  // Claude Code CLI'ını abonelik girişiyle çalıştırır (API anahtarı değişkenleri temizlenir).
  const child = spawn(process.execPath, [PROGRAM], {
    cwd: REPO,
    env: claudeEnv({ VIDEO_AGENT_INPUT: inputPath }),
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
  return { child, done };
}

export async function readAgentEvents(eventsPath: string, offset: number): Promise<{ events: AgentEvent[]; offset: number }> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(eventsPath, "r");
    const { size } = await handle.stat();
    if (size <= offset) return { events: [], offset };
    const buffer = Buffer.alloc(size - offset);
    await handle.read(buffer, 0, buffer.length, offset);
    const text = buffer.toString("utf8");
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline === -1) return { events: [], offset };
    const complete = text.slice(0, lastNewline);
    const events: AgentEvent[] = [];
    for (const line of complete.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as AgentEvent);
      } catch {
        continue;
      }
    }
    return { events, offset: offset + Buffer.byteLength(complete, "utf8") + 1 };
  } catch {
    return { events: [], offset };
  } finally {
    await handle?.close();
  }
}

export async function readAgentOutput(outputPath: string): Promise<AgentOutput | null> {
  try {
    return JSON.parse(await fs.readFile(outputPath, "utf8")) as AgentOutput;
  } catch {
    return null;
  }
}

export async function readAgentSummary(workspace: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(workspace, "result.json"), "utf8")) as { summary?: unknown };
    return typeof raw.summary === "string" ? raw.summary : null;
  } catch {
    return null;
  }
}
