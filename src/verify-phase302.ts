import { createGitHubPrPreflight, executeApprovedGitHubPrCreation, renderGitHubPrReceiptStatus } from "./github-pr-execution";
import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const preflight = createGitHubPrPreflight({
  issue: { owner: "acme", repo: "app", number: 42, title: "Token ghp_secret123456", labels: [], source: "provided" },
  branchName: "colony/issue-42-token",
  headSha: "abc123",
  baseBranch: "main",
  verification: [{ command: "bun test", code: 0, summary: "passed ghp_secret123456" }],
});
const receipt = await executeApprovedGitHubPrCreation({
  preflight,
  approval: { approved: true, approvedBy: "tester", signature: preflight.approvalSignature },
  executor: async () => ({ ok: true, remoteUrl: "https://github.com/acme/app/pull/8?token=ghp_secret123456", prNumber: 8 }),
});
const status = renderGitHubPrReceiptStatus(receipt);
assert(!status.includes("ghp_secret"), "GitHub status redacts secrets");
assert(status.includes("Credentials persisted: no"), "GitHub status says credentials not persisted");

const parser = new SlashCommandParser({ github: { receipts: [receipt] } });
assert(parser.tryHandle(`/github pr status ${receipt.receiptId}`).output.includes("GitHub PR Receipt:"), "/github pr status renders receipt");

console.log("Phase 302: GitHub redaction/status rendering is GREEN.");
