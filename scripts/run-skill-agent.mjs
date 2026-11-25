// Stil skill analizi: Claude Code CLI'ını (`claude -p`) yalnızca Read aracıyla çalıştırır.
// Abonelik girişini kullanır, API anahtarı istemez.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Kullanım: node scripts/run-skill-agent.mjs <girdi> <çıktı>");
  process.exit(1);
}

const input = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
const cli = input.claude ?? { command: "claude", shell: process.platform === "win32" };
const args = ["-p", "--output-format", "json", "--allowedTools", "Read", "--max-turns", "120"];
if (input.model && input.model !== "default") args.push("--model", input.model);
if (input.effort && input.effort !== "auto") args.push("--effort", input.effort);

console.error("agent: Claude Code başlatılıyor");
const child = spawn(cli.command, args, {
  cwd: process.cwd(),
  env: process.env,
  shell: cli.shell,
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  process.stderr.write(chunk);
});
child.stdin.on("error", () => undefined);
child.stdin.end(String(input.instruction));

child.on("error", async (error) => {
  await writeFile(path.resolve(outputPath), JSON.stringify({ status: "error", result: null, error: `Claude Code başlatılamadı: ${error.message}`, model: null }));
  process.exit(1);
});

child.on("close", async (code) => {
  let parsed = null;
  try {
    const start = stdout.indexOf("{");
    parsed = JSON.parse(stdout.slice(start, stdout.lastIndexOf("}") + 1));
  } catch {
    parsed = null;
  }
  const ok = parsed && !parsed.is_error && parsed.subtype === "success" && parsed.result;
  const modelId = parsed?.modelUsage ? Object.keys(parsed.modelUsage)[0] : input.model;
  const output = {
    status: ok ? "finished" : "error",
    result: parsed?.result ?? null,
    error: ok ? null : (parsed?.result || stderr.trim() || `Claude Code ${code} koduyla kapandı.`),
    model: modelId ? { id: modelId } : null,
  };
  console.error(`agent: ${output.status} model=${modelId ?? "?"}`);
  await writeFile(path.resolve(outputPath), JSON.stringify(output));
  process.exit(ok ? 0 : 1);
});
