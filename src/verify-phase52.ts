/**
 * Phase 52 Verification Script - Compact Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/compact` surface
 *   2. Slash parser `/help` uses the same truthful compact description
 *
 * Run: bun run src/verify-phase52.ts
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

function compactHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/compact")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Compact Description");

  const description = COMMAND_HELP["/compact"] ?? "";
  assert(description.includes("standard"), "Command help mentions standard compaction");
  assert(description.includes("micro"), "Command help mentions micro compaction");
  assert(description.includes("reactive"), "Command help mentions reactive compaction");
  assert(description.includes("session_memory"), "Command help mentions session_memory compaction");
  assert(description.includes("cached_micro"), "Command help mentions cached_micro compaction");
  assert(description.includes("context_collapse"), "Command help mentions context_collapse compaction");
  assert(description.includes("smart"), "Command help mentions smart compaction selection");
  assert(description.includes("status"), "Command help mentions status view");
  assert(description.includes("recent"), "Command help mentions recent view");
  assert(description.includes("handoff"), "Command help mentions handoff view");
  assert(description.includes("pressure"), "Command help mentions pressure visibility");
  assert(description.includes("failure"), "Command help mentions failure visibility");

  const rendered = compactHelpLine(formatHelp());
  assert(rendered.includes("/compact"), "Rendered help includes /compact row");
  assert(rendered.includes("standard"), "Rendered help includes standard strategy truth");
  assert(rendered.includes("session_memory"), "Rendered help includes session_memory truth");
  assert(rendered.includes("cached_micro"), "Rendered help includes cached_micro truth");
  assert(rendered.includes("context_collapse"), "Rendered help includes context_collapse truth");
  assert(rendered.includes("smart"), "Rendered help includes smart selection truth");
  assert(rendered.includes("status"), "Rendered help includes status view truth");
  assert(rendered.includes("handoff"), "Rendered help includes handoff view truth");
  assert(rendered.includes("pressure"), "Rendered help includes pressure truth");
  assert(rendered.includes("failure"), "Rendered help includes failure truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Compact Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = compactHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/compact"), "/help includes /compact row");
  assert(rendered.includes("standard"), "/help includes standard strategy truth");
  assert(rendered.includes("session_memory"), "/help includes session_memory truth");
  assert(rendered.includes("cached_micro"), "/help includes cached_micro truth");
  assert(rendered.includes("context_collapse"), "/help includes context_collapse truth");
  assert(rendered.includes("smart"), "/help includes smart selection truth");
  assert(rendered.includes("status"), "/help includes status view truth");
  assert(rendered.includes("handoff"), "/help includes handoff view truth");
  assert(rendered.includes("pressure"), "/help includes pressure truth");
  assert(rendered.includes("failure"), "/help includes failure truth");
}

function main(): void {
  console.log("THE COLONY - Phase 52 Verification (Compact Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 52: Compact help truth is GREEN.");
}

main();
