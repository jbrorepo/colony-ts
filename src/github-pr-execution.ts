import type { NormalizedGitHubIssue, GitHubVerificationResultSummary } from "./github-pr-handoff";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GitHubPrPreflightInput {
  issue: NormalizedGitHubIssue;
  branchName: string;
  headSha: string;
  baseBranch: string;
  verification: GitHubVerificationResultSummary[];
}

export interface GitHubPrPreflight {
  ok: boolean;
  reason?: string;
  issue: NormalizedGitHubIssue;
  branchName: string;
  headSha: string;
  baseBranch: string;
  verification: GitHubVerificationResultSummary[];
  approvalSignature: string;
  approvalsRequired: string[];
  boundaries: {
    pushExecuted: false;
    prCreated: false;
    credentialsPersisted: false;
    remoteMutationExecuted: false;
  };
}

export interface GitHubPrApproval {
  approved?: boolean;
  approvedBy?: string;
  signature?: string;
}

export interface GitHubPrExecutorResult {
  ok: boolean;
  remoteUrl?: string;
  prNumber?: number;
  reason?: string;
}

export interface GitHubPrExecutionReceipt {
  ok: boolean;
  receiptId: string;
  reason?: string;
  issue: string;
  branchName: string;
  headSha: string;
  baseBranch: string;
  branchPushed: boolean;
  prCreated: boolean;
  remoteUrl?: string;
  prNumber?: number;
  verificationAttached: boolean;
  credentialsPersisted: false;
  approvalBy?: string;
}

export function createGitHubPrPreflight(input: GitHubPrPreflightInput): GitHubPrPreflight {
  const verification = input.verification.map((result) => ({
    ...result,
    command: redact(result.command),
    summary: redact(result.summary),
  }));
  const failed = verification.find((result) => result.code !== 0);
  const base = {
    issue: { ...input.issue, title: redact(input.issue.title), bodyPreview: input.issue.bodyPreview ? redact(input.issue.bodyPreview) : undefined },
    branchName: safeBranch(input.branchName),
    headSha: redact(input.headSha).slice(0, 80),
    baseBranch: safeBranch(input.baseBranch),
    verification,
    approvalSignature: `github-pr:${input.issue.owner}/${input.issue.repo}#${input.issue.number}:${safeBranch(input.branchName)}:${redact(input.headSha).slice(0, 12)}`,
    approvalsRequired: ["push", "create_pr"],
    boundaries: {
      pushExecuted: false,
      prCreated: false,
      credentialsPersisted: false,
      remoteMutationExecuted: false,
    },
  } satisfies Omit<GitHubPrPreflight, "ok" | "reason">;
  if (verification.length === 0) {
    return { ok: false, reason: "GitHub PR preflight requires verification evidence.", ...base };
  }
  if (failed) {
    return { ok: false, reason: `GitHub PR preflight blocked because verification failed: ${failed.command}`, ...base };
  }
  return { ok: true, ...base };
}

export async function executeApprovedGitHubPrCreation(opts: {
  preflight: GitHubPrPreflight;
  approval: GitHubPrApproval;
  executor: (preflight: GitHubPrPreflight) => Promise<GitHubPrExecutorResult> | GitHubPrExecutorResult;
}): Promise<GitHubPrExecutionReceipt> {
  const blocked = blockedReceipt(opts.preflight, "GitHub PR execution requires successful preflight.");
  if (!opts.preflight.ok) return blocked;
  if (!opts.approval.approved || opts.approval.signature !== opts.preflight.approvalSignature) {
    return blockedReceipt(opts.preflight, "Exact GitHub PR approval signature is required.");
  }
  const result = await Promise.resolve(opts.executor(opts.preflight));
  if (!result.ok) return blockedReceipt(opts.preflight, result.reason ?? "GitHub executor failed.");
  return {
    ok: true,
    receiptId: receiptId(opts.preflight),
    issue: issueLabel(opts.preflight.issue),
    branchName: opts.preflight.branchName,
    headSha: opts.preflight.headSha,
    baseBranch: opts.preflight.baseBranch,
    branchPushed: true,
    prCreated: true,
    remoteUrl: result.remoteUrl ? redact(result.remoteUrl) : undefined,
    prNumber: result.prNumber,
    verificationAttached: true,
    credentialsPersisted: false,
    approvalBy: redact(opts.approval.approvedBy ?? "operator"),
  };
}

export function renderGitHubPrReceiptStatus(receipt: GitHubPrExecutionReceipt): string {
  return [
    "GitHub PR Receipt:",
    "",
    `Receipt: ${receipt.receiptId}`,
    `Issue: ${receipt.issue}`,
    `Branch: ${receipt.branchName}`,
    `Base: ${receipt.baseBranch}`,
    `Head: ${receipt.headSha}`,
    `Branch pushed: ${receipt.branchPushed ? "yes" : "no"}`,
    `PR created: ${receipt.prCreated ? "yes" : "no"}`,
    receipt.remoteUrl ? `Remote URL: ${receipt.remoteUrl}` : "Remote URL: none",
    `Verification attached: ${receipt.verificationAttached ? "yes" : "no"}`,
    `Credentials persisted: ${receipt.credentialsPersisted ? "yes" : "no"}`,
    "Next valid command: /github pr status <receipt_id>",
  ].join("\n");
}

function blockedReceipt(preflight: GitHubPrPreflight, reason: string): GitHubPrExecutionReceipt {
  return {
    ok: false,
    receiptId: receiptId(preflight),
    reason,
    issue: issueLabel(preflight.issue),
    branchName: preflight.branchName,
    headSha: preflight.headSha,
    baseBranch: preflight.baseBranch,
    branchPushed: false,
    prCreated: false,
    verificationAttached: false,
    credentialsPersisted: false,
  };
}

function receiptId(preflight: GitHubPrPreflight): string {
  return `github_pr_${preflight.issue.owner}_${preflight.issue.repo}_${preflight.issue.number}_${preflight.headSha.slice(0, 8)}`.replace(/[^A-Za-z0-9_]+/g, "_");
}

function issueLabel(issue: NormalizedGitHubIssue): string {
  return `${issue.owner}/${issue.repo}#${issue.number}`;
}

function safeBranch(value: string): string {
  const redacted = redact(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(redacted)) return "main";
  if (redacted.includes("..") || redacted.startsWith("/") || redacted.includes("@{")) return "main";
  return redacted;
}

function redact(value: string): string {
  return scrubSecrets(value)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/([?&](?:token|api[_-]?key|secret|password|authorization)=)[^&#\s]+/gi, "$1[REDACTED]");
}
