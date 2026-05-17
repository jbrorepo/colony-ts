/**
 * Phase 37 Verification Script - Channel Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/channels` surface
 *   2. Slash parser `/help` uses the same truthful channel description
 *
 * Run: bun run src/verify-phase37.ts
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

function channelHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/channels")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Channel Description");

  const description = COMMAND_HELP["/channels"] ?? "";
  assert(description.includes("adapters"), "Command help still mentions channel adapters");
  assert(description.includes("deliveries"), "Command help mentions deliveries view");
  assert(description.includes("auth"), "Command help mentions auth view");
  assert(description.includes("sessions"), "Command help mentions sessions view");
  assert(description.includes("contract-only"), "Command help mentions contract-only channel fixtures");
  assert(description.includes("external"), "Command help mentions external vendor helper state");

  const rendered = channelHelpLine(formatHelp());
  assert(rendered.includes("/channels"), "Rendered help includes /channels row");
  assert(rendered.includes("auth"), "Rendered help includes channel auth truth");
  assert(rendered.includes("sessions"), "Rendered help includes channel sessions truth");
  assert(rendered.includes("contract-only"), "Rendered help includes channel contract truth");
  assert(rendered.includes("external"), "Rendered help includes external vendor helper truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Channel Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = channelHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/channels"), "/help includes /channels row");
  assert(rendered.includes("auth"), "/help includes channel auth truth");
  assert(rendered.includes("sessions"), "/help includes channel sessions truth");
  assert(rendered.includes("contract-only"), "/help includes channel contract truth");
  assert(rendered.includes("external"), "/help includes external vendor helper truth");
}

function main(): void {
  console.log("THE COLONY - Phase 37 Verification (Channel Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 37: Channel help truth is GREEN.");
}

main();
