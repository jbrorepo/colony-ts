/**
 * Derived memory artifact store.
 *
 * Stores compact, lossy memory artifacts that always point back to canonical
 * verbatim transcript turns. This is the "closet" layer on top of drawers.
 */

import { appendFile, mkdir, readdir } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";

import { compressTextCaveman } from "../llm/caveman-bridge";
import { Dialect } from "../mempalace/dialect";
import { scrubSecrets } from "../security/log-sanitizer";
import { SecretScanner } from "../security/secret-scanner";
import type { LoggedTurnRecord } from "./conversation-log";
import { getDataPath, settings } from "../settings";
import {
  hasAdviceIntent,
  hasComparisonIntent,
  hasConstraintIntent,
  hasDecisionIntent,
  hasDiagnosticIntent,
  hasDiscoveryIntent,
  hasEntityIntent,
  hasEventIntent,
  hasFactIntent,
  hasMetricIntent,
  hasPatternIntent,
  hasPreferenceIntent,
  hasProcedureIntent,
  hasReasoningIntent,
  hasRiskIntent,
} from "./query-intent";

export interface MemoryArtifact {
  artifactId: string;
  sessionId: string;
  createdAt: string;
  strategy: "caveman" | "aaak" | "hybrid";
  sourceTurnIds: string[];
  sourceRoles: string[];
  transcriptPath: string;
  verbatimExcerpt: string;
  verbatimChars: number;
  cavemanSummary: string;
  aaakSummary: string;
  metadata: Record<string, unknown>;
}

export interface ArtifactSearchHit {
  artifact: MemoryArtifact;
  score: number;
  reasons?: string[];
}

const MEMORY_ARTIFACT_SECRET_SCANNER = new SecretScanner();

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[\\/]+/g, "_").replace(/\.\./g, "_");
}

