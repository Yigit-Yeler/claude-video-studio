import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Video ajanı, bilgisayardaki Claude Code CLI'ını (`claude`) çalıştırır.
// CLI, `claude` ile yapılan abonelik girişini (Pro/Max) kullanır; API anahtarı gerekmez.

export type ClaudeCommand = { command: string; shell: boolean };

export type ClaudeAuth = {
  ready: boolean;
  cliFound: boolean;
  email: string | null;
  plan: string | null;
  version: string | null;
  error: string | null;
};

function quote(value: string): string {
  return /\s/.test(value) && !value.startsWith('"') ? `"${value}"` : value;
}

export function resolveClaudeCommand(): ClaudeCommand {
  const windows = process.platform === "win32";
  const override = process.env.CLAUDE_CODE_PATH?.trim();
  if (override) {
    const shell = windows && /\.(cmd|bat)$/i.test(override);
    return { command: shell ? quote(override) : override, shell };
  }
  const home = os.homedir();
  const candidates = windows
    ? [
        path.join(home, ".local", "bin", "claude.exe"),
        path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "npm", "claude.cmd"),
      ]
    : [path.join(home, ".local", "bin", "claude"), path.join(home, ".claude", "local", "claude")];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const shell = windows && candidate.toLowerCase().endsWith(".cmd");
    return { command: shell ? quote(candidate) : candidate, shell };
  }
  // PATH üzerinden bul. Windows'ta .cmd/.exe çözümlemesi için kabuk gerekir.
  return { command: "claude", shell: windows };
}

// Abonelik yerine API faturalandırmasına geçiren değişkenleri alt sürece aktarma.
const BLOCKED_ENV = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  // Panel bir Claude Code oturumunun içinden başlatıldıysa iç içe çalışmayı engelleyen işaretler.
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
];

export function claudeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of BLOCKED_ENV) delete env[key];
  return { ...env, ...extra };
}

