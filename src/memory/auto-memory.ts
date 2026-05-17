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
import { inferMemorySessionScopePreference, inferMemoryTimePreference, scoreLiteralPhraseMatch } from "./hybrid-memory";
import { hasAdviceIntent, hasComparisonIntent, hasConstraintIntent, hasDecisionIntent, hasDiagnosticIntent, hasDiscoveryIntent, hasEntityIntent, hasEventIntent, hasFactIntent, hasMetricIntent, hasPatternIntent, hasPreferenceIntent, hasProcedureIntent, hasReasoningIntent, hasRiskIntent } from "./query-intent";

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
    "implementation", "decision", "constraint", "metric", "budget", "latency", "procedure", "runbook", "playbook", "bug", "tool",
    "provider", "session", "context",
  ],
};

const MARKDOWN_MEMORY_INTENT_HINTS: Record<string, string[]> = {
  advice: ["advice", "recommend", "recommendation", "should", "best way", "what should", "how should"],
  reasoning: ["why", "reason", "rationale", "because", "justify", "justification", "motivation", "tradeoff", "trade-off"],
  diagnostic: ["error", "failed", "failure", "failing", "root cause", "root-cause", "diagnostic", "exception", "traceback", "stack trace", "stacktrace", "crash"],
  entity: ["which file", "what file", "file path", "which path", "what path", "which env var", "what env var", "environment variable", "env var", "env vars", "which flag", "what flag", "cli flag", "command flag", "which endpoint", "what endpoint", "endpoint", "endpoints", "which url", "what url", "url", "urls", "which port", "what port", "port", "ports", "which provider", "what provider", "which model", "what model", "which tool", "what tool", "which command", "what command", "which function", "what function", "which class", "what class", "which module", "what module", "which repo", "what repo", "which project", "what project", "which service", "what service", "service", "which database", "what database", "database", "which queue", "what queue", "queue", "which bucket", "what bucket", "bucket", "which table", "what table", "table", "which topic", "what topic", "topic", "which host", "what host", "host", "which domain", "what domain", "domain", "which region", "what region", "region", "which cluster", "what cluster", "cluster", "which namespace", "what namespace", "namespace", "which schema", "what schema", "schema", "which pod", "what pod", "pod", "which deployment", "what deployment", "deployment", "which image", "what image", "image", "which container", "what container", "container", "which job", "what job", "job", "which volume", "what volume", "volume", "which package", "what package", "package", "which library", "what library", "library", "which branch", "what branch", "which commit", "what commit", "which pull request", "what pull request", "pull request", "which issue", "what issue", "which ticket", "what ticket", "which bug", "what bug", "bug id", "which exit code", "what exit code", "which status code", "what status code", "which http status", "what http status", "which errno", "what errno", "which bun version", "what bun version", "which node version", "what node version", "which python version", "what python version", "which typescript version", "what typescript version", "which tsc version", "what tsc version", "runtime version", "toolchain version", "provider", "model", "tool", "file", "path", "command", "module", "function", "class"],
  metric: ["metric", "latency", "performance", "perf", "budget", "cost", "token usage", "token count", "throughput", "threshold", "quota", "rate limit", "rate-limit"],
  procedure: ["procedure", "runbook", "playbook", "step by step", "step-by-step", "steps", "steps to", "process"],
  decision: ["decision", "decide", "decided", "agreed", "chose", "chosen"],
  preference: ["prefer", "preference", "like", "dislike", "habit", "style"],
  constraint: ["constraint", "rule", "requirement", "must", "never", "always", "forbidden"],
  risk: ["risk", "avoid", "unsafe", "danger", "dangerous", "watch out", "pitfall", "gotcha", "caution"],
  change: ["change", "changed", "difference", "before", "after", "delta", "switched", "instead"],
  pattern: ["pattern", "convention", "architecture", "architectural", "design", "workflow"],
  fact: ["fact", "remember", "environment", "runtime", "detail", "status", "because"],
  discovery: ["learn", "learned", "discover", "discovered", "discovery", "insight", "breakthrough"],
  event: ["event", "happened", "incident", "timeline", "milestone", "debug session"],
};

