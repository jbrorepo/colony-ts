/**
 * Phase 229 Verification Script - Approved GitHub Local Workspace Execution
 *
 * Covers Alpha 1 GitHub local execution depth:
 *   1. Approved branch/worktree plans execute through an injected git executor
 *   2. Missing approval, branch tampering, and path escape attempts fail closed
 *   3. Command failures return redacted receipts and stop later mutations
 *
 * Run: bun run src/verify-phase229.ts
 */

import {
  createGitHubLocalWorkspaceActionPlan,
  summarizeGitHubPrHandoffPlan,
  type GitHubLocalWorkspaceActionPlan,
} from "./github-pr-handoff";
import {
  executeApprovedGitHubLocalWorkspaceAction,
  type GitHubLocalWorkspaceCommandExecutor,
} from "./github-local-workspace-executor";

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

function approvedPlan(): {
  plan: GitHubLocalWorkspaceActionPlan;
  approvalSignature: string;
} {
  const handoff = summarizeGitHubPrHandoffPlan({
    issue: {
      reference: "jbrorepo/colony-ts#229",
      title: "Execute local GitHub worktree",
    },
    workspaceRoot: "D:/The Colony Test/colony-ts",
  });
  const plan = createGitHubLocalWorkspaceActionPlan({
    plan: handoff,
    approvalSignature: handoff.localWorkspaceApprovalSignature,
    approvedBy: "operator",
  });
  return {
    plan,
    approvalSignature: handoff.localWorkspaceApprovalSignature,
  };
}

function recordingExecutor(options?: {
  failAt?: number;
  stdout?: string;
  stderr?: string;
}): {
  calls: Parameters<GitHubLocalWorkspaceCommandExecutor>[0][];
  executor: GitHubLocalWorkspaceCommandExecutor;
} {
  const calls: Parameters<GitHubLocalWorkspaceCommandExecutor>[0][] = [];
  return {
    calls,
    executor: async (command) => {
      calls.push(command);
      const callNumber = calls.length;
      if (options?.failAt === callNumber) {
        return {
          code: 1,
          stdout: options.stdout ?? "created ghp_SHOULD_NOT_LEAK12345678",
          stderr: options.stderr ?? "fatal: branch failed with token=SHOULD_NOT_LEAK",
        };
      }
      return {
        code: 0,
        stdout: options?.stdout ?? "ok",
        stderr: "",
      };
    },
  };
}

async function verifySuccessfulReceipt(): Promise<void> {
  section("1. Successful approved execution receipt");
  const { plan, approvalSignature } = approvedPlan();
  const { calls, executor } = recordingExecutor();

  const receipt = await executeApprovedGitHubLocalWorkspaceAction({
    plan,
    approvalSignature,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    worktreeRoot: ".colony/worktrees",
    executor,
  });

  assertEqual(receipt.ok, true, "Approved local workspace execution succeeds");
  assertEqual(receipt.action, "create_local_git_workspace", "Receipt records local workspace action");
  assertEqual(receipt.branchName, "colony/issue-229-execute-local-github-worktree", "Receipt preserves deterministic branch");
  assert(receipt.worktreePath.endsWith("/.colony/worktrees/colony-issue-229-execute-local-github-worktree"), "Receipt resolves bounded worktree path");
  assertEqual(receipt.commands.length, 2, "Receipt records sequential branch and worktree commands");
  assertEqual(calls.length, 2, "Injected executor receives two git mutations");
  assertEqual(calls[0].executable, "git", "First command uses git executable");
  assertEqual(calls[0].args[0], "branch", "First command creates local branch");
  assertEqual(calls[1].args[0], "worktree", "Second command creates local worktree");
  assertEqual(receipt.boundaries.pushed, false, "Receipt states no push occurred");
  assertEqual(receipt.boundaries.prCreated, false, "Receipt states no PR was created");
  assertEqual(receipt.boundaries.credentialsPersisted, false, "Receipt states no credentials were persisted");
  assert(receipt.verificationNextStep.includes("verification"), "Receipt names verification as next step");
}

