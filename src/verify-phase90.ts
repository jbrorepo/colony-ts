/**
 * Phase 90 Verification Script - Local-First GitHub PR Handoff
 *
 * Covers P1 GitHub PR Handoff:
 *   1. Dry-run issue intake without network or credential requirements
 *   2. Deterministic branch/worktree naming
 *   3. Approval-gated local workspace and PR creation boundaries
 *   4. Verification failure blocks PR handoff approval
 *
 * Run: bun run src/verify-phase90.ts
 */

import {
  createGitHubPrHandoffWorkflow,
  deriveGitHubPrBranchName,
  normalizeGitHubIssueInput,
  summarizeGitHubPrHandoffPlan,
} from "./github-pr-handoff";
import {
  WorkflowEngine,
  WorkflowRuntimeRunner,
  type WorkflowRun,
  type WorkflowStore,
  type WorkflowStepHandlers,
} from "./workflow";
import {
  WorkflowAutomationController,
} from "./workflow/automation";

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
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
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

function issueInput() {
  return {
    url: "https://github.com/jbrorepo/colony-ts/issues/42?token=ghp_SHOULD_NOT_LEAK",
    owner: "jbrorepo",
    repo: "colony-ts",
    number: 42,
    title: "Fix /memory: leaks raw query into diagnostics!!!",
    body: "Operator saw secret token ghp_SHOULD_NOT_LEAK in diagnostics.",
    labels: ["bug", "security"],
  };
}

function handlers(failVerify = false): WorkflowStepHandlers {
  return {
    issue_intake: () => ({
      summary: "Issue intake completed in dry-run mode.",
    }),
    approve_local_workspace: () => {
      throw new Error("approval steps must not need handlers");
    },
    create_local_workspace: () => ({
      summary: "Local branch/worktree plan prepared.",
    }),
    implement: () => ({
      summary: "Implementation workflow completed.",
    }),
    verify: () => {
      if (failVerify) throw new Error("verification failed");
      return { summary: "Verification passed." };
    },
    approve_pr_creation: () => {
      throw new Error("approval steps must not need handlers");
    },
    pr_handoff: () => ({
      summary: "PR handoff prepared after approval.",
    }),
  };
}

function verifyIssueIntakeAndNaming(): void {
  section("1. Dry-Run Issue Intake and Naming");

  const issue = normalizeGitHubIssueInput(issueInput());
  assertEqual(issue.owner, "jbrorepo", "Issue intake preserves owner");
  assertEqual(issue.repo, "colony-ts", "Issue intake preserves repo");
  assertEqual(issue.number, 42, "Issue intake preserves issue number");
  assertEqual(issue.source, "provided", "Issue intake stays local/provided");
  assert(!JSON.stringify(issue).includes("ghp_SHOULD_NOT_LEAK"), "Issue intake redacts URL/body credentials");

  const credentialFields = normalizeGitHubIssueInput({
    owner: "ghp_SHOULD_NOT_LEAK1234567890",
    repo: "github_pat_SHOULD_NOT_LEAK1234567890",
    number: 7,
    title: "Credential field regression",
  });
  assertEqual(credentialFields.owner, "unknown-owner", "Credential-like owner falls back to safe placeholder");
  assertEqual(credentialFields.repo, "unknown-repo", "Credential-like repo falls back to safe placeholder");
  assert(!JSON.stringify(credentialFields).match(/ghp|github_pat|should-not-leak/i), "Credential-like owner/repo values are not slug-leaked");

  const branch = deriveGitHubPrBranchName(issue);
  assertEqual(branch, "colony/issue-42-fix-memory-leaks-raw-query-into-diagnostics", "Branch name is deterministic and sanitized");
  assert(!/[^\x00-\x7F]/.test(branch), "Branch name is ASCII-only");
  assert(!branch.includes("//"), "Branch name avoids empty path parts");

  const plan = summarizeGitHubPrHandoffPlan({
    issue,
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });
  assertEqual(plan.mode, "dry_run", "Handoff plan defaults to dry-run mode");
  assert(plan.worktreePath.endsWith(".colony/worktrees/colony-issue-42-fix-memory-leaks-raw-query-into-diagnostics"), "Worktree path is deterministic and local");
  assert(plan.approvalRequired.includes("create_local_workspace"), "Plan requires approval before local branch/worktree creation");
  assert(plan.approvalRequired.includes("approve_pr_creation"), "Plan requires approval before PR creation");
  assert(!JSON.stringify(plan).includes("ghp_SHOULD_NOT_LEAK"), "Plan summary redacts credentials");
}

