import { buildModelCommandPayload } from "./gateway-control";
import { normalizeProviderAlias, resolveConfiguredProvider } from "./gateway-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = {
  provider: "local",
  model: "llama3",
  selectedProvider: "local",
  selectedModel: "llama3",
  availableProviders: ["local", "anthropic", "openai"],
  providerDefaults: {
    local: "llama3",
    anthropic: "claude-sonnet",
    openai: "gpt-4.1",
  },
};

function model(args: string[]) {
  return buildModelCommandPayload({
    args,
    runtime,
    normalizeProviderAlias,
    resolveConfiguredProvider,
  });
}

const flagOnlyStatus = model(["--approved"]);
assert(!flagOnlyStatus.isError, "flag-only model command renders status");
assert(flagOnlyStatus.output.includes("Model Status:"), "flag-only model command renders status heading");
assert(!flagOnlyStatus.output.includes("--approved"), "flag-only model command does not echo approval flag");
assert(!flagOnlyStatus.action, "flag-only model command emits no selection action");

const flagOnlyUse = model(["use", "--approved"]);
assert(flagOnlyUse.isError, "flag-only model selection is rejected");
assert(flagOnlyUse.output.includes("Model name required."), "flag-only model selection explains missing model");
assert(flagOnlyUse.output.includes("/model <model>"), "flag-only model selection gives retry command");
assert(!flagOnlyUse.output.includes("--approved"), "flag-only model selection does not echo approval flag");
assert(!flagOnlyUse.action, "flag-only model selection emits no selection action");

const secretModel = model(["ghp_MODEL_SHOULD_NOT_LEAK12345678"]);
assert(secretModel.isError, "secret-shaped model name is rejected");
assert(secretModel.output.includes("Model name rejected."), "secret-shaped model name explains rejection");
assert(!secretModel.output.includes("MODEL_SHOULD_NOT_LEAK"), "secret-shaped model name redacts token body");
assert(!secretModel.output.includes("ghp_"), "secret-shaped model name redacts token prefix");
assert(!secretModel.action, "secret-shaped model name emits no selection action");

const secretProviderModel = model(["anthropic", "github_pat_MODEL_PROVIDER_SHOULD_NOT_LEAK12345678"]);
assert(secretProviderModel.isError, "secret-shaped provider model name is rejected");
assert(!secretProviderModel.output.includes("MODEL_PROVIDER_SHOULD_NOT_LEAK"), "secret-shaped provider model redacts token body");
assert(!secretProviderModel.output.includes("github_pat_"), "secret-shaped provider model redacts token prefix");
assert(!secretProviderModel.action, "secret-shaped provider model emits no selection action");

const validModel = model(["anthropic", "claude-sonnet"]);
assert(!validModel.isError, "valid provider model selection still succeeds");
assert(validModel.output.includes("Selected provider: anthropic"), "valid model selection preserves provider");
assert(validModel.output.includes("Selected model: claude-sonnet"), "valid model selection preserves model");
assert(validModel.action?.kind === "set_provider", "valid model selection emits set provider action");

console.log("Phase 352: model command inputs ignore flags and redact secrets.");
