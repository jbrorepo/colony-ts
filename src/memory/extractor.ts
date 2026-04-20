/**
 * Structured reusable-memory extraction.
 *
 * Ports colony/memory/extractor.py into TypeScript with async persistence and
 * lightweight relevance ranking. This layer stores durable facts separately
 * from verbatim transcripts and derived compact artifacts.
 */

import { appendFile, mkdir, readdir } from "fs/promises";
import { createHash } from "crypto";
import { join } from "path";

import { scrubSecrets } from "../security/log-sanitizer";
import { validateTeamMemWrite } from "../security/path-validator";
import { SecretScanner } from "../security/secret-scanner";
import { getDataPath, settings } from "../settings";

const EXTRACTED_SECRET_SCANNER = new SecretScanner();
const DEFAULT_LAST_MESSAGE_COUNT = 20;
const DEFAULT_MESSAGE_CHAR_LIMIT = 300;

export const DEFAULT_EXTRACTED_MEMORY_DIR = join(getDataPath(settings), "memory-extracts");

export const MEMORY_SCOPES = ["agent", "colony"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const EXTRACTED_MEMORY_CATEGORIES = [
  "preference",
  "pattern",
  "decision",
  "constraint",
  "fact",
] as const;
export type ExtractedMemoryCategory = (typeof EXTRACTED_MEMORY_CATEGORIES)[number];

export interface ExtractedMemory {
  content: string;
  scope: MemoryScope;
  agentId: string;
  category: ExtractedMemoryCategory;
  confidence: number;
  sourceTurn: number;
  contentHash: string;
  timestamp: number;
}

export interface StoredExtractedMemory extends ExtractedMemory {
  sessionId: string;
  caste: string;
  filePath: string;
}

type MessageShape = Record<string, unknown>;

interface ParsedLlmMemory {
  content?: unknown;
  scope?: unknown;
  category?: unknown;
  confidence?: unknown;
}

const KEYWORD_CATEGORY_MAP: Record<string, ExtractedMemoryCategory> = {
  decided: "decision",
  decision: "decision",
  agreed: "decision",
  always: "constraint",
  never: "constraint",
  must: "constraint",
  prefer: "preference",
  preference: "preference",
  pattern: "pattern",
  convention: "pattern",
  architecture: "pattern",
  important: "fact",
  remember: "fact",
};

const AGENT_SCOPE_MARKERS = [
  "agent",
  "caste",
  "assist-ant",
  "root_queen",
  "eldest_architect",
  "shield_generals",
  "watcher_swarm",
  "forge_carvers",
  "core_shapers",
  "liaison_ants",
  "ledger_ants",
  "lore_burrow",
  "nameless_swarm",
];

const EXTRACTION_PROMPT = [
  "Analyze conversation fragment and extract reusable facts.",
  "Categories:",
  "1. preference - user preferences about coding style, tools, or workflow",
  "2. pattern - codebase patterns, conventions, or architectural decisions",
  "3. decision - decisions that were made and should be remembered",
  "4. constraint - constraints or requirements that must be respected",
  "5. fact - important facts about project or environment",
  "",
  "Return raw JSON array only. Each object must contain:",
  '- "content": 1-2 sentences',
  '- "category": one of preference/pattern/decision/constraint/fact',
  '- "scope": "agent" if specific to this agent, "colony" if project-wide',
  '- "confidence": number 0.0-1.0',
].join("\n");

export class MemoryExtractor {
  private readonly _summarizer: ((prompt: string) => Promise<string> | string) | null;
  private readonly _knowledgeBase: {
    similaritySearch?: (query: string, topK?: number) => Array<{ score?: number }> | Promise<Array<{ score?: number }>>;
  } | null;
  private readonly _maxPerRun: number;

  constructor(opts: {
    summarizer?: ((prompt: string) => Promise<string> | string) | null;
    knowledgeBase?: {
      similaritySearch?: (query: string, topK?: number) => Array<{ score?: number }> | Promise<Array<{ score?: number }>>;
    } | null;
    maxMemoriesPerExtraction?: number;
  } = {}) {
    this._summarizer = opts.summarizer ?? null;
    this._knowledgeBase = opts.knowledgeBase ?? null;
    this._maxPerRun = opts.maxMemoriesPerExtraction ?? 10;
  }

  async extract(messages: MessageShape[], agentId = ""): Promise<ExtractedMemory[]> {
    if (messages.length === 0) return [];

    const conversation = formatConversation(messages);
    const extracted = this._summarizer
      ? await this._llmExtract(conversation, agentId)
      : this._keywordExtract(messages, agentId);

    const deduped = await this._deduplicate(extracted);
    return deduped.slice(0, this._maxPerRun);
  }

  private async _llmExtract(conversation: string, agentId: string): Promise<ExtractedMemory[]> {
    if (!this._summarizer) return [];

    try {
      const response = await Promise.resolve(
        this._summarizer(`${EXTRACTION_PROMPT}\n\nConversation:\n${conversation.slice(0, 4000)}`),
      );
      return parseLlmResponse(response, agentId);
    } catch {
      return [];
    }
  }

  private _keywordExtract(messages: MessageShape[], agentId: string): ExtractedMemory[] {
    const extracted: ExtractedMemory[] = [];

    for (const [index, message] of messages.entries()) {
      const content = normalizeMessageContent(message);
      if (!content) continue;

      const contentLower = content.toLowerCase();
      for (const [keyword, category] of Object.entries(KEYWORD_CATEGORY_MAP)) {
        if (!contentLower.includes(keyword)) continue;

        const sentence = findSentence(content, keyword);
        if (!sentence) continue;

        const scope = inferScope(sentence, agentId);
        extracted.push(createExtractedMemory({
          content: sentence,
          scope,
          agentId: scope === "agent" ? agentId : "",
          category,
          confidence: 0.6,
          sourceTurn: index,
        }));
        break;
      }
    }

    return extracted;
  }

  private async _deduplicate(memories: ExtractedMemory[]): Promise<ExtractedMemory[]> {
    const unique: ExtractedMemory[] = [];
    const seen = new Set<string>();

    for (const memory of memories) {
      if (seen.has(memory.contentHash)) continue;

      if (this._knowledgeBase?.similaritySearch) {
        try {
          const results = await Promise.resolve(this._knowledgeBase.similaritySearch(memory.content, 1));
          if ((results[0]?.score ?? 0) > 0.9) {
            continue;
          }
        } catch {
          // Ignore best-effort similarity dedup failures.
        }
      }

      seen.add(memory.contentHash);
      unique.push(memory);
    }

    return unique;
  }
}

export class ExtractedMemoryStore {
  private readonly _baseDir: string;
  private _cache: StoredExtractedMemory[] | null = null;
  private _knownKeys: Set<string> | null = null;

  constructor(baseDir = DEFAULT_EXTRACTED_MEMORY_DIR) {
    this._baseDir = baseDir;
  }

  get baseDir(): string {
    return this._baseDir;
  }

  async save(
    sessionId: string,
    caste: string,
    memories: ExtractedMemory[],
  ): Promise<StoredExtractedMemory[]> {
    if (memories.length === 0) return [];

    await mkdir(this._baseDir, { recursive: true });
    const filePath = join(this._baseDir, `${sessionId}.jsonl`);
    await validateTeamMemWrite(filePath, this._baseDir);

    const knownKeys = await this._ensureKnownKeys();
    const persisted: StoredExtractedMemory[] = [];
    const lines: string[] = [];

    for (const memory of memories) {
      const stored: StoredExtractedMemory = {
        ...memory,
        content: sanitizeExtractedText(memory.content),
        caste: caste.toLowerCase(),
        sessionId,
        filePath,
      };
      const dedupeKey = recordDedupKey(stored);
      if (knownKeys.has(dedupeKey)) continue;
      knownKeys.add(dedupeKey);
      persisted.push(stored);
      lines.push(`${JSON.stringify(stored)}\n`);
    }

    if (lines.length > 0) {
      await appendFile(filePath, lines.join(""), "utf8");
      const cache = await this._ensureCache();
      cache.push(...persisted);
      cache.sort((left, right) => right.timestamp - left.timestamp);
    }

    return persisted;
  }

  async surfaceRelevant(input: {
    query?: string;
    agentId?: string;
    caste?: string;
    limit?: number;
  } = {}): Promise<StoredExtractedMemory[]> {
    const query = input.query ?? "";
    const limit = input.limit ?? 6;
    const agentId = (input.agentId ?? "").trim();
    const caste = (input.caste ?? "").trim().toLowerCase();
    const queryKeywords = extractKeywords(query);
    const categoryHints = new Set(
      EXTRACTED_MEMORY_CATEGORIES.filter((category) => query.toLowerCase().includes(category)),
    );

    const records = await this._ensureCache();
    const filtered = records.filter((record) => {
      if (record.scope === "agent" && agentId.length > 0 && record.agentId !== agentId) {
        return false;
      }
      if (record.scope === "agent" && agentId.length === 0) {
        return false;
      }
      if (!caste) return true;
      return record.caste === caste || record.scope === "colony";
    });

    const scored = filtered.map((record) => {
      const corpus = extractKeywords(`${record.content} ${record.category} ${record.caste} ${record.agentId}`);
      let score = queryKeywords.size === 0 ? 1 : 0;
      for (const keyword of queryKeywords) {
        if (corpus.has(keyword)) score += 2;
      }
      if (categoryHints.has(record.category)) score += 1;
      if (record.scope === "agent" && record.agentId === agentId) score += 1;
      if (score === 0 && queryKeywords.size > 0) score = -1;
      return { record, score };
    });

    return scored
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.record.timestamp - left.record.timestamp;
      })
      .slice(0, limit)
      .map((entry) => ({ ...entry.record }));
  }

  private async _ensureCache(): Promise<StoredExtractedMemory[]> {
    if (this._cache) return this._cache;

    let files: string[] = [];
    try {
      const entries = await readdir(this._baseDir, { withFileTypes: true });
      files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => join(this._baseDir, entry.name))
        .sort();
    } catch {
      this._cache = [];
      return this._cache;
    }

    const loaded: StoredExtractedMemory[] = [];
    for (const filePath of files) {
      let text = "";
      try {
        text = await Bun.file(filePath).text();
      } catch {
        continue;
      }

      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as Partial<StoredExtractedMemory>;
          const normalized = normalizeStoredRecord(parsed, filePath);
          if (!normalized) continue;
          loaded.push(normalized);
        } catch {
          continue;
        }
      }
    }

    loaded.sort((left, right) => right.timestamp - left.timestamp);
    this._cache = loaded;
    this._knownKeys = new Set(loaded.map((record) => recordDedupKey(record)));
    return this._cache;
  }

  private async _ensureKnownKeys(): Promise<Set<string>> {
    if (this._knownKeys) return this._knownKeys;
    await this._ensureCache();
    this._knownKeys ??= new Set();
    return this._knownKeys;
  }
}

