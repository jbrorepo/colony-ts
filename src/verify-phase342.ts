import { buildCostCommandPayload } from "./gateway-cost";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderCost(args: string[]) {
  return buildCostCommandPayload({
    args,
    summary: "Input tokens: 10\nOutput tokens: 5\nTotal tokens: 15\nEstimated cost: $0.000001",
    modelRows: [],
    budget: { maxUsd: null, maxTokens: null },
    estimatedCost: 0.000001,
  });
}

const flagOnly = renderCost(["--approved"]);
assert(!flagOnly.isError, "flag-only cost view renders summary");
assert(flagOnly.output.includes("Cost Breakdown:"), "flag-only cost view renders cost heading");
assert(!flagOnly.output.includes("--approved"), "flag-only cost view does not echo stray flag");
assert(flagOnly.data?.view === "summary", "flag-only cost view stores summary view");

const flaggedModels = renderCost(["models", "--approved"]);
assert(!flaggedModels.isError, "flagged cost models view still succeeds");
assert(flaggedModels.output.includes("Cost Models:"), "flagged cost models view renders models heading");
assert(!flaggedModels.output.includes("--approved"), "flagged cost models view does not echo stray flag");
assert(flaggedModels.data?.view === "models", "flagged cost models view stores models view");

const secretView = renderCost(["ghp_COST_SHOULD_NOT_LEAK12345678"]);
assert(secretView.isError, "secret-shaped cost view remains rejected");
assert(secretView.output.includes("Unknown cost view '[REDACTED]'"), "secret-shaped cost view renders redacted label");
assert(!secretView.output.includes("COST_SHOULD_NOT_LEAK"), "secret-shaped cost view redacts token body");
assert(!secretView.output.includes("ghp_"), "secret-shaped cost view redacts token prefix");

console.log("Phase 342: cost command inputs ignore flags and redact secrets.");
