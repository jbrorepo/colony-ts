/**
 * Phase 42 Verification Script - Workspace Help Truth
 *
 * Covers a Phase 1 operator-truth slice:
 *   1. `formatHelp()` describes the full shipped `/workspace` surface
 *   2. Slash parser `/help` uses the same truthful workspace description
 *
 * Run: bun run src/verify-phase42.ts
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

function workspaceHelpLine(output: string): string {
  return output
    .split(/\r?\n/)
    .find((line) => line.includes("/workspace")) ?? "";
}

function verifyFormatHelpTruth(): void {
  section("1. formatHelp Workspace Description");

  const description = COMMAND_HELP["/workspace"] ?? "";
  assert(description.includes("packages"), "Command help mentions packages view");
  assert(description.includes("dev"), "Command help mentions dev view");
  assert(description.includes("verify"), "Command help mentions verify view");
  assert(description.includes("stack"), "Command help mentions stack hints");
  assert(description.includes("globs"), "Command help mentions workspace globs");

  const rendered = workspaceHelpLine(formatHelp());
  assert(rendered.includes("/workspace"), "Rendered help includes /workspace row");
  assert(rendered.includes("packages"), "Rendered help includes packages truth");
  assert(rendered.includes("dev"), "Rendered help includes dev truth");
  assert(rendered.includes("verify"), "Rendered help includes verify truth");
  assert(rendered.includes("stack"), "Rendered help includes stack truth");
  assert(rendered.includes("globs"), "Rendered help includes globs truth");
}

function verifySlashHelpTruth(): void {
  section("2. Slash Parser Help Workspace Description");

  const parser = new SlashCommandParser();
  const result = parser.tryHandle("/help");
  const rendered = workspaceHelpLine(result.output);

  assert(result.handled, "/help command resolves");
  assert(!result.isError, "/help command is not an error");
  assert(rendered.includes("/workspace"), "/help includes /workspace row");
  assert(rendered.includes("packages"), "/help includes packages truth");
  assert(rendered.includes("dev"), "/help includes dev truth");
  assert(rendered.includes("verify"), "/help includes verify truth");
  assert(rendered.includes("stack"), "/help includes stack truth");
  assert(rendered.includes("globs"), "/help includes globs truth");
}

function main(): void {
  console.log("THE COLONY - Phase 42 Verification (Workspace Help Truth)\n");

  verifyFormatHelpTruth();
  verifySlashHelpTruth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 42: Workspace help truth is GREEN.");
}

main();
