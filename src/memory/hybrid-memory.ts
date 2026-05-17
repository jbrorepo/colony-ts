/**
 * Hybrid memory recall.
 *
 * Merges exact transcript recall with derived compact artifacts. Exact text is
 * always labeled as verbatim truth; derived recalls are explicitly labeled as
 * compressed context helpers.
 */

import type { LoggedTurnRecord } from "./conversation-log";
import { ConversationLogger } from "./conversation-log";
import type { ArtifactSearchHit, MemoryArtifact } from "./artifact-store";
import { MemoryArtifactStore } from "./artifact-store";
import { hasAdviceIntent, hasComparisonIntent, hasConstraintIntent, hasDecisionIntent, hasDiagnosticIntent, hasDiscoveryIntent, hasEntityIntent, hasEventIntent, hasFactIntent, hasMetricIntent, hasOwnershipIntent, hasPatternIntent, hasPreferenceIntent, hasProcedureIntent, hasReasoningIntent, hasRiskIntent } from "./query-intent";

export interface MemoryResult {
  content: string;
  source: "conversation" | "artifact";
  score: number;
  sessionId: string;
  role: string;
  exact: boolean;
  artifactId?: string;
  metadata: Record<string, unknown>;
}

export type MemoryTruthMode =
  | "balanced"
  | "exact_only"
  | "derived_only"
  | "prefer_exact"
  | "prefer_derived";

export type MemorySessionScopePreference = "current" | "archived" | null;
export type MemoryTimePreference = "recent" | "oldest" | null;

export function normalizeMemoryTruthMode(value: unknown): MemoryTruthMode | null {
  return value === "balanced"
    || value === "exact_only"
    || value === "derived_only"
    || value === "prefer_exact"
    || value === "prefer_derived"
    ? value
    : null;
}

export function parseMemoryTruthModeInput(value: string): MemoryTruthMode | null | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "auto" || normalized === "default") return null;
  if (normalized === "balanced") return "balanced";
  if (normalized === "exact" || normalized === "exact_only" || normalized === "exact-only") return "exact_only";
  if (normalized === "derived" || normalized === "derived_only" || normalized === "derived-only") return "derived_only";
  if (normalized === "prefer_exact" || normalized === "prefer-exact") return "prefer_exact";
  if (normalized === "prefer_derived" || normalized === "prefer-derived") return "prefer_derived";
  return undefined;
}

export function memoryTruthModeLabel(value: MemoryTruthMode | null | undefined): string {
  if (value == null) return "auto (query-guided)";
  if (value === "balanced") return "balanced";
  if (value === "exact_only") return "exact-only";
  if (value === "derived_only") return "derived-only";
  if (value === "prefer_exact") return "prefer-exact";
  return "prefer-derived";
}

export class HybridMemory {
  private readonly _conversations: ConversationLogger;
  private readonly _artifacts: MemoryArtifactStore;

  constructor(opts: {
    conversationLogger?: ConversationLogger;
    artifactStore?: MemoryArtifactStore;
  } = {}) {
    this._conversations = opts.conversationLogger ?? new ConversationLogger();
    this._artifacts = opts.artifactStore ?? new MemoryArtifactStore();
  }

  get conversationLogger(): ConversationLogger {
    return this._conversations;
  }

  get artifactStore(): MemoryArtifactStore {
    return this._artifacts;
  }

  async recall(
    query: string,
    opts: {
      strategy?: "conversation" | "artifact" | "hybrid";
      truthMode?: MemoryTruthMode;
      topK?: number;
      sessionId?: string;
    } = {},
  ): Promise<MemoryResult[]> {
    const strategy = opts.strategy ?? "hybrid";
    const truthMode = opts.truthMode ?? "balanced";
    const topK = opts.topK ?? 5;
    const results: MemoryResult[] = [];

    const allowConversation =
      truthMode !== "derived_only"
      && (strategy === "conversation" || strategy === "hybrid");
    const allowArtifacts =
      truthMode !== "exact_only"
      && (strategy === "artifact" || strategy === "hybrid");

    if (allowConversation) {
      results.push(...await this._recallConversation(query, opts.sessionId, topK));
    }

    if (allowArtifacts) {
      results.push(...await this._recallArtifacts(query, opts.sessionId, topK));
    }

    results.sort((left, right) => scoreForTruthMode(right, truthMode) - scoreForTruthMode(left, truthMode));
    return results.slice(0, topK);
  }

