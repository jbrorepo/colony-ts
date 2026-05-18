import { buildPermissionsCommandPayload, buildToolsCommandPayload } from "./gateway-tools";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderToolsApprovals() {
  return buildToolsCommandPayload({
    args: ["approvals"],
    activeTools: [],
    permittedTools: [],
    deniedTools: [],
    sessionRuleCount: 1,
    pendingApproval: {
      toolName: "shell_exec",
      riskLevel: "dangerous",
      category: "mutation",
      signature: "approve:ghp_TOOLS_APPROVAL_SHOULD_NOT_LEAK12345678",
      summary: "run command with github_pat_TOOLS_SUMMARY_SHOULD_NOT_LEAK12345678",
      reason: "operator supplied ghp_TOOLS_REASON_SHOULD_NOT_LEAK12345678",
    },
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
      sessionRules: [
        "exact:shell_exec:ghp_RULES_SHOULD_NOT_LEAK12345678",
        "exact:file_read:src/index.ts",
      ],
    },
    formatPermissions: (caste, active, allowed, denied, sessionRules) =>
      [
        `Tool Permissions (${caste})`,
        `active=${active.length}`,
        `allowed=${allowed.length}`,
        `denied=${denied.length}`,
        ...sessionRules.map((rule) => `rule=${rule}`),
      ].join("\n"),
  });
}

const toolsApprovals = renderToolsApprovals();
assert(!toolsApprovals.isError, "tools approvals renders approval state");
assert(toolsApprovals.output.includes("Pending approval: shell_exec"), "tools approvals keeps tool identity");
assert(toolsApprovals.output.includes("Signature: approve:[REDACTED]"), "tools approvals redacts token-shaped signature");
assert(toolsApprovals.output.includes("Summary: run command with [REDACTED]"), "tools approvals redacts token-shaped summary");
assert(toolsApprovals.output.includes("Reason: operator supplied [REDACTED]"), "tools approvals redacts token-shaped reason");
assert(!toolsApprovals.output.includes("TOOLS_APPROVAL_SHOULD_NOT_LEAK"), "tools approvals redacts signature body");
assert(!toolsApprovals.output.includes("TOOLS_SUMMARY_SHOULD_NOT_LEAK"), "tools approvals redacts summary body");
assert(!toolsApprovals.output.includes("TOOLS_REASON_SHOULD_NOT_LEAK"), "tools approvals redacts reason body");
assert(!toolsApprovals.output.includes("ghp_"), "tools approvals redacts GitHub token prefixes");
assert(!toolsApprovals.output.includes("github_pat_"), "tools approvals redacts GitHub PAT prefixes");

const permissionsSummary = renderPermissions([]);
assert(!permissionsSummary.isError, "permissions summary renders");
assert(permissionsSummary.output.includes("rule=exact:file_read:src/index.ts"), "permissions summary keeps nonsecret rule detail");
assert(permissionsSummary.output.includes("rule=exact:shell_exec:[REDACTED]"), "permissions summary redacts token-shaped rule detail");
assert(!permissionsSummary.output.includes("RULES_SHOULD_NOT_LEAK"), "permissions summary redacts rule token body");
assert(!permissionsSummary.output.includes("ghp_"), "permissions summary redacts rule token prefix");
assert(!JSON.stringify(permissionsSummary.data).includes("RULES_SHOULD_NOT_LEAK"), "permissions summary data redacts rule token body");
assert(!JSON.stringify(permissionsSummary.data).includes("ghp_"), "permissions summary data redacts rule token prefix");

const permissionsRules = renderPermissions(["rules"]);
assert(!permissionsRules.isError, "permissions rules renders");
assert(permissionsRules.output.includes("= exact:file_read:src/index.ts"), "permissions rules keeps nonsecret rule detail");
assert(permissionsRules.output.includes("= exact:shell_exec:[REDACTED]"), "permissions rules redacts token-shaped rule detail");
assert(!permissionsRules.output.includes("RULES_SHOULD_NOT_LEAK"), "permissions rules redacts rule token body");
assert(!permissionsRules.output.includes("ghp_"), "permissions rules redacts rule token prefix");

console.log("Phase 357: tools approvals and permission rules redact secret-shaped metadata.");
