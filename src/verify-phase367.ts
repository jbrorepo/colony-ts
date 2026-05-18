import {
  formatCaste,
  formatPermissions,
  formatStatus,
  renderCasteView,
} from "./gateway-basic";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const status = formatStatus({
  sessionId: "sess_ghp_BASIC_STATUS_SESSION_SHOULD_NOT_LEAK12345678",
  agentId: "agent_github_pat_BASIC_STATUS_AGENT_SHOULD_NOT_LEAK12345678",
  caste: "custom ghp_BASIC_STATUS_CASTE_SHOULD_NOT_LEAK12345678",
  messageCount: 3,
  iterations: 2,
  tokensUsed: 1234,
  costUsd: 0.12,
  state: "active ghp_BASIC_STATUS_STATE_SHOULD_NOT_LEAK12345678",
});
assert(status.includes("sess_[REDACTED]"), "basic status redacts session id");
assert(status.includes("agent_[REDACTED]"), "basic status redacts agent id");
assert(status.includes("Custom [REDACTED]"), "basic status redacts custom caste label");
assert(status.includes("active [REDACTED]"), "basic status redacts state");
assert(!status.includes("BASIC_STATUS_"), "basic status redacts token bodies");
assert(!status.includes("github_pat_"), "basic status redacts GitHub PAT prefix");
assert(!status.includes("ghp_"), "basic status redacts GitHub token prefix");

const permissions = formatPermissions(
  "operator ghp_BASIC_PERM_CASTE_SHOULD_NOT_LEAK12345678",
  [
    "shell_exec ghp_BASIC_PERM_ACTIVE_SHOULD_NOT_LEAK12345678",
  ],
  [
    "file_read ghp_BASIC_PERM_ALLOWED_SHOULD_NOT_LEAK12345678",
  ],
  [
    "http_request github_pat_BASIC_PERM_DENIED_SHOULD_NOT_LEAK12345678",
  ],
  [
    "exact ghp_BASIC_PERM_RULE_SHOULD_NOT_LEAK12345678",
  ],
);
assert(permissions.includes("Operator [REDACTED]"), "permissions redacts caste label");
assert(permissions.includes("* shell_exec [REDACTED]"), "permissions redacts active tool metadata");
assert(permissions.includes("+ file_read [REDACTED]"), "permissions redacts allowed tool metadata");
assert(permissions.includes("- http_request [REDACTED]"), "permissions redacts denied tool metadata");
assert(permissions.includes("= exact [REDACTED]"), "permissions redacts exact session rules");
assert(!permissions.includes("BASIC_PERM_"), "permissions redact token bodies");
assert(!permissions.includes("github_pat_"), "permissions redact GitHub PAT prefix");
assert(!permissions.includes("ghp_"), "permissions redact GitHub token prefix");

const caste = formatCaste(
  "custom ghp_BASIC_CASTE_NAME_SHOULD_NOT_LEAK12345678",
  "Description github_pat_BASIC_CASTE_DESCRIPTION_SHOULD_NOT_LEAK12345678",
);
assert(caste.includes("Current Caste: Custom [REDACTED]"), "format caste redacts caste label");
assert(caste.includes("Description [REDACTED]"), "format caste redacts description");
assert(!caste.includes("BASIC_CASTE_"), "format caste redacts token bodies");
assert(!caste.includes("github_pat_"), "format caste redacts GitHub PAT prefix");
assert(!caste.includes("ghp_"), "format caste redacts GitHub token prefix");

const renderedCaste = renderCasteView("custom ghp_BASIC_RENDER_CASTE_SHOULD_NOT_LEAK12345678");
assert(renderedCaste.includes("Current Caste: Custom [REDACTED]"), "render caste redacts custom caste label");
assert(!renderedCaste.includes("BASIC_RENDER_CASTE"), "render caste redacts token body");
assert(!renderedCaste.includes("ghp_"), "render caste redacts GitHub token prefix");

console.log("Phase 367: basic status and permission surfaces redact secret-shaped metadata.");
