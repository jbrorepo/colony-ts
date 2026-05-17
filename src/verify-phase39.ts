/**
 * Phase 39 Verification Script - Provider Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/provider` surface
 *   2. Slash parser `/help` uses the same truthful provider description
 *
 * Run: bun run src/verify-phase39.ts
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

function providerHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/provider")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Provider Description");

  const description = COMMAND_HELP["/provider"] ?? "";
  assert(description.includes("switch"), "Command help mentions provider switching");
  assert(description.includes("health"), "Command help mentions provider health");
  assert(description.includes("failovers"), "Command help mentions provider failovers");
  assert(description.includes("performance"), "Command help mentions provider performance");
  assert(description.includes("current"), "Command help mentions current/focused provider view");

  const rendered = providerHelpLine(formatHelp());
  assert(rendered.includes("/provider"), "Rendered help includes /provider row");
  assert(rendered.includes("performance"), "Rendered help includes provider performance truth");
  assert(rendered.includes("current"), "Rendered help includes current-provider truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Provider Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = providerHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/provider"), "/help includes /provider row");
  assert(rendered.includes("performance"), "/help includes provider performance truth");
  assert(rendered.includes("current"), "/help includes current-provider truth");
}

function main(): void {
  console.log("THE COLONY - Phase 39 Verification (Provider Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 39: Provider help truth is GREEN.");
}

main();