function verifyWorkflowShape(): void {
  section("2. Approval-Gated Workflow Shape");

  const workflow = createGitHubPrHandoffWorkflow({
    id: "github_pr_42",
    issue: normalizeGitHubIssueInput(issueInput()),
    workspaceRoot: "D:/The Colony Test/colony-ts",
    requiredApprover: "operator",
  });
  const stepIds = workflow.steps.map((step) => step.id);
  assertEqual(workflow.title, "GitHub PR Handoff: jbrorepo/colony-ts#42", "Workflow title is issue-scoped");
  assertEqual(stepIds.join(" > "), "issue_intake > approve_local_workspace > create_local_workspace > implement > verify > approve_pr_creation > pr_handoff", "Workflow orders local-first PR handoff steps");
  assertEqual(workflow.steps[1].kind, "approval", "Local workspace creation is approval-gated");
  assertEqual(workflow.steps[1].approval?.requiredApprover, "operator", "Local workspace approval preserves approver");
  assertEqual(workflow.steps[5].kind, "approval", "PR creation is approval-gated");
  assert(workflow.steps[5].dependsOn?.includes("verify") ?? false, "PR approval depends on verification");
  assert(workflow.steps[6].dependsOn?.includes("approve_pr_creation") ?? false, "PR handoff waits for PR approval");
  assert(!JSON.stringify(workflow).includes("ghp_SHOULD_NOT_LEAK"), "Workflow definition omits raw credentials");
}

async function verifyRuntimeApprovalAndFailureBoundaries(): Promise<void> {
  section("3. Runtime Approval and Verification Boundaries");

  const engine = new WorkflowEngine({
    store: new MemoryWorkflowStore(),
    now: (() => {
      let timestamp = 1000;
      return () => timestamp++;
    })(),
  });
  const runner = new WorkflowRuntimeRunner({ engine });
  const workflow = createGitHubPrHandoffWorkflow({
    id: "github_pr_42",
    issue: normalizeGitHubIssueInput(issueInput()),
    workspaceRoot: "D:/The Colony Test/colony-ts",
    requiredApprover: "operator",
  });

  const firstRun = await runner.startAndRun(workflow, handlers());
  assertEqual(firstRun.status, "paused", "Workflow pauses before local branch/worktree creation");
  assertEqual(firstRun.steps.approve_local_workspace.status, "awaiting_approval", "Local workspace approval is awaiting approval");
  assertEqual(firstRun.steps.create_local_workspace.status, "pending", "Local workspace task does not run before approval");

  const afterLocalApproval = await runner.approveAndRun(firstRun.id, "approve_local_workspace", "operator", handlers(true));
  assertEqual(afterLocalApproval.status, "failed", "Failed verification fails the workflow");
  assertEqual(afterLocalApproval.steps.verify.status, "failed", "Verify step records failure");
  assertEqual(afterLocalApproval.steps.approve_pr_creation.status, "pending", "PR approval is not reached after failed verification");
  assertEqual(afterLocalApproval.steps.pr_handoff.status, "pending", "PR handoff is blocked after failed verification");

  const engine2 = new WorkflowEngine({
    store: new MemoryWorkflowStore(),
    now: (() => {
      let timestamp = 2000;
      return () => timestamp++;
    })(),
  });
  const runner2 = new WorkflowRuntimeRunner({ engine: engine2 });
  const successRun = await runner2.startAndRun(workflow, handlers());
  const afterWorkspace = await runner2.approveAndRun(successRun.id, "approve_local_workspace", "operator", handlers());
  assertEqual(afterWorkspace.status, "paused", "Successful verification pauses before PR creation");
  assertEqual(afterWorkspace.steps.verify.status, "completed", "Verify step completes before PR approval");
  assertEqual(afterWorkspace.steps.approve_pr_creation.status, "awaiting_approval", "PR creation requires explicit approval");
  assertEqual(afterWorkspace.steps.pr_handoff.status, "pending", "PR handoff does not run before PR approval");
  const completed = await runner2.approveAndRun(afterWorkspace.id, "approve_pr_creation", "operator", handlers());
  assertEqual(completed.status, "completed", "Approved PR handoff workflow completes");
  assertEqual(completed.steps.pr_handoff.status, "completed", "PR handoff runs only after approval");
}

async function verifyAutomationTemplate(): Promise<void> {
  section("4. Daemon Workflow Template Integration");

  const controller = new WorkflowAutomationController({
    engine: new WorkflowEngine({
      store: new MemoryWorkflowStore(),
      now: () => 3000,
    }),
    handlers: handlers(),
  });

  const templates = await controller.handle({
    type: "list_templates",
    requestId: "req_templates",
  });
  assert(templates.templates?.some((template) => template.id === "github_pr_handoff") ?? false, "Workflow templates expose GitHub PR handoff");

  const started = await controller.handle({
    type: "start_template",
    requestId: "req_start",
    templateId: "github_pr_handoff",
    workflowId: "github_pr_42",
    title: "ignored",
    objective: "ignored",
    requiredApprover: "operator",
    githubIssue: issueInput(),
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });
  assertEqual(started.ok, true, "Automation controller starts GitHub PR handoff template");
  assertEqual(started.snapshot?.status, "paused", "Started template pauses at first approval gate");
  assertEqual(started.snapshot?.awaitingStepId, "approve_local_workspace", "Started template awaits local workspace approval");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 90 Verification (GitHub PR Handoff)\n");

  verifyIssueIntakeAndNaming();
  verifyWorkflowShape();
  await verifyRuntimeApprovalAndFailureBoundaries();
  await verifyAutomationTemplate();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 90: GitHub PR handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
