/**
 * Phase 45 Verification Script - Performance Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/perf` surface
 *   2. Slash parser `/help` uses the same truthful performance description
 *
 * Run: bun run src/verify-phase45.ts
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

function perfHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/perf")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Performance Description");

  const description = COMMAND_HELP["/perf"] ?? "";
  assert(description.includes("runtime"), "Command help mentions runtime performance");
  assert(description.includes("models"), "Command help mentions model performance");
  assert(description.includes("providers"), "Command help mentions provider performance");
  assert(description.includes("tools"), "Command help mentions tool performance");
  assert(description.includes("hooks"), "Command help mentions hook performance");
  assert(description.includes("compactions"), "Command help mentions compaction performance");

  const rendered = perfHelpLine(formatHelp());
  assert(rendered.includes("/perf"), "Rendered help includes /perf row");
  assert(rendered.includes("runtime"), "Rendered help includes runtime truth");
  assert(rendered.includes("models"), "Rendered help includes models truth");
  assert(rendered.includes("providers"), "Rendered help includes providers truth");
  assert(rendered.includes("compactions"), "Rendered help includes compactions truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Performance Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = perfHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/perf"), "/help includes /perf row");
  assert(rendered.includes("runtime"), "/help includes runtime truth");
  assert(rendered.includes("models"), "/help includes models truth");
  assert(rendered.includes("providers"), "/help includes providers truth");
  assert(rendered.includes("compactions"), "/help includes compactions truth");
}

function main(): void {
  console.log("THE COLONY - Phase 45 Verification (Performance Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 45: Performance help truth is GREEN.");
}

main();
