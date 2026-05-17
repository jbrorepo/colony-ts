/**
 * Structured reusable-memory extraction.
 *
 * Ports colony/memory/extractor.py into TypeScript with async persistence and
 * lightweight relevance ranking. This layer stores durable reusable memories separately
 * from verbatim transcripts and derived compact artifacts.
 */

import { appendFile, mkdir, readdir } from "fs/promises";
import { createHash } from "crypto";
import { join } from "path";

import { scrubSecrets } from "../security/log-sanitizer";
import { validateTeamMemWrite } from "../security/path-validator";
import { SecretScanner } from "../security/secret-scanner";
import { getDataPath, settings } from "../settings";
import { inferMemorySessionScopePreference, inferMemoryTimePreference, scoreLiteralPhraseMatch } from "./hybrid-memory";
import {
  hasBoundedPhrase,
  inferStructuredRankingSignals,
  STRUCTURED_MEMORY_CATEGORIES,
  type StructuredRankingSignals,
} from "./structured-ranking";
export {
  inferStructuredMemoryCategoryHints,
  inferStructuredRankingPlan,
  type StructuredRankingPlan,
} from "./structured-ranking";

const EXTRACTED_SECRET_SCANNER = new SecretScanner();
const DEFAULT_LAST_MESSAGE_COUNT = 20;
const DEFAULT_MESSAGE_CHAR_LIMIT = 300;

export const DEFAULT_EXTRACTED_MEMORY_DIR = join(getDataPath(settings), "memory-extracts");

