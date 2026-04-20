/**
 * Context window tracking and basic compaction.
 *
 * Ports the Python standard/reactive compaction behavior while keeping the
 * first TypeScript pass deterministic and dependency-free.
 */

import { Caste } from "../caste/enums";
import type { AgentSession } from "./session";
import type { SerializedMessage } from "./message";
import { TokenEstimationService } from "./token-estimation";
import { parsePersistedToolResultMessage } from "./tool-result-storage";

export type CompactionStrategy = "standard" | "reactive" | "micro";
export type CompactionTrigger = "auto_threshold" | "manual" | "reactive_overflow" | "none";

const DEFAULT_PRESERVE_RECENT = 10;
export const DEFAULT_MICRO_COMPACT_RESULT_CHARS = 4_000;
const CASTE_PRESERVE_MAP: Record<string, number> = {
  [Caste.ROOT_QUEEN]: 20,
  [Caste.ASSIST_ANT]: 12,
  [Caste.SHIELD_GENERALS]: 14,
  [Caste.FORGE_CARVERS]: 12,
  [Caste.CORE_SHAPERS]: 10,
  [Caste.LORE_BURROW]: 10,
  [Caste.LIAISON_ANTS]: 8,
  [Caste.LEDGER_ANTS]: 8,
  [Caste.WATCHER_SWARM]: 8,
};

export interface CompactionConfig {
  triggerThreshold: number;
  preserveRecent: number;
  maxSummaryTokens: number;
  caste: Caste | string;
  strategy: CompactionStrategy;
  contextWindowTokens: number;
  reactivePreserveRecent: number;
  microPreserveRecent: number;
  microResultChars: number;
}

export interface CompactionResult {
  compacted: boolean;
  originalCount: number;
  finalCount: number;
  summary: string;
  tokensSavedEstimate: number;
  messages: SerializedMessage[];
  strategyUsed: CompactionStrategy;
  triggerSource: CompactionTrigger;
  usageBeforeFraction: number;
  preservedSystemCount: number;
  preservedRecentCount: number;
  summarizedMessageCount: number;
  summaryLineCount: number;
}

export interface CompactionResultInternal extends CompactionResult {
  compactedMessages: SerializedMessage[];
}

export interface ContextWindowSnapshot {
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  percentUsed: number;
  messageCount: number;
  isAboveWarningThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  isAtBlockingLimit: boolean;
  compactionFailureCount: number;
}

export interface MicroCompactionOpportunity {
  candidateCount: number;
  tokensSavedEstimate: number;
  preserveRecentCount: number;
}

export interface CompactionRecommendation {
  strategy: CompactionStrategy | null;
  reason: string;
  pressure: "ok" | "warning" | "blocking";
  queuedStrategy: CompactionStrategy | null;
  microCandidateCount: number;
  microTokensSavedEstimate: number;
}

export function preserveRecentForCaste(caste: Caste | string): number {
  const key = String(caste).toLowerCase().replace(/\s+/g, "_");
  return CASTE_PRESERVE_MAP[key] ?? DEFAULT_PRESERVE_RECENT;
}

export function formatCompactionTrigger(trigger: CompactionTrigger): string {
  if (trigger === "auto_threshold") return "auto threshold";
  if (trigger === "manual") return "manual request";
  if (trigger === "reactive_overflow") return "reactive overflow recovery";
  return "not triggered";
}

export function describeContextPressure(snapshot: ContextWindowSnapshot): "ok" | "warning" | "blocking" {
  if (snapshot.isAtBlockingLimit) return "blocking";
  if (snapshot.isAboveWarningThreshold) return "warning";
  return "ok";
}

