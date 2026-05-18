import {
  renderCostModelsBreakdown,
  renderCostPerfBreakdown,
  renderDetailedCostBreakdown,
  type GatewayCostUsageRow,
} from "./gateway-cost";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const modelRows: GatewayCostUsageRow[] = [
  {
    model: "claude ghp_COST_MODEL_SHOULD_NOT_LEAK12345678",
    callCount: 2,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 100,
    cacheCreationTokens: 50,
    apiDurationS: 12,
  },
  {
    model: "gpt github_pat_COST_PAT_SHOULD_NOT_LEAK12345678",
    callCount: 1,
    inputTokens: 700,
    outputTokens: 300,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    apiDurationS: 9,
  },
];

const detailed = renderDetailedCostBreakdown({ modelRows });
assert(detailed.includes("`claude [REDACTED]`: 2 calls, 1,500 tokens, 12.0s API time"), "cost summary redacts per-model usage label");
assert(!detailed.includes("COST_MODEL_SHOULD_NOT_LEAK"), "cost summary redacts model token body");
assert(!detailed.includes("ghp_"), "cost summary redacts GitHub token prefix");

const models = renderCostModelsBreakdown(modelRows);
assert(models.includes("`claude [REDACTED]`"), "cost models view redacts model label");
assert(models.includes("`gpt [REDACTED]`"), "cost models view redacts PAT model label");
assert(!models.includes("COST_MODEL_SHOULD_NOT_LEAK"), "cost models view redacts token body");
assert(!models.includes("COST_PAT_SHOULD_NOT_LEAK"), "cost models view redacts PAT token body");
assert(!models.includes("github_pat_"), "cost models view redacts GitHub PAT prefix");
assert(!models.includes("ghp_"), "cost models view redacts GitHub token prefix");

const perf = renderCostPerfBreakdown({
  totalApiDurationS: 21,
  totalCalls: 3,
  modelRows,
});
assert(perf.includes("Slowest average: `gpt [REDACTED]` | 1 calls | 9.00s/call"), "cost perf view redacts slowest model label");
assert(perf.includes("Highest total: `claude [REDACTED]` | 12.0s over 2 calls"), "cost perf view redacts highest-total model label");
assert(perf.includes("`claude [REDACTED]`: 12.0s total | 2 calls | 6.00s/call"), "cost perf view redacts per-model latency label");
assert(!perf.includes("COST_MODEL_SHOULD_NOT_LEAK"), "cost perf view redacts token body");
assert(!perf.includes("COST_PAT_SHOULD_NOT_LEAK"), "cost perf view redacts PAT token body");
assert(!perf.includes("github_pat_"), "cost perf view redacts GitHub PAT prefix");
assert(!perf.includes("ghp_"), "cost perf view redacts GitHub token prefix");

console.log("Phase 363: cost model metadata redacts secret-shaped identifiers.");