export const MEMORY_SCOPES = ["agent", "colony"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const EXTRACTED_MEMORY_CATEGORIES = [
  "advice",
  "reasoning",
  "diagnostic",
  "entity",
  "metric",
  "procedure",
  "preference",
  "pattern",
  "decision",
  "constraint",
  "risk",
  "change",
  "fact",
  "discovery",
  "event",
] as const;
export type ExtractedMemoryCategory = (typeof EXTRACTED_MEMORY_CATEGORIES)[number];

export interface ExtractedMemory {
  content: string;
  scope: MemoryScope;
  agentId: string;
  category: ExtractedMemoryCategory;
  confidence: number;
  sourceTurn: number;
  source?: "keyword" | "llm" | "unknown";
  contentHash: string;
  timestamp: number;
}

export interface StoredExtractedMemory extends ExtractedMemory {
  sessionId: string;
  caste: string;
  filePath: string;
  matchScore?: number;
  matchReasons?: string[];
}

type MessageShape = Record<string, unknown>;

interface ParsedLlmMemory {
  content?: unknown;
  scope?: unknown;
  category?: unknown;
  confidence?: unknown;
  sourceTurn?: unknown;
}

const KEYWORD_CATEGORY_MAP: Record<string, ExtractedMemoryCategory> = {
  advice: "advice",
  recommend: "advice",
  recommendation: "advice",
  reason: "reasoning",
  rationale: "reasoning",
  because: "reasoning",
  justify: "reasoning",
  justification: "reasoning",
  motivation: "reasoning",
  tradeoff: "reasoning",
  "trade-off": "reasoning",
  error: "diagnostic",
  failed: "diagnostic",
  failure: "diagnostic",
  failing: "diagnostic",
  diagnostic: "diagnostic",
  diagnostics: "diagnostic",
  exception: "diagnostic",
  traceback: "diagnostic",
  crash: "diagnostic",
  provider: "entity",
  metric: "metric",
  metrics: "metric",
  latency: "metric",
  slo: "metric",
  p50: "metric",
  p75: "metric",
  p90: "metric",
  p95: "metric",
  p99: "metric",
  "error budget": "metric",
  performance: "metric",
  perf: "metric",
  budget: "metric",
  cost: "metric",
  quota: "metric",
  throughput: "metric",
  threshold: "metric",
  thresholds: "metric",
  steps: "procedure",
  runbook: "procedure",
  playbook: "procedure",
  procedure: "procedure",
  process: "procedure",
  model: "entity",
  package: "entity",
  library: "entity",
  service: "entity",
  database: "entity",
  queue: "entity",
  bucket: "entity",
  table: "entity",
  topic: "entity",
  host: "entity",
  domain: "entity",
  region: "entity",
  cluster: "entity",
  namespace: "entity",
  schema: "entity",
  pod: "entity",
  deployment: "entity",
  image: "entity",
  container: "entity",
  job: "entity",
  volume: "entity",
  tool: "entity",
  file: "entity",
  path: "entity",
  command: "entity",
  module: "entity",
  function: "entity",
  class: "entity",
  decided: "decision",
  decision: "decision",
  agreed: "decision",
  always: "constraint",
  never: "constraint",
  must: "constraint",
  avoid: "risk",
  unsafe: "risk",
  danger: "risk",
  prefer: "preference",
  preference: "preference",
  pattern: "pattern",
  convention: "pattern",
  architecture: "pattern",
  changed: "change",
  difference: "change",
  important: "fact",
  remember: "fact",
  owner: "fact",
  ownership: "fact",
  owns: "fact",
  responsible: "fact",
  responsibility: "fact",
  accountable: "fact",
  accountability: "fact",
  contact: "fact",
  learned: "discovery",
  discover: "discovery",
  discovered: "discovery",
  insight: "discovery",
  happened: "event",
  incident: "event",
  timeline: "event",
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
  "Analyze conversation fragment and extract reusable memories.",
  "Categories:",
  "1. advice - recommendations, guidance, or suggested next actions worth reusing",
  "2. reasoning - why something was chosen, rationale, motivation, or tradeoff worth reusing",
  "3. diagnostic - failures, root causes, exceptions, crashes, or debugging findings worth reusing",
  "4. entity - named files, providers, tools, models, services, databases, queues, buckets, tables, topics, hosts, domains, regions, clusters, namespaces, schemas, pods, deployments, images, containers, jobs, volumes, env vars, flags, endpoints, urls, ports, paths, commands, modules, packages, libraries, owners, contacts, or other concrete things worth reusing",
  "5. metric - reusable budgets, latency/performance numbers, thresholds, costs, token counts, or operational measurements",
  "6. procedure - reusable runbooks, playbooks, ordered steps, or operating processes worth reusing",
  "7. preference - user preferences about coding style, tools, or workflow",
  "8. pattern - codebase patterns, conventions, or architectural decisions",
  "9. decision - decisions that were made and should be remembered",
  "10. constraint - constraints or requirements that must be respected",
  "11. risk - cautions, pitfalls, unsafe paths, or things to avoid",
  "12. change - before/after deltas, migrations, or what changed",
  "13. fact - important facts about project or environment",
  "14. discovery - lessons, insights, breakthroughs, or learned patterns worth reusing",
  "15. event - timeline facts, incidents, milestones, or what happened during execution",
  "",
  "Return raw JSON array only. Each object must contain:",
  '- "content": 1-2 sentences',
  '- "category": one of advice/reasoning/diagnostic/entity/metric/procedure/preference/pattern/decision/constraint/risk/change/fact/discovery/event',
  '  Alias inputs like recommendation/rationale/error/failure/root-cause/provider/model/service/database/queue/bucket/table/topic/host/domain/region/cluster/namespace/schema/pod/deployment/image/container/job/volume/tool/file/path/env/flag/endpoint/url/port/budget/latency/performance/token/cost/threshold/runbook/playbook/steps/process/caution/delta/insight/timeline/package/library plus owner/responsible/contact should map to advice/reasoning/diagnostic/entity/fact/metric/procedure/risk/change/discovery/event before output.',
  '- "scope": "agent" if specific to this agent, "colony" if project-wide',
  '- "confidence": number 0.0-1.0',
  '- "sourceTurn": integer turn id copied from the provided [turn:N role] conversation markers',
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
      ? await this._llmExtract(conversation.text, agentId, conversation.maxSourceTurn)
      : this._keywordExtract(messages, agentId);

    const deduped = await this._deduplicate(extracted);
    return deduped.slice(0, this._maxPerRun);
  }

  private async _llmExtract(conversation: string, agentId: string, maxSourceTurn: number): Promise<ExtractedMemory[]> {
    if (!this._summarizer) return [];

    try {
      const response = await Promise.resolve(
        this._summarizer(`${EXTRACTION_PROMPT}\n\nConversation:\n${conversation.slice(0, 4000)}`),
      );
      return parseLlmResponse(response, agentId, maxSourceTurn);
    } catch {
      return [];
    }
  }

  private _keywordExtract(messages: MessageShape[], agentId: string): ExtractedMemory[] {
    const extracted: ExtractedMemory[] = [];

    for (const [index, message] of messages.entries()) {
      const content = normalizeMessageContent(message);
      if (!content) continue;

      const stepProcedure = extractImplicitProcedureSequence(content);
      if (stepProcedure) {
        const scope = inferScope(stepProcedure, agentId);
        extracted.push(createExtractedMemory({
          content: stepProcedure,
          scope,
          agentId: scope === "agent" ? agentId : "",
          category: "procedure",
          confidence: 0.7,
          sourceTurn: index,
          source: "keyword",
        }));
      }

      for (const sentence of splitSentenceFragments(content)) {
        const scope = inferScope(sentence, agentId);
        const specific = extractSpecificHeuristicMemories(sentence, scope, agentId, index);
        extracted.push(...specific);
        if (specific.length > 0) continue;

        const category = inferKeywordCategory(sentence);
        if (category == null) continue;

        extracted.push(createExtractedMemory({
          content: sentence,
          scope,
          agentId: scope === "agent" ? agentId : "",
          category,
          confidence: specific.length > 0 ? 0.68 : 0.6,
          sourceTurn: index,
          source: "keyword",
        }));
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
    const safeFileSessionId = safeExtractedMemoryFileSegment(sessionId);
    const filePath = join(this._baseDir, `${safeFileSessionId}.jsonl`);
    await validateTeamMemWrite(filePath, this._baseDir);

    const knownKeys = await this._ensureKnownKeys();
    const persisted: StoredExtractedMemory[] = [];
    const lines: string[] = [];

    for (const memory of memories) {
      const safeSessionId = sanitizeExtractedText(sessionId);
      const safeCaste = sanitizeExtractedText(caste.toLowerCase());
      const stored: StoredExtractedMemory = {
        ...memory,
        content: sanitizeExtractedText(memory.content),
        agentId: sanitizeExtractedText(memory.agentId),
        contentHash: sanitizeExtractedText(memory.contentHash),
        caste: safeCaste,
        sessionId: safeSessionId,
        filePath: sanitizeExtractedText(filePath),
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
    sessionId?: string;
    limit?: number;
  } = {}): Promise<StoredExtractedMemory[]> {
    const query = input.query ?? "";
    const limit = input.limit ?? 6;
    const agentId = (input.agentId ?? "").trim();
    const caste = (input.caste ?? "").trim().toLowerCase();
    const sessionId = (input.sessionId ?? "").trim();
    const queryKeywords = extractKeywords(query);
    const structuredSignals = inferStructuredRankingSignals(query);
    const sessionScopePreference = inferMemorySessionScopePreference(query);
    const timePreference = inferMemoryTimePreference(query);

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
      const contentCorpus = extractKeywords(record.content);
      const overlap = [...queryKeywords].filter((keyword) => corpus.has(keyword)).length;
      const contentOverlap = [...queryKeywords]
        .filter((keyword) => isAdmissionKeyword(keyword, structuredSignals))
        .filter((keyword) => contentCorpus.has(keyword)).length;
      const keywordScore = queryKeywords.size === 0 ? 1 : (overlap * 2) / Math.max(queryKeywords.size, 1);
      const phraseScore = scoreLiteralPhraseMatch(record.content, query);
      const hasQueryContentMatch = queryKeywords.size === 0 || contentOverlap > 0 || phraseScore > 0;
      let score = Math.max(keywordScore, phraseScore);
      const reasons: string[] = [];
      if (overlap > 0) reasons.push("keyword-overlap");
      if (phraseScore > 0 && phraseScore >= keywordScore) reasons.push("literal-phrase");
      for (const keyword of queryKeywords) {
        if (corpus.has(keyword)) score += 0.25;
      }
      const structuredScore = scoreStructuredRankingSignals(record, structuredSignals);
      score += structuredScore.scoreDelta;
      reasons.push(...structuredScore.reasons);
      if (record.scope === "agent" && record.agentId === agentId) {
        score += 0.75;
        reasons.push("scope-agent");
      }
      score += Math.max(0, Math.min(record.confidence, 1)) * 0.4;
      if (sessionScopePreference === "current") {
        if (sessionId && record.sessionId === sessionId) {
          score += 0.8;
          reasons.push("session-current");
        }
        else if (sessionId) score -= 0.15;
      }
      if (sessionScopePreference === "archived") {
        if (sessionId && record.sessionId !== sessionId) {
          score += 0.55;
          reasons.push("session-archived");
        }
        else if (sessionId && record.sessionId === sessionId) score -= 0.25;
      }
      if (!hasQueryContentMatch) score = -1;
      else if (score <= 0 && queryKeywords.size > 0 && phraseScore === 0) score = -1;
      return { record, score, reasons };
    });

    const ranked = scored
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.record.timestamp - left.record.timestamp;
      });

    if (timePreference != null) {
      const ordered = [...ranked].sort((left, right) => (
        timePreference === "recent"
          ? right.record.timestamp - left.record.timestamp
          : left.record.timestamp - right.record.timestamp
      ));
      const maxBoost = 0.24;
      const step = Math.max(0.04, maxBoost / Math.max(1, ordered.length));
      for (const [index, entry] of ordered.entries()) {
        entry.score += Math.max(0, maxBoost - index * step);
        if (timePreference === "recent") entry.reasons.push("time-recent");
        else entry.reasons.push("time-oldest");
      }
      ranked.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.record.timestamp - left.record.timestamp;
      });
    }

    return ranked
      .slice(0, limit)
      .map((entry) => ({ ...entry.record, matchScore: entry.score, matchReasons: entry.reasons }));
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

