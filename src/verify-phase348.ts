import { buildCompactCommandPayload } from "./gateway-compact";
import { buildMemoryCommandPayload } from "./gateway-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderCompact(args: string[]) {
  return buildCompactCommandPayload({
    args,
    hasLiveSession: true,
    messageCount: 20,
    activeRun: false,
    queuedStrategy: null,
    recommendation: {
      reason: "test recommendation",
      pressure: "normal",
      microCandidateCount: 0,
      microTokensSavedEstimate: 0,
      strategy: null,
    },
    recentEvents: [],
    handoff: null,
  });
}

const flagOnlyMemory = buildMemoryCommandPayload({
  args: ["--approved"],
  runtime: { memoryTruthModeOverride: null, lastMemoryRecall: null },
});
assert(!flagOnlyMemory.isError, "flag-only memory view renders status");
assert(flagOnlyMemory.output.includes("Memory Recall:"), "flag-only memory view renders status heading");
assert(!flagOnlyMemory.output.includes("--approved"), "flag-only memory view does not echo stray flag");

const flaggedMemoryRouting = buildMemoryCommandPayload({
  args: ["routing", "--approved"],
  runtime: { memoryTruthModeOverride: null, lastMemoryRecall: null },
});
assert(!flaggedMemoryRouting.isError, "flagged memory routing view still succeeds");
assert(flaggedMemoryRouting.output.includes("Memory Routing:"), "flagged memory routing view renders routing heading");
assert(!flaggedMemoryRouting.output.includes("--approved"), "flagged memory routing view does not echo stray flag");

const secretMemory = buildMemoryCommandPayload({
  args: ["ghp_MEMORY_SHOULD_NOT_LEAK12345678"],
  runtime: { memoryTruthModeOverride: null, lastMemoryRecall: null },
});
assert(secretMemory.isError, "secret-shaped memory mode remains rejected");
assert(secretMemory.output.includes("Unknown memory mode."), "secret-shaped memory mode renders sanitized error");
assert(secretMemory.output.includes("Input: [REDACTED]"), "secret-shaped memory mode renders redacted label");
assert(!secretMemory.output.includes("MEMORY_SHOULD_NOT_LEAK"), "secret-shaped memory mode redacts token body");
assert(!secretMemory.output.includes("ghp_"), "secret-shaped memory mode redacts token prefix");

const flaggedCompactStatus = renderCompact(["status", "--approved"]);
assert(!flaggedCompactStatus.isError, "flagged compact status view still succeeds");
assert(flaggedCompactStatus.output.includes("Compaction Status:"), "flagged compact status view renders status heading");
assert(!flaggedCompactStatus.output.includes("--approved"), "flagged compact status view does not echo stray flag");

const flaggedCompactRecent = renderCompact(["recent", "--approved"]);
assert(!flaggedCompactRecent.isError, "flagged compact recent view still succeeds");
assert(flaggedCompactRecent.output.includes("Recent Compactions:"), "flagged compact recent view renders recent heading");
assert(!flaggedCompactRecent.output.includes("--approved"), "flagged compact recent view does not echo stray flag");

const flagOnlyCompact = renderCompact(["--approved"]);
assert(flagOnlyCompact.isError, "flag-only compact does not become a default compaction request");
assert(!flagOnlyCompact.action, "flag-only compact emits no compaction action");

const secretCompact = renderCompact(["github_pat_COMPACT_SHOULD_NOT_LEAK12345678"]);
assert(secretCompact.isError, "secret-shaped compact strategy remains rejected");
assert(secretCompact.output.includes("Unknown compact strategy '[REDACTED]'"), "secret-shaped compact strategy renders redacted label");
assert(!secretCompact.output.includes("COMPACT_SHOULD_NOT_LEAK"), "secret-shaped compact strategy redacts token body");
assert(!secretCompact.output.includes("github_pat_"), "secret-shaped compact strategy redacts token prefix");

console.log("Phase 348: memory and compact command inputs ignore inspection flags and redact secrets.");
