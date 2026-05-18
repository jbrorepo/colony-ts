import { buildHooksCommandPayload, buildStatusCommandPayload } from "./gateway-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderStatus(args: string[]) {
  return buildStatusCommandPayload({
    args,
    sessionLines: ["Session Status:", "", "(No active session)"],
    savedLines: ["Saved Status:", "", "(No persisted sessions)"],
    runtimeLines: ["Runtime Status:", "", "Runtime:", "(No runtime state)"],
    sessionId: "none",
    caste: "assist_ant",
    messageCount: 0,
    contextUsage: null,
    workspace: null,
    provider: null,
    model: null,
  });
}

function renderHooks(args: string[]) {
  return buildHooksCommandPayload({
    args,
    hookRunner: null,
    readNumber: () => 0,
    readString: () => "",
  });
}

const flagOnlyStatus = renderStatus(["--approved"]);
assert(!flagOnlyStatus.isError, "flag-only status view renders summary");
assert(flagOnlyStatus.output.includes("Session Status:"), "flag-only status view renders session section");
assert(flagOnlyStatus.output.includes("Runtime Status:"), "flag-only status view renders runtime section");
assert(!flagOnlyStatus.output.includes("--approved"), "flag-only status view does not echo stray flag");
assert(flagOnlyStatus.data?.view === "summary", "flag-only status stores summary view");

const flaggedRuntime = renderStatus(["runtime", "--approved"]);
assert(!flaggedRuntime.isError, "flagged status runtime view still succeeds");
assert(flaggedRuntime.output.includes("Runtime Status:"), "flagged status runtime view renders runtime heading");
assert(!flaggedRuntime.output.includes("--approved"), "flagged status runtime view does not echo stray flag");
assert(flaggedRuntime.data?.view === "runtime", "flagged status runtime stores runtime view");

const secretStatus = renderStatus(["ghp_STATUS_SHOULD_NOT_LEAK12345678"]);
assert(secretStatus.isError, "secret-shaped status view remains rejected");
assert(secretStatus.output.includes("Unknown status view '[REDACTED]'"), "secret-shaped status view renders redacted label");
assert(!secretStatus.output.includes("STATUS_SHOULD_NOT_LEAK"), "secret-shaped status view redacts token body");
assert(!secretStatus.output.includes("ghp_"), "secret-shaped status view redacts token prefix");

const flagOnlyHooks = renderHooks(["--approved"]);
assert(!flagOnlyHooks.isError, "flag-only hooks view renders summary");
assert(flagOnlyHooks.output.includes("Registered Hooks:"), "flag-only hooks view renders hooks heading");
assert(!flagOnlyHooks.output.includes("--approved"), "flag-only hooks view does not echo stray flag");
assert(flagOnlyHooks.data?.view === "summary", "flag-only hooks stores summary view");

const secretHooks = renderHooks(["github_pat_HOOKS_SHOULD_NOT_LEAK12345678"]);
assert(secretHooks.isError, "secret-shaped hooks view remains rejected");
assert(secretHooks.output.includes("Unknown hooks view '[REDACTED]'"), "secret-shaped hooks view renders redacted label");
assert(!secretHooks.output.includes("HOOKS_SHOULD_NOT_LEAK"), "secret-shaped hooks view redacts token body");
assert(!secretHooks.output.includes("github_pat_"), "secret-shaped hooks view redacts token prefix");

console.log("Phase 344: status and hooks command inputs ignore flags and redact secrets.");