function scoreStructuredRankingSignals(
  record: Pick<StoredExtractedMemory, "category" | "content">,
  signals: StructuredRankingSignals,
): { scoreDelta: number; reasons: string[] } {
  let scoreDelta = 0;
  const reasons: string[] = [];

  if (signals.categoryHints.has(record.category)) {
    scoreDelta += 1.5;
    reasons.push(`category-${record.category}`);
  } else if (signals.categoryHints.size > 0) {
    scoreDelta -= 0.2;
  }
  if (signals.metricIntent && record.category === "metric") {
    scoreDelta += 1.0;
    reasons.push("intent-metric");
  }
  if (signals.ownershipIntent && record.category === "fact" && isOwnershipFact(record.content)) {
    scoreDelta += 1.25;
    reasons.push("intent-ownership");
  }
  if (signals.resolutionIntent && record.category === "diagnostic" && isResolutionDiagnostic(record.content)) {
    scoreDelta += 1.25;
    reasons.push("intent-resolution");
  }

  return { scoreDelta, reasons };
}

export function createExtractedMemory(input: {
  content: string;
  scope?: MemoryScope;
  agentId?: string;
  category?: ExtractedMemoryCategory;
  confidence?: number;
  sourceTurn?: number;
  source?: "keyword" | "llm" | "unknown";
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
    source: input.source ?? "unknown",
    contentHash: hashContent(content),
    timestamp: input.timestamp ?? Date.now() / 1000,
  };
}

function parseLlmResponse(response: string, agentId: string, maxSourceTurn: number): ExtractedMemory[] {
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
        const category = normalizeExtractedMemoryCategory(item.category) ?? "fact";
        return createExtractedMemory({
          content,
          scope,
          agentId: scope === "agent" ? agentId : "",
          category,
          confidence: typeof item.confidence === "number" ? item.confidence : 0.8,
          sourceTurn: normalizeSourceTurn(item.sourceTurn, maxSourceTurn) ?? index,
          source: "llm",
        });
      })
      .filter((item): item is ExtractedMemory => item !== null);
  } catch {
    return [];
  }
}