type MarkdownMemoryCategory = keyof typeof MARKDOWN_MEMORY_INTENT_HINTS;

const LLM_MEMORY_CATEGORY_LABELS: Record<MarkdownMemoryCategory, string> = {
  advice: "advice note",
  reasoning: "reasoning note",
  diagnostic: "diagnostic note",
  entity: "entity note",
  metric: "metric note",
  procedure: "procedure note",
  decision: "decision note",
  preference: "preference note",
  constraint: "constraint note",
  risk: "risk note",
  change: "change note",
  pattern: "pattern note",
  fact: "fact note",
  discovery: "discovery note",
  event: "event note",
};

interface ParsedMarkdownConversation {
  text: string;
  paragraphSourceTurns: number[];
  maxSourceTurn: number;
}

const HEURISTIC_MEMORY_PATTERNS: Array<{ topicPrefix: string; hints: string[] }> = [
  { topicPrefix: "advice note", hints: ["advice", "recommend", "recommendation", "should", "best way", "what should", "how should"] },
  { topicPrefix: "reasoning note", hints: ["why", "reason", "rationale", "because", "justify", "justification", "motivation", "tradeoff", "trade-off"] },
  { topicPrefix: "diagnostic note", hints: ["error", "failed", "failure", "failing", "root cause", "root-cause", "diagnostic", "exception", "traceback", "stack trace", "stacktrace", "crash"] },
  { topicPrefix: "entity note", hints: ["provider", "model", "tool", "file path", "path", "environment variable", "env var", "flag", "endpoint", "url", "port", "command", "module", "function", "class", "service", "database", "queue", "bucket", "table", "topic", "host", "domain", "region", "cluster", "namespace", "schema", "pod", "deployment", "image", "container", "job", "volume", "package", "library", "branch", "commit", "pull request", "issue", "ticket", "bug id", "exit code", "status code", "http status", "errno", "runtime version", "toolchain version", "bun version", "node version", "python version", "typescript version", "tsc version"] },
  { topicPrefix: "metric note", hints: ["metric", "latency", "performance", "perf", "budget", "cost", "token", "throughput", "threshold", "quota", "rate limit", "rate-limit", "ms", "%"] },
  { topicPrefix: "procedure note", hints: ["procedure", "runbook", "playbook", "step by step", "step-by-step", "steps", "steps to", "process", "first", "then", "finally"] },
  { topicPrefix: "risk note", hints: ["risk", "avoid", "unsafe", "danger", "dangerous", "watch out", "pitfall", "gotcha", "caution"] },
  { topicPrefix: "change note", hints: ["change", "changed", "difference", "before", "after", "delta", "switched", "instead"] },
  { topicPrefix: "discovery note", hints: ["learned", "learn", "discover", "discovered", "discovery", "insight", "breakthrough"] },
  { topicPrefix: "event note", hints: ["happened", "incident", "timeline", "milestone", "debug session", "recovered", "failed first"] },
];

export interface MemoryEntry {
  topic: string;
  content: string;
  caste: string;
  agentId: string;
  sessionId: string;
  timestamp: number;
  sourceTurn: number;
  source?: "heuristic" | "llm" | "unknown";
  matchScore?: number;
  matchReasons?: string[];
  relevanceKeywords: string[];
  filePath: string;
}

export interface SurfaceRelevantOptions {
  query?: string;
  contextKeywords?: string[];
  caste?: string;
  sessionId?: string;
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
    const meta = `<!-- agent:${entry.agentId} session:${entry.sessionId} ts:${entry.timestamp} turn:${entry.sourceTurn} source:${entry.source ?? "unknown"} -->\n\n`;
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
    const sessionId = opts.sessionId ?? "";
    const maxFiles = opts.maxFiles ?? MAX_FILES_PER_TURN;
    const maxBytes = opts.maxBytes ?? MAX_BYTES_PER_SESSION;
    const sessionScopePreference = inferMemorySessionScopePreference(query);
    const timePreference = inferMemoryTimePreference(query);
    const intentHints = inferMarkdownMemoryIntentHints(query);

    const allKeywords = new Set<string>();
    for (const keyword of extractKeywords(query)) allKeywords.add(keyword);
    for (const keyword of contextKeywords) allKeywords.add(keyword.toLowerCase());

