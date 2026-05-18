import { createGitHubPrPreflight, executeApprovedGitHubPrCreation } from "./github-pr-execution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const preflight = createGitHubPrPreflight({
  issue: { owner: "acme", repo: "app", number: 42, title: "Fix bug", labels: [], source: "provided" },
  branchName: "colony/issue-42-fix-bug",
  headSha: "abc123",
  baseBranch: "main",
  verification: [{ command: "bun test", code: 0, summary: "passed" }],
});
const receipt = await executeApprovedGitHubPrCreation({
  preflight,
  approval: { approved: true, approvedBy: "tester", signature: preflight.approvalSignature },
  executor: async () => ({ ok: true, remoteUrl: "https://github.com/acme/app/pull/7", prNumber: 7 }),
});
assert(receipt.ok, "approved PR execution succeeds");
assert(receipt.branchPushed === true, "receipt records branch push");
assert(receipt.prCreated === true, "receipt records PR creation");
assert(receipt.remoteUrl === "https://github.com/acme/app/pull/7", "receipt records remote URL");

console.log("Phase 300: approved GitHub PR execution receipt is GREEN.");
