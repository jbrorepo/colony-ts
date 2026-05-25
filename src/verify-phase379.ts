import {
  renderFocusedProviderFailoversView,
  renderFocusedProviderPerfView,
  renderProviderPerfView,
} from "./gateway-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("PROVIDER_COMMAND_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
  assert(!output.includes("sk-ant-"), `${label} redacts Anthropic token prefix`);
}

const focusedPerf = renderFocusedProviderPerfView({
  provider: "openai ghp_PROVIDER_COMMAND_SURFACE_PROVIDER_SHOULD_NOT_LEAK12345678",
  configuredModel: "gpt-4o github_pat_PROVIDER_COMMAND_SURFACE_MODEL_SHOULD_NOT_LEAK12345678",
  mappedModels: [
    "gpt-4o ghp_PROVIDER_COMMAND_SURFACE_MAPPED_SHOULD_NOT_LEAK12345678",
  ],
  totalApiDurationS: 8,
  totalCalls: 2,
  totalTokens: 300,
  rows: [
    {
      model: "gpt-4o-mini sk-ant-PROVIDER_COMMAND_SURFACE_ROW_SHOULD_NOT_LEAK1234567890",
      apiDurationS: 8,
      callCount: 2,
    },
  ],
  ambiguousModels: [
    "shared-model ghp_PROVIDER_COMMAND_SURFACE_AMBIGUOUS_SHOULD_NOT_LEAK12345678",
  ],
  unmappedModels: [
    "unmapped-model github_pat_PROVIDER_COMMAND_SURFACE_UNMAPPED_SHOULD_NOT_LEAK12345678",
  ],
});

assert(focusedPerf.includes("Provider Performance: openai [REDACTED]"), "focused provider perf redacts provider header");
assert(focusedPerf.includes("Configured model: gpt-4o [REDACTED]"), "focused provider perf redacts configured model");
assert(focusedPerf.includes("Mapped models: gpt-4o [REDACTED]"), "focused provider perf redacts mapped models");
assert(focusedPerf.includes("gpt-4o-mini [REDACTED_SECRET]: 8.0s total"), "focused provider perf redacts row model");
assert(focusedPerf.includes("Ambiguous models hidden: shared-model [REDACTED]"), "focused provider perf redacts ambiguous models");
assert(focusedPerf.includes("Unmapped timed models: unmapped-model [REDACTED]"), "focused provider perf redacts unmapped models");
assertRedacted(focusedPerf, "focused provider perf");

const providerPerf = renderProviderPerfView({
  timedProviders: [
    {
      provider: "anthropic github_pat_PROVIDER_COMMAND_SURFACE_TIMED_PROVIDER_SHOULD_NOT_LEAK12345678",
      totalApiDurationS: 12,
      totalCalls: 3,
      models: [
        "claude-3 ghp_PROVIDER_COMMAND_SURFACE_TIMED_MODEL_SHOULD_NOT_LEAK12345678",
      ],
    },
  ],
  ambiguousModels: [
    "shared github_pat_PROVIDER_COMMAND_SURFACE_VIEW_AMBIGUOUS_SHOULD_NOT_LEAK12345678 -> anthropic/openai",
  ],
  unmappedModels: [
    "unknown ghp_PROVIDER_COMMAND_SURFACE_VIEW_UNMAPPED_SHOULD_NOT_LEAK12345678",
  ],
});

assert(providerPerf.includes("Slowest average: anthropic [REDACTED] | 4.00s/call"), "provider perf redacts slowest provider");
assert(providerPerf.includes("Highest total: anthropic [REDACTED] | 12.0s over 3 calls"), "provider perf redacts highest provider");
assert(providerPerf.includes("anthropic [REDACTED]: 12.0s total | 3 calls | 4.00s/call | claude-3 [REDACTED]"), "provider perf redacts provider row models");
assert(providerPerf.includes("Ambiguous models hidden: shared [REDACTED] -> anthropic/openai"), "provider perf redacts ambiguous model labels");
assert(providerPerf.includes("Unmapped timed models: unknown [REDACTED]"), "provider perf redacts unmapped model labels");
assertRedacted(providerPerf, "provider perf");

const failovers = renderFocusedProviderFailoversView({
  provider: "openai ghp_PROVIDER_COMMAND_SURFACE_FAIL_PROVIDER_SHOULD_NOT_LEAK12345678",
  configuredModel: "gpt github_pat_PROVIDER_COMMAND_SURFACE_FAIL_MODEL_SHOULD_NOT_LEAK12345678",
  observedState: "open ghp_PROVIDER_COMMAND_SURFACE_FAIL_STATE_SHOULD_NOT_LEAK12345678",
  observedFailures: 1,
  matchedCount: 1,
  totalRecentFailovers: 2,
  incomingFailovers: [
    "2026-05-18T10:00:00Z | anthropic -> openai | ghp_PROVIDER_COMMAND_SURFACE_INCOMING_SHOULD_NOT_LEAK12345678",
  ],
  outgoingFailovers: [
    "2026-05-18T10:01:00Z | openai -> gemini | github_pat_PROVIDER_COMMAND_SURFACE_OUTGOING_SHOULD_NOT_LEAK12345678",
  ],
  recoveryHints: [
    "rotate token sk-ant-PROVIDER_COMMAND_SURFACE_HINT_SHOULD_NOT_LEAK1234567890",
  ],
});

assert(failovers.includes("Provider Failovers: openai [REDACTED]"), "provider failovers redacts provider header");
assert(failovers.includes("Configured model: gpt [REDACTED]"), "provider failovers redacts configured model");
assert(failovers.includes("Observed health: open [REDACTED] (failures: 1)"), "provider failovers redacts health state");
assert(failovers.includes("anthropic -> openai | [REDACTED]"), "provider failovers redacts incoming events");
assert(failovers.includes("openai -> gemini | [REDACTED]"), "provider failovers redacts outgoing events");
assert(failovers.includes("- rotate token [REDACTED_SECRET]"), "provider failovers redacts recovery hints");
assert(failovers.includes("Inspect: /provider openai [REDACTED] | /provider perf openai [REDACTED] | /provider health | /doctor openai [REDACTED]"), "provider failovers redacts inspect commands");
assertRedacted(failovers, "provider failovers");

console.log("Phase 379: provider command performance and failover surfaces redact secret-shaped metadata.");