    const candidates: Array<{ score: number; entry: MemoryEntry; reasons: string[] }> = [];
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

        const parsedEntries = parseStoredMemoryEntries(
          content,
          currentCaste,
          filePath,
          entry.name.replace(/\.md$/i, "").replace(/_/g, " "),
        );
        if (parsedEntries.length === 0) continue;

        for (const memoryEntry of parsedEntries) {
          const fileKeywords = new Set<string>([
            ...memoryEntry.relevanceKeywords,
            ...extractKeywords(memoryEntry.topic),
          ]);
          const overlap = [...allKeywords].filter((keyword) => fileKeywords.has(keyword));
          const keywordScore = overlap.length / Math.max(allKeywords.size, 1);
          const phraseScore = scoreLiteralPhraseMatch(memoryEntry.content, query);
          let score = Math.max(keywordScore, phraseScore);
          const reasons: string[] = [];
          if (overlap.length > 0) reasons.push("keyword-overlap");
          if (phraseScore > 0 && phraseScore >= keywordScore) reasons.push("literal-phrase");
          const loweredTopicContent = `${memoryEntry.topic} ${memoryEntry.content}`.toLowerCase();
          if (intentHints.size > 0) {
            const matchedIntent = [...intentHints].some((hint) => loweredTopicContent.includes(hint));
            score += matchedIntent ? 0.9 : -0.15;
            if (matchedIntent) reasons.push("intent-match");
          }
          const preferredCategory = inferPrimaryMarkdownCategory(query);
          const entryCategory = inferMarkdownEntryCategory(memoryEntry);
          if (preferredCategory && entryCategory === preferredCategory) {
            score += 0.95;
            reasons.push(`category-${preferredCategory}`);
          } else if (preferredCategory && entryCategory && entryCategory !== preferredCategory) {
            score -= 0.18;
          }
          if (memoryEntry.sessionId && memoryEntry.sessionId === sessionId && sessionScopePreference === "current") {
            score += 0.8;
            reasons.push("session-current");
          } else if (memoryEntry.sessionId && memoryEntry.sessionId !== sessionId && sessionScopePreference === "archived") {
            score += 0.55;
            reasons.push("session-archived");
          } else if (memoryEntry.sessionId && memoryEntry.sessionId === sessionId && sessionScopePreference === "archived") {
            score -= 0.25;
          } else if (memoryEntry.sessionId && memoryEntry.sessionId !== sessionId && sessionScopePreference === "current") {
            score -= 0.15;
          }

          if (score > 0 || allKeywords.size === 0) {
            totalBytes += sizeBytes(memoryEntry.content);
            candidates.push({
              score,
              entry: memoryEntry,
              reasons,
            });
          }
        }
      }
    }

    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.entry.timestamp - left.entry.timestamp;
    });
    if (timePreference != null) {
      const ordered = [...candidates].sort((left, right) => (
        timePreference === "recent"
          ? right.entry.timestamp - left.entry.timestamp
          : left.entry.timestamp - right.entry.timestamp
      ));
      const maxBoost = 0.24;
      const step = Math.max(0.04, maxBoost / Math.max(1, ordered.length));
      for (const [index, item] of ordered.entries()) {
        item.score += Math.max(0, maxBoost - index * step);
        if (timePreference === "recent") item.reasons.push("time-recent");
        else item.reasons.push("time-oldest");
      }
      candidates.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.entry.timestamp - left.entry.timestamp;
      });
    }
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

    return ranked.slice(0, maxFiles).map((entry) => {
      const scored = candidates.find((item) => item.entry.filePath === entry.filePath && item.entry.topic === entry.topic && item.entry.sessionId === entry.sessionId);
      return {
        ...entry,
        ...(scored ? { matchScore: scored.score } : {}),
        ...(scored ? { matchReasons: scored.reasons } : {}),
      };
    });
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

    const conversation = parseConversationForMemory(messages);
    if (conversation.text.length < 100) return [];

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
    conversation: ParsedMarkdownConversation,
    agentId: string,
    caste: string,
    sessionId: string,
  ): Promise<MemoryEntry[]> {
    if (!this._llmExtract) return this._extractHeuristic(conversation, agentId, caste, sessionId);

    const systemPrompt = [
      "Extract 1-5 key learnings from this conversation for future sessions.",
      "Choose the most specific CATEGORY for each memory from:",
      "advice, reasoning, diagnostic, entity, metric, procedure, decision, preference, constraint, risk, change, pattern, fact, discovery, event",
      "Format each as:",
      "CATEGORY: <one allowed category>",
      "TOPIC: <short topic>",
      "CONTENT: <1-3 paragraph summary>",
      "KEYWORDS: <comma-separated keywords>",
      "SOURCE_TURN: <turn number from [turn:N role] markers>",
      "Focus on patterns, decisions, gotchas, reusable insights, discoveries, timelines, changes, and risks.",
    ].join("\n");

    try {
      const response = await Promise.resolve(this._llmExtract(systemPrompt, conversation.text.slice(0, 8000)));
      return parseLlmMemories(response, agentId, caste, sessionId, conversation.maxSourceTurn);
    } catch {
      return this._extractHeuristic(conversation, agentId, caste, sessionId);
    }
  }

  private _extractHeuristic(
    conversation: ParsedMarkdownConversation,
    agentId: string,
    caste: string,
    sessionId: string,
  ): MemoryEntry[] {
    const topics = CASTE_MEMORY_TOPICS[caste.toLowerCase()] ?? CASTE_MEMORY_TOPICS.assist_ant;
    const entries: MemoryEntry[] = [];
    const paragraphs = conversation.text.split(/\n\n+/);
    const scored: Array<{ score: number; paragraph: string; topicPrefix?: string }> = [];

    for (const paragraph of paragraphs) {
      if (paragraph.length < 50) continue;
      const topicScore = topics.reduce(
        (sum, topic) => sum + (paragraph.toLowerCase().includes(topic.toLowerCase()) ? 1 : 0),
        0,
      );
      const lower = paragraph.toLowerCase();
      const patternScores = HEURISTIC_MEMORY_PATTERNS.map((pattern) => ({
        topicPrefix: pattern.topicPrefix,
        score: pattern.hints.reduce((sum, hint) => sum + (lower.includes(hint) ? 1 : 0), 0),
      })).sort((left, right) => right.score - left.score);
      const bestPattern = patternScores[0];
      const score = topicScore + ((bestPattern?.score ?? 0) * 1.25);
      if (score > 0) scored.push({ score, paragraph, topicPrefix: bestPattern?.score ? bestPattern.topicPrefix : undefined });
    }

    scored.sort((left, right) => right.score - left.score);

    for (const item of scored.slice(0, 3)) {
      const firstLine = item.paragraph.trim().split("\n")[0]?.slice(0, 80) ?? "";
      const topicBase = firstLine.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || `${caste || "memory"}_insight_${entries.length}`;
      const topic = item.topicPrefix ? `${item.topicPrefix} ${topicBase}`.slice(0, 60) : topicBase;
      entries.push({
        topic,
        content: item.paragraph.trim(),
        caste: caste.toLowerCase(),
        agentId,
        sessionId,
        timestamp: Date.now() / 1000,
        sourceTurn: inferParagraphSourceTurn(item.paragraph, paragraphs, conversation.paragraphSourceTurns),
        source: "heuristic",
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
  const stops = new Set([
    "this", "that", "with", "from", "have", "been", "would",
    "which", "their", "about", "could", "there", "other",
    "than", "then", "when", "what", "will", "into",
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

function parseStoredMemoryEntries(
  content: string,
  caste: string,
  filePath: string,
  fallbackTopic: string,
): MemoryEntry[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const headerMatch = normalized.match(/^#\s+(.+?)\n/);
  const topic = sanitizeMemoryText(headerMatch?.[1]?.trim() || fallbackTopic);
  const safeCaste = sanitizeMemoryText(caste);
  const body = normalized.replace(/^#\s+.+?\n+/, "");
  const chunks = body.split(/\n---\n+/).map((chunk) => chunk.trim()).filter(Boolean);
  const parsed: MemoryEntry[] = [];

  for (const chunk of chunks) {
    const metaMatch = chunk.match(/^<!--\s*agent:(.*?)\s+session:(.*?)\s+ts:(.*?)\s+turn:(.*?)\s+(?:source:(.*?))?\s*-->\s*\n*/s);
    const metadata = metaMatch
      ? {
        agentId: metaMatch[1]?.trim() ?? "",
        sessionId: metaMatch[2]?.trim() ?? "",
        timestamp: Number(metaMatch[3]?.trim() ?? "0"),
        sourceTurn: Number(metaMatch[4]?.trim() ?? "0"),
        source: metaMatch[5]?.trim() || "unknown",
      }
      : { agentId: "", sessionId: "", timestamp: 0, sourceTurn: 0, source: "unknown" };
    const entryContent = chunk.replace(/^<!--[\s\S]*?-->\s*\n*/s, "").trim();
    if (!entryContent) continue;
    const safeEntryContent = sanitizeMemoryText(entryContent);
    const safeAgentId = sanitizeMemoryText(metadata.agentId);
    const safeSessionId = sanitizeMemoryText(metadata.sessionId);
    const safeSource = sanitizeMemoryText(metadata.source);
    parsed.push({
      topic,
      content: safeEntryContent,
      caste: safeCaste,
      agentId: safeAgentId,
      sessionId: safeSessionId,
      timestamp: Number.isFinite(metadata.timestamp) ? metadata.timestamp : 0,
      sourceTurn: Number.isFinite(metadata.sourceTurn) ? metadata.sourceTurn : 0,
      source: safeSource === "heuristic" || safeSource === "llm" ? safeSource : "unknown",
      relevanceKeywords: [...extractKeywords(`${topic} ${safeEntryContent}`)].slice(0, 12),
      filePath: sanitizeMemoryText(filePath),
    });
  }

  if (parsed.length > 0) return parsed;
  const safeNormalized = sanitizeMemoryText(normalized);
  return [{
    topic,
    content: safeNormalized,
    caste: safeCaste,
    agentId: "",
    sessionId: "",
    timestamp: 0,
    sourceTurn: 0,
    source: "unknown",
    relevanceKeywords: [...extractKeywords(`${topic} ${safeNormalized}`)].slice(0, 12),
    filePath: sanitizeMemoryText(filePath),
  }];
}

function inferMarkdownMemoryIntentHints(query: string): Set<string> {
  const lower = query.toLowerCase();
  const hints = new Set<string>();
  for (const group of Object.values(MARKDOWN_MEMORY_INTENT_HINTS)) {
    for (const hint of group) {
      if (lower.includes(hint)) {
        for (const member of group) hints.add(member);
        break;
      }
    }
  }
  if (hasReasoningIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.reasoning) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.decision) hints.add(member);
  }
  if (hasDiagnosticIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.diagnostic) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasEntityIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.entity) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasMetricIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.metric) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasProcedureIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.procedure) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.advice) hints.add(member);
  }
  if (hasDecisionIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.decision) hints.add(member);
  }
  if (hasAdviceIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.advice) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.constraint) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.preference) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.pattern) hints.add(member);
  }
  if (hasRiskIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.risk) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.pattern) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasComparisonIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.change) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.pattern) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasPreferenceIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.preference) hints.add(member);
  }
  if (hasEventIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.event) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.pattern) hints.add(member);
  }
  if (hasConstraintIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.constraint) hints.add(member);
  }
  if (hasDiscoveryIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.discovery) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.pattern) hints.add(member);
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasFactIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.fact) hints.add(member);
  }
  if (hasPatternIntent(query)) {
    for (const member of MARKDOWN_MEMORY_INTENT_HINTS.pattern) hints.add(member);
  }
  return hints;
}

