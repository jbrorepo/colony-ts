/**
 * Phase 281 Verification Script - Method Caste Doc Display Frontier
 *
 * Ensures source-of-truth docs keep method caste names in public/operator
 * examples while preserving legacy values only as explicit compatibility
 * aliases.
 */

import { readFileSync } from "fs";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.log(`  FAIL ${message}`);
    failed += 1;
    return;
  }

  console.log(`  PASS ${message}`);
  passed += 1;
}

function assertIncludes(text: string, needle: string, message: string): void {
  assert(text.includes(needle), message);
}

function assertExcludes(text: string, needle: string, message: string): void {
  assert(!text.includes(needle), message);
}

function readDoc(path: string): string {
  return readFileSync(path, "utf8");
}

function verifyColonyBible(): void {
  console.log("\n============================================================");
  console.log("  1. Colony Bible method-caste display");
  console.log("============================================================");

  const bible = readDoc("docs/COLONY_BIBLE.md");
  const expectedRows = [
    "| Queen | 20 | Sovereign decisions need maximum context |",
    "| Vigil-ant | 14 | Security investigations need audit trail |",
    "| Assist-Ant | 12 | User-facing work needs good conversation memory |",
    "| Develop-ant | 12 | Builders need code context |",
    "| Logist-ant | 10 | Operators need recent infrastructure state |",
    "| Cogniz-ant | 10 | Memory and documentation work needs source context |",
    "| Inform-ant | 8 | Fetchers are stateless by nature |",
    "| Account-ant | 8 | Auditors track via external ledger |",
    "| Consult-ant | 8 | Reviewers and observers should stay lightweight |",
  ];

  for (const row of expectedRows) {
    assertIncludes(bible, row, `Bible retention row uses method label: ${row}`);
  }

  assertIncludes(bible, "Caste: Develop-ant", "Bible terminal example uses method caste label");

  for (const legacy of [
    "`ROOT_QUEEN`",
    "`SHIELD_GENERALS`",
    "`ASSIST_ANT`",
    "`FORGE_CARVERS`",
    "`CORE_SHAPERS`",
    "`LORE_BURROW`",
    "`LIAISON_ANTS`",
    "`LEDGER_ANTS`",
    "`WATCHER_SWARM`",
    "Caste: FORGE_CARVERS",
  ]) {
    assertExcludes(bible, legacy, `Bible omits legacy display value ${legacy}`);
  }
}

function verifyDecisionLog(): void {
  console.log("\n============================================================");
  console.log("  2. Decision log method-caste display");
  console.log("============================================================");

  const decisions = readDoc("docs/DECISIONS.md");
  assertIncludes(decisions, "Queen: 20 messages, Vigil-ant: 14, Assist-Ant: 12, Consult-ant: 8", "Decision D20 uses method caste labels");
  assertIncludes(decisions, "**Oper-ant sandboxing**", "Deferred sandbox decision uses method caste label");

  for (const legacy of [
    "ROOT_QUEEN",
    "SHIELD_GENERALS",
    "ASSIST_ANT",
    "WATCHER_SWARM",
    "NAMELESS_SWARM",
  ]) {
    assertExcludes(decisions, legacy, `Decision log omits legacy display value ${legacy}`);
  }
}

function verifyMethodFrameworkBible(): void {
  console.log("\n============================================================");
  console.log("  3. Method framework source alignment");
  console.log("============================================================");

  const framework = readDoc("docs/COLONY_METHOD_FRAMEWORK_BIBLE.md");
  assertIncludes(framework, "## 5. The 12-Caste Agent System", "Method framework declares 12-caste system");
  assertIncludes(framework, "### 5.4 Command-ant", "Method framework documents Command-ant");
  assertIncludes(framework, "-> Command-ant", "Standard workflow includes Command-ant routing");
  assertIncludes(framework, "| `root_queen` | Queen |", "Method framework keeps explicit compatibility alias table");
  assertIncludes(framework, "| `watcher_swarm` | Consult-ant |", "Method framework maps Watcher Swarm compatibility to Consult-ant");
  assertExcludes(framework, "If the full 11-caste system", "Method framework no longer advertises 11-caste implementation");
}

function main(): void {
  console.log("THE COLONY - Phase 281 Verification (Method Caste Doc Display Frontier)\n");
  verifyColonyBible();
  verifyDecisionLog();
  verifyMethodFrameworkBible();

  console.log("\n============================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 281: Method caste doc display frontier is GREEN.");
}

main();
