/**
 * Auto-memory extraction and surfacing.
 *
 * Ports colony/memory/auto_memory.py into async TypeScript. Memories are
 * stored as markdown snippets and surfaced later by topic similarity.
 */

import { appendFile, mkdir, readdir } from "fs/promises";
import { join } from "path";

import { scrubSecrets } from "../security/log-sanitizer";
import { validateTeamMemWrite } from "../security/path-validator";
import { SecretScanner } from "../security/secret-scanner";
import { getDataPath, settings } from "../settings";
import { filterRelevantMemories, type RelevantMemory } from "./relevance";

export const DEFAULT_MEMORY_DIR = join(getDataPath(settings), "memories");
export const MAX_FILES_PER_TURN = 5;
export const MAX_BYTES_PER_FILE = 4096;
export const MAX_BYTES_PER_SESSION = 60 * 1024;

const MEMORY_SECRET_SCANNER = new SecretScanner();

const CASTE_MEMORY_TOPICS: Record<string, string[]> = {
  queen: [
    "architecture", "design decision", "trade-off", "constraint",
    "requirement", "pattern", "principle", "strategy",
  ],
  worker: [
    "implementation", "bug fix", "refactor", "function", "class",
    "module", "test", "dependency",
  ],
  scout: [
    "file structure", "navigation", "search pattern", "code location",
    "directory layout", "import path",
  ],
  assist_ant: [
    "implementation", "decision", "constraint", "bug", "tool",
    "provider", "session", "context",
  ],
};

export interface MemoryEntry {
  topic: string;
  content: string;
  caste: string;
  agentId: string;
  sessionId: string;
  timestamp: number;
  relevanceKeywords: string[];
  filePath: string;
}

export interface SurfaceRelevantOptions {
  query?: string;
  contextKeywords?: string[];
  caste?: string;
  maxFiles?: number;
  maxBytes?: number;
  llmFilter?: ((systemPrompt: string, userContent: string) => Promise<string> | string) | null;
}

type MessageShape = Record<string, unknown>;

function sanitizeMemoryText(text: string): string {
  return MEMORY_SECRET_SCANNER.scan(scrubSecrets(text)).redactedText;
}

function sizeBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function trimToBytes(text: string, maxBytes: number): string {
  if (sizeBytes(text) <= maxBytes) return text;
  let out = text;
  while (out.length > 0 && sizeBytes(out) > maxBytes) {
    out = out.slice(0, Math.max(1, Math.floor(out.length * 0.9)));
  }
  return out;
}

export class MemoryStore {
  private readonly _baseDir: string;

  constructor(baseDir = DEFAULT_MEMORY_DIR) {
    this._baseDir = baseDir;
  }

  get baseDir(): string {
    return this._baseDir;
  }

  async save(entry: MemoryEntry): Promise<string> {
    const casteDir = join(this._baseDir, entry.caste || "general");
    await mkdir(casteDir, { recursive: true });

    const slug = slugify(entry.topic);
    const filePath = join(casteDir, `${slug}.md`);
    await validateTeamMemWrite(filePath, this._baseDir);

    const header = `# ${entry.topic}\n\n`;
    const meta = `<!-- agent:${entry.agentId} session:${entry.sessionId} ts:${Math.round(entry.timestamp)} -->\n\n`;
    const body = `${sanitizeMemoryText(entry.content.trim())}\n\n---\n\n`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      await appendFile(filePath, `${meta}${body}`, "utf8");
    } else {
      await Bun.write(filePath, `${header}${meta}${body}`);
    }