export function formatCompactionResult(result: CompactionResult): string {
  const trigger = formatCompactionTrigger(result.triggerSource);
  const beforePct = `${(result.usageBeforeFraction * 100).toFixed(1)}%`;

  if (!result.compacted) {
    return `Compaction not needed (${result.strategyUsed}, ${trigger}, before ${beforePct}).`;
  }

  if (result.strategyUsed === "micro") {
    return [
      `Compaction micro via ${trigger}.`,
      `Saved ~${result.tokensSavedEstimate} tokens.`,
      `Trimmed ${result.summarizedMessageCount} older tool results in place.`,
      `Preserved transcript shape with ${result.preservedSystemCount} system + ${result.preservedRecentCount} recent messages.`,
    ].join(" ");
  }

  return [
    `Compaction ${result.strategyUsed} via ${trigger}.`,
    `Saved ~${result.tokensSavedEstimate} tokens.`,
    `Preserved ${result.preservedSystemCount} system + ${result.preservedRecentCount} recent messages.`,
    `Summarized ${result.summarizedMessageCount} older messages from ${beforePct} context usage.`,
  ].join(" ");
}

export function toPublicCompactionResult(result: CompactionResultInternal): CompactionResult {
  const { compactedMessages: _ignored, ...publicResult } = result;
  return publicResult;
}

export function createCompactionConfig(
  opts: Partial<CompactionConfig> = {},
): CompactionConfig {
  const caste = opts.caste ?? Caste.ASSIST_ANT;
  return {
    triggerThreshold: opts.triggerThreshold ?? 0.80,
    preserveRecent: opts.preserveRecent ?? preserveRecentForCaste(caste),
    maxSummaryTokens: opts.maxSummaryTokens ?? 500,
    caste,
    strategy: opts.strategy ?? "standard",
    contextWindowTokens: opts.contextWindowTokens ?? 200_000,
    reactivePreserveRecent: opts.reactivePreserveRecent ?? 6,
    microPreserveRecent: opts.microPreserveRecent ?? 2,
    microResultChars: opts.microResultChars ?? DEFAULT_MICRO_COMPACT_RESULT_CHARS,
  };
}

export function estimateMicroCompactionOpportunity(
  messages: SerializedMessage[],
  opts: {
    caste?: Caste | string;
    preserveRecent?: number;
    maxChars?: number;
  } = {},
): MicroCompactionOpportunity {
  const { bodyMessages } = splitSystemPrefix(messages);
  const preserveRecent = Math.min(
    opts.preserveRecent ?? 2,
    bodyMessages.length,
  );
  const older = bodyMessages.slice(0, Math.max(bodyMessages.length - preserveRecent, 0));
  const maxChars = opts.maxChars ?? DEFAULT_MICRO_COMPACT_RESULT_CHARS;

  let candidateCount = 0;
  let tokensSavedEstimate = 0;
  for (const message of older) {
    const savings = estimateMicroCompactionSavings(message, maxChars);
    if (savings <= 0) continue;
    candidateCount += 1;
    tokensSavedEstimate += savings;
  }

  return {
    candidateCount,
    tokensSavedEstimate,
    preserveRecentCount: preserveRecent,
  };
}

