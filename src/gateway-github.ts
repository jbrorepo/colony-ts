import type { GatewayBasicCommandPayload } from "./gateway-basic";
import { createGitHubIssueIntakePlan } from "./github-pr-handoff";
import { renderGitHubPrReceiptStatus, type GitHubPrExecutionReceipt } from "./github-pr-execution";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayGitHubContext {
  receipts?: GitHubPrExecutionReceipt[];
  workspaceRoot?: string;
}

export function buildGitHubCommandPayload(args: string[], context: GatewayGitHubContext = {}): GatewayBasicCommandPayload {
  const scope = (args[0] ?? "status").toLowerCase();
  const action = (args[1] ?? "").toLowerCase();
  if (scope === "issue" && action === "plan") {
    return buildGitHubIssuePlanPayload(args.slice(2), context);
  }
  if (scope === "workspace" && action === "approve") {
    return buildGitHubWorkspaceApprovalPayload(args[2]);
  }
  if (scope === "pr" && action === "plan") {
    const runId = requiredGitHubPrIdentifier(args[2]);
    if (!runId) return missingGitHubIdentifier("Run id", "/github pr plan <run_id>");
    if (!runId.ok) return rejectedGitHubIdentifier("Run id", "/github pr plan <run_id>");
    return {
      output: [
        "GitHub PR Plan:",
        "",
        `Run: ${runId.value}`,
        "Approvals required: push, create_pr",
        "Next valid command: /github pr create <run_id> --approved",
      ].join("\n"),
      data: { action: "github_pr_plan", runId: runId.value },
    };
  }
  if (scope === "pr" && action === "create") {
    const approved = args.includes("--approved");
    const runId = requiredGitHubPrIdentifier(args.slice(2).find((arg) => !arg.startsWith("--")));
    if (!runId) return missingGitHubIdentifier("Run id", "/github pr create <run_id> --approved");
    if (!runId.ok) return rejectedGitHubIdentifier("Run id", "/github pr create <run_id> --approved");
    return {
      output: [
        approved ? "GitHub PR creation approved." : "GitHub PR creation blocked.",
        "",
        approved
          ? "Approved PR creation must run through the injected GitHub executor and emit a receipt."
          : "Explicit approval required before push or PR creation.",
        "Credentials persisted: no",
        "Next valid command: /github pr status <receipt_id>",
      ].join("\n"),
      isError: !approved,
      data: { action: approved ? "github_pr_create" : "github_pr_create_blocked", runId: runId.value },
      action: approved ? { kind: "github_pr_create", runId: runId.value, approved: true } : { kind: "display" },
    };
  }
  if (scope === "pr" && action === "status") {
    const receiptId = requiredGitHubPrIdentifier(args[2]);
    if (!receiptId) return missingGitHubIdentifier("Receipt id", "/github pr status <receipt_id>");
    if (!receiptId.ok) return rejectedGitHubIdentifier("Receipt id", "/github pr status <receipt_id>");
    const receipt = (context.receipts ?? []).find((candidate) => candidate.receiptId === receiptId.value);
    return {
      output: receipt ? renderGitHubPrReceiptStatus(receipt) : `GitHub PR Receipt:\n\nReceipt not found: ${receiptId.value}\nNext valid command: /github pr plan <run_id>`,
      isError: !receipt,
      data: { action: "github_pr_status", receiptId: receiptId.value },
    };
  }
  return {
    output: [
      "GitHub Distribution:",
      "",
      "Commands: /github issue plan <owner>/<repo>#<n> | /github workspace approve <signature> | /github pr plan <run_id> | /github pr create <run_id> --approved | /github pr status <receipt_id>",
      "Next valid command: /github issue plan <owner>/<repo>#<n>",
    ].join("\n"),
    data: { action: "github_status" },
  };
}

function requiredIdentifier(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.startsWith("--")) return null;
  return normalized;
}

type GitHubPrIdentifierValidation = { ok: true; value: string } | { ok: false };

function requiredGitHubPrIdentifier(value: string | undefined): GitHubPrIdentifierValidation | null {
  const identifier = requiredIdentifier(value);
  if (!identifier) return null;
  const scrubbed = scrubGitHubApprovalSignature(identifier);
  if (scrubbed.includes("[REDACTED]")) return { ok: false };
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(scrubbed)) return { ok: false };
  if (scrubbed.includes("..") || scrubbed.includes("@{")) return { ok: false };
  return { ok: true, value: scrubbed };
}

function missingGitHubIdentifier(label: string, command: string): GatewayBasicCommandPayload {
  return {
    output: [
      `${label} required.`,
      "",
      `Next valid command: ${command}`,
    ].join("\n"),
    isError: true,
    data: { action: "github_missing_identifier", label },
  };
}

