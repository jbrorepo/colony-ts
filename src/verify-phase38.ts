/**
 * Phase 38 Verification Script - Permissions Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/permissions` surface
 *   2. Slash parser `/help` uses the same truthful permissions description
 *
 * Run: bun run src/verify-phase38.ts
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

function permissionsHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/permissions")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Permissions Description");

  const description = COMMAND_HELP["/permissions"] ?? "";
  assert(description.includes("active"), "Command help mentions active schemas");
  assert(description.includes("allowed"), "Command help mentions allowed tools");
  assert(description.includes("denied"), "Command help mentions denied tools");
  assert(description.includes("session rules"), "Command help mentions session rules");

  const rendered = permissionsHelpLine(formatHelp());
  assert(rendered.includes("/permissions"), "Rendered help includes /permissions row");
  assert(rendered.includes("active"), "Rendered help includes active schema truth");
  assert(rendered.includes("session rules"), "Rendered help includes session-rule truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Permissions Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = permissionsHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/permissions"), "/help includes /permissions row");
  assert(rendered.includes("active"), "/help includes active schema truth");
  assert(rendered.includes("session rules"), "/help includes session-rule truth");
}

function main(): void {
  console.log("THE COLONY - Phase 38 Verification (Permissions Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 38: Permissions help truth is GREEN.");
}

main();
