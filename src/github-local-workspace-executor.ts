import path from "node:path";

import type {
  GitHubLocalWorkspaceActionPlan,
  NormalizedGitHubIssue,
} from "./github-pr-handoff";
import { scrubSecrets } from "./security/log-sanitizer";

export type GitHubLocalWorkspaceCommandExecutor = (command: {
  executable: "git";
  args: string[];
  cwd: string;
}) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface GitHubLocalWorkspaceExecutionCommandReceipt {
  executable: "git";
  args: string[];
  cwd: string;
  code: number;
  stdout: string;
  stderr: string;
  status: "completed" | "failed";
}

export interface GitHubLocalWorkspaceExecutionReceipt {
  ok: boolean;
  action: "create_local_git_workspace";
  branchName: string;
  worktreePath: string;
  workspaceRoot: string;
  worktreeRoot: string;
  commands: GitHubLocalWorkspaceExecutionCommandReceipt[];
  verificationNextStep: string;
  boundaries: {
    pushed: false;
    prCreated: false;
    credentialsPersisted: false;
    remoteFetch: false;
    usedInjectedExecutor: true;
  };
  failure?: {
    commandIndex?: number;
    message: string;
  };
}

const GITHUB_SECRET_PATTERN = /(gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|(?:token|api[_-]?key|secret|password|authorization)=\S+)/gi;
const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/;
const SHELL_META_PATTERN = /[;&|`$<>()[\]{}*?!\r\n\t]/;
const REQUIRED_BOUNDARY = "No git push is executed by this action plan.";

export async function executeApprovedGitHubLocalWorkspaceAction(input: {
  plan: GitHubLocalWorkspaceActionPlan;
  approvalSignature: string;
  workspaceRoot: string;
  worktreeRoot: string;
  executor: GitHubLocalWorkspaceCommandExecutor;
}): Promise<GitHubLocalWorkspaceExecutionReceipt> {
  const workspaceRoot = normalizeAbsolutePath(input.workspaceRoot);
  const worktreeRoot = normalizeWorkspacePath(input.worktreeRoot, workspaceRoot);
  const commands: GitHubLocalWorkspaceExecutionCommandReceipt[] = [];
  const baseReceipt = (overrides: Partial<GitHubLocalWorkspaceExecutionReceipt> = {}): GitHubLocalWorkspaceExecutionReceipt => ({
    ok: false,
    action: "create_local_git_workspace",
    branchName: input.plan.action?.branchName ?? "",
    worktreePath: normalizeDisplayPath(input.plan.action?.worktreePath ?? ""),
    workspaceRoot: normalizeDisplayPath(workspaceRoot),
    worktreeRoot: normalizeDisplayPath(worktreeRoot),
    commands,
    verificationNextStep: "Run local verification before any PR handoff.",
    boundaries: {
      pushed: false,
      prCreated: false,
      credentialsPersisted: false,
      remoteFetch: false,
      usedInjectedExecutor: true,
    },
    ...overrides,
  });

  const validation = validateActionPlan(input.plan, {
    approvalSignature: input.approvalSignature,
    workspaceRoot,
    worktreeRoot,
  });
  if (!validation.ok) {
    return baseReceipt({
      branchName: validation.branchName,
      worktreePath: validation.worktreePath,
      failure: { message: validation.reason },
    });
  }

  const gitCommands: Array<{ executable: "git"; args: string[]; cwd: string }> = [
    {
      executable: "git",
      args: ["branch", validation.branchName],
      cwd: workspaceRoot,
    },
    {
      executable: "git",
      args: ["worktree", "add", validation.worktreePath, validation.branchName],
      cwd: workspaceRoot,
    },
  ];

  for (const [index, command] of gitCommands.entries()) {
    const result = await input.executor(command);
    const commandReceipt: GitHubLocalWorkspaceExecutionCommandReceipt = {
      executable: "git",
      args: [...command.args],
      cwd: normalizeDisplayPath(command.cwd),
      code: result.code,
      stdout: redactExecutionText(result.stdout),
      stderr: redactExecutionText(result.stderr),
      status: result.code === 0 ? "completed" : "failed",
    };
    commands.push(commandReceipt);
    if (result.code !== 0) {
      return baseReceipt({
        branchName: validation.branchName,
        worktreePath: normalizeDisplayPath(validation.worktreePath),
        failure: {
          commandIndex: index,
          message: `Local git mutation failed at command ${index + 1}.`,
        },
      });
    }
  }

  return baseReceipt({
    ok: true,
    branchName: validation.branchName,
    worktreePath: normalizeDisplayPath(validation.worktreePath),
  });
}

function validateActionPlan(
  plan: GitHubLocalWorkspaceActionPlan,
  options: {
    approvalSignature: string;
    workspaceRoot: string;
    worktreeRoot: string;
  },
): {
  ok: boolean;
  reason: string;
  branchName: string;
  worktreePath: string;
} {
  const action = plan.action;
  if (!plan.ok || !action || action.kind !== "create_local_git_workspace") {
    return invalid("Unsupported GitHub local workspace action plan.", "", "");
  }
  const branchName = action.branchName;
  const displayedWorktreePath = normalizeDisplayPath(action.worktreePath);

  const branchReason = validateBranchName(branchName);
  if (branchReason) {
    return invalid(branchReason, branchName, displayedWorktreePath);
  }

  const expectedSignature = localWorkspaceApprovalSignature(action.issue, branchName);
  if (!options.approvalSignature || options.approvalSignature !== expectedSignature) {
    return invalid("Exact approval signature is required before local branch/worktree execution.", branchName, displayedWorktreePath);
  }

  if (!action.boundaries.includes(REQUIRED_BOUNDARY)) {
    return invalid("Action plan is missing required no-push boundary.", branchName, displayedWorktreePath);
  }

  const resolvedWorktreePath = normalizeWorkspacePath(action.worktreePath, options.workspaceRoot);
  const expectedWorktreePath = path.resolve(options.worktreeRoot, branchName.replace(/[\\/]/g, "-"));
  if (normalizeForCompare(resolvedWorktreePath) !== normalizeForCompare(expectedWorktreePath)) {
    return invalid("GitHub local worktree path must match the deterministic branch worktree target.", branchName, displayedWorktreePath);
  }
  if (!isInsideOrEqual(resolvedWorktreePath, options.worktreeRoot) || !isInsideOrEqual(options.worktreeRoot, options.workspaceRoot)) {
    return invalid("GitHub local worktree path must stay inside the bounded worktree root.", branchName, displayedWorktreePath);
  }

  const expectedCommands = [
    `git branch ${branchName}`,
    `git worktree add "${displayedWorktreePath}" ${branchName}`,
  ];
  if (
    action.commands.length !== expectedCommands.length
    || action.commands.some((command, index) => command !== expectedCommands[index])
  ) {
    return invalid("Action plan commands do not match the deterministic local git branch/worktree plan.", branchName, displayedWorktreePath);
  }
  if (action.commands.some((command) => /\b(push|fetch|pull|pr\s+create|pull-request)\b/i.test(command))) {
    return invalid("Action plan includes unsupported remote or PR mutation command.", branchName, displayedWorktreePath);
  }

  return {
    ok: true,
    reason: "",
    branchName,
    worktreePath: resolvedWorktreePath,
  };
}

function validateBranchName(branchName: string): string | undefined {
  if (!branchName || branchName.length > 121 || !SAFE_BRANCH_PATTERN.test(branchName)) {
    return "GitHub local branch name failed conservative branch validation.";
  }
  if (
    branchName.includes("..")
    || branchName.includes("//")
    || branchName.startsWith("/")
    || branchName.endsWith("/")
    || branchName.includes("@{")
    || branchName.endsWith(".lock")
    || SHELL_META_PATTERN.test(branchName)
  ) {
    return "GitHub local branch name failed conservative branch validation.";
  }
  return undefined;
}

function localWorkspaceApprovalSignature(issue: NormalizedGitHubIssue, branchName: string): string {
  return `github-local-workspace:${issue.owner}/${issue.repo}#${issue.number}:${branchName}`;
}

function invalid(reason: string, branchName: string, worktreePath: string): {
  ok: false;
  reason: string;
  branchName: string;
  worktreePath: string;
} {
  return {
    ok: false,
    reason,
    branchName,
    worktreePath,
  };
}

function normalizeAbsolutePath(value: string): string {
  return path.resolve(value);
}

function normalizeWorkspacePath(value: string, workspaceRoot: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(workspaceRoot, value);
}

function normalizeForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function normalizeDisplayPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^([a-zA-Z]):\//, "$1:/");
}

function isInsideOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function redactExecutionText(value: string): string {
  return scrubSecrets(value).replace(GITHUB_SECRET_PATTERN, "[REDACTED]");
}
