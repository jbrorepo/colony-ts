/**
 * Phase 51 Verification Script - Artifact Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/artifact` surface
 *   2. Slash parser `/help` uses the same truthful artifact description
 *
 * Run: bun run src/verify-phase51.ts
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

function artifactHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/artifact")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Artifact Description");

  const description = COMMAND_HELP["/artifact"] ?? "";
  assert(description.includes("persisted"), "Command help mentions persisted artifacts");
  assert(description.includes("large"), "Command help mentions large tool output");
  assert(description.includes("tool"), "Command help mentions tool output");
  assert(description.includes("list"), "Command help mentions artifact catalog listing");
  assert(description.includes("reopen"), "Command help mentions exact artifact reopen");
  assert(description.includes("latest"), "Command help mentions latest artifact shortcut");
  assert(description.includes("storage"), "Command help mentions Colony storage boundary");

  const rendered = artifactHelpLine(formatHelp());
  assert(rendered.includes("/artifact"), "Rendered help includes /artifact row");
  assert(rendered.includes("list"), "Rendered help includes catalog truth");
  assert(rendered.includes("reopen"), "Rendered help includes exact reopen truth");
  assert(rendered.includes("latest"), "Rendered help includes latest shortcut truth");
  assert(rendered.includes("storage"), "Rendered help includes storage-boundary truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Artifact Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = artifactHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/artifact"), "/help includes /artifact row");
  assert(rendered.includes("list"), "/help includes catalog truth");
  assert(rendered.includes("reopen"), "/help includes exact reopen truth");
  assert(rendered.includes("latest"), "/help includes latest shortcut truth");
  assert(rendered.includes("storage"), "/help includes storage-boundary truth");
}

function main(): void {
  console.log("THE COLONY - Phase 51 Verification (Artifact Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 51: Artifact help truth is GREEN.");
}

main();