function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();
  const lower = text.toLowerCase();

  for (const rawToken of lower.match(/[a-z0-9_.:/-]+/g) ?? []) {
    const token = rawToken.trim();
    if (!token) continue;

    if (token.length >= 3) {
      keywords.add(token);
      addWorkItemAliasKeywords(keywords, token);
    }

    const collapsed = token.replace(/[^a-z0-9]/g, "");
    if (collapsed.length >= 3) {
      keywords.add(collapsed);
      addWorkItemAliasKeywords(keywords, collapsed);
    }

    for (const part of token.split(/[^a-z0-9]+/g)) {
      if (part.length >= 3) {
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

function normalizePhraseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreLiteralPhraseMatch(content: string, query: string): number {
  const normalizedContent = normalizePhraseText(content);
  const normalizedQuery = normalizePhraseText(query);
  if (!normalizedQuery || normalizedQuery.length < 6) return 0;

  if (normalizedContent.includes(normalizedQuery)) return 1;

  const quotedPhrases = [...query.matchAll(/"([^"]{3,})"/g)]
    .map((match) => normalizePhraseText(match[1] ?? ""))
    .filter((phrase) => phrase.length >= 3);
  if (quotedPhrases.some((phrase) => normalizedContent.includes(phrase))) {
    return 0.95;
  }

  const literalHint = /\b(exact|literally|verbatim|wording|as written|quote)\b/i.test(query);
  if (!literalHint) return 0;

  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length >= 3);
  if (queryTokens.length < 3) return 0;

  for (let size = Math.min(6, queryTokens.length); size >= 3; size--) {
    for (let index = 0; index <= queryTokens.length - size; index++) {
      const phrase = queryTokens.slice(index, index + size).join(" ");
      if (normalizedContent.includes(phrase)) {
        return 0.5 + (size / Math.max(queryTokens.length, 6)) * 0.4;
      }
    }
  }

  return 0;
}

function scoreArtifactIntent(artifact: MemoryArtifact, query: string): number {
  const haystack = [
    artifact.verbatimExcerpt,
    artifact.cavemanSummary,
    artifact.aaakSummary,
    JSON.stringify(artifact.metadata),
  ].join("\n");
  const lowerHaystack = haystack.toLowerCase();
  const lowerVerbatim = artifact.verbatimExcerpt.toLowerCase();
  if (hasDecisionIntent(query)) {
    if (
      lowerVerbatim.includes("decision")
      || lowerVerbatim.includes("decided")
      || lowerVerbatim.includes("agreed")
      || lowerVerbatim.includes("chose")
      || lowerVerbatim.includes("chosen")
    ) {
      return 0.5;
    }
    if (
      lowerHaystack.includes("decision")
      || lowerHaystack.includes("decided")
      || lowerHaystack.includes("agreed")
      || lowerHaystack.includes("chose")
      || lowerHaystack.includes("chosen")
    ) {
      return 0.15;
    }
    return -0.2;
  }
  if (hasDiagnosticIntent(query)) {
    if (
      lowerHaystack.includes("error")
      || lowerHaystack.includes("failed")
      || lowerHaystack.includes("failure")
      || lowerHaystack.includes("root cause")
      || lowerHaystack.includes("exception")
      || lowerHaystack.includes("traceback")
      || lowerHaystack.includes("stack trace")
      || lowerHaystack.includes("crash")
      || lowerHaystack.includes("diagnostic")
    ) {
      return 0.34;
    }
  }
  if (hasComparisonIntent(query)) {
    if (
      lowerHaystack.includes("changed")
      || lowerHaystack.includes("change")
      || lowerHaystack.includes("before")
      || lowerHaystack.includes("after")
      || lowerHaystack.includes("instead")
      || lowerHaystack.includes("moved from")
    ) {
      return 0.35;
    }
  }
  if (hasEventIntent(query)) {
    if (
      lowerHaystack.includes("happened")
      || lowerHaystack.includes("during")
      || lowerHaystack.includes("then")
      || lowerHaystack.includes("incident")
      || lowerHaystack.includes("timeline")
    ) {
      return 0.34;
    }
  }
  if (hasDiscoveryIntent(query)) {
    if (
      lowerHaystack.includes("learned")
      || lowerHaystack.includes("discover")
      || lowerHaystack.includes("insight")
      || lowerHaystack.includes("pattern")
      || lowerHaystack.includes("breakthrough")
    ) {
      return 0.33;
    }
  }
  if (hasPatternIntent(query)) {
    if (
      lowerHaystack.includes("pattern")
      || lowerHaystack.includes("convention")
      || lowerHaystack.includes("architecture")
      || lowerHaystack.includes("architectural")
      || lowerHaystack.includes("design")
      || lowerHaystack.includes("workflow")
    ) {
      return 0.32;
    }
  }
  if (hasConstraintIntent(query)) {
    if (
      lowerHaystack.includes("must")
      || lowerHaystack.includes("never")
      || lowerHaystack.includes("requirement")
      || lowerHaystack.includes("forbidden")
      || lowerHaystack.includes("not allowed")
    ) {
      return 0.33;
    }
  }
  if (hasFactIntent(query)) {
    if (
      lowerHaystack.includes("runtime")
      || lowerHaystack.includes("environment")
      || lowerHaystack.includes("status")
      || lowerHaystack.includes("detail")
      || lowerHaystack.includes("remember")
    ) {
      return 0.3;
    }
  }
  if (hasEntityIntent(query)) {
    if (
      lowerHaystack.includes("provider")
      || lowerHaystack.includes("model")
      || lowerHaystack.includes("tool")
      || lowerHaystack.includes("file")
      || lowerHaystack.includes("path")
      || lowerHaystack.includes("environment variable")
      || lowerHaystack.includes("env var")
      || lowerHaystack.includes("flag")
      || lowerHaystack.includes("endpoint")
      || lowerHaystack.includes("url")
      || lowerHaystack.includes("port")
      || lowerHaystack.includes("command")
      || lowerHaystack.includes("module")
      || lowerHaystack.includes("function")
      || lowerHaystack.includes("class")
      || /[a-z_][a-z0-9_]*_[a-z0-9_]{2,}/.test(lowerHaystack)
      || /--[a-z0-9][a-z0-9-]*/.test(lowerHaystack)
      || /https?:\/\//.test(lowerHaystack)
    ) {
      return 0.31;
    }
  }
  if (hasMetricIntent(query)) {
    if (
      lowerVerbatim.includes("metric")
      || lowerVerbatim.includes("latency")
      || lowerVerbatim.includes("performance")
      || lowerVerbatim.includes("perf")
      || lowerVerbatim.includes("budget")
      || lowerVerbatim.includes("cost")
      || lowerVerbatim.includes("token")
      || lowerVerbatim.includes("throughput")
      || lowerVerbatim.includes("threshold")
      || lowerVerbatim.includes("quota")
      || lowerVerbatim.includes("rate limit")
      || /\b\d+(ms|s|%|tokens?)\b/.test(lowerVerbatim)
    ) {
      return 0.44;
    }
    if (
      lowerHaystack.includes("metric")
      || lowerHaystack.includes("latency")
      || lowerHaystack.includes("performance")
      || lowerHaystack.includes("perf")
      || lowerHaystack.includes("budget")
      || lowerHaystack.includes("cost")
      || lowerHaystack.includes("token")
      || lowerHaystack.includes("throughput")
      || lowerHaystack.includes("threshold")
      || lowerHaystack.includes("quota")
      || lowerHaystack.includes("rate limit")
      || /\b\d+(ms|s|%|tokens?)\b/.test(lowerHaystack)
    ) {
      return 0.18;
    }
    return -0.24;
  }
  if (hasProcedureIntent(query)) {
    if (
      lowerVerbatim.includes("procedure")
      || lowerVerbatim.includes("runbook")
      || lowerVerbatim.includes("playbook")
      || lowerVerbatim.includes("step by step")
      || lowerVerbatim.includes("step-by-step")
      || lowerVerbatim.includes("steps")
      || lowerVerbatim.includes("first")
      || lowerVerbatim.includes("then")
      || lowerVerbatim.includes("finally")
      || lowerVerbatim.includes("process")
    ) {
      return 0.46;
    }
    if (
      lowerHaystack.includes("procedure")
      || lowerHaystack.includes("runbook")
      || lowerHaystack.includes("playbook")
      || lowerHaystack.includes("step by step")
      || lowerHaystack.includes("step-by-step")
      || lowerHaystack.includes("steps")
      || lowerHaystack.includes("first")
      || lowerHaystack.includes("then")
      || lowerHaystack.includes("finally")
      || lowerHaystack.includes("process")
    ) {
      return 0.18;
    }
    return -0.28;
  }
  if (hasPreferenceIntent(query)) {
    if (
      lowerHaystack.includes("prefer")
      || lowerHaystack.includes("preference")
      || lowerHaystack.includes("style")
      || lowerHaystack.includes("habit")
    ) {
      return 0.3;
    }
  }
  if (hasAdviceIntent(query)) {
    if (
      lowerHaystack.includes("should")
      || lowerHaystack.includes("recommend")
      || lowerHaystack.includes("best way")
      || lowerHaystack.includes("advice")
    ) {
      return 0.3;
    }
  }
  if (hasRiskIntent(query)) {
    if (
      lowerHaystack.includes("avoid")
      || lowerHaystack.includes("risk")
      || lowerHaystack.includes("unsafe")
      || lowerHaystack.includes("danger")
    ) {
      return 0.3;
    }
  }
  if (hasReasoningIntent(query)) {
    if (
      lowerHaystack.includes("because")
      || lowerHaystack.includes("reason")
      || lowerHaystack.includes("rationale")
      || lowerHaystack.includes("tradeoff")
    ) {
      return 0.3;
    }
  }
  return 0;
}

function inferArtifactIntentReason(query: string): string | null {
  if (hasDecisionIntent(query)) return "intent-decision";
  if (hasDiagnosticIntent(query)) return "intent-diagnostic";
  if (hasComparisonIntent(query)) return "intent-comparison";
  if (hasEventIntent(query)) return "intent-event";
  if (hasDiscoveryIntent(query)) return "intent-discovery";
  if (hasPatternIntent(query)) return "intent-pattern";
  if (hasConstraintIntent(query)) return "intent-constraint";
  if (hasEntityIntent(query)) return "intent-entity";
  if (hasMetricIntent(query)) return "intent-metric";
  if (hasProcedureIntent(query)) return "intent-procedure";
  if (hasFactIntent(query)) return "intent-fact";
  if (hasPreferenceIntent(query)) return "intent-preference";
  if (hasAdviceIntent(query)) return "intent-advice";
  if (hasRiskIntent(query)) return "intent-risk";
  if (hasReasoningIntent(query)) return "intent-reasoning";
  return null;
}

function inferArtifactTimePreference(query: string): "recent" | "oldest" | null {
  const lower = query.toLowerCase();
  if (
    lower.includes("latest")
    || lower.includes("newest")
    || lower.includes("most recent")
    || lower.includes("recent")
  ) {
    return "recent";
  }
  if (
    lower.includes("earliest")
    || lower.includes("oldest")
    || lower.includes("first ")
    || lower.endsWith(" first")
    || lower.includes("initial")
    || lower.includes("original")
  ) {
    return "oldest";
  }
  return null;
}

function inferArtifactSessionScopePreference(query: string): "current" | "archived" | null {
  const lower = query.toLowerCase();
  if (
    lower.includes("previous session")
    || lower.includes("earlier session")
    || lower.includes("last session")
    || lower.includes("prior session")
    || lower.includes("previous run")
    || lower.includes("earlier run")
    || lower.includes("last run")
    || lower.includes("prior run")
    || lower.includes("archived session")
    || lower.includes("old session")
    || lower.includes("from before")
  ) {
    return "archived";
  }
  if (
    lower.includes("current session")
    || lower.includes("this session")
    || lower.includes("current run")
    || lower.includes("this run")
    || lower.includes("latest session")
    || lower.includes("latest run")
  ) {
    return "current";
  }
  return null;
}

function excerptTurns(turns: LoggedTurnRecord[], maxChars = 800): string {
  const text = turns
    .map((turn) => `[${turn.role}] ${turn.content}`)
    .join("\n");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

export function createMemoryArtifact(input: {
  sessionId: string;
  transcriptPath: string;
  turns: LoggedTurnRecord[];
  metadata?: Record<string, unknown>;
}): MemoryArtifact | null {
  if (input.turns.length === 0) return null;

  const verbatimText = input.turns
    .map((turn) => `[${turn.role}] ${turn.content}`)
    .join("\n\n");
  const verbatimExcerpt = excerptTurns(input.turns);
  const dialect = new Dialect();
  const aaakSummary = dialect.compress(verbatimText, {
    wing: "session",
    room: safeSessionId(input.sessionId),
    source_file: safeSessionId(input.sessionId),
    date: new Date().toISOString().slice(0, 10),
  });
  const cavemanSummary = compressTextCaveman(verbatimText);

  return {
    artifactId: `art_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
    strategy: "hybrid",
    sourceTurnIds: input.turns.map((turn) => turn.turn_id),
    sourceRoles: input.turns.map((turn) => turn.role),
    transcriptPath: input.transcriptPath,
    verbatimExcerpt,
    verbatimChars: verbatimText.length,
    cavemanSummary,
    aaakSummary,
    metadata: { ...(input.metadata ?? {}) },
  };
}

export class MemoryArtifactStore {
  private readonly _baseDir: string;

  constructor(baseDir = join(getDataPath(settings), "memory-artifacts")) {
    this._baseDir = baseDir;
  }

  get baseDir(): string {
    return this._baseDir;
  }

  artifactPath(sessionId: string): string {
    return join(this._baseDir, `${safeSessionId(sessionId)}.jsonl`);
  }

  async appendArtifact(artifact: MemoryArtifact): Promise<void> {
    await mkdir(this._baseDir, { recursive: true });
    const safeArtifact = sanitizeMemoryArtifact(artifact);
    await appendFile(
      this.artifactPath(safeArtifact.sessionId),
      `${JSON.stringify(safeArtifact)}\n`,
      "utf8",
    );
  }

  async listArtifacts(sessionId: string): Promise<MemoryArtifact[]> {
    const file = Bun.file(this.artifactPath(sessionId));
    if (!(await file.exists())) return [];
    const text = await file.text();
    return parseArtifactLines(text).reverse();
  }

  async listAllArtifacts(): Promise<MemoryArtifact[]> {
    let entries;
    try {
      entries = await readdir(this._baseDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const artifacts: MemoryArtifact[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const text = await Bun.file(join(this._baseDir, entry.name)).text();
      artifacts.push(...parseArtifactLines(text));
    }
    return artifacts.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async searchArtifacts(
    query: string,
    opts: { sessionId?: string; limit?: number; includeOtherSessions?: boolean } = {},
  ): Promise<ArtifactSearchHit[]> {
    const limit = opts.limit ?? 5;
    const artifacts = opts.sessionId && !opts.includeOtherSessions
      ? await this.listArtifacts(opts.sessionId)
      : await this.listAllArtifacts();
    if (artifacts.length === 0) return [];

    const queryKeywords = extractKeywords(query);
    const timePreference = inferArtifactTimePreference(query);
    const sessionScopePreference = inferArtifactSessionScopePreference(query);
    const scored = artifacts
      .map((artifact, index) => {
        const haystack = [
          artifact.verbatimExcerpt,
          artifact.cavemanSummary,
          artifact.aaakSummary,
          JSON.stringify(artifact.metadata),
        ].join("\n");
        const hayKeywords = extractKeywords(haystack);
        const overlap = [...queryKeywords].filter((keyword) => hayKeywords.has(keyword)).length;
        const keywordScore = overlap / Math.max(1, queryKeywords.size);
        const phraseScore = scoreLiteralPhraseMatch(haystack, query);
        const intentScore = scoreArtifactIntent(artifact, query);
        const recencyBoost = timePreference === "oldest"
          ? Math.min(0.15, index * 0.01)
          : Math.max(0, 0.15 - index * 0.01);
        const currentSession = Boolean(opts.sessionId) && artifact.sessionId === opts.sessionId;
        const sessionBoost = sessionScopePreference === "archived"
          ? (currentSession ? -0.1 : 0.2)
          : sessionScopePreference === "current"
            ? (currentSession ? 0.25 : -0.05)
            : currentSession
              ? 0.2
              : 0;
        const score = Math.max(keywordScore, phraseScore) + intentScore + recencyBoost + sessionBoost;
        const reasons: string[] = [];
        if (keywordScore > 0) reasons.push("keyword-overlap");
        if (phraseScore > 0 && phraseScore >= keywordScore) reasons.push("literal-phrase");
        if (intentScore > 0) {
          const intentReason = inferArtifactIntentReason(query);
          if (intentReason) reasons.push(intentReason);
        }
        if (sessionBoost > 0) {
          reasons.push(currentSession ? "session-current" : "session-archived");
        }
        if (timePreference != null) {
          reasons.push(timePreference === "recent" ? "time-recent" : "time-oldest");
        }
        return { artifact, score, reasons };
      })
      .filter((hit) => hit.score > 0);

    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, limit);
  }
}

function parseArtifactLines(text: string): MemoryArtifact[] {
  const artifacts: MemoryArtifact[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as MemoryArtifact;
      if (
        parsed
        && typeof parsed.artifactId === "string"
        && typeof parsed.sessionId === "string"
        && typeof parsed.createdAt === "string"
        && typeof parsed.verbatimExcerpt === "string"
      ) {
        artifacts.push(sanitizeMemoryArtifact(parsed));
      }
    } catch {
      // Ignore malformed JSONL rows.
    }
  }
  return artifacts;
}

function sanitizeArtifactText(text: string): string {
  return MEMORY_ARTIFACT_SECRET_SCANNER.scan(scrubSecrets(text)).redactedText;
}

function sanitizeArtifactValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeArtifactText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeArtifactValue(item));
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      sanitized[sanitizeArtifactText(key)] = sanitizeArtifactValue(item);
    }
    return sanitized;
  }
  return value;
}

function sanitizeArtifactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeArtifactValue(metadata);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

function sanitizeMemoryArtifact(artifact: MemoryArtifact): MemoryArtifact {
  return {
    ...artifact,
    artifactId: sanitizeArtifactText(artifact.artifactId),
    sessionId: sanitizeArtifactText(artifact.sessionId),
    createdAt: sanitizeArtifactText(artifact.createdAt),
    sourceTurnIds: artifact.sourceTurnIds.map((turnId) => sanitizeArtifactText(turnId)),
    sourceRoles: artifact.sourceRoles.map((role) => sanitizeArtifactText(role)),
    transcriptPath: sanitizeArtifactText(artifact.transcriptPath),
    verbatimExcerpt: sanitizeArtifactText(artifact.verbatimExcerpt),
    cavemanSummary: sanitizeArtifactText(artifact.cavemanSummary),
    aaakSummary: sanitizeArtifactText(artifact.aaakSummary),
    metadata: sanitizeArtifactMetadata(artifact.metadata),
  };
}
