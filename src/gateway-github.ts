import type { GatewayBasicCommandPayload } from "./gateway-basic";
import { createGitHubIssueIntakePlan } from "./github-pr-handoff";
import { renderGitHubPrReceiptStatus, type GitHubPrExecutionReceipt } from "./github-pr-execution";

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
    return {
      output: [
        "GitHub Workspace Approval:",
        "",
        `Signature: ${args[2] ?? "missing"}`,
        "Local branch/worktree mutation requires exact approval and injected executor.",
        "Next valid command: /github pr plan <run_id>",
      ].join("\n"),
      data: { action: "github_workspace_approve" },
    };
  }
  if (scope === "pr" && action === "plan") {
    const runId = requiredIdentifier(args[2]);
    if (!runId) return missingGitHubIdentifier("Run id", "/github pr plan <run_id>");
    return {
      output: [
        "GitHub PR Plan:",
        "",
        `Run: ${runId}`,
        "Approvals required: push, create_pr",
        "Next valid command: /github pr create <run_id> --approved",
      ].join("\n"),
      data: { action: "github_pr_plan", runId },
    };
  }
  if (scope === "pr" && action === "create") {
    const approved = args.includes("--approved");
    const runId = requiredIdentifier(args.slice(2).find((arg) => !arg.startsWith("--")));
    if (!runId) return missingGitHubIdentifier("Run id", "/github pr create <run_id> --approved");
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
      data: { action: approved ? "github_pr_create" : "github_pr_create_blocked", runId },
      action: approved ? { kind: "github_pr_create", runId, approved: true } : { kind: "display" },
    };
  }
  if (scope === "pr" && action === "status") {
    const receiptId = requiredIdentifier(args[2]);
    if (!receiptId) return missingGitHubIdentifier("Receipt id", "/github pr status <receipt_id>");
    const receipt = (context.receipts ?? []).find((candidate) => candidate.receiptId === receiptId);
    return {
      output: receipt ? renderGitHubPrReceiptStatus(receipt) : `GitHub PR Receipt:\n\nReceipt not found: ${receiptId}\nNext valid command: /github pr plan <run_id>`,
      isError: !receipt,
      data: { action: "github_pr_status", receiptId },
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
