import { buildCompactCommandPayload } from "./gateway-compact";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("COMPACT_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

function renderCompact(args: string[], overrides: Partial<Parameters<typeof buildCompactCommandPayload>[0]> = {}) {
  return buildCompactCommandPayload({
    args,
    hasLiveSession: true,
    messageCount: 20,
    activeRun: false,
    queuedStrategy: "micro-ghp_COMPACT_SURFACE_QUEUED_SHOULD_NOT_LEAK12345678",
    recommendation: {
      reason: "pressure from github_pat_COMPACT_SURFACE_RECOMMENDATION_SHOULD_NOT_LEAK12345678",
      pressure: "high-ghp_COMPACT_SURFACE_PRESSURE_SHOULD_NOT_LEAK12345678",
      microCandidateCount: 1,
      microTokensSavedEstimate: 20,
      strategy: "micro",
    },
    recentEvents: [
      {
        strategy: "reactive-ghp_COMPACT_SURFACE_EVENT_STRATEGY_SHOULD_NOT_LEAK12345678",
        trigger: "manual-github_pat_COMPACT_SURFACE_EVENT_TRIGGER_SHOULD_NOT_LEAK12345678",
        timestamp: 1_700_000_000_000,
        durationMs: 12,
        compacted: false,
        originalCount: 4,
        finalCount: 4,
        tokensSavedEstimate: 0,
        summaryLineCount: 0,
        summarizedMessageCount: 0,
        failureMessage: "failure ghp_COMPACT_SURFACE_EVENT_FAILURE_SHOULD_NOT_LEAK12345678",
      },
    ],
    handoff: {
      status: "failed",
      strategy: "session_memory-ghp_COMPACT_SURFACE_HANDOFF_STRATEGY_SHOULD_NOT_LEAK12345678",
      trigger: "manual-github_pat_COMPACT_SURFACE_HANDOFF_TRIGGER_SHOULD_NOT_LEAK12345678",
      timestamp: 1_700_000_000_000,
      loggedCount: 2,
      structuredCount: 1,
      artifactId: "artifact_ghp_COMPACT_SURFACE_ARTIFACT_SHOULD_NOT_LEAK12345678",
      artifactChars: 42,
      errorMessage: "handoff error github_pat_COMPACT_SURFACE_HANDOFF_ERROR_SHOULD_NOT_LEAK12345678",
    },
    lastCompactionFailure: {
      strategy: "cached_micro-ghp_COMPACT_SURFACE_LAST_FAILURE_STRATEGY_SHOULD_NOT_LEAK12345678",
      message: "last failure github_pat_COMPACT_SURFACE_LAST_FAILURE_MESSAGE_SHOULD_NOT_LEAK12345678",
    },
    lastCompaction: {
      strategyUsed: "standard-ghp_COMPACT_SURFACE_LAST_STRATEGY_SHOULD_NOT_LEAK12345678",
      triggerSource: "manual-github_pat_COMPACT_SURFACE_LAST_TRIGGER_SHOULD_NOT_LEAK12345678",
      usageBeforeFraction: 0.8,
      compacted: true,
      tokensSavedEstimate: 100,
      originalCount: 10,
      finalCount: 6,
      preservedSystemCount: 1,
      preservedRecentCount: 3,
      summarizedMessageCount: 4,
      summaryLineCount: 2,
    },
    ...overrides,
  });
}

const status = renderCompact(["status"]).output;
assert(status.includes("Pressure: high-[REDACTED]"), "compact status redacts pressure label");
assert(status.includes("Queued: micro-[REDACTED]"), "compact status redacts queued strategy");
assert(status.includes("Strategy: cached_micro-[REDACTED]"), "compact status redacts failure strategy");
assert(status.includes("Reason: last failure [REDACTED]"), "compact status redacts failure message");
assert(status.includes("Last handoff: failed | session_memory-[REDACTED]/manual-[REDACTED]"), "compact status redacts handoff labels");
assert(status.includes("Artifact: artifact_[REDACTED]"), "compact status redacts artifact id");
assert(status.includes("Handoff error: handoff error [REDACTED]"), "compact status redacts handoff error");
assert(status.includes("Why: pressure from [REDACTED]"), "compact status redacts recommendation reason");
assertRedacted(status, "compact status");

const recent = renderCompact(["recent"]).output;
assert(recent.includes("- reactive-[REDACTED] via manual-[REDACTED] | failed"), "compact recent redacts event labels");
assert(recent.includes("Reason: failure [REDACTED]"), "compact recent redacts failure reason");
assertRedacted(recent, "compact recent");

const handoff = renderCompact(["handoff"]).output;
assert(handoff.includes("Compaction: session_memory-[REDACTED] via manual-[REDACTED]"), "compact handoff redacts handoff labels");
assert(handoff.includes("Artifact: artifact_[REDACTED]"), "compact handoff redacts artifact id");
assert(handoff.includes("Error: handoff error [REDACTED]"), "compact handoff redacts handoff error");
assertRedacted(handoff, "compact handoff");

const smartHold = renderCompact(["smart"], {
  recommendation: {
    reason: "hold because ghp_COMPACT_SURFACE_SMART_REASON_SHOULD_NOT_LEAK12345678",
    pressure: "normal",
    microCandidateCount: 0,
    microTokensSavedEstimate: 0,
    strategy: null,
  },
}).output;
assert(smartHold.includes("Why: hold because [REDACTED]"), "smart hold redacts recommendation reason");
assertRedacted(smartHold, "compact smart hold");

const noSession = renderCompact(["status"], {
  hasLiveSession: false,
  noActiveHint: "no session github_pat_COMPACT_SURFACE_NO_SESSION_SHOULD_NOT_LEAK12345678",
}).output;
assert(noSession.includes("no session [REDACTED]"), "compact status redacts no-session hint");
assertRedacted(noSession, "compact no-session status");

console.log("Phase 376: compact status surfaces redact secret-shaped metadata.");
