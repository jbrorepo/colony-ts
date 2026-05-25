import { redactOperatorSurfaceText, redactOperatorSurfaceList } from "./operator-surface-redaction";
import { buildMemoryCommandPayload } from "./gateway-control";
import { renderDoctorView } from "./gateway-doctor";
import { renderFocusedProviderPerfView } from "./gateway-provider";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoSecrets(output: string, label: string): void {
  assert(!output.includes("OPERATOR_SURFACE_"), `${label} redacts token bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
  assert(!output.includes("sk-ant-"), `${label} redacts Anthropic token prefix`);
  assert(!output.includes("Bearer OPERATOR"), `${label} redacts bearer tokens`);
}

const raw = [
  "provider ghp_OPERATOR_SURFACE_PROVIDER_SHOULD_NOT_LEAK12345678",
  "model github_pat_OPERATOR_SURFACE_MODEL_SHOULD_NOT_LEAK12345678",
  "anthropic sk-ant-OPERATOR_SURFACE_ANTHROPIC_SHOULD_NOT_LEAK1234567890",
  "Authorization: Bearer OPERATOR_SURFACE_BEARER_SHOULD_NOT_LEAK1234567890",
].join(" | ");

const redacted = redactOperatorSurfaceText(raw);
assert(redacted.includes("provider [REDACTED]"), "shared helper redacts ghp tokens");
assert(redacted.includes("model [REDACTED]"), "shared helper redacts github_pat tokens");
assert(redacted.includes("anthropic [REDACTED_SECRET]"), "shared helper redacts scrubbed Anthropic tokens");
assert(redacted.includes("Authorization: Bearer ****"), "shared helper keeps generic scrubber output");
assertNoSecrets(redacted, "shared helper");

const list = redactOperatorSurfaceList([
  "one ghp_OPERATOR_SURFACE_LIST_ONE_SHOULD_NOT_LEAK12345678",
  "two github_pat_OPERATOR_SURFACE_LIST_TWO_SHOULD_NOT_LEAK12345678",
], ">");
assert(list === "one [REDACTED]>two [REDACTED]", "shared list helper redacts and joins values");
assert(redactOperatorSurfaceList([], ">") === "none", "shared list helper returns default fallback");

const provider = renderFocusedProviderPerfView({
  provider: "anthropic sk-ant-OPERATOR_SURFACE_PROVIDER_VIEW_SHOULD_NOT_LEAK1234567890",
  configuredModel: "claude github_pat_OPERATOR_SURFACE_PROVIDER_MODEL_SHOULD_NOT_LEAK12345678",
  mappedModels: ["claude ghp_OPERATOR_SURFACE_MAPPED_SHOULD_NOT_LEAK12345678"],
  totalApiDurationS: 3,
  totalCalls: 1,
  totalTokens: 10,
  rows: [{ model: "claude ghp_OPERATOR_SURFACE_ROW_SHOULD_NOT_LEAK12345678", apiDurationS: 3, callCount: 1 }],
  ambiguousModels: [],
  unmappedModels: [],
});
assert(provider.includes("Provider Performance: anthropic [REDACTED_SECRET]"), "provider view uses shared redaction");
assertNoSecrets(provider, "provider view");

const doctor = renderDoctorView({
  passed: false,
  errorCount: 1,
  warningCount: 0,
  mode: "all",
  query: "github_pat_OPERATOR_SURFACE_DOCTOR_QUERY_SHOULD_NOT_LEAK12345678",
  visibleChecks: [
    {
      prefix: "ERR ghp_OPERATOR_SURFACE_DOCTOR_PREFIX_SHOULD_NOT_LEAK12345678",
      name: "provider",
      message: "missing sk-ant-OPERATOR_SURFACE_DOCTOR_MESSAGE_SHOULD_NOT_LEAK1234567890",
      fix: "rotate github_pat_OPERATOR_SURFACE_DOCTOR_FIX_SHOULD_NOT_LEAK12345678",
    },
  ],
  allCheckCount: 1,
  providerMode: false,
  failoverMode: false,
  firstRunMode: false,
  inspectHints: ["inspect ghp_OPERATOR_SURFACE_DOCTOR_HINT_SHOULD_NOT_LEAK12345678"],
  firstRunLines: [],
  providerDiagnosticsLines: [],
});
assert(doctor.includes("Search: [REDACTED]"), "doctor view uses shared redaction for search query");
assertNoSecrets(doctor, "doctor view");

const memory = buildMemoryCommandPayload({
  args: ["palace"],
  runtime: {
    memoryTruthModeOverride: null,
    lastMemoryRecall: {
      palace: {
        hintedPath: "hall/ghp_OPERATOR_SURFACE_MEMORY_PATH_SHOULD_NOT_LEAK12345678",
        resolvedPath: "hall/github_pat_OPERATOR_SURFACE_MEMORY_RESOLVED_SHOULD_NOT_LEAK12345678",
      },
      noHitReason: "miss sk-ant-OPERATOR_SURFACE_MEMORY_NOHIT_SHOULD_NOT_LEAK1234567890",
    },
  },
}).output;
assert(memory.includes("Hinted path: hall/[REDACTED]"), "memory view uses shared redaction for paths");
assert(memory.includes("No-hit: miss [REDACTED_SECRET]"), "memory view uses shared redaction for no-hit reason");
assertNoSecrets(memory, "memory view");

console.log("Phase 384: provider, doctor, and memory operator surfaces share redaction helper behavior.");