export function createExtractedMemory(input: {
  content: string;
  scope?: MemoryScope;
  agentId?: string;
  category?: ExtractedMemoryCategory;
  confidence?: number;
  sourceTurn?: number;
  timestamp?: number;
}): ExtractedMemory {
  const content = sanitizeExtractedText(input.content.trim());
  return {
    content,
    scope: input.scope ?? "colony",
    agentId: input.agentId ?? "",
    category: input.category ?? "fact",
    confidence: clampConfidence(input.confidence ?? 0.8),
    sourceTurn: input.sourceTurn ?? 0,
    contentHash: hashContent(content),
    timestamp: input.timestamp ?? Date.now() / 1000,
  };
}

function parseLlmResponse(response: string, agentId: string): ExtractedMemory[] {
  const text = stripMarkdownFence(response).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is ParsedLlmMemory => typeof item === "object" && item !== null)
      .map((item, index) => {
        const content = typeof item.content === "string" ? item.content.trim() : "";
        if (!content) return null;

        const scope = item.scope === "agent" ? "agent" : "colony";
        const category = isCategory(item.category) ? item.category : "fact";
        return createExtractedMemory({
          content,
          scope,
          agentId: scope === "agent" ? agentId : "",
          category,
          confidence: typeof item.confidence === "number" ? item.confidence : 0.8,
          sourceTurn: index,
        });
      })
      .filter((item): item is ExtractedMemory => item !== null);
  } catch {
    return [];
  }
}

