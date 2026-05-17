/**
 * Phase 280 Verification Script - Operator Caste Display Compatibility
 *
 * Confirms public/operator display prefers the 12-caste method names while
 * legacy persisted caste strings remain accepted as inputs.
 *
 * Run: bun run src/verify-phase280.ts
 */

import {
  formatCaste,
  formatPermissions,
  formatStatus,
  renderCasteView,
} from "./gateway-basic";
import { formatCasteDisplay } from "./ui/components";
import { Caste, MethodCaste, casteDisplayName } from "./caste/enums";

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

function assertNoLegacyDisplay(output: string, label: string): void {
  const legacyDisplayTerms = [
    "Root Queen",
    "Eldest Architect",
    "Shield General",
    "Shield Generals",
    "Watcher Swarm",
    "Forge Carver",
    "Forge Carvers",
    "Core Shaper",
    "Core Shapers",
    "Liaison Ant",
    "Liaison Ants",
    "Ledger Ant",
    "Ledger Ants",
    "Lore Burrow",
    "Nameless Swarm",
  ];
  for (const term of legacyDisplayTerms) {
    assert(!output.includes(term), `${label} omits legacy display term ${term}`);
  }
}

function verifyUiDisplayLabels(): void {
  section("1. UI caste display labels");

  assertEqual(formatCasteDisplay(Caste.ROOT_QUEEN), "Queen", "Root Queen alias displays Queen");
  assertEqual(formatCasteDisplay("Forge Carvers"), "Develop-ant", "Forge Carvers display Develop-ant");
  assertEqual(formatCasteDisplay("watcher_swarm"), "Consult-ant", "Watcher Swarm displays Consult-ant");
  assertEqual(formatCasteDisplay(MethodCaste.COMMAND_ANT), "Command-ant", "Command-ant display is canonical");
  assertEqual(formatCasteDisplay("unknown custom"), "Unknown Custom", "Unknown caste keeps title-case fallback");
}

function verifyGatewayCasteView(): void {
  section("2. Gateway caste view");

  const view = renderCasteView(Caste.FORGE_CARVERS);
  assert(view.includes("Current Caste: Develop-ant"), "Caste view prefers method label for legacy input");
  assert(view.includes("Compatibility alias: forge_carvers"), "Caste view includes machine alias metadata");
  assert(view.includes("code creation and software engineering"), "Caste view keeps behavior description");
  assertNoLegacyDisplay(view, "Caste view");

  const consultView = renderCasteView("Watcher Swarm");
  assert(consultView.includes("Current Caste: Consult-ant"), "Watcher Swarm maps to Consult-ant in caste view");
  assert(consultView.includes("Compatibility alias: watcher_swarm"), "Watcher Swarm view keeps compatibility alias");
  assertNoLegacyDisplay(consultView, "Watcher Swarm caste view");
}

function verifyGatewayStatusAndPermissions(): void {
  section("3. Gateway status and permissions display");

  const status = formatStatus({
    sessionId: "ses_method_display",
    agentId: "agent_method_display",
    caste: Caste.SHIELD_GENERALS,
    messageCount: 2,
    iterations: 1,
    tokensUsed: 128,
    costUsd: 0.01,
    state: "active",
  });
  assert(status.includes("Vigil-ant"), "Status displays method caste");
  assert(!status.includes("shield_generals"), "Status omits raw legacy caste");

  const permissions = formatPermissions(Caste.WATCHER_SWARM, ["file_read"], ["file_read"], ["shell_exec"], []);
  assert(permissions.includes("Tool Permissions (Consult-ant)"), "Permissions displays method caste");
  assert(!permissions.includes("watcher_swarm"), "Permissions omits raw legacy caste");

  const explicit = formatCaste(Caste.ROOT_QUEEN);
  assert(explicit.includes("Current Caste: Queen"), "formatCaste displays method label");
  assert(explicit.includes("The Queen caste"), "formatCaste default description uses method label");
  assertNoLegacyDisplay(explicit, "formatCaste");
}

function verifyCompatibilityMetadata(): void {
  section("4. Compatibility metadata remains available");

  assertEqual(casteDisplayName(Caste.LEDGER_ANTS), "Account-ant", "Ledger alias resolves to Account-ant display");
  assertEqual(casteDisplayName("lore burrow"), "Cogniz-ant", "Lore Burrow resolves to Cogniz-ant display");
  assertEqual(casteDisplayName(MethodCaste.OPER_ANT), "Oper-ant", "Oper-ant display is canonical");
}

function main(): void {
  console.log("THE COLONY - Phase 280 Verification (Operator Caste Display Compatibility)\n");

  verifyUiDisplayLabels();
  verifyGatewayCasteView();
  verifyGatewayStatusAndPermissions();
  verifyCompatibilityMetadata();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 280: Operator caste display compatibility is GREEN.");
}

main();
