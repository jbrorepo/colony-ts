import type {
  WorkflowArtifactInput,
  WorkflowApprovalPolicy,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepHandler,
} from "./workflow/types";
import type { GitHubLocalWorkspaceExecutionReceipt } from "./github-local-workspace-executor";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GitHubIssueInput {
  reference?: string;
  url?: string;
  owner?: string;
  repo?: string;
  number?: number;
  title?: string;
  body?: string;
  labels?: string[];
}

export interface NormalizedGitHubIssue {
  owner: string;
  repo: string;
  number: number;
  title: string;
  bodyPreview?: string;
  labels: string[];
  url?: string;
  source: "provided";
}

export interface GitHubPrHandoffPlan {
  mode: "dry_run";
  issue: NormalizedGitHubIssue;
  branchName: string;
  worktreePath: string;
  localWorkspaceApprovalSignature: string;
  approvalRequired: string[];
  verificationRequired: string[];
  mutationBoundaries: string[];
}

export interface GitHubIssueIntakePlan {
  ok: boolean;
  source: "provided";
  networkRequired: false;
  approvalState: "awaiting_local_workspace_approval" | "rejected";
  reason?: string;
  issue?: NormalizedGitHubIssue;
  handoffPlan?: GitHubPrHandoffPlan;
  branchName?: string;
  worktreePath?: string;
  localWorkspaceApprovalSignature?: string;
  nextSteps: string[];
  guardrails: string[];
  redactedInputPreview: string;
}

export interface GitHubLocalWorkspaceActionPlan {
  ok: boolean;
  reason?: string;
  action?: {
    kind: "create_local_git_workspace";
    issue: NormalizedGitHubIssue;
    branchName: string;
    worktreePath: string;
    approvedBy: string;
    commands: string[];
    boundaries: string[];
  };
}

export interface GitHubVerificationResultSummary {
  command: string;
  code: number;
  summary: string;
  durationMs?: number;
}

export interface GitHubVerificationToPrHandoffInput {
  issueIntake: GitHubIssueIntakePlan;
  executionReceipt: GitHubLocalWorkspaceExecutionReceipt;
  verificationCommands: string[];
  verificationResults: GitHubVerificationResultSummary[];
  targetBaseBranch: string;
}

export interface GitHubVerificationToPrHandoff {
  ok: boolean;
  reason?: string;
  issue?: NormalizedGitHubIssue;
  branchName: string;
  worktreePath: string;
  targetBaseBranch: string;
  verification: {
    status: "missing" | "failed" | "passed";
    commands: string[];
    results: GitHubVerificationResultSummary[];
  };
  suggestedCommands: string[];
  prBody: string;
  artifacts: WorkflowArtifactInput[];
  boundaries: {
    pushExecuted: false;
    prCreated: false;
    remoteMutationExecuted: false;
    credentialsPersisted: false;
    defaultRemoteMutation: false;
  };
}

export interface GitHubPrHandoffWorkflowOptions {
  id: string;
  issue: NormalizedGitHubIssue | GitHubIssueInput;
  workspaceRoot: string;
  requiredApprover?: string;
}