function formatConversation(messages: MessageShape[]): string {
  const relevant = messages.slice(-DEFAULT_LAST_MESSAGE_COUNT);
  return relevant
    .map((message) => {
      const role = typeof message.role === "string"
        ? message.role
        : typeof message.type === "string"
          ? message.type
          : "?";
      const content = normalizeMessageContent(message).slice(0, DEFAULT_MESSAGE_CHAR_LIMIT);
      return `[${role}] ${content}`;
    })
    .filter((line) => line !== "[?] ")
    .join("\n");
}

function normalizeMessageContent(message: MessageShape): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null)
      .map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function sanitizeExtractedText(text: string): string {
  return EXTRACTED_SECRET_SCANNER.scan(scrubSecrets(text)).redactedText;
}

function inferScope(content: string, agentId: string): MemoryScope {
  const lower = content.toLowerCase();
  if (agentId && lower.includes(agentId.toLowerCase())) return "agent";
  if (AGENT_SCOPE_MARKERS.some((marker) => lower.includes(marker))) return "agent";
  return "colony";
}

function findSentence(content: string, keyword: string): string {
  const fragments = content.split(/(?<=[.!?])\s+|\n+/);
  for (const fragment of fragments) {
    const line = fragment.trim();
    if (line.length < 16) continue;
    if (!line.toLowerCase().includes(keyword.toLowerCase())) continue;
    return line.slice(0, 200).trim();
  }
  return "";
}

