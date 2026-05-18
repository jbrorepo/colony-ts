import {
  isCompactionUpgrade,
  normalizeCompactionStrategy,
  type CompactionStrategy,
} from "./runtime/compaction";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayCompactEvent {
  strategy: string;
  trigger: string;
  timestamp: number;
  durationMs?: number;
  compacted: boolean;
  originalCount: number;
  finalCount: number;
  tokensSavedEstimate: number;
  summaryLineCount: number;
  summarizedMessageCount: number;
  failureMessage?: string;
}

export interface GatewayCompactHandoff {
  status: "ok" | "failed";
  strategy: string;
  trigger: string;
  timestamp: number;
  loggedCount: number;
  structuredCount: number;
  artifactId?: string;
  artifactChars?: number;
  errorMessage?: string;
}

export interface GatewayLastCompaction {
  strategyUsed?: string;
  triggerSource?: string;
  usageBeforeFraction?: number;
  compacted?: boolean;
  tokensSavedEstimate?: number;
  originalCount?: number;
  finalCount?: number;
  preservedSystemCount?: number;
  preservedRecentCount?: number;
  summarizedMessageCount?: number;
  summaryLineCount?: number;
}

export interface GatewayLastCompactionFailure {
  strategy?: string;
  message?: string;
}

export interface GatewayCompactRecommendation {
  strategy?: CompactionStrategy | null;
  reason: string;
  pressure: string;
  microCandidateCount: number;
  microTokensSavedEstimate: number;
}

export interface GatewayCompactStatusView {
  hasLiveSession: boolean;
  messageCount: number;
  pressure: string;
  contextLine?: string;
  autoThresholdLine?: string;
  blockingLimitLine?: string;
  failureCountLine?: string;
  microCandidatesLine?: string;
  queued: string;
  recentEventCount: number;
  lastCompactionFailure?: GatewayLastCompactionFailure | null;
  lastCompaction?: GatewayLastCompaction | null;
  handoff?: GatewayCompactHandoff | null;
  recommendation: GatewayCompactRecommendation;
  noActiveHint?: string;
}

export interface GatewayCompactCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
  action?: {
    kind: "compact";
    strategy: CompactionStrategy;
  };
}

export function compactionTriggerLabel(trigger?: string): string {
  if (trigger === "auto_threshold") return "auto threshold";
  if (trigger === "manual") return "manual request";
  if (trigger === "reactive_overflow") return "reactive overflow";
  return trigger ?? "unknown";
}

export function appendLastCompactionDetails(
  lines: string[],
  lastCompaction: GatewayLastCompaction,
): void {
  lines.push("Last compaction:");
  lines.push(`Strategy: ${redactCompactSurfaceText(lastCompaction.strategyUsed ?? "unknown")}`);
  lines.push(`Trigger: ${redactCompactSurfaceText(compactionTriggerLabel(lastCompaction.triggerSource))}`);
  if (typeof lastCompaction.usageBeforeFraction === "number") {
    lines.push(`Before usage: ${(lastCompaction.usageBeforeFraction * 100).toFixed(1)}%`);
  }
  lines.push(
    lastCompaction.compacted
      ? `Saved ~${lastCompaction.tokensSavedEstimate ?? 0} tokens (${lastCompaction.originalCount ?? 0} -> ${lastCompaction.finalCount ?? 0})`
      : "Result: no changes made",
  );
  if (!lastCompaction.compacted) return;

  lines.push(`Preserved: ${lastCompaction.preservedSystemCount ?? 0} system + ${lastCompaction.preservedRecentCount ?? 0} recent`);
  if (lastCompaction.strategyUsed === "micro" || lastCompaction.strategyUsed === "cached_micro") {
    lines.push(`Micro: trimmed ${lastCompaction.summarizedMessageCount ?? 0} older tool results in place`);
    return;
  }
  lines.push(`Summarized: ${lastCompaction.summarizedMessageCount ?? 0} messages across ${lastCompaction.summaryLineCount ?? 0} summary lines`);
}

export function appendLastCompactionFailureDetails(
  lines: string[],
  failure: GatewayLastCompactionFailure,
): void {
  if (!failure.message) return;
  lines.push("Last compaction failure:");
  lines.push(`Strategy: ${redactCompactSurfaceText(failure.strategy ?? "unknown")}`);
  lines.push(`Reason: ${redactCompactSurfaceText(failure.message)}`);
}

