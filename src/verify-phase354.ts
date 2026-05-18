import { buildBudgetCommandPayload } from "./gateway-basic";
import { buildWorkspaceCommandPayload, type GatewayWorkspaceView } from "./gateway-workspace";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const workspace: GatewayWorkspaceView = {
  detected: true,
  name: "colony-ts",
  root: "D:\\The Colony Test\\colony-ts",
  projectType: "typescript",
  packageManager: "bun",
  workspaceMode: "single-package",
  stackHints: ["typescript", "ink"],
  scriptNames: ["verify:all", "verify:market-parity"],
  devCommand: "bun run start",
  verifyCommand: "bun run verify:all",
};

const flagOnlyWorkspace = buildWorkspaceCommandPayload(["--approved"], workspace);
assert(!flagOnlyWorkspace.isError, "flag-only workspace command renders summary");
assert(flagOnlyWorkspace.output.includes("Workspace:"), "flag-only workspace command renders summary heading");
assert(!flagOnlyWorkspace.output.includes("--approved"), "flag-only workspace command does not echo approval flag");
assert(flagOnlyWorkspace.data?.view === "summary", "flag-only workspace command stores summary view");

const flaggedWorkspaceDev = buildWorkspaceCommandPayload(["dev", "--approved"], workspace);
assert(!flaggedWorkspaceDev.isError, "flagged workspace dev view still succeeds");
assert(flaggedWorkspaceDev.output.includes("Workspace Dev:"), "flagged workspace dev view renders heading");
assert(!flaggedWorkspaceDev.output.includes("--approved"), "flagged workspace dev view does not echo approval flag");
assert(flaggedWorkspaceDev.data?.view === "dev", "flagged workspace dev stores dev view");

const secretWorkspace = buildWorkspaceCommandPayload(["ghp_WORKSPACE_SHOULD_NOT_LEAK12345678"], workspace);
assert(secretWorkspace.isError, "secret-shaped workspace view is rejected");
assert(secretWorkspace.output.includes("Unknown workspace view '[REDACTED]'"), "secret-shaped workspace view renders redacted label");
assert(!secretWorkspace.output.includes("WORKSPACE_SHOULD_NOT_LEAK"), "secret-shaped workspace view redacts token body");
assert(!secretWorkspace.output.includes("ghp_"), "secret-shaped workspace view redacts token prefix");

const flagOnlyBudget = buildBudgetCommandPayload({
  args: ["--approved"],
  maxUsd: 25,
  maxTokens: 10000,
});
assert(!flagOnlyBudget.isError, "flag-only budget command renders status");
assert(flagOnlyBudget.output.includes("Budget:"), "flag-only budget command renders status heading");
assert(flagOnlyBudget.output.includes("Cost cap: $25.00"), "flag-only budget command preserves budget status");
assert(!flagOnlyBudget.output.includes("--approved"), "flag-only budget command does not echo approval flag");
assert(!flagOnlyBudget.action, "flag-only budget command emits no set-budget action");

const flaggedBudgetSet = buildBudgetCommandPayload({
  args: ["30", "--approved"],
  maxUsd: 25,
  maxTokens: 10000,
});
assert(!flaggedBudgetSet.isError, "flagged budget set still succeeds");
assert(flaggedBudgetSet.output.includes("Budget cap set to $30.00."), "flagged budget set preserves cap");
assert(flaggedBudgetSet.action?.kind === "set_budget", "flagged budget set emits set-budget action");
assert(!flaggedBudgetSet.output.includes("--approved"), "flagged budget set does not echo approval flag");

const secretBudget = buildBudgetCommandPayload({
  args: ["github_pat_BUDGET_SHOULD_NOT_LEAK12345678"],
  maxUsd: 25,
  maxTokens: 10000,
});
assert(secretBudget.isError, "secret-shaped budget cap is rejected");
assert(!secretBudget.output.includes("BUDGET_SHOULD_NOT_LEAK"), "secret-shaped budget cap redacts token body");
assert(!secretBudget.output.includes("github_pat_"), "secret-shaped budget cap redacts token prefix");
assert(!secretBudget.action, "secret-shaped budget cap emits no action");

console.log("Phase 354: workspace and budget command inputs ignore flags and redact secrets.");
