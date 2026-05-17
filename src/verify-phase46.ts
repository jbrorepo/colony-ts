/**
 * Phase 46 Verification Script - Tools Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/tools` surface
 *   2. Slash parser `/help` uses the same truthful tools description
 *
 * Run: bun run src/verify-phase46.ts
 */

import {
  COMMAND_HELP,
  formatHelp,
} from "./gateway-basic";
import { SlashCommandParser } from "./gateway";

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

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function toolsHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/tools")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Tools Description");

  const description = COMMAND_HELP["/tools"] ?? "";
  assert(description.includes("active"), "Command help mentions active tools");
  assert(description.includes("approvals"), "Command help mentions approvals view");
  assert(description.includes("recent"), "Command help mentions recent activity");
  assert(description.includes("artifacts"), "Command help mentions saved artifacts");
  assert(description.includes("perf"), "Command help mentions tool performance");
  assert(description.includes("policy"), "Command help mentions policy linkage");
  assert(description.includes("exact"), "Command help mentions exact-call rules");

  const rendered = toolsHelpLine(formatHelp());
  assert(rendered.includes("/tools"), "Rendered help includes /tools row");
  assert(rendered.includes("approvals"), "Rendered help includes approvals truth");
  assert(rendered.includes("artifacts"), "Rendered help includes artifacts truth");
  assert(rendered.includes("perf"), "Rendered help includes performance truth");
  assert(rendered.includes("exact"), "Rendered help includes exact-call truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Tools Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = toolsHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/tools"), "/help includes /tools row");
  assert(rendered.includes("approvals"), "/help includes approvals truth");
  assert(rendered.includes("artifacts"), "/help includes artifacts truth");
  assert(rendered.includes("perf"), "/help includes performance truth");
  assert(rendered.includes("exact"), "/help includes exact-call truth");
}

function main(): void {
  console.log("THE COLONY - Phase 46 Verification (Tools Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 46: Tools help truth is GREEN.");
}

main();