export function recommendCompaction(
  opts: {
    pendingStrategy?: CompactionStrategy | string | null;
    contextUsage?: Partial<ContextWindowSnapshot> | null;
    history?: SerializedMessage[];
    messageCount?: number;
    caste?: Caste | string;
    microPreserveRecent?: number;
    microResultChars?: number;
  } = {},
): CompactionRecommendation {
  const queuedStrategy = normalizeQueuedCompactionStrategy(opts.pendingStrategy);
  const contextUsage = opts.contextUsage ?? null;
  const history = opts.history ?? [];
  const messageCount = opts.messageCount ?? history.length;
  const pressure =
    contextUsage?.isAtBlockingLimit
      ? "blocking"
      : contextUsage?.isAboveWarningThreshold
        ? "warning"
        : messageCount > 24
          ? "warning"
          : "ok";
  const microOpportunity = history.length > 0
    ? estimateMicroCompactionOpportunity(history, {
        caste: opts.caste,
        preserveRecent: opts.microPreserveRecent,
        maxChars: opts.microResultChars,
      })
    : {
        candidateCount: 0,
        tokensSavedEstimate: 0,
        preserveRecentCount: 0,
      };
  const microUseful = microOpportunity.candidateCount > 0;

  if (queuedStrategy) {
    return {
      strategy: null,
      reason: `${queuedStrategy} compaction already queued for the next loop iteration`,
      pressure,
      queuedStrategy,
      microCandidateCount: microOpportunity.candidateCount,
      microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
    };
  }

  if (contextUsage?.isAtBlockingLimit) {
    const blockingPercent =
      typeof contextUsage.percentUsed === "number"
        ? ` at ${contextUsage.percentUsed.toFixed(1)}%`
        : "";
    return {
      strategy: "reactive",
      reason: `context is blocking${blockingPercent}`,
      pressure,
      queuedStrategy: null,
      microCandidateCount: microOpportunity.candidateCount,
      microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
    };
  }

  if (contextUsage?.isAboveAutoCompactThreshold) {
    if (
      microUseful
      && typeof contextUsage.usedTokens === "number"
      && typeof contextUsage.maxTokens === "number"
      && contextUsage.maxTokens > 0
    ) {
      const projectedUsedTokens = Math.max(
        0,
        contextUsage.usedTokens - microOpportunity.tokensSavedEstimate,
      );
      const projectedPercent = (projectedUsedTokens / contextUsage.maxTokens) * 100;
      if (projectedPercent < 80) {
        return {
          strategy: "micro",
          reason: `${microOpportunity.candidateCount} older tool results can likely drop pressure below the auto threshold`,
          pressure,
          queuedStrategy: null,
          microCandidateCount: microOpportunity.candidateCount,
          microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
        };
      }
    }
    const thresholdPercent =
      typeof contextUsage.percentUsed === "number"
        ? ` at ${contextUsage.percentUsed.toFixed(1)}%`
        : "";
    return {
      strategy: "standard",
      reason: `context is above the auto-compaction threshold${thresholdPercent}`,
      pressure,
      queuedStrategy: null,
      microCandidateCount: microOpportunity.candidateCount,
      microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
    };
  }

  if ((contextUsage?.compactionFailureCount ?? 0) > 0 && contextUsage?.isAboveWarningThreshold) {
    return {
      strategy: "reactive",
      reason: `${contextUsage.compactionFailureCount} prior compaction failure(s) under warning pressure`,
      pressure,
      queuedStrategy: null,
      microCandidateCount: microOpportunity.candidateCount,
      microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
    };
  }

  if (
    microUseful
    && (
      pressure !== "ok"
      || microOpportunity.tokensSavedEstimate >= 1_200
      || microOpportunity.candidateCount >= 2
    )
  ) {
    return {
      strategy: "micro",
      reason: `${microOpportunity.candidateCount} older tool results can be trimmed in place with low transcript churn`,
      pressure,
      queuedStrategy: null,
      microCandidateCount: microOpportunity.candidateCount,
      microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
    };
  }

  if (messageCount > 24) {
    return {
      strategy: "standard",
      reason: `${messageCount} messages are live in the current transcript`,
      pressure,
      queuedStrategy: null,
      microCandidateCount: microOpportunity.candidateCount,
      microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
    };
  }

  return {
    strategy: null,
    reason: "context pressure is low and no worthwhile micro-compaction target exists",
    pressure,
    queuedStrategy: null,
    microCandidateCount: microOpportunity.candidateCount,
    microTokensSavedEstimate: microOpportunity.tokensSavedEstimate,
  };
}

export class ContextWindowTracker {
  private _estimator: TokenEstimationService;
  private _maxTokens: number;
  private _triggerThreshold: number;
  private _compactionFailureCount = 0;

  constructor(opts?: {
    model?: string;
    maxTokens?: number;
    triggerThreshold?: number;
    compactionFailureCount?: number;
  }) {
    this._estimator = new TokenEstimationService({ model: opts?.model ?? "" });
    this._maxTokens = opts?.maxTokens ?? 200_000;
    this._triggerThreshold = opts?.triggerThreshold ?? 0.80;
    this._compactionFailureCount = opts?.compactionFailureCount ?? 0;
  }