export function renderCompactUsage(): string {
  return "Usage: /compact [standard|micro|reactive|session_memory|cached_micro|context_collapse|smart|status|recent|handoff]\n\nUse /compact status to inspect pressure, /compact recent for recent compaction history, /compact handoff for compaction-memory bridge status, /compact for normal cleanup, /compact smart for current best move, /compact session_memory to preserve durable constraints before summarizing, /compact cached_micro to clear stale tool output after idle cache-cold gaps, /compact micro to trim stale tool output in place, /compact reactive for aggressive overflow recovery, or /compact context_collapse for extreme-pressure collapse.";
}

export function renderCompactHandoffView(
  handoff: GatewayCompactHandoff | null,
): string {
  const lines = ["Compaction Memory Handoff:", ""];
  if (!handoff) {
    lines.push("(No compaction memory handoff recorded yet)");
  } else {
    lines.push(`Status: ${redactCompactSurfaceText(handoff.status)}`);
    lines.push(`Compaction: ${redactCompactSurfaceText(handoff.strategy)} via ${redactCompactSurfaceText(compactionTriggerLabel(handoff.trigger))}`);
    lines.push(`When: ${new Date(handoff.timestamp).toISOString()}`);
    lines.push(`Logged transcript turns: ${handoff.loggedCount}`);
    lines.push(`Structured memories: ${handoff.structuredCount}`);
    if (handoff.artifactId) {
      lines.push(`Artifact: ${redactCompactSurfaceText(handoff.artifactId)}${handoff.artifactChars ? ` | ${handoff.artifactChars.toLocaleString()} chars` : ""}`);
    } else {
      lines.push("Artifact: none");
    }
    if (handoff.errorMessage) {
      lines.push(`Error: ${redactCompactSurfaceText(handoff.errorMessage)}`);
    }
  }
  lines.push("");
  lines.push("Views: /compact status | /compact recent | /compact handoff | /status | /perf compactions");
  return lines.join("\n");
}

export function renderCompactRecentView(
  events: GatewayCompactEvent[],
): string {
  const lines = ["Recent Compactions:", ""];
  if (events.length === 0) {
    lines.push("(No compaction events recorded yet)");
  } else {
    for (const event of events.slice(-5).reverse()) {
      const time = new Date(event.timestamp).toISOString();
      if (event.failureMessage) {
        lines.push(`- ${redactCompactSurfaceText(event.strategy)} via ${redactCompactSurfaceText(compactionTriggerLabel(event.trigger))} | failed${event.durationMs ? ` | ${event.durationMs}ms` : ""} | ${time}`);
        lines.push(`  Reason: ${redactCompactSurfaceText(event.failureMessage)}`);
      } else {
        lines.push(`- ${redactCompactSurfaceText(event.strategy)} via ${redactCompactSurfaceText(compactionTriggerLabel(event.trigger))} | ${event.compacted ? `${event.originalCount}->${event.finalCount}` : "no change"} | saved ~${event.tokensSavedEstimate}t${event.durationMs ? ` | ${event.durationMs}ms` : ""} | ${time}`);
        if (event.compacted) {
          lines.push(`  Summarized: ${event.summarizedMessageCount} msg across ${event.summaryLineCount} lines`);
        }
      }
    }
  }
  lines.push("");
  lines.push("Views: /compact status | /compact recent | /compact handoff | /status | /cost");
  return lines.join("\n");
}

export function renderCompactStatusView(
  view: GatewayCompactStatusView,
): string {
  const lines = ["Compaction Status:", ""];

  if (!view.hasLiveSession) {
    lines.push("Live session: no");
    lines.push(redactCompactSurfaceText(view.noActiveHint ?? "(No live session)"));
  } else {
    lines.push(`Live session: yes (${view.messageCount} messages)`);
    lines.push(`Pressure: ${redactCompactSurfaceText(view.pressure)}`);
    if (view.contextLine) {
      lines.push(view.contextLine);
      if (view.autoThresholdLine) lines.push(view.autoThresholdLine);
      if (view.blockingLimitLine) lines.push(view.blockingLimitLine);
      if (view.failureCountLine) lines.push(view.failureCountLine);
    } else {
      lines.push("Context: usage snapshot unavailable");
    }
    if (view.microCandidatesLine) {
      lines.push(view.microCandidatesLine);
    }
  }

  lines.push(`Queued: ${redactCompactSurfaceText(view.queued)}`);
  lines.push(`Recent events: ${view.recentEventCount}`);
  if (view.lastCompactionFailure?.message) {
    lines.push("");
    appendLastCompactionFailureDetails(lines, view.lastCompactionFailure);
  }
  if (view.lastCompaction) {
    lines.push("");
    appendLastCompactionDetails(lines, view.lastCompaction);
  }
  if (view.handoff) {
    lines.push("");
    lines.push(`Last handoff: ${redactCompactSurfaceText(view.handoff.status)} | ${redactCompactSurfaceText(view.handoff.strategy)}/${redactCompactSurfaceText(view.handoff.trigger)} | ${view.handoff.loggedCount} logged | ${view.handoff.structuredCount} structured`);
    if (view.handoff.artifactId) {
      lines.push(`Artifact: ${redactCompactSurfaceText(view.handoff.artifactId)}${view.handoff.artifactChars ? ` | ${view.handoff.artifactChars.toLocaleString()} chars` : ""}`);
    }
    if (view.handoff.errorMessage) {
      lines.push(`Handoff error: ${redactCompactSurfaceText(view.handoff.errorMessage)}`);
    }
  }

  lines.push("");
  if (view.recommendation.strategy) {
    lines.push(`Recommend: /compact smart -> ${view.recommendation.strategy}`);
    lines.push(`Direct: /compact ${view.recommendation.strategy}`);
  } else {
    lines.push("Recommend: hold");
  }
  lines.push(`Why: ${redactCompactSurfaceText(view.recommendation.reason)}`);
  lines.push("Inspect: /compact recent | /compact handoff | /status | /cost");
  return lines.join("\n");
}

