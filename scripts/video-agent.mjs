// lib/video-agent.ts bu dosyayı ayrı bir Node süreci olarak çalıştırır.
// Ajan motoru: bilgisayardaki Claude Code CLI'ı (`claude -p`). Abonelik girişini kullanır, API anahtarı istemez.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const input = JSON.parse(readFileSync(process.env.VIDEO_AGENT_INPUT, "utf8"));
const MAX_FOLLOWUPS = 2;
const cli = input.claude;

function emit(kind, text, extra = {}) {
  appendFileSync(input.eventsPath, JSON.stringify({ at: new Date().toISOString(), kind, text, ...extra }) + "\n");
}

function clip(value, length = 220) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

const ARG_KEYS = ["command", "file_path", "path", "filePath", "pattern", "query", "url", "description"];

function describeArgs(args) {
  if (!args || typeof args !== "object") return "";
  for (const key of ARG_KEYS) {
    if (typeof args[key] === "string" && args[key]) {
      return args[key].replaceAll(input.cwd, ".").replaceAll(input.cwd.replaceAll("\\", "/"), ".");
    }
  }
  return "";
}

function isPaused() {
  return Boolean(input.pausePath) && existsSync(input.pausePath);
}

function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
}

function friendlyError(text) {
  const value = String(text ?? "");
  if (/usage limit|limit reached|rate.?limit|5-hour limit|weekly limit/i.test(value)) {
    return `Claude abonelik kullanım limitine ulaşıldı. Limit sıfırlanınca "Devam ettir" ile kaldığı yerden sürdürebilirsin. (${clip(value, 200)})`;
  }
  if (/invalid api key|please run \/login|not logged in|authentication|oauth/i.test(value)) {
    return `Claude Code girişi geçersiz. Terminalde \`claude\` → \`/login\` ile Claude.ai hesabınla tekrar gir. (${clip(value, 200)})`;
  }
  return value;
}

// Token tasarrufu: video ajanının ihtiyaç duymadığı şeyleri oturuma yükleme.
// - Kullanıcının MCP sunucuları (araç şemaları her adımda bağlamda taşınır)
// - Kullanıcının skill'leri / slash komutları
// - Video işinde kullanılmayan yerleşik araçlar (web arama, alt ajan, notebook...)
// Bu bayraklar desteklenmezse ajan bunlar olmadan otomatik olarak yeniden başlatılır.
const LEAN_FLAGS = ["--strict-mcp-config", "--disable-slash-commands", "--tools", "Bash,Read,Write,Edit,Glob,Grep"];
let lean = process.env.VIDEO_AGENT_LEAN !== "0";