type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function runClaude(args: string[], timeoutMs: number): Promise<RunResult> {
  const cli = resolveClaudeCommand();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;
    try {
      child = spawn(cli.command, args, {
        env: claudeEnv(),
        shell: cli.shell,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ code: -1, stdout, stderr: error instanceof Error ? error.message : String(error), timedOut });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export function killProcessTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // süreç zaten kapanmış
    }
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const NOT_FOUND =
  "Claude Code bulunamadı. Kur: PowerShell'de `irm https://claude.ai/install.ps1 | iex` (veya `npm i -g @anthropic-ai/claude-code`). Farklı bir yerdeyse .env.local içine CLAUDE_CODE_PATH yaz.";
const NOT_LOGGED_IN =
  "Claude Code'a abonelik hesabınla giriş yapılmamış. \"Claude ile bağlan\" butonuna bas ya da terminalde `claude` yazıp `/login` komutuyla Claude.ai hesabınla gir.";

let cached: { at: number; value: ClaudeAuth } | null = null;

export async function claudeAuthStatus(force = false): Promise<ClaudeAuth> {
  if (!force && cached && cached.value.ready && Date.now() - cached.at < 60_000) return cached.value;

  const versionRun = await runClaude(["--version"], 20_000);
  if (versionRun.code !== 0) {
    const value: ClaudeAuth = { ready: false, cliFound: false, email: null, plan: null, version: null, error: NOT_FOUND };
    cached = { at: Date.now(), value };
    return value;
  }
  const version = versionRun.stdout.trim().split(/\r?\n/)[0] || null;

  const statusRun = await runClaude(["auth", "status"], 20_000);
  const parsed = parseJson(statusRun.stdout);
  let value: ClaudeAuth;
  if (parsed && typeof parsed.loggedIn === "boolean") {
    const email = typeof parsed.email === "string" ? parsed.email : null;
    const plan = typeof parsed.subscriptionType === "string" ? parsed.subscriptionType : null;
    const method = String(parsed.authMethod ?? parsed.apiProvider ?? "").toLowerCase();
    const usesApiBilling = /api.?key|console/.test(method) && !plan;
    value = {
      ready: parsed.loggedIn,
      cliFound: true,
      email,
      plan,
      version,
      error: !parsed.loggedIn
        ? NOT_LOGGED_IN
        : usesApiBilling
          ? "Claude Code şu an API/Console hesabıyla giriş yapmış görünüyor. Abonelikten kullanmak için terminalde `claude auth logout` sonra `claude auth login` ile Claude.ai (Pro/Max) hesabını seç."
          : null,
    };
  } else {
    // Eski sürümlerde `auth status` yok; kimlik dosyasına bak.
    const credentials = path.join(os.homedir(), ".claude", ".credentials.json");
    const loggedIn =
      statusRun.code === 0 || existsSync(credentials) || Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN) || process.platform === "darwin";
    value = { ready: loggedIn, cliFound: true, email: null, plan: null, version, error: loggedIn ? null : NOT_LOGGED_IN };
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function openClaudeLogin(): Promise<{ opened: boolean; message: string }> {
  cached = null;
  if (process.platform !== "win32") {
    return { opened: false, message: "Terminalde `claude auth login` (veya `claude` → `/login`) çalıştırıp Claude.ai hesabınla gir." };
  }
  const cli = resolveClaudeCommand();
  const command = cli.command.startsWith('"') ? cli.command : quote(cli.command);
  const child = spawn(`start "Claude Code giris" cmd /k ${command} auth login`, {
    shell: true,
    detached: true,
    stdio: "ignore",
    env: claudeEnv(),
  });
  child.unref();
  return {
    opened: true,
    message: "Açılan terminal penceresinde Claude.ai (Pro/Max) hesabınla girişi tamamla. Açılmazsa terminalde `claude` yazıp `/login` komutunu çalıştır.",
  };
}

export type EffortLevel = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

export type ModelOption = {
  id: string;
  label: string;
  description: string;
  /** Modelin kendi varsayılan eforu ("auto" seçilince bu kullanılır). */
  defaultEffort: Exclude<EffortLevel, "auto">;
  efforts: Exclude<EffortLevel, "auto">[];
};

const ALL_EFFORTS: Exclude<EffortLevel, "auto">[] = ["low", "medium", "high", "xhigh", "max"];

// Claude Code'un tam model kimlikleri. Planında olmayan model seçilirse ajan hata mesajıyla durur.
export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    description: "En iyi tasarım/kod dengesi. Video için önerilen.",
    defaultEffort: "medium",
    efforts: ALL_EFFORTS,
  },
  {
    id: "claude-fable-5-1",
    label: "Claude Fable 5.1",
    description: "En güçlü model; limiti en hızlı tüketir. Planında Fable erişimi olmalı.",
    defaultEffort: "high",
    efforts: ALL_EFFORTS,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "Daha hızlı ve limiti daha az tüketir.",
    defaultEffort: "medium",
    efforts: ALL_EFFORTS,
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    description: "En hızlı ve en ucuz; karmaşık videolarda zayıf kalabilir.",
    defaultEffort: "medium",
    efforts: ALL_EFFORTS,
  },
];

export const EFFORT_LEVELS: { id: EffortLevel; label: string; description: string }[] = [
  { id: "auto", label: "Model varsayılanı", description: "Modelin kendi ayarı (Opus 5.5 için medium)." },
  { id: "low", label: "Düşük", description: "En hızlı, en az limit; basit işler için." },
  { id: "medium", label: "Orta", description: "Dengeli." },
  { id: "high", label: "Yüksek", description: "Daha dikkatli plan ve kontrol. Video için önerilen." },
  { id: "xhigh", label: "Çok yüksek", description: "Daha derin düşünme; daha yavaş ve daha çok limit." },
  { id: "max", label: "Maksimum", description: "En derin düşünme; en yavaş, limiti en hızlı tüketir." },
];

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === "string" && EFFORT_LEVELS.some((item) => item.id === value);
}

export function modelLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id === "default" || id === "auto") return "Claude (hesap varsayılanı)";
  return CLAUDE_MODELS.find((item) => item.id === id || id.startsWith(item.id))?.label ?? id;
}

export function effortLabel(effort: string | null | undefined): string | null {
  if (!effort || effort === "auto") return null;
  return EFFORT_LEVELS.find((item) => item.id === effort)?.label ?? effort;
}

export const DEFAULT_CLAUDE_MODEL = process.env.VIDEO_AGENT_MODEL || "claude-opus-5-5";
export const DEFAULT_EFFORT: EffortLevel = isEffortLevel(process.env.VIDEO_AGENT_EFFORT)
  ? process.env.VIDEO_AGENT_EFFORT
  : "high";
