/**
 * Phase 41 Verification Script - Doctor Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/doctor` surface
 *   2. Slash parser `/help` uses the same truthful doctor description
 *
 * Run: bun run src/verify-phase41.ts
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

function doctorHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/doctor")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Doctor Description");

  const description = COMMAND_HELP["/doctor"] ?? "";
  assert(description.includes("diagnostics"), "Command help mentions diagnostics");
  assert(description.includes("first-run"), "Command help mentions first-run checklist");
  assert(description.includes("workspace"), "Command help mentions workspace view");
  assert(description.includes("providers"), "Command help mentions providers view");
  assert(description.includes("failovers"), "Command help mentions failovers view");

  const rendered = doctorHelpLine(formatHelp());
  assert(rendered.includes("/doctor"), "Rendered help includes /doctor row");
  assert(rendered.includes("first-run"), "Rendered help includes first-run truth");
  assert(rendered.includes("workspace"), "Rendered help includes workspace truth");
  assert(rendered.includes("providers"), "Rendered help includes providers truth");
  assert(rendered.includes("failovers"), "Rendered help includes failovers truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Doctor Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = doctorHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/doctor"), "/help includes /doctor row");
  assert(rendered.includes("first-run"), "/help includes first-run truth");
  assert(rendered.includes("workspace"), "/help includes workspace truth");
  assert(rendered.includes("providers"), "/help includes providers truth");
  assert(rendered.includes("failovers"), "/help includes failovers truth");
}

function main(): void {
  console.log("THE COLONY - Phase 41 Verification (Doctor Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 41: Doctor help truth is GREEN.");
}

main();