export function buildCompactCommandPayload(opts: {
  args: string[];
  hasLiveSession: boolean;
  messageCount: number;
  activeRun: boolean;
  queuedStrategy?: string | null;
  recommendation: GatewayCompactRecommendation;
  recentEvents: GatewayCompactEvent[];
  handoff: GatewayCompactHandoff | null;
  lastCompactionFailure?: GatewayLastCompactionFailure | null;
  lastCompaction?: GatewayLastCompaction | null;
  contextUsage?: {
    usedTokens?: number;
    maxTokens?: number;
    percentUsed?: number;
    isAboveAutoCompactThreshold?: boolean;
    isAtBlockingLimit?: boolean;
    compactionFailureCount?: number;
  } | null;
  noActiveHint?: string;
}): GatewayCompactCommandPayload {
  const args = normalizeCompactInspectionArgs(opts.args);
  const rawStrategy = normalizeCompactStrategyInput(args[0] ?? "");

  if (rawStrategy === "handoff") {
    if (args.length > 1) {
      return {
        output: "Usage: /compact handoff",
        isError: true,
      };
    }
    return {
      output: renderCompactHandoffView(opts.handoff),
      data: { action: "compact_handoff", status: opts.handoff?.status ?? "none" },
    };
  }

  if (rawStrategy === "recent") {
    if (args.length > 1) {
      return {
        output: "Usage: /compact recent",
        isError: true,
      };
    }
    return {
      output: renderCompactRecentView(opts.recentEvents),
      data: { action: "compact_recent", recentCount: opts.recentEvents.length },
    };
  }

  if (rawStrategy === "status") {
    if (args.length > 1) {
      return {
        output: "Usage: /compact [standard|micro|reactive|session_memory|cached_micro|context_collapse|smart|status|recent|handoff]",
        isError: true,
      };
    }

    return {
      output: renderCompactStatusView({
        hasLiveSession: opts.hasLiveSession,
        messageCount: opts.messageCount,
        pressure: opts.recommendation.pressure,
        contextLine: opts.contextUsage
          ? (
            typeof opts.contextUsage.usedTokens === "number" &&
              typeof opts.contextUsage.maxTokens === "number" &&
              typeof opts.contextUsage.percentUsed === "number"
              ? `Context: ${opts.contextUsage.usedTokens.toLocaleString()}/${opts.contextUsage.maxTokens.toLocaleString()} tokens (${opts.contextUsage.percentUsed.toFixed(1)}%)`
              : "Context: partial usage snapshot unavailable"
          )
          : undefined,
        autoThresholdLine: opts.contextUsage ? `Auto threshold: ${opts.contextUsage.isAboveAutoCompactThreshold ? "crossed" : "not crossed"}` : undefined,
        blockingLimitLine: opts.contextUsage ? `Blocking limit: ${opts.contextUsage.isAtBlockingLimit ? "yes" : "no"}` : undefined,
        failureCountLine: opts.contextUsage ? `Failures: ${opts.contextUsage.compactionFailureCount ?? 0}` : undefined,
        microCandidatesLine: opts.recommendation.microCandidateCount > 0
          ? `Micro candidates: ${opts.recommendation.microCandidateCount} older tool results (~${opts.recommendation.microTokensSavedEstimate} tokens)`
          : undefined,
        queued: opts.queuedStrategy ?? "none",
        recentEventCount: opts.recentEvents.length,
        lastCompactionFailure: opts.lastCompactionFailure ?? null,
        lastCompaction: opts.lastCompaction ?? null,
        handoff: opts.handoff,
        recommendation: opts.recommendation,
        noActiveHint: opts.noActiveHint,
      }),
      data: {
        action: "compact_status",
        messageCount: opts.messageCount,
        queued: opts.queuedStrategy ?? "none",
        recommendedStrategy: opts.recommendation.strategy,
        pressure: opts.recommendation.pressure,
      },
    };
  }

  const normalizedStrategy = normalizeCompactionStrategy(rawStrategy);
  const requestedStrategy =
    rawStrategy === ""
      ? "standard"
      : rawStrategy === "smart"
        ? "smart"
        : normalizedStrategy;

  if (!requestedStrategy || args.length > 1) {
    return {
      output: `Unknown compact strategy '${redactCompactSurfaceText(rawStrategy || "[empty]")}'.\n\n${renderCompactUsage()}`,
      isError: true,
    };
  }

  if (!opts.hasLiveSession) {
    return {
      output: redactCompactSurfaceText(opts.noActiveHint ?? "(No live session)"),
      isError: true,
    };
  }

  if (requestedStrategy === "smart" && !opts.recommendation.strategy) {
    return {
      output: `Smart compaction says hold.\nWhy: ${redactCompactSurfaceText(opts.recommendation.reason)}\nInspect: /compact status | /status | /cost`,
      data: {
        action: "compact",
        messageCount: opts.messageCount,
        requested: false,
        requestedStrategy,
        recommendedStrategy: opts.recommendation.strategy,
      },
    };
  }

  const strategy = requestedStrategy === "smart"
    ? opts.recommendation.strategy as CompactionStrategy
    : requestedStrategy;

  if (opts.messageCount <= 5 && strategy !== "micro") {
    return {
      output: `Only ${opts.messageCount} messages in context - nothing to compact.`,
      data: {
        action: "compact",
        messageCount: opts.messageCount,
        requested: false,
        strategy,
        requestedStrategy,
      },
    };
  }

  const queued = opts.queuedStrategy ?? null;
  if (opts.activeRun && queued) {
    const normalizedQueued = normalizeCompactionStrategy(queued);
    if (queued === strategy) {
      return {
        output: `Context compaction already queued (${redactCompactSurfaceText(queued)}).\nIt will run before the next loop iteration.`,
        data: {
          action: "compact",
          messageCount: opts.messageCount,
          requested: false,
          queued,
          strategy,
          requestedStrategy,
        },
      };
    }
    if (normalizedQueued && !isCompactionUpgrade(normalizedQueued, strategy)) {
      return {
        output: `${redactCompactSurfaceText(queued)} context compaction already queued.\nIt will run before the next loop iteration.`,
        data: {
          action: "compact",
          messageCount: opts.messageCount,
          requested: false,
          queued,
          strategy,
          requestedStrategy,
        },
      };
    }
    return {
      output: `Context compaction change requested (${redactCompactSurfaceText(queued)} -> ${redactCompactSurfaceText(strategy)}).\nThe ${redactCompactSurfaceText(strategy)} compaction will run before the next loop iteration.`,
      data: {
        action: "compact",
        messageCount: opts.messageCount,
        requested: true,
        queued,
        strategy,
        requestedStrategy,
      },
      action: { kind: "compact", strategy },
    };
  }

  const preflight = requestedStrategy === "smart"
    ? `Running smart compaction (${redactCompactSurfaceText(strategy)}) for ${opts.messageCount} messages...\nWhy: ${redactCompactSurfaceText(opts.recommendation.reason)}`
    : `Running ${redactCompactSurfaceText(strategy)} compaction for ${opts.messageCount} messages...`;

  return {
    output: opts.activeRun
      ? requestedStrategy === "smart"
        ? `Context smart compaction selected ${redactCompactSurfaceText(strategy)} for ${opts.messageCount} messages.\nWhy: ${redactCompactSurfaceText(opts.recommendation.reason)}\nThe compaction engine will run before the next loop iteration.`
        : `Context ${redactCompactSurfaceText(strategy)} compaction requested for ${opts.messageCount} messages.\nThe compaction engine will run before the next loop iteration.`
      : preflight,
    data: {
      action: "compact",
      messageCount: opts.messageCount,
      requested: true,
      strategy,
      requestedStrategy,
      activeRun: opts.activeRun,
    },
    action: { kind: "compact", strategy },
  };
}

function normalizeCompactInspectionArgs(args: string[]): string[] {
  if (!args[0] || args[0].trim().startsWith("--")) return args;
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

function normalizeCompactStrategyInput(value: string): string {
  const redacted = redactCompactSurfaceText(value);
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

function redactCompactSurfaceText(value: string): string {
  return scrubSecrets(value.replace(/[\r\n]+/g, " ").trim())
    .replace(/(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]");
}