    entry.filePath = filePath;
    return filePath;
  }

  async surfaceRelevant(opts: SurfaceRelevantOptions = {}): Promise<MemoryEntry[]> {
    const query = opts.query ?? "";
    const contextKeywords = opts.contextKeywords ?? [];
    const caste = opts.caste ?? "";
    const maxFiles = opts.maxFiles ?? MAX_FILES_PER_TURN;
    const maxBytes = opts.maxBytes ?? MAX_BYTES_PER_SESSION;

    const allKeywords = new Set<string>();
    for (const keyword of extractKeywords(query)) allKeywords.add(keyword);
    for (const keyword of contextKeywords) allKeywords.add(keyword.toLowerCase());

    const candidates: Array<{ score: number; entry: MemoryEntry }> = [];
    let totalBytes = 0;
    const castesToScan = caste ? [caste] : await this._listCastes();

    for (const currentCaste of castesToScan) {
      const casteDir = join(this._baseDir, currentCaste);
      let entries;
      try {
        entries = await readdir(casteDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const filePath = join(casteDir, entry.name);
        let content = "";
        try {
          content = await Bun.file(filePath).text();
        } catch {
          continue;
        }

        const entryBytes = sizeBytes(content);
        if (totalBytes + entryBytes > maxBytes) continue;

        const fileKeywords = extractKeywords(content);
        const overlap = [...allKeywords].filter((keyword) => fileKeywords.has(keyword));
        const score = overlap.length / Math.max(allKeywords.size, 1);

        if (score > 0 || allKeywords.size === 0) {
          totalBytes += entryBytes;
          candidates.push({
            score,
            entry: {
              topic: entry.name.replace(/\.md$/i, "").replace(/_/g, " "),
              content,
              caste: currentCaste,
              agentId: "",
              sessionId: "",
              timestamp: 0,
              relevanceKeywords: [...fileKeywords].slice(0, 10),
              filePath,
            },
          });
        }
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    let ranked = candidates.slice(0, maxFiles).map((item) => item.entry);

    if (query && candidates.length > maxFiles && opts.llmFilter) {
      const reranked = await filterRelevantMemories(
        query,
        candidates.map((item) => ({
          topic: item.entry.topic,
          content: item.entry.content,
          caste: item.entry.caste,
          filePath: item.entry.filePath,
          score: item.score,
        }) satisfies RelevantMemory),
        opts.llmFilter,
        maxFiles,
      );
      const byPath = new Map(candidates.map((item) => [item.entry.filePath, item.entry]));
      ranked = reranked
        .map((entry) => byPath.get(entry.filePath))
        .filter((entry): entry is MemoryEntry => Boolean(entry));
    }

    return ranked.slice(0, maxFiles).map((entry) => ({ ...entry }));
  }

  private async _listCastes(): Promise<string[]> {
    try {
      const entries = await readdir(this._baseDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }
}

export class AutoMemoryService {
  private readonly _store: MemoryStore;
  private readonly _llmExtract: ((systemPrompt: string, userContent: string) => Promise<string> | string) | null;
  private readonly _sessionBytes = new Map<string, number>();

  constructor(opts: {
    store?: MemoryStore;
    llmExtract?: ((systemPrompt: string, userContent: string) => Promise<string> | string) | null;
  } = {}) {
    this._store = opts.store ?? new MemoryStore();
    this._llmExtract = opts.llmExtract ?? null;
  }

  get store(): MemoryStore {
    return this._store;
  }

  async extractMemories(
    messages: MessageShape[],
    agentId = "",
    caste = "",
    sessionId = "",
  ): Promise<MemoryEntry[]> {
    const used = this._sessionBytes.get(sessionId) ?? 0;
    if (used >= MAX_BYTES_PER_SESSION) return [];

    const conversation = messagesToText(messages);
    if (conversation.length < 100) return [];

    const extracted = this._llmExtract
      ? await this._extractWithLlm(conversation, agentId, caste, sessionId)
      : this._extractHeuristic(conversation, agentId, caste, sessionId);

    const persisted: MemoryEntry[] = [];

    for (const entry of extracted.slice(0, MAX_FILES_PER_TURN)) {
      entry.content = trimToBytes(entry.content, MAX_BYTES_PER_FILE);
      const nextUsed = (this._sessionBytes.get(sessionId) ?? 0) + sizeBytes(entry.content);
      if (nextUsed > MAX_BYTES_PER_SESSION) break;
      this._sessionBytes.set(sessionId, nextUsed);
      await this._store.save(entry);
      persisted.push({ ...entry });
    }

    return persisted;
  }

  async surfaceRelevant(opts: SurfaceRelevantOptions = {}): Promise<MemoryEntry[]> {
    return this._store.surfaceRelevant(opts);
  }

  private async _extractWithLlm(
    conversation: string,
    agentId: string,
    caste: string,
    sessionId: string,
  ): Promise<MemoryEntry[]> {
    if (!this._llmExtract) return this._extractHeuristic(conversation, agentId, caste, sessionId);

    const systemPrompt = [
      "Extract 1-5 key learnings from this conversation for future sessions.",
      "Format each as:",
      "TOPIC: <short topic>",
      "CONTENT: <1-3 paragraph summary>",
      "KEYWORDS: <comma-separated keywords>",
      "Focus on patterns, decisions, gotchas, reusable insights.",
    ].join("\n");

    try {
      const response = await Promise.resolve(this._llmExtract(systemPrompt, conversation.slice(0, 8000)));
      return parseLlmMemories(response, agentId, caste, sessionId);
    } catch {
      return this._extractHeuristic(conversation, agentId, caste, sessionId);
    }
  }

  private _extractHeuristic(
    conversation: string,
    agentId: string,
    caste: string,
    sessionId: string,
  ): MemoryEntry[] {
    const topics = CASTE_MEMORY_TOPICS[caste.toLowerCase()] ?? CASTE_MEMORY_TOPICS.assist_ant;
    const entries: MemoryEntry[] = [];
    const paragraphs = conversation.split(/\n\n+/);
    const scored: Array<{ score: number; paragraph: string }> = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length < 50) continue;
      const score = topics.reduce(
        (sum, topic) => sum + (paragraph.toLowerCase().includes(topic.toLowerCase()) ? 1 : 0),
        0,
      );
      if (score > 0) scored.push({ score, paragraph });
    }

    scored.sort((left, right) => right.score - left.score);

    for (const item of scored.slice(0, 3)) {
      const firstLine = item.paragraph.trim().split("\n")[0]?.slice(0, 80) ?? "";
      const topic = firstLine.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || `${caste || "memory"}_insight_${entries.length}`;
      entries.push({
        topic,
        content: item.paragraph.trim(),
        caste: caste.toLowerCase(),
        agentId,
        sessionId,
        timestamp: Date.now() / 1000,
        relevanceKeywords: [...extractKeywords(item.paragraph)].slice(0, 10),
        filePath: "",
      });
    }

    return entries;
  }
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.slice(0, 60) || "memory";
}

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  const stops = new Set([
    "this", "that", "with", "from", "have", "been", "would",
    "which", "their", "about", "could", "there", "other",
    "than", "then", "when", "what", "will", "into",
  ]);
  return new Set(words.filter((word) => !stops.has(word)));
}

function messagesToText(messages: MessageShape[]): string {
  const parts: string[] = [];

  for (const message of messages) {
    const role = typeof message.role === "string"
      ? message.role
      : typeof message.type === "string"
        ? message.type
        : "";
    if (role === "system") continue;
    let content = "";
    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      content = message.content
        .filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null)
        .map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "")
        .filter(Boolean)
        .join("\n");
    }

    if (content) parts.push(`[${role}]: ${content}`);
  }

  return parts.join("\n\n");
}

