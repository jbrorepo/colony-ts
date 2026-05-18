import {
  formatFailoverEventLine,
  formatProviderHealthSummary,
  renderFocusedProviderStatusView,
  renderProviderSelectionUpdated,
  renderProviderSummaryView,
} from "./gateway-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const selection = renderProviderSelectionUpdated({
  provider: "openai ghp_PROVIDER_SELECTION_SHOULD_NOT_LEAK12345678",
  selectedModel: "gpt github_pat_MODEL_SELECTION_SHOULD_NOT_LEAK12345678",
  currentProvider: "anthropic ghp_CURRENT_PROVIDER_SHOULD_NOT_LEAK12345678",
  currentModel: "claude ghp_CURRENT_MODEL_SHOULD_NOT_LEAK12345678",
});
assert(selection.includes("Selected provider: openai [REDACTED]"), "provider selection redacts selected provider");
assert(selection.includes("Selected model: gpt [REDACTED]"), "provider selection redacts selected model");
assert(selection.includes("Current provider: anthropic [REDACTED]"), "provider selection redacts current provider");
assert(selection.includes("Current model: claude [REDACTED]"), "provider selection redacts current model");
assert(selection.includes("Next run: openai [REDACTED]:gpt [REDACTED] primary"), "provider selection redacts next-run labels");
assert(!selection.includes("SELECTION_SHOULD_NOT_LEAK"), "provider selection redacts token bodies");

const summary = renderProviderSummaryView({
  selectedProvider: "gemini ghp_SUMMARY_SELECTED_PROVIDER_SHOULD_NOT_LEAK12345678",
  selectedModel: "flash ghp_SUMMARY_SELECTED_MODEL_SHOULD_NOT_LEAK12345678",
  currentProvider: "ollama ghp_SUMMARY_CURRENT_PROVIDER_SHOULD_NOT_LEAK12345678",
  currentModel: "llama github_pat_SUMMARY_CURRENT_MODEL_SHOULD_NOT_LEAK12345678",
  circuitState: "closed",
  availableProviders: [
    "openai ghp_AVAILABLE_PROVIDER_SHOULD_NOT_LEAK12345678",
  ],
  failoverEntries: [
    {
      provider: "openai ghp_FAILOVER_PROVIDER_SHOULD_NOT_LEAK12345678",
      chain: [
        "anthropic ghp_FAILOVER_TARGET_SHOULD_NOT_LEAK12345678",
      ],
    },
  ],
  observedHealth: [
    {
      provider: "openai ghp_HEALTH_PROVIDER_SHOULD_NOT_LEAK12345678",
      state: "ok",
      failures: 0,
    },
  ],
  recentFailovers: [
    "2026-05-18T10:30:00.000Z | openai ghp_RECENT_FAILOVER_SHOULD_NOT_LEAK12345678:gpt -> anthropic:claude",
  ],
  summaryHints: [
    "Check provider ghp_HINT_SHOULD_NOT_LEAK12345678",
  ],
  performanceLine: "Performance: slowest ghp_PERF_LINE_SHOULD_NOT_LEAK12345678",
});
assert(summary.includes("Selected provider: gemini [REDACTED]"), "provider summary redacts selected provider");
assert(summary.includes("Selected model: flash [REDACTED]"), "provider summary redacts selected model");
assert(summary.includes("Current provider: ollama [REDACTED]"), "provider summary redacts current provider");
assert(summary.includes("Current model: llama [REDACTED]"), "provider summary redacts current model");
assert(summary.includes("Configured providers: openai [REDACTED]"), "provider summary redacts available providers");
assert(summary.includes("openai [REDACTED] -> anthropic [REDACTED]"), "provider summary redacts failover chain");
assert(summary.includes("openai [REDACTED]: ok (failures: 0)"), "provider summary redacts observed health provider");
assert(summary.includes("Check provider [REDACTED]"), "provider summary redacts hints");
assert(summary.includes("Performance: slowest [REDACTED]"), "provider summary redacts performance line");
assert(!summary.includes("SHOULD_NOT_LEAK"), "provider summary redacts token bodies");

