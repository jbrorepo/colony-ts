/**
 * Phase 48 Verification Script - Budget Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/budget` surface
 *   2. Slash parser `/help` uses the same truthful budget description
 *
 * Run: bun run src/verify-phase48.ts
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

function budgetHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/budget")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Budget Description");

  const description = COMMAND_HELP["/budget"] ?? "";
  assert(description.includes("current"), "Command help mentions current budget state");
  assert(description.includes("cost"), "Command help mentions cost cap");
  assert(description.includes("token"), "Command help mentions token cap");
  assert(description.includes("inspect"), "Command help mentions inspect paths");
  assert(description.includes("set"), "Command help mentions set syntax");

  const rendered = budgetHelpLine(formatHelp());
  assert(rendered.includes("/budget"), "Rendered help includes /budget row");
  assert(rendered.includes("current"), "Rendered help includes current-state truth");
  assert(rendered.includes("token"), "Rendered help includes token-cap truth");
  assert(rendered.includes("inspect"), "Rendered help includes inspect truth");
  assert(rendered.includes("set"), "Rendered help includes set truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Budget Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = budgetHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/budget"), "/help includes /budget row");
  assert(rendered.includes("current"), "/help includes current-state truth");
  assert(rendered.includes("token"), "/help includes token-cap truth");
  assert(rendered.includes("inspect"), "/help includes inspect truth");
  assert(rendered.includes("set"), "/help includes set truth");
}

function main(): void {
  console.log("THE COLONY - Phase 48 Verification (Budget Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 48: Budget help truth is GREEN.");
}

main();
