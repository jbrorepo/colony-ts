import { buildProviderCommandPayload } from "./gateway-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = {
  provider: "local",
  model: "llama3",
  availableProviders: ["local", "anthropic", "openai"],
  providerDefaults: {
    local: "llama3",
    anthropic: "claude-sonnet",
    openai: "gpt-4.1",
  },
};

const flagOnlyView = buildProviderCommandPayload({
  args: ["--approved"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(!flagOnlyView.isError, "flag-only provider view renders summary");
assert(flagOnlyView.output.includes("Provider Status:"), "flag-only provider view renders provider status");
assert(flagOnlyView.output.includes("Current provider: local"), "flag-only provider view preserves current provider");
assert(!flagOnlyView.output.includes("--approved"), "flag-only provider view does not echo stray flag");

const flaggedPerfView = buildProviderCommandPayload({
  args: ["perf", "--approved"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(!flaggedPerfView.isError, "flagged provider perf view renders read-only perf");
assert(flaggedPerfView.output.includes("Provider Performance:"), "flagged provider perf view renders performance");
assert(!flaggedPerfView.output.includes("--approved"), "flagged provider perf view does not echo stray flag");

const secretView = buildProviderCommandPayload({
  args: ["ghp_PROVIDER_VIEW_SHOULD_NOT_LEAK12345678"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(secretView.isError, "secret-shaped provider view is rejected");
assert(secretView.output.includes("Unknown provider view '[REDACTED]'"), "secret-shaped provider view redacts display");
assert(!secretView.output.includes("PROVIDER_VIEW_SHOULD_NOT_LEAK"), "secret-shaped provider view redacts token body");
assert(!secretView.output.includes("ghp_"), "secret-shaped provider view redacts token prefix");

const validView = buildProviderCommandPayload({
  args: ["open"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(!validView.isError, "valid provider view still resolves provider prefix");
assert(validView.output.includes("Selected provider: openai"), "valid provider view renders resolved provider");
assert(validView.data?.provider === "openai", "valid provider view stores resolved provider");

console.log("Phase 338: provider view flags are ignored and unknown views are redacted.");
