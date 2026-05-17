/**
 * Phase 47 Verification Script - Cost Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/cost` surface
 *   2. Slash parser `/help` uses the same truthful cost description
 *
 * Run: bun run src/verify-phase47.ts
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

function costHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/cost")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Cost Description");

  const description = COMMAND_HELP["/cost"] ?? "";
  assert(description.includes("summary"), "Command help mentions cost summary");
  assert(description.includes("model"), "Command help mentions model usage");
  assert(description.includes("budget"), "Command help mentions budget detail");
  assert(description.includes("perf"), "Command help mentions cost performance");
  assert(description.includes("drill-down"), "Command help mentions drill-down views");

  const rendered = costHelpLine(formatHelp());
  assert(rendered.includes("/cost"), "Rendered help includes /cost row");
  assert(rendered.includes("models"), "Rendered help includes models truth");
  assert(rendered.includes("budget"), "Rendered help includes budget truth");
  assert(rendered.includes("perf"), "Rendered help includes performance truth");
  assert(rendered.includes("drill-down"), "Rendered help includes drill-down truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Cost Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = costHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/cost"), "/help includes /cost row");
  assert(rendered.includes("models"), "/help includes models truth");
  assert(rendered.includes("budget"), "/help includes budget truth");
  assert(rendered.includes("perf"), "/help includes performance truth");
  assert(rendered.includes("drill-down"), "/help includes drill-down truth");
}

function main(): void {
  console.log("THE COLONY - Phase 47 Verification (Cost Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 47: Cost help truth is GREEN.");
}

main();
