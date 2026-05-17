/**
 * Phase 228 Verification Script - GitHub Issue Intake Planning
 *
 * Covers Alpha 1 GitHub local execution depth:
 *   1. Deterministic issue-reference intake without network or credentials
 *   2. Fail-closed handling for incomplete issue coordinates
 *   3. Approval-gated local branch/worktree action planning from intake
 *   4. Existing PR handoff workflow remains verification-before-PR
 *
 * Run: bun run src/verify-phase228.ts
 */

import {
  createGitHubIssueIntakePlan,
  createGitHubLocalWorkspaceActionPlan,
  createGitHubPrHandoffWorkflow,
} from "./github-pr-handoff";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

function verifyIssueReferenceIntake(): void {
  section("1. Deterministic issue reference intake");
  const plan = createGitHubIssueIntakePlan({
    issue: {
      reference: "jbrorepo/colony-ts#128",
      title: "Add Alpha 1 GitHub local execution",
      body: "Observed ghp_SHOULD_NOT_LEAK12345678 in copied issue notes.",
      labels: ["launch-alpha-1", "github"],
    },
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });

  assertEqual(plan.ok, true, "Issue reference intake is accepted");
  assertEqual(plan.source, "provided", "Issue intake remains provided/local");
  assertEqual(plan.networkRequired, false, "Issue intake does not require network");
  assertEqual(plan.approvalState, "awaiting_local_workspace_approval", "Issue intake awaits local workspace approval");
  assertEqual(plan.issue?.owner, "jbrorepo", "Issue intake parses owner");
  assertEqual(plan.issue?.repo, "colony-ts", "Issue intake parses repo");
  assertEqual(plan.issue?.number, 128, "Issue intake parses issue number");
  assertEqual(plan.branchName, "colony/issue-128-add-alpha-1-github-local-execution", "Issue intake derives deterministic branch");
  assert(plan.localWorkspaceApprovalSignature?.startsWith("github-local-workspace:jbrorepo/colony-ts#128:") === true, "Issue intake exposes exact approval signature");
  assert(plan.nextSteps.some((step) => step.includes("approve local workspace")), "Issue intake explains approval next step");
  assert(!JSON.stringify(plan).includes("SHOULD_NOT_LEAK"), "Issue intake redacts copied credential material");
  assert(!("commands" in plan), "Issue intake does not prepare executable git commands");
  assert(!JSON.stringify(plan).includes("gh pr create"), "Issue intake does not prepare PR commands");
}

function verifyUrlIntakeAndRejection(): void {
  section("2. URL intake and fail-closed rejection");
  const urlPlan = createGitHubIssueIntakePlan({
    issue: {
      url: "https://github.com/acme/widget/issues/12?token=ghp_SHOULD_NOT_LEAK12345678",
      title: "Fix install doctor",
    },
    workspaceRoot: "D:/repo",
  });

  assertEqual(urlPlan.ok, true, "Token-bearing GitHub issue URL is accepted after redaction");
  assertEqual(urlPlan.issue?.owner, "acme", "URL intake parses owner");
  assertEqual(urlPlan.issue?.repo, "widget", "URL intake parses repo");
  assertEqual(urlPlan.issue?.number, 12, "URL intake parses issue number");
  assertEqual(urlPlan.issue?.url, "https://github.com/acme/widget/issues/12", "URL intake strips query and hash");
  assert(!JSON.stringify(urlPlan).includes("SHOULD_NOT_LEAK"), "URL intake redacts token-bearing query");

  const rejected = createGitHubIssueIntakePlan({
    issue: {
      url: "https://github.com/acme/widget/issues/not-a-number?token=ghp_SHOULD_NOT_LEAK12345678",
      title: "Invalid issue coordinate",
    },
    workspaceRoot: "D:/repo",
  });

  assertEqual(rejected.ok, false, "Incomplete issue coordinates are rejected");
  assertEqual(rejected.approvalState, "rejected", "Rejected intake never awaits approval");
  assert(rejected.reason?.includes("owner, repo, and positive issue number") ?? false, "Rejected intake explains missing coordinate requirements");
  assert(!JSON.stringify(rejected).includes("SHOULD_NOT_LEAK"), "Rejected intake redacts copied credentials");
}

function verifyApprovalGatedLocalAction(): void {
  section("3. Approval-gated local branch/worktree action planning");
  const intake = createGitHubIssueIntakePlan({
    issue: {
      reference: "jbrorepo/colony-ts#129",
      title: "Verify local branch guardrails",
    },
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });
  assert(Boolean(intake.ok && intake.handoffPlan), "Intake creates a handoff plan");
  if (!intake.handoffPlan) return;

  const wrongApproval = createGitHubLocalWorkspaceActionPlan({
    plan: intake.handoffPlan,
    approvalSignature: "wrong",
    approvedBy: "operator",
  });
  assertEqual(wrongApproval.ok, false, "Wrong local workspace approval is rejected");

  const approved = createGitHubLocalWorkspaceActionPlan({
    plan: intake.handoffPlan,
    approvalSignature: intake.localWorkspaceApprovalSignature ?? "",
    approvedBy: "operator",
  });
  assertEqual(approved.ok, true, "Exact intake approval produces host action plan");
  assertEqual(approved.action?.branchName, "colony/issue-129-verify-local-branch-guardrails", "Approved action keeps intake branch");
  assert(approved.action?.commands.every((command) => command.startsWith("git ") && !command.includes("push") && !command.includes("gh pr")) ?? false, "Approved action is local git only");
}

function verifyWorkflowFromIntake(): void {
  section("4. Verification-before-PR workflow from intake");
  const intake = createGitHubIssueIntakePlan({
    issue: {
      reference: "jbrorepo/colony-ts#130",
      title: "Carry intake into workflow",
    },
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });
  assert(Boolean(intake.ok && intake.issue), "Intake issue is available for workflow creation");
  if (!intake.issue) return;

  const workflow = createGitHubPrHandoffWorkflow({
    id: "github_issue_130",
    issue: intake.issue,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    requiredApprover: "operator",
  });
  const stepIds = workflow.steps.map((step) => step.id).join(" > ");
  assertEqual(stepIds, "issue_intake > approve_local_workspace > create_local_workspace > implement > verify > approve_pr_creation > pr_handoff", "Workflow keeps verification-before-PR ordering");
  assert(workflow.steps.find((step) => step.id === "approve_local_workspace")?.kind === "approval", "Local workspace mutation remains approval-gated");
  assert(workflow.steps.find((step) => step.id === "approve_pr_creation")?.dependsOn?.includes("verify") ?? false, "PR creation approval still depends on verification");
}

function main(): void {
  console.log("THE COLONY - Phase 228 Verification (GitHub Issue Intake Planning)\n");
  verifyIssueReferenceIntake();
  verifyUrlIntakeAndRejection();
  verifyApprovalGatedLocalAction();
  verifyWorkflowFromIntake();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 228: GitHub issue intake planning is GREEN.");
}

main();
