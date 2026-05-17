/**
 * Phase 288 Verification Script - Trace To Skill Proposals
 *
 * Run: bun run src/verify-phase288.ts
 */

import { buildTraceToSkillProposal } from "./skills/trace-codification";

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

function verifyProposal(): void {
  const proposal = buildTraceToSkillProposal({
    skillName: "browser-login-review",
    transcriptRef: "session-123",
    attempts: [
      {
        attempt: 1,
        status: "failed",
        calls: [{ tool: "browser.goto", args: { url: "https://example.test" }, mutating: true }],
      },
      {
        attempt: 2,
        status: "succeeded",
        calls: [
          { tool: "browser.goto", args: { url: "https://example.test" }, mutating: true },
          { tool: "browser.snapshot", args: { ref: "page" }, mutating: false },
        ],
      },
    ],
  });

  assertEqual(proposal.status, "proposal", "Builder returns inert proposal");
  assertEqual(proposal.inert, true, "Proposal is inert");
  assertEqual(proposal.finalAttempt, 2, "Builder selects successful final attempt");
  assertEqual(proposal.calls.length, 2, "Proposal includes final attempt calls only");
  assert(proposal.markdown.includes("browser-login-review"), "Proposal includes skill name");
  assert(proposal.markdown.includes("Transcript reference: session-123"), "Proposal references exact transcript");
  assert(proposal.markdown.includes("Promotion status: not promoted"), "Proposal does not promote skill");
  assert(proposal.approvalClassification.includes("high-risk:mutating-trace"), "Mutating traces require stronger approval");
  assert(proposal.markdown.includes("attempt 1") === false, "Failed earlier attempt is excluded");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 288 Verification (Trace To Skill Proposals)\n");
  verifyProposal();
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 288: trace-to-skill proposals are GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