const DEFAULT_OWNER = "unknown-owner";
const DEFAULT_REPO = "unknown-repo";
const DEFAULT_ISSUE_NUMBER = 0;
const DEFAULT_TITLE = "github issue handoff";
const MAX_BRANCH_LENGTH = 96;
const SECRET_PATTERN = /(gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|[?&](?:token|api[_-]?key|secret|password|authorization)=[^&#\s]+|\b(?:token|api[_-]?key|secret|password|authorization)=\S+)/gi;

export function createGitHubIssueIntakePlan(options: {
  issue: NormalizedGitHubIssue | GitHubIssueInput;
  workspaceRoot: string;
}): GitHubIssueIntakePlan {
  const issue = isNormalizedIssue(options.issue)
    ? options.issue
    : normalizeGitHubIssueInput(options.issue);
  const redactedInputPreview = previewGitHubIssueInput(options.issue);
  const missingCoordinates = [
    issue.owner === DEFAULT_OWNER ? "owner" : "",
    issue.repo === DEFAULT_REPO ? "repo" : "",
    issue.number <= 0 ? "positive issue number" : "",
  ].filter(Boolean);
  const baseGuardrails = [
    "Issue intake uses only supplied local issue data and performs no GitHub network fetch.",
    "No local branch or worktree action is prepared for execution before exact approval.",
    "No git push or remote PR creation is prepared by issue intake.",
  ];

  if (missingCoordinates.length > 0) {
    return {
      ok: false,
      source: "provided",
      networkRequired: false,
      approvalState: "rejected",
      reason: "GitHub issue intake requires owner, repo, and positive issue number before local workspace planning.",
      nextSteps: [
        "Provide a GitHub issue URL, owner/repo#number reference, or explicit owner/repo/number fields.",
        "Retry intake after the issue coordinates are complete.",
      ],
      guardrails: baseGuardrails,
      redactedInputPreview,
    };
  }

  const handoffPlan = summarizeGitHubPrHandoffPlan({
    issue,
    workspaceRoot: options.workspaceRoot,
  });

  return {
    ok: true,
    source: "provided",
    networkRequired: false,
    approvalState: "awaiting_local_workspace_approval",
    issue,
    handoffPlan,
    branchName: handoffPlan.branchName,
    worktreePath: handoffPlan.worktreePath,
    localWorkspaceApprovalSignature: handoffPlan.localWorkspaceApprovalSignature,
    nextSteps: [
      `Review the local branch/worktree plan for ${issue.owner}/${issue.repo}#${issue.number}.`,
      `Use the exact approval signature to approve local workspace planning: ${handoffPlan.localWorkspaceApprovalSignature}`,
      "Run local verification before any PR handoff.",
      "Require a separate explicit approval before any remote PR creation.",
    ],
    guardrails: [
      ...baseGuardrails,
      ...handoffPlan.mutationBoundaries,
    ],
    redactedInputPreview,
  };
}

export function normalizeGitHubIssueInput(input: GitHubIssueInput): NormalizedGitHubIssue {
  const parsed = parseGitHubIssueReference(input.reference ?? input.url);
  const owner = safeIdentifier(input.owner ?? parsed.owner ?? DEFAULT_OWNER, DEFAULT_OWNER);
  const repo = safeIdentifier(input.repo ?? parsed.repo ?? DEFAULT_REPO, DEFAULT_REPO);
  const number = positiveInteger(input.number ?? parsed.number ?? DEFAULT_ISSUE_NUMBER);
  const title = safeText(input.title ?? DEFAULT_TITLE, DEFAULT_TITLE);
  const bodyPreview = input.body
    ? redactGitHubHandoffText(input.body).slice(0, 500)
    : undefined;
  const url = parsed.url
    ? redactGitHubHandoffText(parsed.url)
    : undefined;

  return {
    owner,
    repo,
    number,
    title,
    bodyPreview,
    labels: Array.isArray(input.labels)
      ? input.labels.map((label) => safeText(label, "label")).filter(Boolean).slice(0, 20)
      : [],
    url,
    source: "provided",
  };
}

export function deriveGitHubPrBranchName(issue: NormalizedGitHubIssue): string {
  const issuePart = issue.number > 0 ? `issue-${issue.number}` : "issue";
  const titlePart = slugify(issue.title) || "handoff";
  return truncateBranch(`colony/${issuePart}-${titlePart}`, MAX_BRANCH_LENGTH);
}

export function summarizeGitHubPrHandoffPlan(options: {
  issue: NormalizedGitHubIssue | GitHubIssueInput;
  workspaceRoot: string;
}): GitHubPrHandoffPlan {
  const issue = isNormalizedIssue(options.issue)
    ? options.issue
    : normalizeGitHubIssueInput(options.issue);
  const branchName = deriveGitHubPrBranchName(issue);
  return {
    mode: "dry_run",
    issue,
    branchName,
    worktreePath: normalizeDisplayPath(`${trimTrailingSlash(options.workspaceRoot)}/.colony/worktrees/${branchName.replace(/\//g, "-")}`),
    localWorkspaceApprovalSignature: localWorkspaceApprovalSignature(issue, branchName),
    approvalRequired: ["create_local_workspace", "approve_pr_creation"],
    verificationRequired: ["verify"],
    mutationBoundaries: [
      "No branch or worktree is created before approve_local_workspace.",
      "No PR creation command is prepared for execution before approve_pr_creation.",
      "Failed verification leaves approve_pr_creation and pr_handoff pending.",
    ],
  };
}

export function createGitHubLocalWorkspaceActionPlan(options: {
  plan: GitHubPrHandoffPlan;
  approvalSignature: string;
  approvedBy: string;
}): GitHubLocalWorkspaceActionPlan {
  const expected = options.plan.localWorkspaceApprovalSignature;
  if (!options.approvalSignature || options.approvalSignature !== expected) {
    return {
      ok: false,
      reason: "Exact approval signature is required before local branch/worktree action planning.",
    };
  }

  const approvedBy = safeText(options.approvedBy, "operator");
  const branchName = options.plan.branchName;
  const worktreePath = options.plan.worktreePath;
  return {
    ok: true,
    action: {
      kind: "create_local_git_workspace",
      issue: { ...options.plan.issue },
      branchName,
      worktreePath,
      approvedBy,
      commands: [
        `git branch ${branchName}`,
        `git worktree add "${worktreePath}" ${branchName}`,
      ],
      boundaries: [
        "This is a host-executable local action plan, not an automatic shell execution.",
        "No git push is executed by this action plan.",
        "No remote pull request is created by this action plan.",
        "Host execution must still verify workspace paths before running commands.",
      ],
    },
  };
}

export function createGitHubVerificationToPrHandoff(
  input: GitHubVerificationToPrHandoffInput,
): GitHubVerificationToPrHandoff {
  const issue = input.issueIntake.issue;
  const branchName = redactGitHubHandoffText(input.executionReceipt.branchName);
  const worktreePath = normalizeDisplayPath(redactGitHubHandoffText(input.executionReceipt.worktreePath));
  const targetBaseBranch = safeBranchLike(input.targetBaseBranch, "main");
  const verificationCommands = input.verificationCommands.map((command) => redactGitHubHandoffText(command.trim())).filter(Boolean);
  const verificationResults = input.verificationResults.map((result) => ({
    command: redactGitHubHandoffText(result.command.trim()),
    code: Number.isInteger(result.code) ? result.code : 1,
    summary: redactGitHubHandoffText(result.summary).slice(0, 1000),
    durationMs: result.durationMs,
  }));
  const base = (
    overrides: Partial<GitHubVerificationToPrHandoff>,
  ): GitHubVerificationToPrHandoff => ({
    ok: false,
    issue,
    branchName,
    worktreePath,
    targetBaseBranch,
    verification: {
      status: "missing",
      commands: verificationCommands,
      results: verificationResults,
    },
    suggestedCommands: [],
    prBody: "",
    artifacts: [],
    boundaries: {
      pushExecuted: false,
      prCreated: false,
      remoteMutationExecuted: false,
      credentialsPersisted: false,
      defaultRemoteMutation: false,
    },
    ...overrides,
  });

  if (!input.issueIntake.ok || !issue) {
    return base({ reason: "GitHub PR handoff requires accepted local issue intake." });
  }
  if (!input.executionReceipt.ok) {
    return base({ reason: "GitHub PR handoff requires successful local workspace execution before verification-to-PR handoff." });
  }
  if (input.executionReceipt.boundaries.pushed || input.executionReceipt.boundaries.prCreated) {
    return base({ reason: "GitHub PR handoff refuses receipts that already report push or PR creation." });
  }
  if (verificationCommands.length === 0 || verificationResults.length === 0) {
    return base({ reason: "GitHub PR handoff requires local verification evidence before PR handoff." });
  }
  const missingResult = verificationCommands.find((command) => !verificationResults.some((result) => result.command === command));
  if (missingResult) {
    return base({ reason: `GitHub PR handoff requires verification evidence for command: ${missingResult}` });
  }
  const failed = verificationResults.find((result) => result.code !== 0);
  if (failed) {
    return base({
      reason: `GitHub PR handoff blocked because verification command failed: ${failed.command}`,
      verification: {
        status: "failed",
        commands: verificationCommands,
        results: verificationResults,
      },
    });
  }

  const title = redactGitHubHandoffText(`${issue.title}`);
  const prBody = [
    `## Summary`,
    ``,
    `Prepared local changes for ${issue.owner}/${issue.repo}#${issue.number}: ${title}`,
    ``,
    `## Local Workspace`,
    ``,
    `- Branch: ${branchName}`,
    `- Worktree: ${worktreePath}`,
    `- Base branch: ${targetBaseBranch}`,
    ``,
    `## Verification`,
    ``,
    ...verificationResults.map((result) => `- \`${result.command}\`: passed (${result.summary})`),
    ``,
    `## Safety Boundaries`,
    ``,
    `- Colony did not push this branch.`,
    `- Colony did not create a remote PR.`,
    `- Operator approval is required before any remote mutation.`,
  ].join("\n");
  const artifact: WorkflowArtifactInput = {
    type: "markdown",
    name: "github-pr-handoff.md",
    content: prBody,
    metadata: {
      issue: `${issue.owner}/${issue.repo}#${issue.number}`,
      branchName,
      targetBaseBranch,
      pushExecuted: false,
      prCreated: false,
    },
  };

  return base({
    ok: true,
    verification: {
      status: "passed",
      commands: verificationCommands,
      results: verificationResults,
    },
    suggestedCommands: [
      `git push -u origin ${branchName}`,
      `gh pr create --base ${targetBaseBranch} --head ${branchName} --title "${escapeCommandText(title)}" --body-file github-pr-handoff.md`,
    ],
    prBody,
    artifacts: [artifact],
  });
}

export function createGitHubVerificationToPrHandoffWorkflowHandler(
  input: GitHubVerificationToPrHandoffInput,
): WorkflowStepHandler {
  return () => {
    const handoff = createGitHubVerificationToPrHandoff(input);
    if (!handoff.ok) {
      throw new Error(handoff.reason ?? "GitHub verification-to-PR handoff was rejected.");
    }
    return {
      summary: `GitHub PR handoff artifact prepared for ${handoff.branchName}; no push or PR creation was executed.`,
      artifacts: handoff.artifacts,
    };
  };
}

export function createGitHubPrHandoffWorkflow(options: GitHubPrHandoffWorkflowOptions): WorkflowDefinition {
  const plan = summarizeGitHubPrHandoffPlan({
    issue: options.issue,
    workspaceRoot: options.workspaceRoot,
  });
  const approvalBase: Pick<WorkflowApprovalPolicy, "requiredApprover"> = {
    requiredApprover: options.requiredApprover,
  };

  return {
    id: safeWorkflowId(options.id),
    title: `GitHub PR Handoff: ${plan.issue.owner}/${plan.issue.repo}#${plan.issue.number}`,
    version: "phase90",
    steps: [
      taskStep("issue_intake", "Issue Intake", issueIntakeTask(plan)),
      approvalStep("approve_local_workspace", "Approve Local Workspace", ["issue_intake"], {
        ...approvalBase,
        reason: `Approval required before creating local branch/worktree ${plan.branchName}.`,
      }),
      taskStep("create_local_workspace", "Create Local Workspace", localWorkspaceTask(plan), ["approve_local_workspace"]),
      taskStep("implement", "Implement Locally", implementTask(plan), ["create_local_workspace"]),
      taskStep("verify", "Verify Locally", verifyTask(plan), ["implement"]),
      approvalStep("approve_pr_creation", "Approve PR Creation", ["verify"], {
        ...approvalBase,
        reason: `Approval required before preparing PR creation for ${plan.branchName}.`,
      }),
      taskStep("pr_handoff", "PR Handoff", prHandoffTask(plan), ["approve_pr_creation"]),
    ],
  };
}

function issueIntakeTask(plan: GitHubPrHandoffPlan): string {
  return [
    "Read the provided GitHub issue data in dry-run mode.",
    `Issue: ${plan.issue.owner}/${plan.issue.repo}#${plan.issue.number}`,
    `Title: ${redactGitHubHandoffText(plan.issue.title)}`,
    "Do not fetch network resources or require GitHub credentials in this step.",
  ].join("\n");
}

function localWorkspaceTask(plan: GitHubPrHandoffPlan): string {
  return [
    "After explicit approval, prepare the local branch/worktree handoff plan.",
    `Branch: ${plan.branchName}`,
    `Worktree: ${plan.worktreePath}`,
    "Keep all mutations local-first and approval-auditable.",
  ].join("\n");
}

function implementTask(plan: GitHubPrHandoffPlan): string {
  return [
    "Run the implementation workflow for the approved local branch/worktree.",
    `Issue: ${plan.issue.owner}/${plan.issue.repo}#${plan.issue.number}`,
    "Preserve Colony security defaults and exact transcript truth.",
  ].join("\n");
}

function verifyTask(plan: GitHubPrHandoffPlan): string {
  return [
    "Run the required verification commands before any PR handoff.",
    `Branch: ${plan.branchName}`,
    "If verification fails, stop before approve_pr_creation.",
  ].join("\n");
}

function prHandoffTask(plan: GitHubPrHandoffPlan): string {
  return [
    "After verification and explicit approval, prepare the PR handoff artifact.",
    `Repository: ${plan.issue.owner}/${plan.issue.repo}`,
    `Branch: ${plan.branchName}`,
    "Include verification evidence before any operator-run push or PR command.",
    "Do not claim a remote PR exists unless the host executes an approved PR creation action.",
  ].join("\n");
}

function taskStep(id: string, title: string, task: string, dependsOn?: string[]): WorkflowStep {
  return {
    id,
    title,
    kind: "task",
    dependsOn,
    agentLoop: { task },
  };
}

function approvalStep(
  id: string,
  title: string,
  dependsOn: string[],
  approval: WorkflowApprovalPolicy,
): WorkflowStep {
  return {
    id,
    title,
    kind: "approval",
    dependsOn,
    approval,
  };
}

function parseGitHubIssueUrl(value: string | undefined): {
  owner?: string;
  repo?: string;
  number?: number;
  url?: string;
} {
  return parseGitHubIssueReference(value);
}

function parseGitHubIssueReference(value: string | undefined): {
  owner?: string;
  repo?: string;
  number?: number;
  url?: string;
} {
  if (!value) return {};
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const issueIndex = parts.findIndex((part) => part === "issues");
    if (url.hostname.toLowerCase() !== "github.com" || issueIndex < 2) {
      return { url: stripUrlCredentials(url) };
    }
    const number = positiveInteger(Number(parts[issueIndex + 1] ?? 0));
    return {
      owner: parts[0],
      repo: parts[1],
      number,
      url: stripUrlCredentials(url),
    };
  } catch {
    const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#|\/issues\/)([1-9][0-9]*)$/);
    if (shorthand) {
      return {
        owner: shorthand[1],
        repo: shorthand[2],
        number: Number(shorthand[3]),
      };
    }
    return { url: redactGitHubHandoffText(value) };
  }
}

function stripUrlCredentials(url: URL): string {
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function safeIdentifier(value: string, fallback: string): string {
  const redacted = redactGitHubHandoffText(value);
  if (redacted.includes("[REDACTED]")) return fallback;
  const slug = slugify(redacted);
  return slug || fallback;
}

function safeWorkflowId(value: string): string {
  return safeIdentifier(value, "github_pr_handoff").replace(/-/g, "_");
}

function safeBranchLike(value: string, fallback: string): string {
  const redacted = redactGitHubHandoffText(String(value ?? "")).trim();
  if (!redacted || redacted.includes("[REDACTED]")) return fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(redacted)) return fallback;
  if (
    redacted.includes("..")
    || redacted.includes("//")
    || redacted.startsWith("/")
    || redacted.endsWith("/")
    || redacted.includes("@{")
    || /[;&|`$<>()[\]{}*?!\r\n\t]/.test(redacted)
  ) {
    return fallback;
  }
  return redacted;
}

function safeText(value: string, fallback: string): string {
  const redacted = redactGitHubHandoffText(String(value ?? "")).trim();
  return redacted || fallback;
}

function positiveInteger(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_ISSUE_NUMBER;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function truncateBranch(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).replace(/-+$/g, "");
}

function localWorkspaceApprovalSignature(issue: NormalizedGitHubIssue, branchName: string): string {
  return `github-local-workspace:${issue.owner}/${issue.repo}#${issue.number}:${branchName}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/[\\/]+$/g, "");
}

function normalizeDisplayPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^([a-zA-Z]):\//, "$1:/");
}

function escapeCommandText(value: string): string {
  return redactGitHubHandoffText(value).replace(/["\\]/g, "");
}

function redactGitHubHandoffText(value: string): string {
  return scrubSecrets(value).replace(SECRET_PATTERN, (match) => (
    match.startsWith("?") || match.startsWith("&")
      ? `${match.slice(0, match.indexOf("=") + 1)}[REDACTED]`
      : "[REDACTED]"
  ));
}

function previewGitHubIssueInput(value: NormalizedGitHubIssue | GitHubIssueInput): string {
  const preview = isNormalizedIssue(value)
    ? {
        owner: value.owner,
        repo: value.repo,
        number: value.number,
        title: value.title,
        bodyPreview: value.bodyPreview,
        labels: value.labels,
        url: value.url,
      }
    : {
        reference: value.reference,
        url: value.url,
        owner: value.owner,
        repo: value.repo,
        number: value.number,
        title: value.title,
        body: value.body,
        labels: value.labels,
      };
  return redactGitHubHandoffText(JSON.stringify(preview)).slice(0, 1000);
}

function isNormalizedIssue(value: NormalizedGitHubIssue | GitHubIssueInput): value is NormalizedGitHubIssue {
  return (value as NormalizedGitHubIssue).source === "provided"
    && typeof (value as NormalizedGitHubIssue).owner === "string"
    && typeof (value as NormalizedGitHubIssue).repo === "string"
    && typeof (value as NormalizedGitHubIssue).number === "number";
}
