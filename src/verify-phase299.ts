import { createGitHubPrPreflight } from "./github-pr-execution";

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
assert(preflight.ok, "preflight succeeds for verified input");
assert(preflight.approvalsRequired.includes("push"), "preflight requires push approval");
assert(preflight.approvalsRequired.includes("create_pr"), "preflight requires PR approval");
assert(preflight.boundaries.credentialsPersisted === false, "preflight persists no credentials");

console.log("Phase 299: GitHub push/PR preflight is GREEN.");