function formatConversation(messages: MessageShape[]): { text: string; maxSourceTurn: number } {
  const relevant = messages.slice(-DEFAULT_LAST_MESSAGE_COUNT);
  const offset = Math.max(0, messages.length - relevant.length);
  const text = relevant
    .map((message, index) => {
      const role = typeof message.role === "string"
        ? message.role
        : typeof message.type === "string"
          ? message.type
          : "?";
      const content = normalizeMessageContent(message).slice(0, DEFAULT_MESSAGE_CHAR_LIMIT);
      return `[turn:${offset + index} ${role}] ${content}`;
    })
    .filter((line) => line !== "[?] ")
    .join("\n");
  return {
    text,
    maxSourceTurn: Math.max(0, messages.length - 1),
  };
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

function safeExtractedMemoryFileSegment(value: string): string {
  const sanitized = sanitizeExtractedText(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_")
    .replace(/\.\.+/g, "_")
    .trim();
  return sanitized.length > 0 ? sanitized : "session";
}

function isAdmissionKeyword(keyword: string, signals: StructuredRankingSignals): boolean {
  if (STRUCTURED_MEMORY_CATEGORIES.includes(keyword as typeof STRUCTURED_MEMORY_CATEGORIES[number])) return false;
  if (signals.resolutionIntent && isResolutionControlKeyword(keyword)) return false;
  return true;
}

function isResolutionControlKeyword(keyword: string): boolean {
  return [
    "fix",
    "fixed",
    "fixes",
    "solve",
    "solved",
    "solves",
    "solution",
    "solutions",
    "resolve",
    "resolved",
    "resolves",
    "workaround",
    "workarounds",
    "resolution",
  ].includes(keyword.toLowerCase());
}

function isOwnershipFact(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes(" owner")
    || lower.startsWith("owner")
    || lower.includes("ownership")
    || lower.includes(" owns ")
    || lower.includes("owned by")
    || lower.includes("responsible for")
    || lower.includes("responsibility")
    || lower.includes("accountable for")
    || lower.includes("contact for")
    || lower.includes("point of contact");
}

function isResolutionDiagnostic(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes("resolution:")
    || lower.includes("the fix")
    || lower.includes("fix was")
    || lower.includes("fixed by")
    || lower.includes("solution")
    || lower.includes("workaround")
    || lower.includes("resolved by")
    || lower.includes("solved by");
}

function inferScope(content: string, agentId: string): MemoryScope {
  const lower = content.toLowerCase();
  if (agentId && lower.includes(agentId.toLowerCase())) return "agent";
  if (AGENT_SCOPE_MARKERS.some((marker) => lower.includes(marker))) return "agent";
  return "colony";
}

function splitSentenceFragments(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 16)
    .map((fragment) => fragment.slice(0, DEFAULT_MESSAGE_CHAR_LIMIT).trim());
}

function inferKeywordCategory(content: string): ExtractedMemoryCategory | null {
  for (const [keyword, category] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (hasBoundedPhrase(content, keyword)) return category;
  }
  return null;
}

function extractSpecificHeuristicMemories(
  sentence: string,
  scope: MemoryScope,
  agentId: string,
  sourceTurn: number,
): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];
  const seen = new Set<string>();
  const add = (content: string, category: ExtractedMemoryCategory, confidence: number) => {
    const normalized = normalizeHeuristicValue(content);
    const minLength = category === "metric" ? 6 : 12;
    if (normalized.length < minLength) return;
    const key = `${category}:${normalized.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    memories.push(createExtractedMemory({
      content: normalized,
      scope,
      agentId: scope === "agent" ? agentId : "",
      category,
      confidence,
      sourceTurn,
      source: "keyword",
    }));
  };

  const explicitBodies = extractExplicitCategoryBodies(sentence);
  for (const [category, body] of explicitBodies) {
    add(body, category, category === "fact" ? 0.74 : 0.72);
  }
  if (explicitBodies.length > 0) return memories;

  const implicitBodies = extractImplicitCategoryBodies(sentence);
  for (const [category, body] of implicitBodies) {
    add(body, category, category === "fact" ? 0.71 : 0.69);
  }
  if (implicitBodies.length > 0) return memories;

  const implicitProcedure = extractImplicitProcedureBody(sentence);
  if (implicitProcedure) {
    add(implicitProcedure, "procedure", 0.69);
  }

  for (const metric of collectConcreteMetricMatches(sentence)) {
    add(metric, "metric", 0.7);
  }

  for (const envVar of collectMatches(sentence, /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g)) {
    add(`Entity: env var ${envVar}.`, "entity", 0.72);
  }

  const endpointLabel = /\b(endpoint|url)\b/i.test(sentence) ? "endpoint" : "url";
  for (const url of collectMatches(sentence, /https?:\/\/[^\s)]+/gi)) {
    add(`Entity: ${endpointLabel} ${url}.`, "entity", 0.72);
  }

  const implicitBranches = collectImplicitBranchMatches(sentence);
  const pathLabel = /\bfile\b/i.test(sentence) ? "file" : "path";
  for (const branch of implicitBranches) {
    add(`Entity: branch ${branch}.`, "entity", 0.7);
  }
  for (const path of collectPathMatches(sentence, implicitBranches)) {
    add(`Entity: ${pathLabel} ${path}.`, "entity", 0.7);
  }

  for (const port of collectCaptures(sentence, /\bport(?:\s+(?:number|id))?\s*(?:was|is|stayed|=|:)?\s*(\d{2,5})\b/gi)) {
    add(`Entity: port ${port}.`, "entity", 0.72);
  }

  if (/\bprovider\b/i.test(sentence)) {
    for (const provider of collectProviderLikeMatches(sentence)) {
      add(`Entity: provider ${provider}.`, "entity", 0.7);
    }
  }

  if (/\bmodel\b/i.test(sentence)) {
    for (const model of [
      ...collectLabeledValues(sentence, ["model"], "(?:`[^`]+`|[a-z0-9][a-z0-9._-]*)"),
      ...collectMatches(sentence, /\b(?:gpt-[a-z0-9.-]+|claude-[a-z0-9.-]+|gemini-[a-z0-9.-]+|llama[0-9.-]*|qwen[0-9.-]*|mistral[0-9.-]*|deepseek-[a-z0-9.-]+|o[1-9](?:-[a-z0-9.-]+)?)\b/gi),
    ]) {
      add(`Entity: model ${model}.`, "entity", 0.7);
    }
  }

  for (const runtimeVersion of collectRuntimeVersionMatches(sentence)) {
    add(`Entity: version ${runtimeVersion}.`, "entity", 0.7);
  }

  for (const statusCode of collectStatusCodeMatches(sentence)) {
    add(`Entity: status ${statusCode}.`, "entity", 0.7);
  }

  if (/\bfile\b/i.test(sentence)) {
    for (const file of collectLabeledValues(sentence, ["file"], "(?:`[^`]+`|[a-z0-9_.\\\\/-]+\\.[a-z0-9]+)")) {
      add(`Entity: file ${file}.`, "entity", 0.7);
    }
  }

  if (/\bflag\b/i.test(sentence)) {
    for (const flag of collectLabeledValues(sentence, ["flag", "cli flag", "command flag"], "(?:`[^`]+`|--?[a-z0-9][a-z0-9-]*)")) {
      add(`Entity: flag ${flag}.`, "entity", 0.68);
    }
  }

  if (/\btool\b/i.test(sentence)) {
    for (const tool of collectMatches(sentence, /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)) {
      add(`Entity: tool ${tool}.`, "entity", 0.68);
    }
  }

  if (/\bmodule\b/i.test(sentence)) {
    for (const moduleName of collectLabeledValues(sentence, ["module"], "(?:`[^`]+`|[a-z0-9_.:/-]+)")) {
      add(`Entity: module ${moduleName}.`, "entity", 0.68);
    }
  }

  if (/\b(package|library)\b/i.test(sentence)) {
    for (const packageName of collectLabeledValues(sentence, ["package", "library"], "(?:`[^`]+`|@?[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: package ${packageName}.`, "entity", 0.68);
    }
  }

  if (/\bservice\b/i.test(sentence)) {
    for (const serviceName of collectLabeledValues(sentence, ["service"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: service ${serviceName}.`, "entity", 0.68);
    }
  }

  if (/\bdatabase\b/i.test(sentence)) {
    for (const databaseName of collectLabeledValues(sentence, ["database", "db"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: database ${databaseName}.`, "entity", 0.68);
    }
  }

  if (/\bqueue\b/i.test(sentence)) {
    for (const queueName of collectLabeledValues(sentence, ["queue"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: queue ${queueName}.`, "entity", 0.68);
    }
  }

  if (/\bbucket\b/i.test(sentence)) {
    for (const bucketName of collectLabeledValues(sentence, ["bucket"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: bucket ${bucketName}.`, "entity", 0.68);
    }
  }

  if (/\btable\b/i.test(sentence)) {
    for (const tableName of collectLabeledValues(sentence, ["table"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: table ${tableName}.`, "entity", 0.68);
    }
  }

  if (/\btopic\b/i.test(sentence)) {
    for (const topicName of collectLabeledValues(sentence, ["topic"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: topic ${topicName}.`, "entity", 0.68);
    }
  }

  if (/\bhost\b/i.test(sentence)) {
    for (const hostName of collectLabeledValues(sentence, ["host"], "(?:`[^`]+`|[a-z0-9][a-z0-9.-]*)")) {
      add(`Entity: host ${hostName}.`, "entity", 0.68);
    }
  }

  if (/\bdomain\b/i.test(sentence)) {
    for (const domainName of collectLabeledValues(sentence, ["domain"], "(?:`[^`]+`|[a-z0-9][a-z0-9.-]*\\.[a-z]{2,})")) {
      add(`Entity: domain ${domainName}.`, "entity", 0.68);
    }
  }

  if (/\bregion\b/i.test(sentence)) {
    for (const regionName of collectLabeledValues(sentence, ["region"], "(?:`[^`]+`|[a-z]{2,}(?:-[a-z0-9]+)+)")) {
      add(`Entity: region ${regionName}.`, "entity", 0.68);
    }
  }

  if (/\bcluster\b/i.test(sentence)) {
    for (const clusterName of collectLabeledValues(sentence, ["cluster"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: cluster ${clusterName}.`, "entity", 0.68);
    }
  }

  if (/\bnamespace\b/i.test(sentence)) {
    for (const namespaceName of collectLabeledValues(sentence, ["namespace"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: namespace ${namespaceName}.`, "entity", 0.68);
    }
  }

  if (/\bschema\b/i.test(sentence)) {
    for (const schemaName of collectLabeledValues(sentence, ["schema"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: schema ${schemaName}.`, "entity", 0.68);
    }
  }

  if (/\bpod\b/i.test(sentence)) {
    for (const podName of collectLabeledValues(sentence, ["pod"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: pod ${podName}.`, "entity", 0.68);
    }
  }

  if (/\bdeployment\b/i.test(sentence)) {
    for (const deploymentName of collectLabeledValues(sentence, ["deployment"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: deployment ${deploymentName}.`, "entity", 0.68);
    }
  }

  if (/\bimage\b/i.test(sentence)) {
    for (const imageName of collectLabeledValues(sentence, ["image"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*(?::[a-z0-9._-]+)?)")) {
      add(`Entity: image ${imageName}.`, "entity", 0.68);
    }
  }

  if (/\bcontainer\b/i.test(sentence)) {
    for (const containerName of collectLabeledValues(sentence, ["container"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: container ${containerName}.`, "entity", 0.68);
    }
  }

  if (/\bjob\b/i.test(sentence)) {
    for (const jobName of collectLabeledValues(sentence, ["job"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: job ${jobName}.`, "entity", 0.68);
    }
  }

  if (/\bvolume\b/i.test(sentence)) {
    for (const volumeName of collectLabeledValues(sentence, ["volume"], "(?:`[^`]+`|[a-z0-9][a-z0-9._/-]*)")) {
      add(`Entity: volume ${volumeName}.`, "entity", 0.68);
    }
  }

  if (/\bfunction\b/i.test(sentence)) {
    for (const functionName of collectLabeledValues(sentence, ["function"], "(?:`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)")) {
      add(`Entity: function ${functionName}.`, "entity", 0.68);
    }
  }

  if (/\bclass\b/i.test(sentence)) {
    for (const className of collectLabeledValues(sentence, ["class"], "(?:`[^`]+`|[A-Z][A-Za-z0-9_]*)")) {
      add(`Entity: class ${className}.`, "entity", 0.68);
    }
  }

  if (/\brepo\b/i.test(sentence)) {
    for (const repo of collectLabeledValues(sentence, ["repo"], "(?:`[^`]+`|[a-z0-9_.-]+)")) {
      add(`Entity: repo ${repo}.`, "entity", 0.68);
    }
  }

  if (/\bproject\b/i.test(sentence)) {
    for (const project of collectLabeledValues(sentence, ["project"], "(?:`[^`]+`|[A-Za-z0-9_. -]+)")) {
      add(`Entity: project ${project}.`, "entity", 0.68);
    }
  }

  if (/\bbranch\b/i.test(sentence)) {
    for (const branch of collectLabeledValues(sentence, ["branch", "git branch"], "(?:`[^`]+`|[A-Za-z0-9._/-]+)")) {
      add(`Entity: branch ${branch}.`, "entity", 0.68);
    }
  }

  if (/\bcommit\b/i.test(sentence)) {
    for (const commit of [
      ...collectLabeledValues(sentence, ["commit"], "(?:`[^`]+`|[a-f0-9]{7,40})"),
      ...collectMatches(sentence, /\b[a-f0-9]{7,40}\b/gi),
    ]) {
      add(`Entity: commit ${commit}.`, "entity", 0.68);
    }
  }

  if (/\b(?:pr|pull request)\b/i.test(sentence)) {
    for (const pr of collectLabeledWorkItems(sentence, ["pr", "pull request"])) {
      add(`Entity: pr ${formatWorkItemValue(pr.value)}.`, "entity", 0.68);
    }
  }

  if (/\b(?:issue|ticket|bug)\b/i.test(sentence)) {
    for (const workItem of collectLabeledWorkItems(sentence, ["issue", "ticket", "bug"])) {
      add(`Entity: ${workItem.label} ${formatWorkItemValue(workItem.value)}.`, "entity", 0.68);
    }
  }

  if (/\b(command|run|rerun)\b/i.test(sentence)) {
    for (const command of collectCaptures(sentence, /`([^`]+)`/g)) {
      add(`Entity: command ${command}.`, "entity", 0.68);
    }
  }

  return memories;
}

function extractExplicitCategoryBodies(sentence: string): Array<[ExtractedMemoryCategory, string]> {
  const extracted: Array<[ExtractedMemoryCategory, string]> = [];
  const patterns: Array<[ExtractedMemoryCategory, RegExp[]]> = [
    ["fact", [
      /^(?:owner:\s*)(.+)$/i,
      /^(?:ownership:\s*)(.+)$/i,
      /^(?:responsibility:\s*)(.+)$/i,
      /^(?:contact:\s*)(.+)$/i,
      /^(?:remember(?: this)?(?: runtime)? fact:\s*)(.+)$/i,
      /^(?:runtime fact:\s*)(.+)$/i,
      /^(?:fact:\s*)(.+)$/i,
    ]],
    ["decision", [/^(?:decision:\s*)(.+)$/i]],
    ["advice", [/^(?:advice:\s*)(.+)$/i, /^(?:recommendation:\s*)(.+)$/i]],
    ["reasoning", [/^(?:reasoning:\s*)(.+)$/i, /^(?:rationale:\s*)(.+)$/i, /^(?:justification:\s*)(.+)$/i]],
    ["diagnostic", [/^(?:diagnostic:\s*)(.+)$/i, /^(?:root cause:\s*)(.+)$/i, /^(?:error:\s*)(.+)$/i, /^(?:failure:\s*)(.+)$/i]],
    ["procedure", [/^(?:procedure:\s*)(.+)$/i, /^(?:runbook:\s*)(.+)$/i, /^(?:playbook:\s*)(.+)$/i]],
    ["metric", [/^(?:metric:\s*)(.+)$/i, /^(?:budget:\s*)(.+)$/i, /^(?:latency:\s*)(.+)$/i]],
    ["preference", [/^(?:preference:\s*)(.+)$/i]],
    ["pattern", [/^(?:pattern:\s*)(.+)$/i]],
    ["constraint", [/^(?:constraint:\s*)(.+)$/i]],
    ["risk", [/^(?:risk:\s*)(.+)$/i, /^(?:caution:\s*)(.+)$/i]],
    ["change", [/^(?:change:\s*)(.+)$/i, /^(?:delta:\s*)(.+)$/i]],
    ["discovery", [/^(?:discovery:\s*)(.+)$/i, /^(?:insight:\s*)(.+)$/i, /^(?:lesson:\s*)(.+)$/i]],
    ["event", [/^(?:event:\s*)(.+)$/i, /^(?:timeline:\s*)(.+)$/i, /^(?:milestone:\s*)(.+)$/i]],
  ];

  for (const [category, categoryPatterns] of patterns) {
    for (const pattern of categoryPatterns) {
      const match = sentence.match(pattern);
      if (!match) continue;
      const body = normalizeHeuristicValue(match[1]);
      if (!body) continue;
      extracted.push([category, body]);
      break;
    }
  }

  return extracted;
}

function extractImplicitProcedureBody(sentence: string): string {
  const lower = sentence.toLowerCase();
  const startsOrdered = /^(?:first|1[.)]|step\s*1|to\s+\w+)/i.test(sentence);
  const hasFlow = /\bthen\b|\bnext\b|\bfinally\b|\bafter that\b|\band then\b/i.test(sentence);
  const hasAction = /\b(?:run|check|inspect|rerun|open|review|verify|restart|retry|apply|build|deploy|use|start|stop|edit|search|log)\b/i.test(sentence);
  if (hasAction && ((startsOrdered && hasFlow) || /\bfirst\b.*\bthen\b/i.test(lower))) {
    return normalizeHeuristicValue(sentence);
  }
  return "";
}

function extractImplicitCategoryBodies(sentence: string): Array<[ExtractedMemoryCategory, string]> {
  const extracted: Array<[ExtractedMemoryCategory, string]> = [];
  const resolutionPatterns = [
    /^(?:the\s+)?fix\s+was\s+(?:to\s+)?(.+)$/i,
    /^(?:the\s+)?workaround\s+was\s+(?:to\s+)?(.+)$/i,
    /^(?:workaround:\s*)(.+)$/i,
    /^(.+?\b(?:was|were)\s+fixed\s+by\s+.+)$/i,
    /^(.+?\b(?:was|were)\s+resolved\s+by\s+.+)$/i,
    /^(.+?\b(?:was|were)\s+solved\s+by\s+.+)$/i,
    /^(?:fixed|resolved|solved)\s+by\s+(.+)$/i,
  ];
  for (const pattern of resolutionPatterns) {
    const match = sentence.match(pattern);
    if (!match) continue;
    const body = normalizeHeuristicValue(match[1] ?? match[0]);
    if (body) extracted.push(["diagnostic", `Resolution: ${body}`]);
    return extracted;
  }

  const patterns: Array<[ExtractedMemoryCategory, RegExp[]]> = [
    ["decision", [
      /^(?:we\s+)?(?:decided|agreed|chose)\s+(?:to\s+)?(.+)$/i,
    ]],
    ["advice", [
      /^(?:we\s+should|you\s+should|should)\s+(.+)$/i,
    ]],
    ["reasoning", [
      /^(?:because|since)\s+(.+)$/i,
    ]],
    ["preference", [
      /^(?:we\s+)?prefer(?:red)?\s+(.+)$/i,
    ]],
    ["constraint", [
      /^(?:must|always|never)\s+(.+)$/i,
      /^(?:do\s+not|don't)\s+(.+)$/i,
    ]],
    ["risk", [
      /^(?:avoid|caution|watch\s+out)\s+(.+)$/i,
    ]],
    ["change", [
      /^(?:we\s+)?(?:changed|switched|moved)\s+(.+)$/i,
    ]],
    ["discovery", [
      /^(?:we\s+)?(?:learned|discovered|found)\s+(?:that\s+)?(.+)$/i,
    ]],
    ["diagnostic", [
      /^(?:root cause(?:\s+was)?|error came from|failure came from)\s+(.+)$/i,
    ]],
    ["fact", [
      /^(.+?\bowns\b\s+.+)$/i,
      /^(.+?\bis\s+responsible\s+for\s+.+)$/i,
      /^(.+?\bare\s+responsible\s+for\s+.+)$/i,
      /^(.+?\bis\s+accountable\s+for\s+.+)$/i,
      /^(.+?\bare\s+accountable\s+for\s+.+)$/i,
      /^(.+?\bis\s+the\s+(?:owner|contact|point\s+of\s+contact)\s+for\s+.+)$/i,
      /^(?:the\s+)?(?:runtime\s+detail|important\s+fact|fact)\s+(?:is|was|stays|stayed)\s+(.+)$/i,
    ]],
    ["pattern", [
      /^(?:the\s+)?(?:pattern|convention)\s+(?:is|was|stays|stayed)\s+(.+)$/i,
      /^(?:keep\s+the\s+pattern\s+where)\s+(.+)$/i,
    ]],
    ["event", [
      /^(?:the\s+)?(?:incident|event|milestone)\s+(?:is|was|stays|stayed)\s+(.+)$/i,
      /^(?:what\s+happened\s+was)\s+(.+)$/i,
    ]],
  ];

  for (const [category, categoryPatterns] of patterns) {
    for (const pattern of categoryPatterns) {
      const match = sentence.match(pattern);
      if (!match) continue;
      const preserveConstraintWording = category === "constraint"
        && /^(?:never|do\s+not|don't)\b/i.test(sentence);
      const body = normalizeHeuristicValue(preserveConstraintWording ? sentence : (match[1] ?? match[0]));
      if (!body) continue;
      extracted.push([category, body]);
      break;
    }
  }

  return extracted;
}

function extractImplicitProcedureSequence(content: string): string {
  const numberedSteps = content
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:\d+[.)]|step\s*\d+[:.)-]?)\s*(.+)$/i)?.[1]?.trim() ?? "")
    .filter((line) => line.length >= 4);
  if (numberedSteps.length >= 2) {
    const normalized = numberedSteps.map((step, index) => `Step ${index + 1}: ${normalizeHeuristicValue(step)}`);
    return normalized.join("; ");
  }

  const bulletSteps = content
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:[-*•]\s+)(.+)$/)?.[1]?.trim() ?? "")
    .filter((line) => line.length >= 4)
    .filter((line) => /\b(?:run|check|inspect|rerun|open|review|verify|restart|retry|apply|build|deploy|use|start|stop|edit|search|log)\b/i.test(line));
  if (bulletSteps.length >= 2) {
    const normalized = bulletSteps.map((step, index) => `Step ${index + 1}: ${normalizeHeuristicValue(step)}`);
    return normalized.join("; ");
  }

  return "";
}

function collectMatches(text: string, pattern: RegExp): string[] {
  const matches = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const value = normalizeHeuristicValue(match[0] ?? "");
    if (!value) continue;
    matches.add(value);
  }
  return [...matches];
}

function collectCaptures(text: string, pattern: RegExp): string[] {
  const matches = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const value = normalizeHeuristicValue(match[1] ?? "");
    if (!value) continue;
    matches.add(value);
  }
  return [...matches];
}

function collectLabeledValues(text: string, labels: string[], valuePattern: string): string[] {
  const matches = new Set<string>();
  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`\\b${escapedLabel}\\b\\s*(?:path|name|id)?\\s*(?:was|is|stayed|=|:)?\\s*(${valuePattern})`, "gi");
    for (const match of text.matchAll(pattern)) {
      const value = normalizeHeuristicValue(match[1] ?? "");
      if (!value) continue;
      matches.add(value);
    }
  }
  return [...matches];
}

function collectPathMatches(text: string, exclude: string[] = []): string[] {
  const candidates = new Set<string>();
  const excluded = new Set(exclude.map((value) => value.toLowerCase()));
  for (const match of text.matchAll(/(?:[A-Za-z]:\\|\/)[^\s,;()]+|(?:[a-z0-9_.-]+\/){1,}[a-z0-9_.-]+/gi)) {
    const value = normalizeHeuristicValue(match[0] ?? "");
    if (
      !value
      || excluded.has(value.toLowerCase())
      || /^https?:\/\//i.test(value)
      || /^\/\/.+/i.test(value)
      || text.includes(`https://${value}`)
      || text.includes(`http://${value}`)
      || value.length < 5
    ) continue;
    candidates.add(value);
  }
  return [...candidates];
}

function collectImplicitBranchMatches(text: string): string[] {
  const candidates = new Set<string>();
  if (!/\b(?:branch|commit|pull request|merged|merge|shipped|release|rollout|deploy(?:ed|ment)?)\b/i.test(text)) {
    return [];
  }

  for (const match of text.matchAll(/\b(?:on|from)\s+([A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+)\b/gi)) {
    const value = normalizeHeuristicValue(match[1] ?? "");
    if (!value || /^https?:\/\//i.test(value) || value.length < 5) continue;
    candidates.add(value);
  }

  return [...candidates];
}

function collectProviderLikeMatches(text: string): string[] {
  const candidates = new Set<string>();
  for (const value of collectCaptures(text, /\bprovider(?:\s+(?:name|id|model))?\s*(?:was|is|stayed|=|:)?\s*([a-z0-9][a-z0-9.-]*)\b/gi)) {
    candidates.add(value);
  }
  if (candidates.size === 0) {
    for (const value of collectMatches(text, /\b(?:openai|anthropic|gemini|ollama|azure|vertex|bedrock|mistral|deepseek|gpt-[a-z0-9.-]+|claude-[a-z0-9.-]+|gemini-[a-z0-9.-]+|llama[0-9.-]*|qwen[0-9.-]*|o[1-9](?:-[a-z0-9.-]+)?)\b/gi)) {
      candidates.add(value);
    }
  }
  return [...candidates];
}

function collectRuntimeVersionMatches(text: string): string[] {
  const candidates = new Set<string>();

  for (const match of text.matchAll(/\b(bun|node(?:\.js)?|python|typescript|tsc)\s*(?:version\s*)?(?:was|is|stayed|=|:)?\s*v?(\d+\.\d+(?:\.\d+)*)\b/gi)) {
    const runtime = normalizeHeuristicValue(match[1] ?? "").toLowerCase();
    const version = normalizeHeuristicValue(match[2] ?? "");
    if (!runtime || !version) continue;
    candidates.add(`${runtime.replace(/\.js$/i, "")} ${version}`);
  }

  for (const match of text.matchAll(/\bversion\s*(?:was|is|stayed|=|:)?\s*((?:bun|node(?:\.js)?|python|typescript|tsc)\s+v?\d+\.\d+(?:\.\d+)*)\b/gi)) {
    const normalized = normalizeHeuristicValue(match[1] ?? "").replace(/\.js/gi, "").replace(/\bv/i, "");
    if (!normalized) continue;
    candidates.add(normalized.toLowerCase());
  }

  return [...candidates];
}

function collectLabeledWorkItems(text: string, labels: string[]): Array<{ label: string; value: string }> {
  const candidates = new Map<string, { label: string; value: string }>();

  for (const label of labels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`\\b${escapedLabel}\\b\\s*(?:number|id)?\\s*(?:was|is|stayed|=|:)?\\s*(#?(?:\\d+|[A-Z][A-Z0-9]+-\\d+))`, "gi");
    for (const match of text.matchAll(pattern)) {
      const value = normalizeHeuristicValue(match[1] ?? "");
      if (!value) continue;
      const normalizedValue = value.replace(/^#/, "");
      const key = `${label}:${normalizedValue.toLowerCase()}`;
      if (candidates.has(key)) continue;
      candidates.set(key, { label, value: normalizedValue });
    }
  }

  return [...candidates.values()];
}

function formatWorkItemValue(value: string): string {
  return /^\d+$/.test(value) ? `#${value}` : value;
}

function collectStatusCodeMatches(text: string): string[] {
  const candidates = new Set<string>();

  for (const code of collectCaptures(text, /\bexit code\s*(?:was|is|stayed|=|:)?\s*(\d{1,3})\b/gi)) {
    candidates.add(`exit ${code}`);
  }

  for (const code of collectCaptures(text, /\b(?:http status|status code|status)\s*(?:was|is|stayed|=|:)?\s*(\d{3})\b/gi)) {
    candidates.add(`http ${code}`);
  }

  for (const code of collectCaptures(text, /\b(?:errno|error code)\s*(?:was|is|stayed|=|:)?\s*([A-Z][A-Z0-9_]{2,})\b/g)) {
    candidates.add(`error ${code}`);
  }

  for (const code of collectMatches(text, /\b(?:EACCES|EADDRINUSE|ECONNREFUSED|ECONNRESET|EEXIST|EHOSTUNREACH|EISDIR|EMFILE|ENOENT|ENOMEM|ENOSPC|EPERM|ETIMEDOUT)\b/g)) {
    candidates.add(`error ${code}`);
  }

  return [...candidates];
}

function collectConcreteMetricMatches(text: string): string[] {
  const candidates = new Set<string>();

  for (const match of text.matchAll(/\bslo\s+(p(?:50|75|90|95|99))\s+latency\s*(?:(?:was|is|stayed)\s+)?(?:under|at|<=?|=|:)?\s*(\d+(?:\.\d+)?(?:ms|s|m|min|h))\b/gi)) {
    const percentile = normalizeHeuristicValue(match[1] ?? "").toLowerCase();
    const value = normalizeHeuristicValue(match[2] ?? "").toLowerCase();
    if (percentile && value) candidates.add(`slo ${percentile} latency ${value}`);
  }

  for (const match of text.matchAll(/\berror\s+budget\s*(?:(?:was|is|stayed)\s+)?(?:under|at|<=?|=|:)?\s*(\d+(?:\.\d+)?%?)(?=\s|,|;|\.|$)/gi)) {
    const value = normalizeHeuristicValue(match[1] ?? "").toLowerCase();
    if (value) candidates.add(`error budget ${value}`);
  }

  for (const match of text.matchAll(/\bthroughput(?:\s+(?:target|budget|quota))?\s*(?:was|is|stayed|under|at|<=?|=|:)?\s*(\d+(?:\.\d+)?\s*(?:rps|rpm|qps|req\/s|requests\/s|ops\/s))\b/gi)) {
    const value = normalizeHeuristicValue(match[1] ?? "").toLowerCase().replace(/\s+/g, " ");
    if (value) candidates.add(`throughput target ${value}`);
  }

  const patterns: Array<[string, RegExp]> = [
    ["latency", /\blatency(?:\s+budget)?\s*(?:was|is|stayed|under|at|=|:)?\s*(\d+(?:\.\d+)?(?:ms|s|m|min|h))\b/gi],
    ["timeout", /\btimeout(?:\s+budget|\s+limit)?\s*(?:was|is|stayed|under|at|=|:)?\s*(\d+(?:\.\d+)?(?:ms|s|m|min|h))\b/gi],
    ["retry window", /\bretry\s+window\s*(?:was|is|stayed|under|at|=|:)?\s*(\d+(?:\.\d+)?(?:ms|s|m|min|h))\b/gi],
    ["token budget", /\btoken\s+(?:budget|limit|quota)\s*(?:was|is|stayed|under|at|=|:)?\s*(\$?\d+(?:\.\d+)?k?)\b/gi],
    ["memory limit", /\bmemory\s+(?:budget|limit)\s*(?:was|is|stayed|under|at|=|:)?\s*(\d+(?:\.\d+)?(?:kb|mb|gb|tb))\b/gi],
    ["cost budget", /\bcost\s+budget\s*(?:was|is|stayed|under|at|=|:)?\s*(\$?\d+(?:\.\d+)?)\b/gi],
  ];

  for (const [label, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = normalizeHeuristicValue(match[1] ?? "").toLowerCase();
      if (!value) continue;
      candidates.add(`${label} ${value}`);
    }
  }

  return [...candidates];
}

function normalizeHeuristicValue(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),;:.!?]+$/g, "")
    .trim();
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
    "session",
  ]);
  const keywords = new Set<string>();
  for (const rawToken of text.toLowerCase().match(/[a-z0-9_.:/-]+/g) ?? []) {
    const token = rawToken.trim();
    if (!token) continue;
    if (token.length >= 3 && !stops.has(token)) {
      keywords.add(token);
      addWorkItemAliasKeywords(keywords, token);
    }
    const collapsed = token.replace(/[^a-z0-9]/g, "");
    if (collapsed.length >= 3 && !stops.has(collapsed)) {
      keywords.add(collapsed);
      addWorkItemAliasKeywords(keywords, collapsed);
    }
    for (const part of token.split(/[^a-z0-9]+/g)) {
      if (part.length >= 3 && !stops.has(part)) {
        keywords.add(part);
        addWorkItemAliasKeywords(keywords, part);
      }
    }
  }
  return keywords;
}

function addWorkItemAliasKeywords(keywords: Set<string>, token: string): void {
  const normalized = token.toLowerCase();
  if (normalized === "issue" || normalized === "ticket" || normalized === "bug" || normalized === "bugs") {
    keywords.add("issue");
    keywords.add("ticket");
    keywords.add("bug");
    keywords.add("bugs");
  }
  if (normalized === "pr" || normalized === "pullrequest") {
    keywords.add("pr");
    keywords.add("pullrequest");
  }
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

function normalizeExtractedMemoryCategory(value: unknown): ExtractedMemoryCategory | null {
  if (isCategory(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, ExtractedMemoryCategory> = {
    advice: "advice",
    architecture: "pattern",
    bug: "diagnostic",
    bugs: "diagnostic",
    caution: "risk",
    cautions: "risk",
    class: "entity",
    classes: "entity",
    command: "entity",
    commands: "entity",
    crash: "diagnostic",
    crashes: "diagnostic",
    diagnostic: "diagnostic",
    diagnostics: "diagnostic",
    budget: "metric",
    budgets: "metric",
    cost: "metric",
    costs: "metric",
    playbook: "procedure",
    playbooks: "procedure",
    justification: "reasoning",
    justifications: "reasoning",
    delta: "change",
    deltas: "change",
    discovery: "discovery",
    discoveries: "discovery",
    error: "diagnostic",
    errors: "diagnostic",
    entity: "entity",
    entities: "entity",
    event: "event",
    events: "event",
    exception: "diagnostic",
    exceptions: "diagnostic",
    fact: "fact",
    facts: "fact",
    owner: "fact",
    owners: "fact",
    ownership: "fact",
    responsible: "fact",
    responsibility: "fact",
    accountable: "fact",
    accountability: "fact",
    contact: "fact",
    contacts: "fact",
    failure: "diagnostic",
    failures: "diagnostic",
    endpoint: "entity",
    endpoints: "entity",
    file: "entity",
    files: "entity",
    flag: "entity",
    flags: "entity",
    latency: "metric",
    function: "entity",
    functions: "entity",
    incident: "event",
    incidents: "event",
    insight: "discovery",
    insights: "discovery",
    issue: "diagnostic",
    issues: "diagnostic",
    lesson: "discovery",
    lessons: "discovery",
    motivation: "reasoning",
    motivations: "reasoning",
    metric: "metric",
    metrics: "metric",
    milestone: "event",
    milestones: "event",
    model: "entity",
    models: "entity",
    module: "entity",
    modules: "entity",
    path: "entity",
    paths: "entity",
    performance: "metric",
    perf: "metric",
    port: "entity",
    ports: "entity",
    procedure: "procedure",
    procedures: "procedure",
    project: "entity",
    projects: "entity",
    provider: "entity",
    providers: "entity",
    url: "entity",
    urls: "entity",
    quota: "metric",
    quotas: "metric",
    rationale: "reasoning",
    rationales: "reasoning",
    rate: "metric",
    rates: "metric",
    "rate limit": "metric",
    "rate limits": "metric",
    "rate-limit": "metric",
    "rate-limits": "metric",
    recommendation: "advice",
    recommendations: "advice",
    reason: "reasoning",
    reasons: "reasoning",
    repo: "entity",
    repos: "entity",
    runbook: "procedure",
    runbooks: "procedure",
    "root cause": "diagnostic",
    "root causes": "diagnostic",
    "root-cause": "diagnostic",
    "root-causes": "diagnostic",
    process: "procedure",
    processes: "procedure",
    step: "procedure",
    steps: "procedure",
    "step by step": "procedure",
    "step-by-step": "procedure",
    stacktrace: "diagnostic",
    traceback: "diagnostic",
    timeline: "event",
    timelines: "event",
    token: "metric",
    tokens: "metric",
    tool: "entity",
    tools: "entity",
    throughput: "metric",
    throughputs: "metric",
    tradeoff: "reasoning",
    tradeoffs: "reasoning",
    "trade-off": "reasoning",
    "trade-offs": "reasoning",
    threshold: "metric",
    thresholds: "metric",
  };
  return aliases[normalized] ?? null;
}

function normalizeSourceTurn(value: unknown, maxSourceTurn: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  if (normalized < 0) return 0;
  if (normalized > maxSourceTurn) return maxSourceTurn;
  return normalized;
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
    content: sanitizeExtractedText(value.content),
    scope: value.scope,
    agentId: sanitizeExtractedText(value.agentId),
    category: value.category,
    confidence: value.confidence,
    sourceTurn: value.sourceTurn,
    source: value.source === "keyword" || value.source === "llm" ? value.source : "unknown",
    contentHash: sanitizeExtractedText(value.contentHash),
    timestamp: value.timestamp,
    sessionId: sanitizeExtractedText(value.sessionId),
    caste: sanitizeExtractedText(value.caste),
    filePath: sanitizeExtractedText(typeof value.filePath === "string" && value.filePath.length > 0 ? value.filePath : filePath),
  };
}