function parseConversationForMemory(messages: MessageShape[]): ParsedMarkdownConversation {
  const parts: string[] = [];
  const paragraphSourceTurns: number[] = [];
  let maxSourceTurn = 0;

  for (const [index, message] of messages.entries()) {
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

    if (content) {
      parts.push(`[turn:${index} ${role}]: ${content}`);
      paragraphSourceTurns.push(index);
      maxSourceTurn = index;
    }
  }

  return {
    text: parts.join("\n\n"),
    paragraphSourceTurns,
    maxSourceTurn,
  };
}

function parseLlmMemories(
  response: string,
  agentId: string,
  caste: string,
  sessionId: string,
  maxSourceTurn: number,
): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  let currentCategory: MarkdownMemoryCategory | null = null;
  let currentTopic = "";
  let currentContent = "";
  let currentKeywords: string[] = [];
  let currentSourceTurn = 0;

  const pushCurrent = () => {
    if (!currentTopic || !currentContent) return;
    const categoryHints = currentCategory ? MARKDOWN_MEMORY_INTENT_HINTS[currentCategory] ?? [] : [];
    const relevanceKeywords = Array.from(new Set([
      ...currentKeywords,
      ...(currentCategory ? [currentCategory] : []),
      ...categoryHints,
    ]));
    entries.push({
      topic: formatLlmMemoryTopic(currentTopic, currentCategory),
      content: currentContent.trim(),
      caste: caste.toLowerCase(),
      agentId,
      sessionId,
      timestamp: Date.now() / 1000,
      sourceTurn: currentSourceTurn,
      source: "llm",
      relevanceKeywords,
      filePath: "",
    });
    currentCategory = null;
    currentTopic = "";
    currentContent = "";
    currentKeywords = [];
    currentSourceTurn = 0;
  };

  for (const rawLine of response.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("CATEGORY:")) {
      pushCurrent();
      currentCategory = normalizeMarkdownMemoryCategory(line.slice(9).trim());
      continue;
    }

    if (line.startsWith("TOPIC:")) {
      pushCurrent();
      currentTopic = line.slice(6).trim();
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

    if (line.startsWith("SOURCE_TURN:")) {
      currentSourceTurn = normalizeMarkdownSourceTurn(line.slice(12).trim(), maxSourceTurn);
      continue;
    }

    if (currentTopic) {
      currentContent += `${currentContent ? "\n" : ""}${line}`;
    }
  }

  pushCurrent();

  return entries;
}