const usage = { turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
function addUsage(result) {
  const u = result?.usage ?? {};
  usage.turns += Number(result?.num_turns) || 0;
  usage.inputTokens += Number(u.input_tokens) || 0;
  usage.outputTokens += Number(u.output_tokens) || 0;
  usage.cacheReadTokens += Number(u.cache_read_input_tokens) || 0;
  usage.cacheWriteTokens += Number(u.cache_creation_input_tokens) || 0;
}

// Tek bir `claude -p` çağrısı. Akışı (stream-json) olay günlüğüne çevirir.
async function runClaude(prompt, sessionId) {
  const result = await runClaudeOnce(prompt, sessionId);
  if (lean && !result.started && result.status === "error" && /unknown option|unrecognized|invalid (option|value)|--tools|--strict-mcp-config|--disable-slash-commands/i.test(result.error ?? "")) {
    lean = false;
    emit("status", "Claude Code sürümü hafif mod bayraklarını desteklemiyor; normal modda yeniden başlatılıyor");
    return runClaudeOnce(prompt, sessionId);
  }
  return result;
}

function runClaudeOnce(prompt, sessionId) {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
    "--max-turns",
    String(input.maxTurns ?? 500),
  ];
  if (input.model && input.model !== "default" && input.model !== "auto") args.push("--model", input.model);
  if (input.effort && input.effort !== "auto") args.push("--effort", input.effort);
  if (sessionId) args.push("--resume", sessionId);
  if (lean) args.push(...LEAN_FLAGS);
  args.push("--disallowedTools", "AskUserQuestion");

  return new Promise((resolve) => {
    const child = spawn(cli.command, args, {
      cwd: input.cwd,
      env: process.env,
      shell: cli.shell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const state = { sessionId: sessionId ?? null, model: null, result: null, paused: false, stderr: "", started: false };
    const tools = new Map();
    let buffer = "";
    let pendingText = "";
    const flush = () => {
      const text = pendingText.trim();
      pendingText = "";
      if (text) emit("text", text);
    };

    const handle = (message) => {
      if (message.type === "system" && message.subtype === "init") {
        const fresh = message.session_id && message.session_id !== state.sessionId;
        state.started = true;
        state.sessionId = message.session_id ?? state.sessionId;
        state.model = message.model ?? state.model;
        if (fresh || !sessionId) {
          emit("status", sessionId ? "Kaldığı yerden devam ediliyor" : "Ajan başladı (Claude Code)", {
            agentId: state.sessionId,
            model: state.model,
          });
        }
        return;
      }
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text") pendingText += block.text;
          if (block.type === "tool_use") {
            flush();
            tools.set(block.id, { name: block.name, input: block.input });
          }
        }
        return;
      }
      if (message.type === "user" && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type !== "tool_result") continue;
          const call = tools.get(block.tool_use_id);
          tools.delete(block.tool_use_id);
          const name = call?.name ?? "tool";
          const detail = describeArgs(call?.input);
          emit("tool", clip(detail ? `${name}: ${detail}` : name), { status: block.is_error ? "error" : "completed" });
        }
        return;
      }
      if (message.type === "result") {
        flush();
        state.sessionId = message.session_id ?? state.sessionId;
        state.result = message;
        addUsage(message);
      }
    };

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          handle(JSON.parse(line));
        } catch {
          // JSON olmayan satırları yok say
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      state.stderr = (state.stderr + chunk.toString()).slice(-4000);
    });

    const pauseTimer = setInterval(() => {
      if (isPaused() && !state.paused) {
        state.paused = true;
        flush();
        killTree(child);
      }
    }, 400);

    child.on("error", (error) => {
      clearInterval(pauseTimer);
      resolve({ status: "error", error: `Claude Code başlatılamadı: ${error.message}`, sessionId: state.sessionId, model: state.model });
    });
    child.on("close", (code) => {
      clearInterval(pauseTimer);
      flush();
      if (state.paused) return resolve({ status: "paused", sessionId: state.sessionId, model: state.model });
      const result = state.result;
      if (result && !result.is_error && result.subtype === "success") {
        return resolve({ status: "finished", result: result.result ?? null, sessionId: state.sessionId, model: state.model });
      }
      if (result?.subtype === "error_max_turns") {
        return resolve({ status: "finished", result: null, sessionId: state.sessionId, model: state.model });
      }
      const raw = result?.result || result?.errors?.join?.("\n") || state.stderr.trim() || `Claude Code ${code} koduyla kapandı.`;
      resolve({ status: "error", error: friendlyError(raw), sessionId: state.sessionId, model: state.model, started: state.started });
    });

    child.stdin.on("error", () => undefined);
    child.stdin.end(prompt);
  });
}

const followup = [
  "out/final.mp4 hâlâ yok. İşi bitirmeden durdun.",
  "Kalan adımları tamamla: tip kontrolü, still kontrolleri, `render`, final grid ve loudness kontrolü, result.json.",
  "Kullanıcıya soru sorma; kararları sen ver.",
].join("\n");

let output = { status: "error", result: null, error: null, model: { id: input.model }, agentId: input.resumeAgentId ?? null, usage };
try {
  let result;
  if (isPaused()) {
    result = { status: "paused", sessionId: input.resumeAgentId ?? null };
  } else {
    result = await runClaude(input.prompt, input.resumeAgentId ?? null);
    if (result.status === "error" && input.resumeAgentId && !result.started) {
      emit("status", "Önceki oturum açılamadı; mevcut dosyalardan devam ediliyor");
      result = await runClaude(input.prompt, null);
    }
  }
  for (
    let attempt = 0;
    attempt < MAX_FOLLOWUPS && result.status === "finished" && !existsSync(input.finalOutput) && result.sessionId;
    attempt += 1
  ) {
    if (isPaused()) {
      result = { ...result, status: "paused" };
      break;
    }
    emit("status", "Final video bulunamadı; ajandan işi tamamlaması istendi");
    result = await runClaude(followup, result.sessionId);
  }

  output = {
    status: result.status,
    result: result.result ?? null,
    error: result.status === "error" ? (result.error ?? "Bilinmeyen hata") : null,
    model: { id: result.model ?? input.model },
    agentId: result.sessionId ?? output.agentId,
    usage,
  };
  if (result.status === "error") emit("error", clip(output.error, 600));
  if (result.status !== "finished" && result.status !== "paused") process.exitCode = 2;
} catch (error) {
  output.error = error instanceof Error ? error.message : String(error);
  emit("error", clip(output.error, 600));
  process.exitCode = 1;
} finally {
  writeFileSync(input.outputPath, JSON.stringify(output, null, 2));
  process.exit(process.exitCode ?? 0);
}
