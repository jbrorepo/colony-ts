import { buildModelCommandPayload } from "./gateway-control";
import {
  renderModelStatusView,
  renderStatusRuntimeSection,
} from "./gateway-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const modelStatus = renderModelStatusView({
  selectedProvider: "openai ghp_MODEL_STATUS_PROVIDER_SHOULD_NOT_LEAK12345678",
  selectedModel: "gpt github_pat_MODEL_STATUS_MODEL_SHOULD_NOT_LEAK12345678",
  currentProvider: "anthropic ghp_MODEL_STATUS_CURRENT_PROVIDER_SHOULD_NOT_LEAK12345678",
  currentModel: "claude ghp_MODEL_STATUS_CURRENT_MODEL_SHOULD_NOT_LEAK12345678",
});
assert(modelStatus.includes("Selected provider: openai [REDACTED]"), "model status redacts selected provider");
assert(modelStatus.includes("Selected model: gpt [REDACTED]"), "model status redacts selected model");
assert(modelStatus.includes("Current provider: anthropic [REDACTED]"), "model status redacts current provider");
assert(modelStatus.includes("Current model: claude [REDACTED]"), "model status redacts current model");
assert(!modelStatus.includes("MODEL_STATUS_"), "model status redacts token bodies");
assert(!modelStatus.includes("github_pat_"), "model status redacts GitHub PAT prefix");
assert(!modelStatus.includes("ghp_"), "model status redacts GitHub token prefix");

const modelSelection = buildModelCommandPayload({
  args: ["openai", "gpt-4.1"],
  runtime: {
    selectedProvider: "anthropic ghp_MODEL_COMMAND_SELECTED_PROVIDER_SHOULD_NOT_LEAK12345678",
    selectedModel: "claude ghp_MODEL_COMMAND_SELECTED_MODEL_SHOULD_NOT_LEAK12345678",
    provider: "anthropic ghp_MODEL_COMMAND_CURRENT_PROVIDER_SHOULD_NOT_LEAK12345678",
    model: "claude github_pat_MODEL_COMMAND_CURRENT_MODEL_SHOULD_NOT_LEAK12345678",
  },
  normalizeProviderAlias: (provider) => provider,
  resolveConfiguredProvider: () => ({
    provider: "openai ghp_MODEL_COMMAND_PROVIDER_SHOULD_NOT_LEAK12345678",
  }),
});
assert(!modelSelection.isError, "model selection with configured provider succeeds");
assert(modelSelection.output.includes("Selected provider: openai [REDACTED]"), "model command redacts selected provider");
assert(modelSelection.output.includes("Selected model: gpt-4.1"), "model command preserves safe selected model");
assert(modelSelection.output.includes("Current provider: anthropic [REDACTED]"), "model command redacts current provider");
assert(modelSelection.output.includes("Current model: claude [REDACTED]"), "model command redacts current model");
assert(modelSelection.output.includes("Next run: openai [REDACTED]:gpt-4.1 primary"), "model command redacts next-run provider");
assert(modelSelection.action?.kind === "set_provider", "model command still emits set provider action");
assert(!modelSelection.output.includes("MODEL_COMMAND_"), "model command redacts token bodies");
assert(!modelSelection.output.includes("github_pat_"), "model command redacts GitHub PAT prefix");
assert(!modelSelection.output.includes("ghp_"), "model command redacts GitHub token prefix");

const runtimeSection = renderStatusRuntimeSection({
  hasRuntime: true,
  selectedProvider: "openai ghp_RUNTIME_SELECTED_PROVIDER_SHOULD_NOT_LEAK12345678",
  selectedModel: "gpt ghp_RUNTIME_SELECTED_MODEL_SHOULD_NOT_LEAK12345678",
  provider: "anthropic github_pat_RUNTIME_CURRENT_PROVIDER_SHOULD_NOT_LEAK12345678",
  model: "claude ghp_RUNTIME_CURRENT_MODEL_SHOULD_NOT_LEAK12345678",
  circuitState: "closed ghp_RUNTIME_CIRCUIT_SHOULD_NOT_LEAK12345678",
  runActive: false,
  observedHealthLine: "Observed health: openai ghp_RUNTIME_HEALTH_SHOULD_NOT_LEAK12345678 ok",
  latestFailoverLine: "Latest failover: anthropic ghp_RUNTIME_FAILOVER_SHOULD_NOT_LEAK12345678",
});
const runtimeOutput = runtimeSection.join("\n");
assert(runtimeOutput.includes("Selected provider: openai [REDACTED]"), "runtime status redacts selected provider");
assert(runtimeOutput.includes("Selected model: gpt [REDACTED]"), "runtime status redacts selected model");
assert(runtimeOutput.includes("Provider: anthropic [REDACTED]"), "runtime status redacts current provider");
assert(runtimeOutput.includes("Model: claude [REDACTED]"), "runtime status redacts current model");
assert(runtimeOutput.includes("Circuit: closed [REDACTED]"), "runtime status redacts circuit state");
assert(runtimeOutput.includes("Observed health: openai [REDACTED] ok"), "runtime status redacts observed health line");
assert(runtimeOutput.includes("Latest failover: anthropic [REDACTED]"), "runtime status redacts latest failover line");
assert(!runtimeOutput.includes("RUNTIME_"), "runtime status redacts token bodies");
assert(!runtimeOutput.includes("github_pat_"), "runtime status redacts GitHub PAT prefix");
assert(!runtimeOutput.includes("ghp_"), "runtime status redacts GitHub token prefix");

console.log("Phase 365: model and runtime status surfaces redact secret-shaped labels.");
