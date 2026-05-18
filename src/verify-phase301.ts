import { createGitHubPrPreflight } from "./github-pr-execution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const preflight = createGitHubPrPreflight({
  issue: { owner: "acme", repo: "app", number: 42, title: "Fix bug", labels: [], source: "provided" },
  branchName: "colony/issue-42-fix-bug",
  headSha: "abc123",
  baseBranch: "main",
  verification: [{ command: "bun test", code: 1, summary: "failed" }],
});
assert(!preflight.ok, "failed verification blocks PR preflight");
assert(preflight.reason?.includes("verification failed"), "failure explains verification block");

console.log("Phase 301: failed verification blocks PR creation is GREEN.");
