/**
 * Phase 44 Verification Script - Events Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/events` surface
 *   2. Slash parser `/help` uses the same truthful events description
 *
 * Run: bun run src/verify-phase44.ts
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

function eventsHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/events")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Events Description");

  const description = COMMAND_HELP["/events"] ?? "";
  assert(description.includes("recent"), "Command help mentions recent events");
  assert(description.includes("failures"), "Command help mentions event failures");
  assert(description.includes("tools"), "Command help mentions tool events");
  assert(description.includes("hooks"), "Command help mentions hook events");
  assert(description.includes("compactions"), "Command help mentions compaction events");
  assert(description.includes("failovers"), "Command help mentions failover events");
  assert(description.includes("perf"), "Command help mentions event performance view");

  const rendered = eventsHelpLine(formatHelp());
  assert(rendered.includes("/events"), "Rendered help includes /events row");
  assert(rendered.includes("failures"), "Rendered help includes failures truth");
  assert(rendered.includes("compactions"), "Rendered help includes compactions truth");
  assert(rendered.includes("failovers"), "Rendered help includes failovers truth");
  assert(rendered.includes("perf"), "Rendered help includes event perf truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Events Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = eventsHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/events"), "/help includes /events row");
  assert(rendered.includes("failures"), "/help includes failures truth");
  assert(rendered.includes("compactions"), "/help includes compactions truth");
  assert(rendered.includes("failovers"), "/help includes failovers truth");
  assert(rendered.includes("perf"), "/help includes event perf truth");
}

function main(): void {
  console.log("THE COLONY - Phase 44 Verification (Events Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 44: Events help truth is GREEN.");
}

main();