function recordDedupKey(record: Pick<StoredExtractedMemory, "contentHash" | "scope" | "agentId">): string {
  return `${record.scope}:${record.agentId}:${record.contentHash}`;
}

function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0.8;
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return confidence;
}

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  const stops = new Set([
    "this",
    "that",
    "with",
    "from",
    "have",
    "been",
    "would",
    "which",
    "their",
    "about",
    "could",
    "there",
    "other",
    "than",
    "then",
    "when",
    "what",
    "will",
    "into",
  ]);
  return new Set(words.filter((word) => !stops.has(word)));
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.split("\n").slice(1).join("\n");
  return withoutOpen.replace(/```$/, "").trim();
}

function isCategory(value: unknown): value is ExtractedMemoryCategory {
  return typeof value === "string" && EXTRACTED_MEMORY_CATEGORIES.includes(value as ExtractedMemoryCategory);
}

function normalizeStoredRecord(
  value: Partial<StoredExtractedMemory>,
  filePath: string,
): StoredExtractedMemory | null {
  if (
    typeof value.content !== "string"
    || (value.scope !== "agent" && value.scope !== "colony")
    || typeof value.agentId !== "string"
    || !isCategory(value.category)
    || typeof value.confidence !== "number"
    || typeof value.sourceTurn !== "number"
    || typeof value.contentHash !== "string"
    || typeof value.timestamp !== "number"
    || typeof value.sessionId !== "string"
    || typeof value.caste !== "string"
  ) {
    return null;
  }

  return {
    content: value.content,
    scope: value.scope,
    agentId: value.agentId,
    category: value.category,
    confidence: value.confidence,
    sourceTurn: value.sourceTurn,
    contentHash: value.contentHash,
    timestamp: value.timestamp,
    sessionId: value.sessionId,
    caste: value.caste,
    filePath: typeof value.filePath === "string" && value.filePath.length > 0 ? value.filePath : filePath,
  };
}
