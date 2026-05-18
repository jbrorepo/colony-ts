import { buildPermissionsCommandPayload, buildToolsCommandPayload } from "./gateway-tools";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderTools(args: string[]) {
  return buildToolsCommandPayload({
    args,
    activeTools: [],
    permittedTools: [],
    deniedTools: [],
    sessionRuleCount: 0,
    pendingApproval: null,
    recentActivity: [],
  });
}

function renderPermissions(args: string[]) {
  return buildPermissionsCommandPayload({
    args,
    permissions: {
      caste: "assist_ant",
      active: [],
      allowed: [],
      denied: [],
      sessionRules: [],
    },
    formatPermissions: () => "Tool Permissions:\n\nActive tool schemas: 0\nnone",
  });
}

const flagOnlyTools = renderTools(["--approved"]);
assert(!flagOnlyTools.isError, "flag-only tools view renders summary");
assert(flagOnlyTools.output.includes("Tool Activity:"), "flag-only tools view renders activity heading");
assert(!flagOnlyTools.output.includes("--approved"), "flag-only tools view does not echo stray flag");
assert(flagOnlyTools.data?.view === "summary", "flag-only tools stores summary view");

const flaggedToolsPerf = renderTools(["perf", "--approved"]);
assert(!flaggedToolsPerf.isError, "flagged tools perf view still succeeds");
assert(flaggedToolsPerf.output.includes("Tool Performance:"), "flagged tools perf view renders perf heading");
assert(!flaggedToolsPerf.output.includes("--approved"), "flagged tools perf view does not echo stray flag");
assert(flaggedToolsPerf.data?.view === "perf", "flagged tools perf stores perf view");

const secretTools = renderTools(["ghp_TOOLS_SHOULD_NOT_LEAK12345678"]);
assert(secretTools.isError, "secret-shaped tools view remains rejected");
assert(secretTools.output.includes("Unknown tools view '[REDACTED]'"), "secret-shaped tools view renders redacted label");
assert(!secretTools.output.includes("TOOLS_SHOULD_NOT_LEAK"), "secret-shaped tools view redacts token body");
assert(!secretTools.output.includes("ghp_"), "secret-shaped tools view redacts token prefix");

const flagOnlyPermissions = renderPermissions(["--approved"]);
assert(!flagOnlyPermissions.isError, "flag-only permissions view renders summary");
assert(flagOnlyPermissions.output.includes("Tool Permissions:"), "flag-only permissions view renders permissions heading");
assert(!flagOnlyPermissions.output.includes("--approved"), "flag-only permissions view does not echo stray flag");
assert(flagOnlyPermissions.data?.view === "summary", "flag-only permissions stores summary view");

const secretPermissions = renderPermissions(["github_pat_PERMS_SHOULD_NOT_LEAK12345678"]);
assert(secretPermissions.isError, "secret-shaped permissions view remains rejected");
assert(secretPermissions.output.includes("Unknown permissions view '[REDACTED]'"), "secret-shaped permissions view renders redacted label");
assert(!secretPermissions.output.includes("PERMS_SHOULD_NOT_LEAK"), "secret-shaped permissions view redacts token body");
assert(!secretPermissions.output.includes("github_pat_"), "secret-shaped permissions view redacts token prefix");

console.log("Phase 345: tools and permissions command inputs ignore flags and redact secrets.");
