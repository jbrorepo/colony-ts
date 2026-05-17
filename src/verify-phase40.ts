/**
 * Phase 40 Verification Script - Skills Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/skills` surface
 *   2. Slash parser `/help` uses the same truthful skills description
 *
 * Run: bun run src/verify-phase40.ts
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

function skillsHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/skills")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Skills Description");

  const description = COMMAND_HELP["/skills"] ?? "";
  assert(description.includes("search"), "Command help mentions skill search");
  assert(description.includes("inspect"), "Command help mentions skill inspect");
  assert(description.includes("audit"), "Command help mentions skill audit");
  assert(description.includes("plan"), "Command help mentions safe skill planning");
  assert(description.includes("staged"), "Command help mentions staged skill workflow");
  assert(description.includes("approval"), "Command help mentions approval metadata");
  assert(description.includes("source drift"), "Command help mentions source drift");
  assert(description.includes("safe imports"), "Command help mentions safe imports");
  assert(description.includes("promotion rollback"), "Command help mentions promotion rollback views");

  const rendered = skillsHelpLine(formatHelp());
  assert(rendered.includes("/skills"), "Rendered help includes /skills row");
  assert(rendered.includes("inspect"), "Rendered help includes skill inspect truth");
  assert(rendered.includes("audit"), "Rendered help includes skill audit truth");
  assert(rendered.includes("plan"), "Rendered help includes safe planning truth");
  assert(rendered.includes("staged"), "Rendered help includes staged workflow truth");
  assert(rendered.includes("approval"), "Rendered help includes skill approval truth");
  assert(rendered.includes("source drift"), "Rendered help includes source drift truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Skills Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = skillsHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/skills"), "/help includes /skills row");
  assert(rendered.includes("inspect"), "/help includes skill inspect truth");
  assert(rendered.includes("audit"), "/help includes skill audit truth");
  assert(rendered.includes("plan"), "/help includes safe planning truth");
  assert(rendered.includes("staged"), "/help includes staged workflow truth");
  assert(rendered.includes("approval"), "/help includes skill approval truth");
  assert(rendered.includes("source drift"), "/help includes source drift truth");
}

function main(): void {
  console.log("THE COLONY - Phase 40 Verification (Skills Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 40: Skills help truth is GREEN.");
}

main();
