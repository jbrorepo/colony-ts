/**
 * Phase 49 Verification Script - Model Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/model` surface
 *   2. Slash parser `/help` uses the same truthful model description
 *
 * Run: bun run src/verify-phase49.ts
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

function modelHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/model")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Model Description");

  const description = COMMAND_HELP["/model"] ?? "";
  assert(description.includes("selected"), "Command help mentions selected model state");
  assert(description.includes("provider"), "Command help mentions provider selection");
  assert(description.includes("model"), "Command help mentions model selection");
  assert(description.includes("current"), "Command help mentions current-provider model setting");
  assert(description.includes("next-run"), "Command help mentions next-run primary selection");

  const rendered = modelHelpLine(formatHelp());
  assert(rendered.includes("/model"), "Rendered help includes /model row");
  assert(rendered.includes("selected"), "Rendered help includes selected-state truth");
  assert(rendered.includes("current"), "Rendered help includes current-provider truth");
  assert(rendered.includes("next-run"), "Rendered help includes next-run truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Model Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = modelHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/model"), "/help includes /model row");
  assert(rendered.includes("selected"), "/help includes selected-state truth");
  assert(rendered.includes("current"), "/help includes current-provider truth");
  assert(rendered.includes("next-run"), "/help includes next-run truth");
}

function main(): void {
  console.log("THE COLONY - Phase 49 Verification (Model Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 49: Model help truth is GREEN.");
}

main();