function parseLlmMemories(
  response: string,
  agentId: string,
  caste: string,
  sessionId: string,
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  let currentTopic = "";
  let currentContent = "";
  let currentKeywords: string[] = [];

  for (const rawLine of response.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("TOPIC:")) {
      if (currentTopic && currentContent) {
        entries.push({
          topic: currentTopic,
          content: currentContent.trim(),
          caste: caste.toLowerCase(),
          agentId,
          sessionId,
          timestamp: Date.now() / 1000,
          relevanceKeywords: currentKeywords,
          filePath: "",
        });
      }
      currentTopic = line.slice(6).trim();
      currentContent = "";
      currentKeywords = [];
      continue;
    }

    if (line.startsWith("CONTENT:")) {
      currentContent = line.slice(8).trim();
      continue;
    }

    if (line.startsWith("KEYWORDS:")) {
      currentKeywords = line
        .slice(9)
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      continue;
    }

    if (currentTopic) {
      currentContent += `${currentContent ? "\n" : ""}${line}`;
    }
  }

  if (currentTopic && currentContent) {
    entries.push({
      topic: currentTopic,
      content: currentContent.trim(),
      caste: caste.toLowerCase(),
      agentId,
      sessionId,
      timestamp: Date.now() / 1000,
      relevanceKeywords: currentKeywords,
      filePath: "",
    });
  }

  return entries;
}
