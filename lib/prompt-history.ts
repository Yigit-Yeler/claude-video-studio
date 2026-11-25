import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// "Video üret"e basıldığında kullanılan promptların kalıcı geçmişi: data/prompt-history.json

export type PromptEntry = {
  id: string;
  text: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
};

const MAX_ENTRIES = 500;

function historyFile(): string {
  return path.join(process.cwd(), "data", "prompt-history.json");
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
}

let chain: Promise<unknown> = Promise.resolve();

// Yazma işlemlerini sıraya koy ki eşzamanlı istekler birbirini ezmesin.
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

// Geçmiş dosyası hiç yoksa, eski işlerdeki (tmp/jobs/*/input.json) promptları içe aktar.
async function importFromJobs(): Promise<PromptEntry[]> {
  const jobsDir = path.join(process.cwd(), "tmp", "jobs");
  const names = await fs.readdir(jobsDir).catch(() => [] as string[]);
  const found: { text: string; at: Date }[] = [];
  for (const name of names) {
    const file = path.join(jobsDir, name, "input.json");
    try {
      const [raw, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
      const text = String((JSON.parse(raw) as { prompt?: unknown }).prompt ?? "").trim();
      if (text) found.push({ text, at: stat.mtime });
    } catch {
      continue;
    }
  }
  found.sort((a, b) => a.at.getTime() - b.at.getTime());
  let entries: PromptEntry[] = [];
  for (const item of found) entries = upsert(entries, item.text, item.at.toISOString());
  return entries;
}

function upsert(entries: PromptEntry[], text: string, at: string): PromptEntry[] {
  const key = normalize(text);
  const existing = entries.find((entry) => normalize(entry.text) === key);
  if (existing) {
    const updated = { ...existing, text, lastUsedAt: at, useCount: existing.useCount + 1 };
    return [updated, ...entries.filter((entry) => entry.id !== existing.id)];
  }
  return [{ id: randomUUID(), text, createdAt: at, lastUsedAt: at, useCount: 1 }, ...entries].slice(0, MAX_ENTRIES);
}

async function readAll(): Promise<PromptEntry[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(historyFile(), "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as PromptEntry[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return [];
    const imported = await importFromJobs();
    await writeAll(imported);
    return imported;
  }
}

async function writeAll(entries: PromptEntry[]): Promise<void> {
  const file = historyFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(entries, null, 2), "utf8");
  await fs.rm(file, { force: true });
  await fs.rename(temporary, file);
}

function sorted(entries: PromptEntry[]): PromptEntry[] {
  return [...entries].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export function listPrompts(): Promise<PromptEntry[]> {
  return serial(async () => sorted(await readAll()));
}

export function recordPrompt(text: string): Promise<void> {
  const value = text.trim();
  if (!value) return Promise.resolve();
  return serial(async () => {
    const entries = await readAll();
    await writeAll(upsert(entries, value, new Date().toISOString()));
  });
}

export function deletePrompt(id: string): Promise<PromptEntry[]> {
  return serial(async () => {
    const entries = (await readAll()).filter((entry) => entry.id !== id);
    await writeAll(entries);
    return sorted(entries);
  });
}
