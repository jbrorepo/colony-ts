/**
 * Phase 43 Verification Script - Hooks Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/hooks` surface
 *   2. Slash parser `/help` uses the same truthful hooks description
 *
 * Run: bun run src/verify-phase43.ts
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

function hooksHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/hooks")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Hooks Description");

  const description = COMMAND_HELP["/hooks"] ?? "";
  assert(description.includes("registered"), "Command help mentions registered hooks");
  assert(description.includes("recent"), "Command help mentions recent hook events");
  assert(description.includes("perf"), "Command help mentions hook performance view");
  assert(description.includes("kinds"), "Command help mentions supported hook kinds");

  const rendered = hooksHelpLine(formatHelp());
  assert(rendered.includes("/hooks"), "Rendered help includes /hooks row");
  assert(rendered.includes("recent"), "Rendered help includes recent hook truth");
  assert(rendered.includes("perf"), "Rendered help includes hook perf truth");
  assert(rendered.includes("kinds"), "Rendered help includes hook kinds truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Hooks Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = hooksHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/hooks"), "/help includes /hooks row");
  assert(rendered.includes("recent"), "/help includes recent hook truth");
  assert(rendered.includes("perf"), "/help includes hook perf truth");
  assert(rendered.includes("kinds"), "/help includes hook kinds truth");
}

function main(): void {
  console.log("THE COLONY - Phase 43 Verification (Hooks Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 43: Hooks help truth is GREEN.");
}

main();