function rejectedGitHubIdentifier(label: string, command: string): GatewayBasicCommandPayload {
  return {
    output: [
      `${label} rejected.`,
      "",
      "GitHub PR identifiers must be local run/receipt ids, not paths, shell text, or credentials.",
      `Next valid command: ${command}`,
    ].join("\n"),
    isError: true,
    data: { action: "github_rejected_identifier", label },
  };
}

interface ParsedGitHubWorkspaceApprovalSignature {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
}

function buildGitHubWorkspaceApprovalPayload(rawSignature: string | undefined): GatewayBasicCommandPayload {
  const signature = requiredIdentifier(rawSignature);
  if (!signature) return missingGitHubIdentifier("Workspace approval signature", "/github workspace approve <signature>");
  const parsed = parseGitHubWorkspaceApprovalSignature(signature);
  if (!parsed) {
    return {
      output: [
        "Malformed GitHub workspace approval signature.",
        "",
        "Expected: github-local-workspace:<owner>/<repo>#<issue>:<branch>",
        "Approval signatures must describe a local workspace handoff, not credentials.",
        "Next valid command: /github issue plan <owner>/<repo>#<n>",
      ].join("\n"),
      isError: true,
      data: { action: "github_workspace_approve", ok: false },
    };
  }
  return {
    output: [
      "GitHub Workspace Approval:",
      "",
      `Issue: ${parsed.owner}/${parsed.repo}#${parsed.issueNumber}`,
      `Branch: ${parsed.branchName}`,
      "Approval state: accepted for host-owned local workspace handoff",
      "Local branch/worktree mutation requires exact approval and injected executor.",
      "No git push or remote PR creation is executed by this approval.",
      "Credentials persisted: no",
      "Next valid command: /github pr plan <run_id>",
    ].join("\n"),
    data: {
      action: "github_workspace_approve",
      ok: true,
      issue: `${parsed.owner}/${parsed.repo}#${parsed.issueNumber}`,
      branchName: parsed.branchName,
    },
  };
}

function parseGitHubWorkspaceApprovalSignature(value: string): ParsedGitHubWorkspaceApprovalSignature | null {
  const scrubbed = scrubGitHubApprovalSignature(value);
  if (scrubbed.includes("[REDACTED]")) return null;
  const match = scrubbed.match(/^github-local-workspace:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9][0-9]*):([A-Za-z0-9][A-Za-z0-9._/-]{0,120})$/);
  if (!match) return null;
  const branchName = match[4];
  if (
    branchName.includes("..") ||
    branchName.includes("//") ||
    branchName.includes("@{") ||
    branchName.startsWith("/") ||
    branchName.endsWith("/")
  ) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2],
    issueNumber: Number(match[3]),
    branchName,
  };
}

function scrubGitHubApprovalSignature(value: string): string {
  return scrubSecrets(value.trim())
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
}

function buildGitHubIssuePlanPayload(args: string[], context: GatewayGitHubContext): GatewayBasicCommandPayload {
  const reference = args.join(" ").trim();
  const plan = createGitHubIssueIntakePlan({
    issue: { reference },
    workspaceRoot: context.workspaceRoot ?? ".",
  });
  if (!plan.ok || !plan.issue) {
    return {
      output: [
        "GitHub Issue Plan rejected.",
        "",
        plan.reason ?? "GitHub issue intake rejected the supplied reference.",
        "",
        ...plan.guardrails.map((guardrail) => `- ${guardrail}`),
        "",
        "Next valid command: /github issue plan <owner>/<repo>#<n>",
      ].join("\n"),
      isError: true,
      data: { action: "github_issue_plan", ok: false },
    };
  }
  return {
    output: [
      "GitHub Issue Plan:",
      "",
      `Issue: ${plan.issue.owner}/${plan.issue.repo}#${plan.issue.number}`,
      `Branch: ${plan.branchName ?? "unknown"}`,
      `Worktree: ${plan.worktreePath ?? "unknown"}`,
      `Approval signature: ${plan.localWorkspaceApprovalSignature ?? "missing"}`,
      "Network fetch: no",
      "Approval state: awaiting local workspace approval",
      "",
      "Guardrails:",
      ...plan.guardrails.map((guardrail) => `- ${guardrail}`),
      "",
      "Next valid command: /github workspace approve <signature>",
    ].join("\n"),
    data: {
      action: "github_issue_plan",
      ok: true,
      issue: `${plan.issue.owner}/${plan.issue.repo}#${plan.issue.number}`,
      branchName: plan.branchName,
      approvalSignature: plan.localWorkspaceApprovalSignature,
    },
  };
}