  snapshot(messages: SerializedMessage[]): ContextWindowSnapshot {
    const usedTokens = this._estimator.countMessages(
      messages as unknown as Array<Record<string, unknown>>,
    );
    const maxTokens = Math.max(1, this._maxTokens);
    const percentUsed = (usedTokens / maxTokens) * 100;
    return {
      usedTokens,
      maxTokens,
      remainingTokens: Math.max(0, maxTokens - usedTokens),
      percentUsed,
      messageCount: messages.length,
      isAboveWarningThreshold: percentUsed >= 70,
      isAboveAutoCompactThreshold: percentUsed >= this._triggerThreshold * 100,
      isAtBlockingLimit: percentUsed >= 97,
      compactionFailureCount: this._compactionFailureCount,
    };
  }

  recordCompactionSuccess(): void {
    this._compactionFailureCount = 0;
  }

  recordCompactionFailure(): void {
    this._compactionFailureCount++;
  }
}

export class CompactionEngine {
  private _config: CompactionConfig;

  constructor(config: Partial<CompactionConfig> = {}) {
    this._config = createCompactionConfig(config);
  }

  get config(): CompactionConfig {
    return this._config;
  }

  async compact(
    messages: SerializedMessage[],
    opts: {
      strategy?: CompactionStrategy;
      currentUsageFraction?: number;
      force?: boolean;
      triggerSource?: CompactionTrigger;
    } = {},
  ): Promise<CompactionResultInternal> {
    const strategy = opts.strategy ?? this._config.strategy;
    if (strategy === "micro") {
      return this._compactMicro(
        messages,
        opts.currentUsageFraction ?? 0,
        opts.force ?? false,
        opts.triggerSource ?? (opts.force ? "manual" : "auto_threshold"),
      );
    }
    if (strategy === "reactive") {
      return this._compactReactive(
        messages,
        opts.triggerSource ?? "reactive_overflow",
      );
    }
    return this._compactStandard(
      messages,
      opts.currentUsageFraction ?? 0,
      opts.force ?? false,
      opts.triggerSource ?? (opts.force ? "manual" : "auto_threshold"),
    );
  }

  private async _compactStandard(
    messages: SerializedMessage[],
    currentUsageFraction: number,
    force: boolean,
    triggerSource: CompactionTrigger,
  ): Promise<CompactionResultInternal> {
    const originalCount = messages.length;
    if (!force && currentUsageFraction < this._config.triggerThreshold) {
      return this._noCompaction(messages, "standard", {
        triggerSource,
        usageBeforeFraction: currentUsageFraction,
      });
    }

    const { systemMessages, bodyMessages } = splitSystemPrefix(messages);
    const preserveCount = Math.min(this._config.preserveRecent, bodyMessages.length);

    if (bodyMessages.length <= preserveCount + 1) {
      return this._noCompaction(messages, "standard", {
        triggerSource,
        usageBeforeFraction: currentUsageFraction,
      });
    }

    const older = bodyMessages.slice(0, bodyMessages.length - preserveCount);
    const recent = bodyMessages.slice(bodyMessages.length - preserveCount);
    const summary = this._heuristicSummary(older);
    const compacted: SerializedMessage[] = [
      ...systemMessages,
      makeSystemSummary(`[Context Summary - ${older.length} earlier messages compacted]\n\n${summary}`),
      ...recent,
    ];

    return {
      compacted: true,
      originalCount,
      finalCount: compacted.length,
      summary,
      tokensSavedEstimate: estimateTokensSaved(older, summary),
      messages: compacted,
      strategyUsed: "standard",
      triggerSource,
      usageBeforeFraction: currentUsageFraction,
      preservedSystemCount: systemMessages.length,
      preservedRecentCount: recent.length,
      summarizedMessageCount: older.length,
      summaryLineCount: countSummaryLines(summary),
      compactedMessages: older,
    };
  }