function normalizeMarkdownMemoryCategory(value: string): MarkdownMemoryCategory | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const aliases: Record<string, MarkdownMemoryCategory> = {
    advice: "advice",
    bug: "entity",
    bugs: "entity",
    branch: "entity",
    branches: "entity",
    caution: "risk",
    cautions: "risk",
    class: "entity",
    classes: "entity",
    command: "entity",
    commands: "entity",
    commit: "entity",
    commits: "entity",
    crash: "diagnostic",
    crashes: "diagnostic",
    budget: "metric",
    budgets: "metric",
    cost: "metric",
    costs: "metric",
    delta: "change",
    deltas: "change",
    diagnostic: "diagnostic",
    diagnostics: "diagnostic",
    playbook: "procedure",
    playbooks: "procedure",
    discovery: "discovery",
    discoveries: "discovery",
    error: "diagnostic",
    errors: "diagnostic",
    entity: "entity",
    entities: "entity",
    endpoint: "entity",
    endpoints: "entity",
    event: "event",
    events: "event",
    exception: "diagnostic",
    exceptions: "diagnostic",
    fact: "fact",
    facts: "fact",
    failure: "diagnostic",
    failures: "diagnostic",
    file: "entity",
    files: "entity",
    flag: "entity",
    flags: "entity",
    latency: "metric",
    function: "entity",
    functions: "entity",
    incident: "event",
    incidents: "event",
    issue: "entity",
    issues: "entity",
    justification: "reasoning",
    justifications: "reasoning",
    motivation: "reasoning",
    motivations: "reasoning",
    metric: "metric",
    metrics: "metric",
    model: "entity",
    models: "entity",
    module: "entity",
    modules: "entity",
    path: "entity",
    paths: "entity",
    pr: "entity",
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
    pullrequest: "entity",
    url: "entity",
    urls: "entity",
    quota: "metric",
    quotas: "metric",
    preference: "preference",
    preferences: "preference",
    rationale: "reasoning",
    rationales: "reasoning",
    recommendation: "advice",
    recommendations: "advice",
    reason: "reasoning",
    reasoning: "reasoning",
    reasons: "reasoning",
    repo: "entity",
    repos: "entity",
    ticket: "entity",
    tickets: "entity",
    rate: "metric",
    rates: "metric",
    "rate limit": "metric",
    "rate limits": "metric",
    "rate-limit": "metric",
    "rate-limits": "metric",
    runbook: "procedure",
    runbooks: "procedure",
    "root cause": "diagnostic",
    "root causes": "diagnostic",
    "root-cause": "diagnostic",
    "root-causes": "diagnostic",
    process: "procedure",
    processes: "procedure",
    risk: "risk",
    risks: "risk",
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

  if (normalized in MARKDOWN_MEMORY_INTENT_HINTS) {
    return normalized as MarkdownMemoryCategory;
  }

  return aliases[normalized] ?? null;
}

