import { buildSwarmCommandPayload } from "./gateway-swarm";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const flagOnly = buildSwarmCommandPayload(["--approved"]);
assert(flagOnly.isError, "flag-only swarm command renders usage");
assert(flagOnly.output.includes("Usage: /swarm <objective>"), "flag-only swarm command renders usage text");
assert(!flagOnly.output.includes("--approved"), "flag-only swarm command does not echo approval flag");
assert(!flagOnly.action, "flag-only swarm command emits no start action");

const flaggedStatus = buildSwarmCommandPayload(["status", "--approved"]);
assert(!flaggedStatus.isError, "flagged swarm status renders run list");
assert(flaggedStatus.output.includes("Swarm Runs:"), "flagged swarm status renders run list heading");
assert(!flaggedStatus.output.includes("--approved"), "flagged swarm status does not echo approval flag");
assert(!flaggedStatus.action, "flagged swarm status emits no action");

const secretStatus = buildSwarmCommandPayload(["status", "ghp_SWARM_STATUS_SHOULD_NOT_LEAK12345678"]);
assert(secretStatus.isError, "secret-shaped swarm status id is rejected");
assert(secretStatus.output.includes("Swarm run not found: [REDACTED]"), "secret-shaped swarm status id renders redacted label");
assert(!secretStatus.output.includes("SWARM_STATUS_SHOULD_NOT_LEAK"), "secret-shaped swarm status redacts token body");
assert(!secretStatus.output.includes("ghp_"), "secret-shaped swarm status redacts token prefix");
assert(secretStatus.data?.runId === "[REDACTED]", "secret-shaped swarm status stores only redacted id");

const flagOnlyLlm = buildSwarmCommandPayload(["llm", "--approved"]);
assert(flagOnlyLlm.isError, "flag-only swarm llm command renders usage");
assert(flagOnlyLlm.output.includes("Usage: /swarm llm <objective>"), "flag-only swarm llm renders usage text");
assert(!flagOnlyLlm.output.includes("--approved"), "flag-only swarm llm does not echo approval flag");
assert(!flagOnlyLlm.action, "flag-only swarm llm emits no start action");

const secretObjective = buildSwarmCommandPayload(["llm", "review", "github_pat_SWARM_OBJECTIVE_SHOULD_NOT_LEAK12345678"]);
assert(!secretObjective.isError, "secret-shaped swarm objective is redacted and still starts");
assert(secretObjective.output.includes("Objective: review [REDACTED]"), "secret-shaped swarm objective renders redacted objective");
assert(!secretObjective.output.includes("SWARM_OBJECTIVE_SHOULD_NOT_LEAK"), "secret-shaped swarm objective redacts token body");
assert(!secretObjective.output.includes("github_pat_"), "secret-shaped swarm objective redacts token prefix");
assert(secretObjective.data?.objective === "review [REDACTED]", "secret-shaped swarm objective stores only redacted objective");
assert(secretObjective.action?.objective === "review [REDACTED]", "secret-shaped swarm objective action is redacted");

const flagOnlyResume = buildSwarmCommandPayload(["resume", "--approved"]);
assert(flagOnlyResume.isError, "flag-only swarm resume renders usage");
assert(flagOnlyResume.output.includes("Usage: /swarm resume <swarm_run_id>"), "flag-only swarm resume renders usage text");
assert(!flagOnlyResume.output.includes("--approved"), "flag-only swarm resume does not echo approval flag");
assert(!flagOnlyResume.action, "flag-only swarm resume emits no action");

const secretResume = buildSwarmCommandPayload(["resume", "ghp_SWARM_RESUME_SHOULD_NOT_LEAK12345678"]);
assert(secretResume.isError, "secret-shaped swarm resume id is rejected");
assert(secretResume.output.includes("Swarm run id rejected."), "secret-shaped swarm resume explains rejection");
assert(!secretResume.output.includes("SWARM_RESUME_SHOULD_NOT_LEAK"), "secret-shaped swarm resume redacts token body");
assert(!secretResume.output.includes("ghp_"), "secret-shaped swarm resume redacts token prefix");
assert(!secretResume.action, "secret-shaped swarm resume emits no action");

const flaggedRetry = buildSwarmCommandPayload(["retry", "swarm_123", "plan", "--approved"]);
assert(!flaggedRetry.isError, "flagged swarm retry still succeeds");
assert(flaggedRetry.output.includes("Retrying swarm run swarm_123 stage plan."), "flagged swarm retry preserves run and stage");
assert(!flaggedRetry.output.includes("--approved"), "flagged swarm retry does not echo approval flag");
assert(flaggedRetry.action?.kind === "retry_swarm_stage", "flagged swarm retry emits retry action");

const secretCancel = buildSwarmCommandPayload(["cancel", "github_pat_SWARM_CANCEL_SHOULD_NOT_LEAK12345678"]);
assert(secretCancel.isError, "secret-shaped swarm cancel id is rejected");
assert(secretCancel.output.includes("Swarm run id rejected."), "secret-shaped swarm cancel explains rejection");
assert(!secretCancel.output.includes("SWARM_CANCEL_SHOULD_NOT_LEAK"), "secret-shaped swarm cancel redacts token body");
assert(!secretCancel.output.includes("github_pat_"), "secret-shaped swarm cancel redacts token prefix");
assert(!secretCancel.action, "secret-shaped swarm cancel emits no action");

console.log("Phase 355: swarm command inputs ignore flags and redact secrets.");
