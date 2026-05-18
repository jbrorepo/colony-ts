import {
  renderPerfProvidersView,
  renderPerfSummaryView,
  type GatewayProviderPerfSummary,
} from "./gateway-events";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const providerSummaries: GatewayProviderPerfSummary[] = [
  {
    provider: "openai ghp_PROVIDER_SHOULD_NOT_LEAK12345678",
    totalCalls: 2,
    totalApiDurationS: 12,
  },
  {
    provider: "anthropic github_pat_PROVIDER_PAT_SHOULD_NOT_LEAK12345678",
    totalCalls: 1,
    totalApiDurationS: 9,
  },
];

const providersView = renderPerfProvidersView({
  summaries: providerSummaries,
  ambiguousCount: 0,
  unmappedModels: [
    "gpt-4o ghp_UNMAPPED_MODEL_SHOULD_NOT_LEAK12345678",
  ],
  views: "/perf providers",
});
assert(providersView.includes("Slowest provider: anthropic [REDACTED] | 9.00s/call"), "provider perf view redacts slowest provider");
assert(providersView.includes("openai [REDACTED]: 12.0s | 2 calls | 6.00s/call"), "provider perf view redacts provider row");
assert(providersView.includes("Unmapped timed models: `gpt-4o [REDACTED]`"), "provider perf view redacts unmapped model");
assert(!providersView.includes("PROVIDER_SHOULD_NOT_LEAK"), "provider perf view redacts provider token body");
assert(!providersView.includes("PROVIDER_PAT_SHOULD_NOT_LEAK"), "provider perf view redacts provider PAT body");
assert(!providersView.includes("UNMAPPED_MODEL_SHOULD_NOT_LEAK"), "provider perf view redacts unmapped model token body");
assert(!providersView.includes("github_pat_"), "provider perf view redacts GitHub PAT prefix");
assert(!providersView.includes("ghp_"), "provider perf view redacts GitHub token prefix");

const summaryView = renderPerfSummaryView({
  modelRows: [
    {
      model: "claude ghp_MODEL_SHOULD_NOT_LEAK12345678",
      callCount: 1,
      apiDurationS: 11,
    },
  ],
  providerSummaries,
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
  compactionSummary: {
    recentCount: 0,
    timedCount: 0,
    failureCount: 0,
    successCount: 0,
    totalTokensSaved: 0,
    averageMs: 0,
  },
  views: "/perf",
});
assert(summaryView.includes("Slowest model: `claude [REDACTED]` | 11.00s/call"), "perf summary redacts slowest model");
assert(summaryView.includes("Slowest provider: anthropic [REDACTED] | 9.00s/call"), "perf summary redacts slowest provider");
assert(!summaryView.includes("MODEL_SHOULD_NOT_LEAK"), "perf summary redacts model token body");
assert(!summaryView.includes("PROVIDER_PAT_SHOULD_NOT_LEAK"), "perf summary redacts provider token body");
assert(!summaryView.includes("github_pat_"), "perf summary redacts GitHub PAT prefix");
assert(!summaryView.includes("ghp_"), "perf summary redacts GitHub token prefix");

console.log("Phase 362: provider and model performance metadata redacts secret-shaped identifiers.");