function formatLlmMemoryTopic(topic: string, category: MarkdownMemoryCategory | null): string {
  const trimmed = topic.trim();
  if (!trimmed || !category) return trimmed;
  const lower = trimmed.toLowerCase();
  const label = LLM_MEMORY_CATEGORY_LABELS[category];
  if (lower.startsWith(`${label}:`) || lower.startsWith(`${label} -`)) {
    return trimmed;
  }
  return `${label}: ${trimmed}`;
}

function inferMarkdownEntryCategory(entry: MemoryEntry): MarkdownMemoryCategory | null {
  const lowerTopic = entry.topic.trim().toLowerCase();
  for (const [category, label] of Object.entries(LLM_MEMORY_CATEGORY_LABELS)) {
    const normalizedCategory = category as MarkdownMemoryCategory;
    if (lowerTopic.startsWith(`${label}:`) || lowerTopic.startsWith(`${label} -`)) {
      return normalizedCategory;
    }
  }

  const lowerCombined = `${entry.topic} ${entry.content}`.toLowerCase();
  for (const [category, label] of Object.entries(LLM_MEMORY_CATEGORY_LABELS)) {
    const normalizedCategory = category as MarkdownMemoryCategory;
    if (lowerCombined.includes(`${label}:`) || lowerCombined.includes(`${label} `)) {
      return normalizedCategory;
    }
  }

  const matched = new Set<MarkdownMemoryCategory>();
  for (const keyword of entry.relevanceKeywords) {
    const normalized = normalizeMarkdownMemoryCategory(keyword);
    if (normalized) matched.add(normalized);
  }

  const categoryPriority: MarkdownMemoryCategory[] = [
    "diagnostic",
    "reasoning",
    "metric",
    "procedure",
    "advice",
    "risk",
    "change",
    "discovery",
    "event",
    "decision",
    "preference",
    "constraint",
    "pattern",
    "entity",
    "fact",
  ];
  for (const category of categoryPriority) {
    if (matched.has(category)) return category;
  }

  return null;
}