  private async _recallConversation(query: string, sessionId: string | undefined, topK: number): Promise<MemoryResult[]> {
    const sessionIds = sessionId
      ? [sessionId, ...(await this._conversations.listSessions()).filter((id) => id !== sessionId)]
      : await this._conversations.listSessions();
    const hits: MemoryResult[] = [];

    for (const currentSessionId of sessionIds) {
      const history = await this._conversations.getHistory(currentSessionId, 0);
      const scored = history
        .filter((match) => match.role !== "system")
        .map((match, index) => ({
          match,
          index,
          score: scoreConversationMatchWithContext(
            match.role,
            match.content,
            history[index + 1],
            query,
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);

      for (const [index, entry] of scored.slice(0, topK).entries()) {
        hits.push(this._mapConversationHit(
          entry.match,
          history[entry.index + 1],
          currentSessionId,
          index,
          currentSessionId === sessionId,
          entry.score,
          query,
        ));
      }
    }

    applyTemporalPreference(hits, query, (hit) => hit.metadata.timestamp);
    hits.sort((left, right) => compareTemporalAwareMemoryResults(
      left,
      right,
      inferMemoryTimePreference(query),
      (hit) => hit.metadata.timestamp,
    ));
    return hits.slice(0, topK);
  }

  private async _recallArtifacts(query: string, sessionId: string | undefined, topK: number): Promise<MemoryResult[]> {
    const hits = await this._artifacts.searchArtifacts(query, {
      sessionId,
      limit: Math.max(topK * 3, topK),
      includeOtherSessions: true,
    });
    const results = hits.map((hit) => this._mapArtifactHit(hit, hit.artifact.sessionId === sessionId, query));
    applyTemporalPreference(results, query, (hit) => hit.metadata.createdAt);
    results.sort((left, right) => compareTemporalAwareMemoryResults(
      left,
      right,
      inferMemoryTimePreference(query),
      (hit) => hit.metadata.createdAt,
    ));
    return results.slice(0, topK);
  }

  private _mapConversationHit(
    match: LoggedTurnRecord,
    adjacentTurn: LoggedTurnRecord | undefined,
    sessionId: string,
    index: number,
    currentSession: boolean,
    lexicalScore: number,
    query: string,
  ): MemoryResult {
    const base = Math.max(0.2, lexicalScore - index * 0.05);
    const roleScore = scoreConversationRole(match.role, query);
    const sessionScopeScore = scoreSessionScope(currentSession, query);
    const decisionScore = scoreDecisionAnswer(match.role, match.content, query);
    const explanationScore = scoreExplanationAnswer(match.role, match.content, query);
    const diagnosticScore = scoreDiagnosticAnswer(match.role, match.content, query);
    const adviceScore = scoreAdviceAnswer(match.role, match.content, query);
    const metricScore = scoreMetricAnswer(match.role, match.content, query);
    const procedureScore = scoreProcedureAnswer(match.role, match.content, query);
    const riskScore = scoreRiskAnswer(match.role, match.content, query);
    const comparisonScore = scoreComparisonAnswer(match.role, match.content, query);
    const preferenceScore = scorePreferenceAnswer(match.role, match.content, query);
    const eventScore = scoreEventAnswer(match.role, match.content, query);
    const constraintScore = scoreConstraintAnswer(match.role, match.content, query);
    const discoveryScore = scoreDiscoveryAnswer(match.role, match.content, query);
    const entityScore = scoreEntityAnswer(match.role, match.content, query);
    const factScore = scoreFactAnswer(match.role, match.content, query);
    const ownershipScore = scoreOwnershipAnswer(match.role, match.content, query);
    const recallReasons = collectConversationRecallReasons(
      match.role,
      match.content,
      adjacentTurn,
      currentSession,
      roleScore,
      sessionScopeScore,
      query,
    );
    return {
      content: `[${match.role}] ${match.content}`,
      source: "conversation",
      score: (currentSession ? base + 0.2 : base) + roleScore + sessionScopeScore + decisionScore + explanationScore + diagnosticScore + adviceScore + metricScore + procedureScore + riskScore + comparisonScore + preferenceScore + eventScore + constraintScore + discoveryScore + entityScore + factScore + ownershipScore,
      sessionId,
      role: match.role,
      exact: true,
      metadata: {
        ...match.metadata,
        timestamp: match.timestamp,
        turnId: match.turn_id,
        transcriptPath: this._conversations.sessionPath(sessionId),
        recallReasons,
      },
    };
  }

  private _mapArtifactHit(hit: ArtifactSearchHit, currentSession: boolean, query: string): MemoryResult {
    const artifact = hit.artifact;
    return {
      content: [
        `Derived compact recall. Not verbatim.`,
        `Caveman: ${artifact.cavemanSummary}`,
        `AAAK: ${artifact.aaakSummary}`,
        `Source excerpt: ${artifact.verbatimExcerpt}`,
      ].join("\n"),
      source: "artifact",
      score: hit.score + scoreSessionScope(currentSession, query),
      sessionId: artifact.sessionId,
      role: "system",
      exact: false,
      artifactId: artifact.artifactId,
      metadata: {
        ...artifact.metadata,
        sourceTurnIds: [...artifact.sourceTurnIds],
        sourceRoles: [...artifact.sourceRoles],
        transcriptPath: artifact.transcriptPath,
        createdAt: artifact.createdAt,
        recallReasons: hit.reasons ?? [],
      },
    };
  }
}

function collectConversationRecallReasons(
  role: string,
  content: string,
  adjacentTurn: LoggedTurnRecord | undefined,
  currentSession: boolean,
  roleScore: number,
  sessionScopeScore: number,
  query: string,
): string[] {
  const reasons: string[] = [];
  if (roleScore > 0) reasons.push(`role-${role.toLowerCase()}`);
  if (sessionScopeScore > 0) reasons.push(currentSession ? "session-current" : "session-archived");
  const keywordScore = scoreConversationMatch(content, extractKeywords(query));
  const phraseScore = scoreLiteralPhraseMatch(content, query);
  if (phraseScore > 0 && phraseScore >= keywordScore) reasons.push("literal-phrase");
  const lowerRole = role.toLowerCase();
  if (
    lowerRole === "assistant"
    && adjacentTurn?.role?.toLowerCase() === "user"
    && (hasReasoningIntent(query)
      || hasDiagnosticIntent(query)
      || hasAdviceIntent(query)
      || hasMetricIntent(query)
      || hasProcedureIntent(query)
      || hasRiskIntent(query)
      || hasComparisonIntent(query)
      || hasPreferenceIntent(query)
      || hasEventIntent(query)
      || hasConstraintIntent(query)
      || hasDiscoveryIntent(query)
      || hasEntityIntent(query)
      || hasFactIntent(query)
      || hasDecisionIntent(query))
  ) {
    const directScore = scoreConversationMatchWithQuery(content, query);
    const carriedScore = scoreConversationMatchWithQuery(adjacentTurn.content, query) * 0.85;
    if (carriedScore > directScore) reasons.push("context-carry");
  }
  if (lowerRole === "assistant") {
    if (hasDecisionIntent(query) && scoreDecisionAnswer(role, content, query) > 0) reasons.push("intent-decision");
    if (hasReasoningIntent(query) && scoreExplanationAnswer(role, content, query) > 0) reasons.push("intent-reasoning");
    if (hasDiagnosticIntent(query) && scoreDiagnosticAnswer(role, content, query) > 0) reasons.push("intent-diagnostic");
    if (hasAdviceIntent(query) && scoreAdviceAnswer(role, content, query) > 0) reasons.push("intent-advice");
    if (hasMetricIntent(query) && scoreMetricAnswer(role, content, query) > 0) reasons.push("intent-metric");
    if (hasProcedureIntent(query) && scoreProcedureAnswer(role, content, query) > 0) reasons.push("intent-procedure");
    if (hasRiskIntent(query) && scoreRiskAnswer(role, content, query) > 0) reasons.push("intent-risk");
    if (hasComparisonIntent(query) && scoreComparisonAnswer(role, content, query) > 0) reasons.push("intent-comparison");
    if (hasPreferenceIntent(query) && scorePreferenceAnswer(role, content, query) > 0) reasons.push("intent-preference");
    if (hasEventIntent(query) && scoreEventAnswer(role, content, query) > 0) reasons.push("intent-event");
    if (hasConstraintIntent(query) && scoreConstraintAnswer(role, content, query) > 0) reasons.push("intent-constraint");
    if (hasDiscoveryIntent(query) && scoreDiscoveryAnswer(role, content, query) > 0) reasons.push("intent-discovery");
    if (hasEntityIntent(query) && scoreEntityAnswer(role, content, query) > 0) reasons.push("intent-entity");
    if (hasFactIntent(query) && scoreFactAnswer(role, content, query) > 0) reasons.push("intent-fact");
    if (hasOwnershipIntent(query) && scoreOwnershipAnswer(role, content, query) > 0) reasons.push("intent-ownership");
  }
  return reasons;
}

export function extractKeywords(text: string): Set<string> {
  const keywords = new Set<string>();
  const lower = text.toLowerCase();
  const stopwords = new Set([
    "about",
    "been",
    "could",
    "from",
    "have",
    "into",
    "note",
    "notes",
    "other",
    "run",
    "runs",
    "session",
    "sessions",
    "than",
    "that",
    "their",
    "then",
    "there",
    "this",
    "what",
    "when",
    "which",
    "will",
    "with",
    "would",
  ]);

  for (const rawToken of lower.match(/[a-z0-9_.:/-]+/g) ?? []) {
    const token = rawToken.trim();
    if (!token) continue;

    if (token.length >= 3 && !stopwords.has(token)) {
      keywords.add(token);
      addWorkItemAliasKeywords(keywords, token);
    }

    const collapsed = token.replace(/[^a-z0-9]/g, "");
    if (collapsed.length >= 3 && !stopwords.has(collapsed)) {
      keywords.add(collapsed);
      addWorkItemAliasKeywords(keywords, collapsed);
    }

    for (const part of token.split(/[^a-z0-9]+/g)) {
      if (part.length >= 3 && !stopwords.has(part)) {
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

function scoreConversationMatch(content: string, queryKeywords: Set<string>): number {
  if (queryKeywords.size === 0) return 0;
  const contentKeywords = extractKeywords(content);
  const overlap = [...queryKeywords].filter((keyword) => contentKeywords.has(keyword)).length;
  return overlap / queryKeywords.size;
}

function scoreConversationMatchWithQuery(content: string, query: string): number {
  const keywordScore = scoreConversationMatch(content, extractKeywords(query));
  const phraseScore = scoreLiteralPhraseMatch(content, query);
  return Math.max(keywordScore, phraseScore);
}

function scoreConversationMatchWithContext(
  role: string,
  content: string,
  previousTurn: LoggedTurnRecord | undefined,
  query: string,
): number {
  const directScore = scoreConversationMatchWithQuery(content, query);
  if (
    role.toLowerCase() === "assistant"
    && (hasReasoningIntent(query) || hasDiagnosticIntent(query) || hasAdviceIntent(query) || hasMetricIntent(query) || hasProcedureIntent(query) || hasRiskIntent(query) || hasComparisonIntent(query) || hasPreferenceIntent(query) || hasEventIntent(query) || hasConstraintIntent(query) || hasDiscoveryIntent(query) || hasEntityIntent(query) || hasFactIntent(query) || hasDecisionIntent(query))
    && previousTurn?.role?.toLowerCase() === "user"
  ) {
    const carriedScore = scoreConversationMatchWithQuery(previousTurn.content, query) * 0.85;
    return Math.max(directScore, carriedScore);
  }
  return directScore;
}

export function scoreLiteralPhraseMatch(content: string, query: string): number {
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

  const queryTokens = normalizePhraseText(query).split(" ").filter((token) => token.length >= 3);
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

function scoreConversationRole(role: string, query: string): number {
  const lowerRole = role.toLowerCase();
  const preference = inferConversationRolePreference(query);
  if (lowerRole === "user") {
    if (preference === "user") return 0.25;
    if (preference === "assistant" || preference === "tool") return -0.05;
    return 0.2;
  }
  if (lowerRole === "assistant") {
    if (preference === "assistant") return 0.25;
    if (preference === "user" || preference === "tool") return -0.05;
    return 0.1;
  }
  if (lowerRole === "tool") {
    if (preference === "tool") return 0.2;
    return -0.15;
  }
  return 0;
}

export function inferConversationRolePreference(query: string): "user" | "assistant" | "tool" | null {
  const lower = query.toLowerCase();
  if (
    lower.includes("what did i say")
    || lower.includes("i said")
    || lower.includes("my wording")
    || lower.includes("my words")
    || lower.includes("user said")
  ) {
    return "user";
  }
  if (
    lower.includes("what did you say")
    || lower.includes("you said")
    || lower.includes("your wording")
    || lower.includes("your words")
    || lower.includes("you told me")
    || lower.includes("assistant said")
  ) {
    return "assistant";
  }
  if (hasReasoningIntent(query)) {
    return "assistant";
  }
  if (hasDiagnosticIntent(query)) {
    return "assistant";
  }
  if (hasDecisionIntent(query)) {
    return "assistant";
  }
  if (hasAdviceIntent(query)) {
    return "assistant";
  }
  if (hasMetricIntent(query)) {
    return "assistant";
  }
  if (hasProcedureIntent(query)) {
    return "assistant";
  }
  if (hasRiskIntent(query)) {
    return "assistant";
  }
  if (hasComparisonIntent(query)) {
    return "assistant";
  }
  if (hasPreferenceIntent(query)) {
    return "assistant";
  }
  if (hasEventIntent(query)) {
    return "assistant";
  }
  if (hasConstraintIntent(query)) {
    return "assistant";
  }
  if (hasDiscoveryIntent(query)) {
    return "assistant";
  }
  if (hasEntityIntent(query)) {
    return "assistant";
  }
  if (hasFactIntent(query)) {
    return "assistant";
  }
  if (hasPatternIntent(query)) {
    return "assistant";
  }
  if (
    lower.includes("tool")
    || lower.includes("stdout")
    || lower.includes("stderr")
    || lower.includes("output")
    || lower.includes("exit code")
    || lower.includes("command")
    || lower.includes("shell")
  ) {
    return "tool";
  }
  return null;
}

export function inferMemorySessionScopePreference(query: string): MemorySessionScopePreference {
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

export function inferMemoryTimePreference(query: string): MemoryTimePreference {
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

function normalizePhraseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]+\]\s*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreSessionScope(currentSession: boolean, query: string): number {
  const preference = inferMemorySessionScopePreference(query);
  if (preference === "archived") {
    return currentSession ? -0.25 : 0.2;
  }
  if (preference === "current") {
    return currentSession ? 0.25 : -0.1;
  }
  return 0;
}

function scoreExplanationAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasReasoningIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("because")
    || lowerContent.includes("reason")
    || lowerContent.includes("so that")
    || lowerContent.includes("to avoid")
    || lowerContent.includes("to prevent")
    || lowerContent.includes("therefore")
    || lowerContent.includes("due to")
  ) {
    return 0.45;
  }
  return 0.15;
}

function scoreDiagnosticAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasDiagnosticIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("error")
    || lowerContent.includes("failed")
    || lowerContent.includes("failure")
    || lowerContent.includes("root cause")
    || lowerContent.includes("exception")
    || lowerContent.includes("traceback")
    || lowerContent.includes("stack trace")
    || lowerContent.includes("crash")
    || lowerContent.includes("diagnostic")
  ) {
    return 0.44;
  }
  return 0.14;
}

function scoreDecisionAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasDecisionIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("decided")
    || lowerContent.includes("decision")
    || lowerContent.includes("agreed")
    || lowerContent.includes("chose")
    || lowerContent.includes("chosen")
    || lowerContent.includes("we will")
    || lowerContent.includes("we kept")
  ) {
    return 0.42;
  }
  return 0.14;
}

function scoreAdviceAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasAdviceIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("should")
    || lowerContent.includes("recommend")
    || lowerContent.includes("use ")
    || lowerContent.includes("prefer")
    || lowerContent.includes("best")
    || lowerContent.includes("avoid")
    || lowerContent.includes("try ")
  ) {
    return 0.4;
  }
  return 0.12;
}

function scoreMetricAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasMetricIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("metric")
    || lowerContent.includes("latency")
    || lowerContent.includes("performance")
    || lowerContent.includes("perf")
    || lowerContent.includes("budget")
    || lowerContent.includes("cost")
    || lowerContent.includes("token")
    || lowerContent.includes("throughput")
    || lowerContent.includes("threshold")
    || lowerContent.includes("quota")
    || lowerContent.includes("rate limit")
    || /\b\d+(ms|s|%|tokens?)\b/.test(lowerContent)
  ) {
    return 0.41;
  }
  return 0.13;
}

function scoreProcedureAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasProcedureIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("procedure")
    || lowerContent.includes("runbook")
    || lowerContent.includes("playbook")
    || lowerContent.includes("first")
    || lowerContent.includes("then")
    || lowerContent.includes("finally")
    || lowerContent.includes("step ")
    || lowerContent.includes("steps")
    || lowerContent.includes("process")
  ) {
    return 0.41;
  }
  return 0.13;
}

function scoreRiskAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasRiskIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("avoid")
    || lowerContent.includes("risk")
    || lowerContent.includes("risky")
    || lowerContent.includes("unsafe")
    || lowerContent.includes("danger")
    || lowerContent.includes("dangerous")
    || lowerContent.includes("careful")
    || lowerContent.includes("caution")
    || lowerContent.includes("watch out")
    || lowerContent.includes("pitfall")
    || lowerContent.includes("gotcha")
  ) {
    return 0.42;
  }
  return 0.14;
}

function scoreComparisonAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasComparisonIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("changed")
    || lowerContent.includes("difference")
    || lowerContent.includes("now")
    || lowerContent.includes("used to")
    || lowerContent.includes("before")
    || lowerContent.includes("after")
    || lowerContent.includes("instead of")
    || lowerContent.includes("switched")
    || lowerContent.includes("moved from")
  ) {
    return 0.42;
  }
  return 0.14;
}

function scorePreferenceAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasPreferenceIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("prefer")
    || lowerContent.includes("preference")
    || lowerContent.includes("like")
    || lowerContent.includes("dislike")
    || lowerContent.includes("habit")
    || lowerContent.includes("style")
    || lowerContent.includes("usually")
    || lowerContent.includes("tend to")
  ) {
    return 0.4;
  }
  return 0.13;
}

function scoreEventAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasEventIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("happened")
    || lowerContent.includes("then")
    || lowerContent.includes("after")
    || lowerContent.includes("before")
    || lowerContent.includes("during")
    || lowerContent.includes("incident")
    || lowerContent.includes("timeline")
    || lowerContent.includes("session")
    || lowerContent.includes("milestone")
  ) {
    return 0.4;
  }
  return 0.13;
}

function scoreConstraintAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasConstraintIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("must")
    || lowerContent.includes("must not")
    || lowerContent.includes("never")
    || lowerContent.includes("always")
    || lowerContent.includes("rule")
    || lowerContent.includes("requirement")
    || lowerContent.includes("forbidden")
    || lowerContent.includes("not allowed")
  ) {
    return 0.42;
  }
  return 0.14;
}

function scoreDiscoveryAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasDiscoveryIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("learned")
    || lowerContent.includes("discovered")
    || lowerContent.includes("insight")
    || lowerContent.includes("pattern")
    || lowerContent.includes("breakthrough")
    || lowerContent.includes("found that")
  ) {
    return 0.4;
  }
  return 0.13;
}

function scoreFactAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasFactIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("status")
    || lowerContent.includes("state")
    || lowerContent.includes("environment")
    || lowerContent.includes("runtime")
    || lowerContent.includes("detail")
    || lowerContent.includes("fact")
    || lowerContent.includes("remember")
  ) {
    return 0.38;
  }
  return 0.13;
}

function scoreEntityAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasEntityIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("provider")
    || lowerContent.includes("model")
    || lowerContent.includes("tool")
    || lowerContent.includes("file")
    || lowerContent.includes("path")
    || lowerContent.includes("environment variable")
    || lowerContent.includes("env var")
    || lowerContent.includes("flag")
    || lowerContent.includes("endpoint")
    || lowerContent.includes("url")
    || lowerContent.includes("port")
    || lowerContent.includes("command")
    || lowerContent.includes("module")
    || lowerContent.includes("function")
    || lowerContent.includes("class")
    || /[a-z_][a-z0-9_]*_[a-z0-9_]{2,}/.test(lowerContent)
    || /--[a-z0-9][a-z0-9-]*/.test(lowerContent)
    || /https?:\/\//.test(lowerContent)
  ) {
    return 0.39;
  }
  return 0.13;
}