  private async _compactMicro(
    messages: SerializedMessage[],
    currentUsageFraction: number,
    force: boolean,
    triggerSource: CompactionTrigger,
  ): Promise<CompactionResultInternal> {
    const originalCount = messages.length;
    if (!force && currentUsageFraction < this._config.triggerThreshold) {
      return this._noCompaction(messages, "micro", {
        triggerSource,
        usageBeforeFraction: currentUsageFraction,
      });
    }

    const { systemMessages, bodyMessages } = splitSystemPrefix(messages);
    const preserveCount = Math.min(this._config.preserveRecent, bodyMessages.length);
    const olderCount = Math.max(bodyMessages.length - preserveCount, 0);
    const older = bodyMessages.slice(0, olderCount);
    const recent = bodyMessages.slice(olderCount);

    let trimmedCount = 0;
    let tokensSavedEstimate = 0;
    const compactedMessages: SerializedMessage[] = [];
    const compactedOlder = older.map((message) => {
      const next = microCompactMessage(message, this._config.microResultChars);
      if (!next) return message;
      trimmedCount += 1;
      tokensSavedEstimate += next.tokensSavedEstimate;
      compactedMessages.push({ ...message });
      return next.message;
    });

    if (trimmedCount === 0) {
      return this._noCompaction(messages, "micro", {
        triggerSource,
        usageBeforeFraction: currentUsageFraction,
      });
    }

    const summary = `Micro-compacted ${trimmedCount} older tool results while preserving transcript shape.`;
    return {
      compacted: true,
      originalCount,
      finalCount: messages.length,
      summary,
      tokensSavedEstimate,
      messages: [...systemMessages, ...compactedOlder, ...recent],
      strategyUsed: "micro",
      triggerSource,
      usageBeforeFraction: currentUsageFraction,
      preservedSystemCount: systemMessages.length,
      preservedRecentCount: recent.length,
      summarizedMessageCount: trimmedCount,
      summaryLineCount: countSummaryLines(summary),
      compactedMessages,
    };
  }

  private async _compactReactive(
    messages: SerializedMessage[],
    triggerSource: CompactionTrigger,
  ): Promise<CompactionResultInternal> {
    const originalCount = messages.length;
    const systemMessages = messages.filter((m) => m.type === "system");
    const bodyMessages = messages.filter((m) => m.type !== "system");
    const keep = Math.min(this._config.reactivePreserveRecent, bodyMessages.length);
    const usageBeforeFraction = this._config.contextWindowTokens > 0
      ? estimateMessageChars(messages) / Math.max(1, this._config.contextWindowTokens * 4)
      : 0;

    if (bodyMessages.length <= keep) {
      return this._noCompaction(messages, "reactive", {
        triggerSource,
        usageBeforeFraction,
      });
    }

    const older = bodyMessages.slice(0, bodyMessages.length - keep);
    const recent = bodyMessages.slice(bodyMessages.length - keep);
    const summary = this._emergencySummary(older);
    const compacted: SerializedMessage[] = [
      ...systemMessages,
      makeSystemSummary(`[CONTEXT RECOVERY - ${older.length} messages compacted due to context overflow]\n\n${summary}`),
      ...recent,
    ];

    return {
      compacted: true,
      originalCount,
      finalCount: compacted.length,
      summary,
      tokensSavedEstimate: estimateTokensSaved(older, summary),
      messages: compacted,
      strategyUsed: "reactive",
      triggerSource,
      usageBeforeFraction,
      preservedSystemCount: systemMessages.length,
      preservedRecentCount: recent.length,
      summarizedMessageCount: older.length,
      summaryLineCount: countSummaryLines(summary),
      compactedMessages: older,
    };
  }

  private _noCompaction(
    messages: SerializedMessage[],
    strategy: CompactionStrategy,
    opts: {
      triggerSource?: CompactionTrigger;
      usageBeforeFraction?: number;
    } = {},
  ): CompactionResultInternal {
    return {
      compacted: false,
      originalCount: messages.length,
      finalCount: messages.length,
      summary: "",
      tokensSavedEstimate: 0,
      messages: [...messages],
      strategyUsed: strategy,
      triggerSource: opts.triggerSource ?? "none",
      usageBeforeFraction: opts.usageBeforeFraction ?? 0,
      preservedSystemCount: messages.filter((message) => message.type === "system").length,
      preservedRecentCount: 0,
      summarizedMessageCount: 0,
      summaryLineCount: 0,
      compactedMessages: [],
    };
  }