function inferPrimaryMarkdownCategory(query: string): MarkdownMemoryCategory | null {
  if (hasDiagnosticIntent(query)) return "diagnostic";
  if (hasReasoningIntent(query)) return "reasoning";
  if (hasMetricIntent(query)) return "metric";
  if (hasProcedureIntent(query)) return "procedure";
  if (hasRiskIntent(query)) return "risk";
  if (hasComparisonIntent(query)) return "change";
  if (hasDiscoveryIntent(query)) return "discovery";
  if (hasEventIntent(query)) return "event";
  if (hasAdviceIntent(query)) return "advice";
  if (hasDecisionIntent(query)) return "decision";
  if (hasPreferenceIntent(query)) return "preference";
  if (hasConstraintIntent(query)) return "constraint";
  if (hasPatternIntent(query)) return "pattern";
  if (hasEntityIntent(query)) return "entity";
  if (hasFactIntent(query)) return "fact";
  return null;
}

function normalizeMarkdownSourceTurn(value: string, maxSourceTurn: number): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.trunc(parsed);
  if (normalized < 0) return 0;
  if (normalized > maxSourceTurn) return maxSourceTurn;
  return normalized;
}

function inferParagraphSourceTurn(
  paragraph: string,
  paragraphs: string[],
  paragraphSourceTurns: number[],
): number {
  const index = paragraphs.indexOf(paragraph);
  if (index < 0) return 0;
  return paragraphSourceTurns[index] ?? 0;
}
