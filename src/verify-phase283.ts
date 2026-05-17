/**
 * Phase 283 Verification Script - GStack-Inspired Capability Registry
 *
 * Covers the first comparison-derived implementation slice:
 *   1. Read-only registry of GStack-inspired Colony capability tracks
 *   2. `/capabilities` list/next/inspect operator surface
 *   3. Parser and help wiring
 *
 * Run: bun run src/verify-phase283.ts
 */

import {
  getGstackInspiredCapability,
  listGstackInspiredCapabilities,
} from "./gstack-inspired-capabilities";
import { COMMAND_HELP } from "./gateway-basic";
import { parseCommand, SlashCommandParser } from "./gateway";

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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function verifyRegistry(): void {
  section("1. Capability Registry");

  const capabilities = listGstackInspiredCapabilities();
  assertEqual(capabilities.length, 5, "Registry exposes five comparison-derived tracks");
  assertEqual(capabilities[0]?.id, "browser-sidecar", "Browser sidecar is the first priority");
  assertEqual(capabilities[1]?.id, "generated-skill-docs", "Generated skill docs track is present");
  assertEqual(capabilities[2]?.id, "workflow-recipes", "Workflow recipe track is present");
  assertEqual(capabilities[3]?.id, "trace-to-skill", "Trace-to-skill codification track is present");
  assertEqual(capabilities[4]?.id, "host-adapters", "Host adapter track is present");
  assert(capabilities.every((capability) => capability.rationale.length > 20), "Every track has concrete rationale");
  assert(capabilities.every((capability) => capability.colonyFit.length > 20), "Every track names Colony fit");
  assert(capabilities.every((capability) => capability.nextSlice.length > 20), "Every track names next implementation slice");
  assert(capabilities.every((capability) => capability.guardrails.length > 0), "Every track carries guardrails");
  assertEqual(getGstackInspiredCapability("BROWSER-SIDECAR")?.id, "browser-sidecar", "Lookup is case-insensitive");
  assertEqual(getGstackInspiredCapability("missing"), null, "Missing lookup returns null");
}

function verifyGatewayCommand(): void {
  section("2. /capabilities Operator Command");

  const parser = new SlashCommandParser();

  const parsed = parseCommand("/capabilities inspect browser-sidecar");
  assertEqual(parsed.type, "capabilities", "parseCommand recognizes /capabilities");
  assertEqual(parsed.args[0], "inspect", "parseCommand preserves subcommand");
  assertEqual(parseCommand("/capability next").type, "capabilities", "parseCommand supports /capability alias");

  const list = parser.tryHandle("/capabilities");
  assertEqual(list.handled, true, "/capabilities resolves");
  assert(list.output.includes("GStack-Inspired Colony Capabilities"), "/capabilities renders header");
  assert(list.output.includes("browser-sidecar"), "/capabilities lists browser sidecar");
  assert(list.output.includes("generated-skill-docs"), "/capabilities lists generated skill docs");
  assertEqual(list.data.action, "capabilities_list", "/capabilities data action is list");

  const next = parser.tryHandle("/capabilities next");
  assert(next.output.includes("Next Capability Slice"), "/capabilities next renders next slice header");
  assert(next.output.includes("browser-sidecar"), "/capabilities next selects first non-shipped track");
  assertEqual(next.data.action, "capabilities_next", "/capabilities next data action is next");

  const inspect = parser.tryHandle("/capabilities inspect browser-sidecar");
  assert(inspect.output.includes("Capability: browser-sidecar"), "/capabilities inspect renders selected track");
  assert(inspect.output.includes("Guardrails:"), "/capabilities inspect renders guardrails");
  assert(inspect.output.includes("Next slice:"), "/capabilities inspect renders next slice");
  assertEqual(inspect.data.id, "browser-sidecar", "/capabilities inspect returns selected id");

  const missing = parser.tryHandle("/capabilities inspect missing");
  assertEqual(missing.isError, true, "/capabilities inspect missing fails closed");
  assert(missing.output.includes("Capability not found"), "/capabilities inspect missing explains failure");
}

function verifyHelpWiring(): void {
  section("3. Help Wiring");

  assert(typeof COMMAND_HELP["/capabilities"] === "string", "Help includes /capabilities");
  assert(COMMAND_HELP["/capabilities"].includes("GStack-inspired"), "Help describes comparison-derived purpose");

  const help = new SlashCommandParser().tryHandle("/help");
  assert(help.output.includes("/capabilities"), "/help renders /capabilities command");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 283 Verification (GStack-Inspired Capability Registry)\n");

  verifyRegistry();
  verifyGatewayCommand();
  verifyHelpWiring();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 283: GStack-inspired capability registry is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
