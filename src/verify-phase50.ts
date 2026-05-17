/**
 * Phase 50 Verification Script - Status Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/status` surface
 *   2. Slash parser `/help` uses the same truthful status description
 *
 * Run: bun run src/verify-phase50.ts
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

function statusHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/status")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Status Description");

  const description = COMMAND_HELP["/status"] ?? "";
  assert(description.includes("session"), "Command help mentions session status");
  assert(description.includes("runtime"), "Command help mentions runtime status");
  assert(description.includes("saved"), "Command help mentions saved-session status");
  assert(description.includes("workspace"), "Command help mentions workspace status");
  assert(description.includes("tools"), "Command help mentions tool status");
  assert(description.includes("workflow"), "Command help mentions workflow status");
  assert(description.includes("operator"), "Command help mentions operator next-actions");
  assert(description.includes("drill-down"), "Command help mentions drill-down views");

  const rendered = statusHelpLine(formatHelp());
  assert(rendered.includes("/status"), "Rendered help includes /status row");
  assert(rendered.includes("saved"), "Rendered help includes saved-session truth");
  assert(rendered.includes("workspace"), "Rendered help includes workspace truth");
  assert(rendered.includes("workflow"), "Rendered help includes workflow truth");
  assert(rendered.includes("drill-down"), "Rendered help includes drill-down truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Status Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = statusHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/status"), "/help includes /status row");
  assert(rendered.includes("saved"), "/help includes saved-session truth");
  assert(rendered.includes("workspace"), "/help includes workspace truth");
  assert(rendered.includes("workflow"), "/help includes workflow truth");
  assert(rendered.includes("drill-down"), "/help includes drill-down truth");
}

function main(): void {
  console.log("THE COLONY - Phase 50 Verification (Status Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 50: Status help truth is GREEN.");
}

main();
