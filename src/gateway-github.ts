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
    return {
      output: [
        "GitHub PR Plan:",
        "",
        `Run: ${args[2] ?? "missing"}`,
        "Approvals required: push, create_pr",
        "Next valid command: /github pr create <run_id> --approved",
      ].join("\n"),
      data: { action: "github_pr_plan" },
    };
  }
  if (scope === "pr" && action === "create") {
    const approved = args.includes("--approved");
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
      data: { action: approved ? "github_pr_create" : "github_pr_create_blocked" },
      action: approved ? { kind: "github_pr_create", runId: args[2] ?? "", approved: true } : { kind: "display" },
    };
  }
  if (scope === "pr" && action === "status") {
    const receiptId = args[2] ?? "";
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
