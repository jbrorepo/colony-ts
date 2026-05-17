/**
 * Phase 230 Verification Script - GitHub Verification-to-PR Handoff
 *
 * Covers Alpha 1 GitHub handoff depth:
 *   1. Verified local branch/worktree execution can produce a PR handoff artifact
 *   2. Missing or failed verification blocks the handoff
 *   3. Secrets are redacted from verification summaries and PR body text
 *   4. Push and PR creation remain operator-run suggestions, not executed actions
 *   5. The workflow template can attach the handoff artifact through a handler
 *
 * Run: bun run src/verify-phase230.ts
 */

import {
  createGitHubIssueIntakePlan,
  createGitHubLocalWorkspaceActionPlan,
  createGitHubPrHandoffWorkflow,
  createGitHubVerificationToPrHandoff,
  createGitHubVerificationToPrHandoffWorkflowHandler,
  type GitHubIssueIntakePlan,
} from "./github-pr-handoff";
import {
  executeApprovedGitHubLocalWorkspaceAction,
  type GitHubLocalWorkspaceExecutionReceipt,
} from "./github-local-workspace-executor";
import {
  WorkflowEngine,
  WorkflowRuntimeRunner,
  type WorkflowRun,
  type WorkflowStore,
  type WorkflowStepHandlers,
} from "./workflow";

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

class MemoryWorkflowStore implements WorkflowStore {
  private readonly runs = new Map<string, WorkflowRun>();

  async saveRun(run: WorkflowRun): Promise<void> {
    this.runs.set(run.id, JSON.parse(JSON.stringify(run)) as WorkflowRun);
  }

  async loadRun(runId: string): Promise<WorkflowRun | null> {
    const run = this.runs.get(runId);
    return run ? JSON.parse(JSON.stringify(run)) as WorkflowRun : null;
  }
}

async function verifiedInputs(): Promise<{
  intake: GitHubIssueIntakePlan;
  receipt: GitHubLocalWorkspaceExecutionReceipt;
}> {
  const intake = createGitHubIssueIntakePlan({
    issue: {
      reference: "jbrorepo/colony-ts#230",
      title: "Prepare verified PR handoff",
      body: "Copied issue body includes ghp_SHOULD_NOT_LEAK12345678.",
      labels: ["alpha-1", "github"],
    },
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });
  if (!intake.handoffPlan || !intake.localWorkspaceApprovalSignature) {
    throw new Error("fixture intake did not produce handoff plan");
  }
  const actionPlan = createGitHubLocalWorkspaceActionPlan({
    plan: intake.handoffPlan,
    approvalSignature: intake.localWorkspaceApprovalSignature,
    approvedBy: "operator",
  });
  const receipt = await executeApprovedGitHubLocalWorkspaceAction({
    plan: actionPlan,
    approvalSignature: intake.localWorkspaceApprovalSignature,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    worktreeRoot: ".colony/worktrees",
    executor: async () => ({ code: 0, stdout: "ok", stderr: "" }),
  });
  return { intake, receipt };
}

async function verifyPassingVerificationCreatesHandoff(): Promise<void> {
  section("1. Passing verification creates handoff artifact");
  const { intake, receipt } = await verifiedInputs();

  const handoff = createGitHubVerificationToPrHandoff({
    issueIntake: intake,
    executionReceipt: receipt,
    verificationCommands: ["bun run verify:phase230", "node ./node_modules/typescript/bin/tsc --noEmit"],
    verificationResults: [
      { command: "bun run verify:phase230", code: 0, summary: "Phase 230 passed with token=SHOULD_NOT_LEAK" },
      { command: "node ./node_modules/typescript/bin/tsc --noEmit", code: 0, summary: "TypeScript clean" },
    ],
    targetBaseBranch: "main",
  });

  assertEqual(handoff.ok, true, "Passing verification produces handoff");
  assertEqual(handoff.branchName, "colony/issue-230-prepare-verified-pr-handoff", "Handoff preserves branch");
  assertEqual(handoff.targetBaseBranch, "main", "Handoff records target base");
  assertEqual(handoff.verification.status, "passed", "Handoff records passing verification");
  assertEqual(handoff.artifacts.length, 1, "Handoff emits one markdown artifact");
  assertEqual(handoff.artifacts[0].name, "github-pr-handoff.md", "Artifact has stable name");
  assert(handoff.prBody.includes("jbrorepo/colony-ts#230"), "PR body names issue");
  assert(handoff.prBody.includes("Verification"), "PR body includes verification section");
  assert(handoff.suggestedCommands.some((command) => command.startsWith("git push -u origin ")), "Handoff suggests human-run push");
  assert(handoff.suggestedCommands.some((command) => command.startsWith("gh pr create ")), "Handoff suggests human-run PR creation");
  assertEqual(handoff.boundaries.pushExecuted, false, "Handoff states push was not executed");
  assertEqual(handoff.boundaries.prCreated, false, "Handoff states PR was not created");
  assertEqual(handoff.boundaries.remoteMutationExecuted, false, "Handoff states no remote mutation executed");
  assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Handoff redacts copied secrets");
}