  private _heuristicSummary(messages: SerializedMessage[]): string {
    const points: string[] = [];
    for (const msg of messages) {
      const content = String(msg.content ?? "").trim();
      if (!content) continue;
      if (msg.type === "user") {
        points.push(`- User asked: ${content.slice(0, 200)}`);
      } else if (msg.type === "assistant" && content.length > 50) {
        points.push(`- Assistant: ${content.slice(0, 200)}`);
      }
    }

    if (points.length === 0) return "(Earlier conversation context was compacted.)";
    if (points.length > 15) return [...points.slice(0, 5), "- ...", ...points.slice(-5)].join("\n");
    return points.join("\n");
  }

  private _emergencySummary(messages: SerializedMessage[]): string {
    const userMessages = messages
      .filter((m) => m.type === "user" && m.content)
      .map((m) => `- ${String(m.content).trim().slice(0, 100)}`)
      .slice(0, 5);
    if (userMessages.length === 0) return "(Previous context was emergency-compacted.)";
    return `Key user requests from compacted context:\n${userMessages.join("\n")}`;
  }
}

function estimateMicroCompactionSavings(
  message: SerializedMessage,
  maxChars: number,
): number {
  const compacted = microCompactMessage(message, maxChars);
  return compacted?.tokensSavedEstimate ?? 0;
}

function microCompactMessage(
  message: SerializedMessage,
  maxChars: number,
): { message: SerializedMessage; tokensSavedEstimate: number } | null {
  if (message.type !== "tool_result") return null;
  const content = String(message.content ?? "");
  if (!content || content.length <= maxChars) return null;
  if (parsePersistedToolResultMessage(content)) return null;

  const compactedContent = microCompactContent(content, maxChars);
  if (compactedContent.length >= content.length) return null;

  return {
    message: {
      ...message,
      content: compactedContent,
    },
    tokensSavedEstimate: Math.max(0, Math.floor((content.length - compactedContent.length) / 4)),
  };
}

function microCompactContent(content: string, maxChars: number): string {
  const marker = "\n\n[... tool result trimmed by micro compaction ...]\n\n";
  if (content.length <= maxChars) return content;
  const retainedBudget = Math.max(256, maxChars - marker.length);
  const headChars = Math.max(1, Math.floor(retainedBudget * 0.75));
  const tailChars = Math.max(1, retainedBudget - headChars);
  return `${content.slice(0, headChars)}${marker}${content.slice(-tailChars)}`;
}

function normalizeQueuedCompactionStrategy(
  strategy?: CompactionStrategy | string | null,
): CompactionStrategy | null {
  if (strategy === "standard" || strategy === "reactive" || strategy === "micro") {
    return strategy;
  }
  return null;
}

export function applyCompactionToSession(
  session: AgentSession,
  result: CompactionResult,
): AgentSession {
  if (!result.compacted) return session;
  return {
    ...session,
    history: result.messages,
    metadata: {
      ...session.metadata,
      lastCompaction: {
        strategy: result.strategyUsed,
        originalCount: result.originalCount,
        finalCount: result.finalCount,
        tokensSavedEstimate: result.tokensSavedEstimate,
        at: new Date().toISOString(),
      },
    },
  };
}

function splitSystemPrefix(messages: SerializedMessage[]): {
  systemMessages: SerializedMessage[];
  bodyMessages: SerializedMessage[];
} {
  const systemMessages: SerializedMessage[] = [];
  const bodyMessages = [...messages];
  while (bodyMessages[0]?.type === "system") {
    systemMessages.push(bodyMessages.shift()!);
  }
  return { systemMessages, bodyMessages };
}

function makeSystemSummary(content: string): SerializedMessage {
  return {
    type: "system",
    id: `compact_${Date.now().toString(36)}`,
    content,
    priority: 90,
    timestamp: new Date().toISOString(),
  };
}

function estimateTokensSaved(messages: SerializedMessage[], summary: string): number {
  const originalChars = messages.reduce(
    (total, msg) => total + String(msg.content ?? "").length,
    0,
  );
  return Math.max(0, Math.floor((originalChars - summary.length) / 4));
}

function estimateMessageChars(messages: SerializedMessage[]): number {
  return messages.reduce((total, message) => total + String(message.content ?? "").length, 0);
}

function countSummaryLines(summary: string): number {
  const trimmed = summary.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}
