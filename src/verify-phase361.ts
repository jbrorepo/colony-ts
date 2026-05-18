import {
  renderPerfCompactionsView,
  renderPerfSummaryView,
  type GatewayCompactionPerfSummary,
} from "./gateway-events";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const compactionSummary: GatewayCompactionPerfSummary = {
  recentCount: 2,
  timedCount: 2,
  failureCount: 0,
  successCount: 2,
  totalTokensSaved: 12000,
  averageMs: 42,
  strongestSave: {
    strategy: "reactive github_pat_COMPACTION_BEST_SHOULD_NOT_LEAK12345678",
    tokensSavedEstimate: 9000,
    originalCount: 180,
    finalCount: 40,
  },
  slowest: {
    strategy: "standard ghp_COMPACTION_SLOW_SHOULD_NOT_LEAK12345678",
    durationMs: 84,
  },
};

const compactionsView = renderPerfCompactionsView(compactionSummary, "/perf compactions");
assert(compactionsView.includes("Best save: reactive [REDACTED] | ~9,000 tokens | 180->40"), "compaction perf view redacts strongest-save strategy");
assert(compactionsView.includes("Slowest compaction: standard [REDACTED] | 84ms"), "compaction perf view redacts slowest strategy");
assert(!compactionsView.includes("COMPACTION_BEST_SHOULD_NOT_LEAK"), "compaction perf view redacts strongest-save token body");
assert(!compactionsView.includes("COMPACTION_SLOW_SHOULD_NOT_LEAK"), "compaction perf view redacts slowest token body");
assert(!compactionsView.includes("github_pat_"), "compaction perf view redacts GitHub PAT prefix");
assert(!compactionsView.includes("ghp_"), "compaction perf view redacts GitHub token prefix");

const summaryView = renderPerfSummaryView({
  modelRows: [],
  providerSummaries: [],
  runtimeEvents: [],
  timedEvents: [],
  toolSummary: {
    recentCount: 0,
    timedCount: 0,
    failureCount: 0,
    averageMs: 0,
  },
  hookSummary: {
    recentCount: 0,
    timedCount: 0,
    averageMs: 0,
  },
  compactionSummary,
  views: "/perf",
});
assert(summaryView.includes("Best save: reactive [REDACTED] | ~9,000 tokens"), "perf summary redacts strongest-save strategy");
assert(summaryView.includes("Slowest compaction: standard [REDACTED] | 84ms"), "perf summary redacts slowest compaction strategy");
assert(!summaryView.includes("COMPACTION_BEST_SHOULD_NOT_LEAK"), "perf summary redacts strongest-save token body");
assert(!summaryView.includes("COMPACTION_SLOW_SHOULD_NOT_LEAK"), "perf summary redacts slowest token body");
assert(!summaryView.includes("github_pat_"), "perf summary redacts GitHub PAT prefix");
assert(!summaryView.includes("ghp_"), "perf summary redacts GitHub token prefix");

console.log("Phase 361: compaction performance metadata redacts secret-shaped strategy labels.");