async function verifyMissingApprovalRejection(): Promise<void> {
  section("2. Missing approval rejection");
  const { plan } = approvedPlan();
  const { calls, executor } = recordingExecutor();

  const receipt = await executeApprovedGitHubLocalWorkspaceAction({
    plan,
    approvalSignature: "",
    workspaceRoot: "D:/The Colony Test/colony-ts",
    worktreeRoot: "D:/The Colony Test/colony-ts/.colony/worktrees",
    executor,
  });

  assertEqual(receipt.ok, false, "Missing approval is rejected");
  assert(receipt.failure?.message.includes("Exact approval signature") ?? false, "Missing approval explains exact-signature requirement");
  assertEqual(calls.length, 0, "Missing approval performs no git mutation");
}

async function verifyTamperedBranchRejection(): Promise<void> {
  section("3. Tampered branch rejection");
  const { plan, approvalSignature } = approvedPlan();
  const tampered: GitHubLocalWorkspaceActionPlan = JSON.parse(JSON.stringify(plan)) as GitHubLocalWorkspaceActionPlan;
  if (tampered.action) {
    tampered.action.branchName = "colony/issue-229;git push origin main";
    tampered.action.commands = [
      `git branch ${tampered.action.branchName}`,
      `git worktree add "${tampered.action.worktreePath}" ${tampered.action.branchName}`,
    ];
  }
  const { calls, executor } = recordingExecutor();

  const receipt = await executeApprovedGitHubLocalWorkspaceAction({
    plan: tampered,
    approvalSignature,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    worktreeRoot: "D:/The Colony Test/colony-ts/.colony/worktrees",
    executor,
  });

  assertEqual(receipt.ok, false, "Tampered branch is rejected");
  assert(receipt.failure?.message.includes("branch") ?? false, "Tampered branch rejection names branch validation");
  assertEqual(calls.length, 0, "Tampered branch performs no git mutation");
}

async function verifyPathEscapeRejection(): Promise<void> {
  section("4. Worktree path escape rejection");
  const { plan, approvalSignature } = approvedPlan();
  const tampered: GitHubLocalWorkspaceActionPlan = JSON.parse(JSON.stringify(plan)) as GitHubLocalWorkspaceActionPlan;
  if (tampered.action) {
    tampered.action.worktreePath = "D:/The Colony Test/escape";
    tampered.action.commands = [
      `git branch ${tampered.action.branchName}`,
      `git worktree add "${tampered.action.worktreePath}" ${tampered.action.branchName}`,
    ];
  }
  const { calls, executor } = recordingExecutor();

  const receipt = await executeApprovedGitHubLocalWorkspaceAction({
    plan: tampered,
    approvalSignature,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    worktreeRoot: "D:/The Colony Test/colony-ts/.colony/worktrees",
    executor,
  });

  assertEqual(receipt.ok, false, "Worktree path escape is rejected");
  assert(receipt.failure?.message.includes("worktree") ?? false, "Path escape rejection names worktree validation");
  assertEqual(calls.length, 0, "Worktree path escape performs no git mutation");
}

async function verifyCommandFailureStopsLaterMutation(): Promise<void> {
  section("5. Command failure receipt");
  const { plan, approvalSignature } = approvedPlan();
  const { calls, executor } = recordingExecutor({ failAt: 1 });

  const receipt = await executeApprovedGitHubLocalWorkspaceAction({
    plan,
    approvalSignature,
    workspaceRoot: "D:/The Colony Test/colony-ts",
    worktreeRoot: "D:/The Colony Test/colony-ts/.colony/worktrees",
    executor,
  });

  assertEqual(receipt.ok, false, "Failed git command returns failed receipt");
  assertEqual(receipt.commands.length, 1, "Receipt stops after first failed mutation");
  assertEqual(calls.length, 1, "Executor does not receive second mutation after failure");
  assert(receipt.commands[0].stdout.includes("[REDACTED]"), "Receipt redacts command stdout secrets");
  assert(receipt.commands[0].stderr.includes("[REDACTED]"), "Receipt redacts command stderr secrets");
  assertEqual(receipt.boundaries.pushed, false, "Failure receipt still states no push occurred");
  assertEqual(receipt.boundaries.prCreated, false, "Failure receipt still states no PR was created");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 229 Verification (GitHub Local Workspace Execution)\n");
  await verifySuccessfulReceipt();
  await verifyMissingApprovalRejection();
  await verifyTamperedBranchRejection();
  await verifyPathEscapeRejection();
  await verifyCommandFailureStopsLaterMutation();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 229: GitHub local workspace execution is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