function scoreOwnershipAnswer(role: string, content: string, query: string): number {
  if (role.toLowerCase() !== "assistant") return 0;
  if (!hasOwnershipIntent(query)) return 0;

  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes("owner")
    || lowerContent.includes("ownership")
    || lowerContent.includes(" owns ")
    || lowerContent.includes("owned by")
    || lowerContent.includes("responsible for")
    || lowerContent.includes("responsibility")
    || lowerContent.includes("accountable for")
    || lowerContent.includes("contact for")
    || lowerContent.includes("point of contact")
  ) {
    return 0.45;
  }
  return 0.12;
}

function applyTemporalPreference<T extends { score: number }>(
  hits: T[],
  query: string,
  getTimestamp: (hit: T) => unknown,
): void {
  const preference = inferMemoryTimePreference(query);
  if (preference == null || hits.length < 2) return;

  const ranked = hits
    .map((hit) => ({
      hit,
      time: parseTimestamp(getTimestamp(hit)),
    }))
    .filter((entry) => entry.time !== null) as Array<{ hit: T; time: number }>;

  if (ranked.length < 2) return;

  ranked.sort((left, right) => (
    preference === "recent"
      ? right.time - left.time
      : left.time - right.time
  ));

  const maxBoost = 0.24;
  const step = Math.max(0.04, maxBoost / Math.max(1, ranked.length));
  for (const [index, entry] of ranked.entries()) {
    entry.hit.score += Math.max(0, maxBoost - index * step);
    appendRecallReason(entry.hit, preference === "recent" ? "time-recent" : "time-oldest");
  }
}