async function verifyMissingVerificationRejected(): Promise<void> {
  section("2. Missing verification rejection");
  const { intake, receipt } = await verifiedInputs();
  const handoff = createGitHubVerificationToPrHandoff({
    issueIntake: intake,
    executionReceipt: receipt,
    verificationCommands: ["bun run verify:phase230"],
    verificationResults: [],
    targetBaseBranch: "main",
  });

  assertEqual(handoff.ok, false, "Missing verification is rejected");
  assert(handoff.reason?.includes("verification evidence") ?? false, "Missing verification explains evidence requirement");
  assertEqual(handoff.boundaries.prCreated, false, "Rejected handoff does not create PR");
}

async function verifyFailedVerificationRejected(): Promise<void> {
  section("3. Failed verification rejection");
  const { intake, receipt } = await verifiedInputs();
  const handoff = createGitHubVerificationToPrHandoff({
    issueIntake: intake,
    executionReceipt: receipt,
    verificationCommands: ["bun run verify:phase230"],
    verificationResults: [
      { command: "bun run verify:phase230", code: 1, summary: "failed with github_pat_SHOULD_NOT_LEAK12345678" },
    ],
    targetBaseBranch: "main",
  });

  assertEqual(handoff.ok, false, "Failed verification is rejected");
  assert(handoff.reason?.includes("failed") ?? false, "Failed verification explains failure");
  assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Failed handoff redacts copied secrets");
}

async function verifyFailedExecutionRejected(): Promise<void> {
  section("4. Failed local execution rejection");
  const { intake, receipt } = await verifiedInputs();
  const failedReceipt = {
    ...receipt,
    ok: false,
    failure: { message: "Local git mutation failed." },
  };
  const handoff = createGitHubVerificationToPrHandoff({
    issueIntake: intake,
    executionReceipt: failedReceipt,
    verificationCommands: ["bun run verify:phase230"],
    verificationResults: [
      { command: "bun run verify:phase230", code: 0, summary: "passed" },
    ],
    targetBaseBranch: "main",
  });

  assertEqual(handoff.ok, false, "Failed local execution blocks handoff");
  assert(handoff.reason?.includes("successful local workspace execution") ?? false, "Failed execution rejection explains requirement");
}

async function verifyWorkflowHandlerArtifact(): Promise<void> {
  section("5. Workflow template handoff artifact");
  const { intake, receipt } = await verifiedInputs();
  if (!intake.issue) throw new Error("fixture intake missing issue");
  const workflow = createGitHubPrHandoffWorkflow({
    id: "github_pr_230",
    issue: intake.issue,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    requiredApprover: "operator",
  });
  const handlers: WorkflowStepHandlers = {
    issue_intake: () => ({ summary: "Issue intake completed." }),
    create_local_workspace: () => ({ summary: "Workspace execution completed." }),
    implement: () => ({ summary: "Implementation completed." }),
    verify: () => ({
      summary: "Verification passed.",
      artifacts: [{ type: "json", name: "verification.json", content: JSON.stringify({ ok: true }) }],
    }),
    pr_handoff: createGitHubVerificationToPrHandoffWorkflowHandler({
      issueIntake: intake,
      executionReceipt: receipt,
      verificationCommands: ["bun run verify:phase230"],
      verificationResults: [
        { command: "bun run verify:phase230", code: 0, summary: "passed" },
      ],
      targetBaseBranch: "main",
    }),
  };
  const engine = new WorkflowEngine({
    store: new MemoryWorkflowStore(),
    now: (() => {
      let timestamp = 4000;
      return () => timestamp++;
    })(),
  });
  const runner = new WorkflowRuntimeRunner({ engine });
  const firstRun = await runner.startAndRun(workflow, handlers);
  const afterWorkspaceApproval = await runner.approveAndRun(firstRun.id, "approve_local_workspace", "operator", handlers);
  const completed = await runner.approveAndRun(afterWorkspaceApproval.id, "approve_pr_creation", "operator", handlers);

  assertEqual(completed.status, "completed", "Workflow completes after PR handoff approval");
  assert(completed.artifacts.some((artifact) => artifact.name === "github-pr-handoff.md"), "Workflow attaches PR handoff artifact");
  assert(!JSON.stringify(completed.artifacts).includes("SHOULD_NOT_LEAK"), "Workflow artifact redacts secrets");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 230 Verification (GitHub Verification-to-PR Handoff)\n");
  await verifyPassingVerificationCreatesHandoff();
  await verifyMissingVerificationRejected();
  await verifyFailedVerificationRejected();
  await verifyFailedExecutionRejected();
  await verifyWorkflowHandlerArtifact();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 230: GitHub verification-to-PR handoff is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
