import type { GatewayBasicCommandPayload } from "./gateway-basic";
import { renderGitHubPrReceiptStatus, type GitHubPrExecutionReceipt } from "./github-pr-execution";

export interface GatewayGitHubContext {
  receipts?: GitHubPrExecutionReceipt[];
}

export function buildGitHubCommandPayload(args: string[], context: GatewayGitHubContext = {}): GatewayBasicCommandPayload {
  const scope = (args[0] ?? "status").toLowerCase();
  const action = (args[1] ?? "").toLowerCase();
  if (scope === "issue" && action === "plan") {
    return {
      output: [
        "GitHub Issue Plan:",
        "",
        `Reference: ${args[2] ?? "missing"}`,
        "Network fetch: no",
        "Next valid command: /github workspace approve <signature>",
      ].join("\n"),
      data: { action: "github_issue_plan" },
    };
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