function compareTemporalAwareMemoryResults<T extends { score: number }>(
  left: T,
  right: T,
  preference: MemoryTimePreference,
  getTimestamp: (hit: T) => unknown,
): number {
  const scoreDelta = right.score - left.score;
  if (preference == null) {
    return scoreDelta;
  }

  const leftTime = parseTimestamp(getTimestamp(left));
  const rightTime = parseTimestamp(getTimestamp(right));
  if (
    leftTime !== null
    && rightTime !== null
    && leftTime !== rightTime
    && Math.abs(scoreDelta) <= 0.1
  ) {
    return preference === "recent"
      ? rightTime - leftTime
      : leftTime - rightTime;
  }

  return scoreDelta;
}

function appendRecallReason(hit: unknown, reason: string): void {
  if (!hit || typeof hit !== "object") return;
  const record = hit as { metadata?: Record<string, unknown> };
  const existing = Array.isArray(record.metadata?.recallReasons)
    ? record.metadata!.recallReasons.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (existing.includes(reason)) return;
  record.metadata = {
    ...(record.metadata ?? {}),
    recallReasons: [...existing, reason],
  };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreForTruthMode(result: MemoryResult, truthMode: MemoryTruthMode): number {
  const exactBoost =
    truthMode === "prefer_exact"
      ? 0.4
      : truthMode === "prefer_derived"
        ? -0.2
        : 0;
  const derivedBoost =
    truthMode === "prefer_derived"
      ? 0.4
      : truthMode === "prefer_exact"
        ? -0.2
        : 0;
  return result.score + (result.exact ? exactBoost : derivedBoost);
}
