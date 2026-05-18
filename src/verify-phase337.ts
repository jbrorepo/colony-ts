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

const flagOnlyUse = buildProviderCommandPayload({
  args: ["use", "--approved"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(flagOnlyUse.isError, "flag-only provider selection is rejected");
assert(flagOnlyUse.output.includes("Provider name required."), "flag-only provider selection explains missing name");
assert(flagOnlyUse.output.includes("/provider use <name>"), "flag-only provider selection gives retry command");
assert(!flagOnlyUse.output.includes("--approved"), "flag-only provider selection does not echo approval flag");

const secretUse = buildProviderCommandPayload({
  args: ["use", "ghp_PROVIDER_SHOULD_NOT_LEAK12345678"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(secretUse.isError, "secret-shaped provider selection is rejected");
assert(secretUse.output.includes("Unknown provider '[REDACTED]'"), "secret-shaped provider selection redacts display");
assert(!secretUse.output.includes("PROVIDER_SHOULD_NOT_LEAK"), "secret-shaped provider selection redacts token body");
assert(!secretUse.output.includes("ghp_"), "secret-shaped provider selection redacts token prefix");

const validUse = buildProviderCommandPayload({
  args: ["use", "open"],
  runtime,
  startupReport: null,
  costTracker: null,
});
assert(!validUse.isError, "valid provider prefix still resolves");
assert(validUse.output.includes("Selected provider: openai"), "valid provider selection still renders selected provider");
assert(validUse.action?.kind === "set_provider", "valid provider selection still emits action");
assert(validUse.data?.provider === "openai", "valid provider selection still stores resolved provider");

console.log("Phase 337: provider selection names are required and redacted.");