const focused = renderFocusedProviderStatusView({
  provider: "openai ghp_FOCUSED_PROVIDER_SHOULD_NOT_LEAK12345678",
  configuredModel: "gpt ghp_FOCUSED_CONFIGURED_MODEL_SHOULD_NOT_LEAK12345678",
  currentProvider: "openai ghp_FOCUSED_CURRENT_PROVIDER_SHOULD_NOT_LEAK12345678",
  currentModel: "gpt ghp_FOCUSED_CURRENT_MODEL_SHOULD_NOT_LEAK12345678",
  isCurrent: true,
  isSelectedDefault: true,
  outgoingChain: [
    "anthropic ghp_FOCUSED_OUTGOING_SHOULD_NOT_LEAK12345678",
  ],
  incomingChain: [
    "gemini ghp_FOCUSED_INCOMING_SHOULD_NOT_LEAK12345678",
  ],
  outgoingFailovers: [
    "openai ghp_FOCUSED_OUT_EVENT_SHOULD_NOT_LEAK12345678:gpt -> anthropic:claude",
  ],
  incomingFailovers: [
    "gemini:gpt -> openai ghp_FOCUSED_IN_EVENT_SHOULD_NOT_LEAK12345678:claude",
  ],
  relatedChecks: [],
  recoveryHints: [
    "Try provider ghp_FOCUSED_HINT_SHOULD_NOT_LEAK12345678",
  ],
  performanceLine: "Performance: ghp_FOCUSED_PERF_SHOULD_NOT_LEAK12345678",
});
assert(focused.includes("Selected provider: openai [REDACTED]"), "focused provider status redacts provider");
assert(focused.includes("Configured model: gpt [REDACTED]"), "focused provider status redacts configured model");
assert(focused.includes("Configured failover targets: anthropic [REDACTED]"), "focused provider status redacts outgoing chain");
assert(focused.includes("Incoming failover sources: gemini [REDACTED]"), "focused provider status redacts incoming chain");
assert(focused.includes("Try provider [REDACTED]"), "focused provider status redacts hints");
assert(!focused.includes("FOCUSED_"), "focused provider status redacts token bodies");

const health = formatProviderHealthSummary({
  "openai ghp_HEALTH_SUMMARY_SHOULD_NOT_LEAK12345678": {
    state: "ok",
    failureCount: 1,
  },
}, "openai ghp_HEALTH_SUMMARY_SHOULD_NOT_LEAK12345678");
assert(health.includes("openai [REDACTED] [current]: ok (1)"), "provider health summary redacts provider");
assert(!health.includes("HEALTH_SUMMARY_SHOULD_NOT_LEAK"), "provider health summary redacts token body");

const failover = formatFailoverEventLine({
  fromProvider: "openai ghp_FAILOVER_FROM_PROVIDER_SHOULD_NOT_LEAK12345678",
  fromModel: "gpt ghp_FAILOVER_FROM_MODEL_SHOULD_NOT_LEAK12345678",
  toProvider: "anthropic github_pat_FAILOVER_TO_PROVIDER_SHOULD_NOT_LEAK12345678",
  toModel: "claude ghp_FAILOVER_TO_MODEL_SHOULD_NOT_LEAK12345678",
  errorType: "ProviderError ghp_FAILOVER_ERROR_TYPE_SHOULD_NOT_LEAK12345678",
  errorMessage: "message ghp_FAILOVER_MESSAGE_SHOULD_NOT_LEAK12345678",
  timestamp: Date.parse("2026-05-18T10:34:00.000Z"),
});
assert(failover.includes("openai [REDACTED]:gpt [REDACTED] -> anthropic [REDACTED]:claude [REDACTED]"), "failover line redacts provider and model labels");
assert(failover.includes("(ProviderError [REDACTED]) | message [REDACTED]"), "failover line redacts error metadata");
assert(!failover.includes("FAILOVER_"), "failover line redacts token bodies");
assert(!failover.includes("github_pat_"), "failover line redacts PAT prefix");
assert(!failover.includes("ghp_"), "failover line redacts token prefix");

console.log("Phase 364: provider status metadata redacts secret-shaped labels.");
