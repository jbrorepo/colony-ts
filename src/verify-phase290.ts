/**
 * Phase 290 Verification Script - MCP Plugin Activation Preflight
 *
 * Run: bun run src/verify-phase290.ts
 */

import { buildLocalPluginActivationPreflight } from "./mcp/plugin-local-activation-preflight";

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
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function verifyPreflight(): void {
  const blocked = buildLocalPluginActivationPreflight({
    packageId: "browser-sidecar",
    sidecarId: "browser-sidecar",
    approved: false,
  });
  assertEqual(blocked.state, "blocked", "Preflight blocks without approval");
  assertEqual(blocked.defaultExecution, false, "Preflight has no default execution");
  assertEqual(blocked.registryFetch, false, "Preflight performs no registry fetch");
  assertEqual(blocked.packageCodeExecution, false, "Preflight performs no package code execution");
  assertEqual(blocked.credentialPersistence, false, "Preflight performs no credential persistence");

  const ready = buildLocalPluginActivationPreflight({
    packageId: "browser-sidecar",
    sidecarId: "browser-sidecar",
    approved: true,
    approvalSignature: "approve:browser-sidecar",
  });
  assertEqual(ready.state, "ready_for_host_activation", "Approved preflight becomes host-activation ready");
  assert(ready.operatorSummary.includes("host-owned activation"), "Preflight names host-owned activation");
  assert(ready.operatorSummary.includes("no default execution"), "Preflight states no default execution");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 290 Verification (MCP Plugin Activation Preflight)\n");
  verifyPreflight();
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 290: MCP plugin activation preflight is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
