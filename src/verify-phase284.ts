/**
 * Phase 284 Verification Script - Browser Sidecar Boundary
 *
 * Covers the second GStack-inspired implementation slice:
 *   1. Descriptor-only browser sidecar contracts
 *   2. `/browser` read-only operator view
 *   3. Parser and help wiring
 *
 * Run: bun run src/verify-phase284.ts
 */

import {
  createDefaultBrowserSidecarDescriptor,
  listBrowserSidecarCommandScopes,
} from "./browser/browser-sidecar-contracts";
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

function verifyDescriptor(): void {
  section("1. Browser Sidecar Descriptor");

  const descriptor = createDefaultBrowserSidecarDescriptor();
  assertEqual(descriptor.sidecarId, "browser-sidecar", "Descriptor has stable sidecar id");
  assertEqual(descriptor.status, "planned", "Default descriptor is planned only");
  assertEqual(descriptor.localOnly, true, "Descriptor is local-only");
  assertEqual(descriptor.startsListenerByDefault, false, "Descriptor does not start a listener by default");
  assertEqual(descriptor.startsBrowserByDefault, false, "Descriptor does not start Chromium by default");
  assertEqual(descriptor.persistsCredentials, false, "Descriptor forbids credential persistence");
  assertEqual(descriptor.enablesTunnelByDefault, false, "Descriptor forbids default tunnel exposure");
  assert(descriptor.invariants.includes("page_content_is_untrusted"), "Descriptor marks page content as untrusted");
  assert(descriptor.invariants.includes("approval_required_for_tunnel"), "Descriptor requires approval for tunnel");
  assert(descriptor.surfaces.some((surface) => surface.id === "refs"), "Descriptor includes ref surface");
  assert(descriptor.surfaces.some((surface) => surface.id === "screenshots"), "Descriptor includes screenshot surface");
  assert(descriptor.surfaces.some((surface) => surface.id === "logs"), "Descriptor includes log surface");

  const scopes = listBrowserSidecarCommandScopes();
  assertEqual(scopes.length, 4, "Command scopes are bounded");
  assert(scopes.some((scope) => scope.id === "read"), "Read scope exists");
  assert(scopes.some((scope) => scope.id === "write"), "Write scope exists");
  assert(scopes.some((scope) => scope.requiresApproval), "At least one scope requires approval");
}

function verifyGatewayCommand(): void {
  section("2. /browser Operator Command");

  const parser = new SlashCommandParser();
  const parsed = parseCommand("/browser status");
  assertEqual(parsed.type, "browser", "parseCommand recognizes /browser");
  assertEqual(parsed.args[0], "status", "parseCommand preserves browser subcommand");

  const status = parser.tryHandle("/browser");
  assertEqual(status.handled, true, "/browser resolves");
  assert(status.output.includes("Browser Sidecar Boundary"), "/browser renders boundary header");
  assert(status.output.includes("Status: planned"), "/browser shows planned status");
  assert(status.output.includes("Starts listener by default: no"), "/browser states no default listener");
  assert(status.output.includes("Persists credentials: no"), "/browser states no credential persistence");
  assertEqual(status.data.action, "browser_status", "/browser data action is status");

  const scopes = parser.tryHandle("/browser scopes");
  assert(scopes.output.includes("Browser Sidecar Command Scopes"), "/browser scopes renders scopes header");
  assert(scopes.output.includes("read | approval no"), "/browser scopes shows read approval state");
  assert(scopes.output.includes("tunnel | approval yes"), "/browser scopes shows tunnel approval state");
  assertEqual(scopes.data.action, "browser_scopes", "/browser scopes data action is scopes");

  const contract = parser.tryHandle("/browser contract");
  assert(contract.output.includes("Browser Sidecar Safety Contract"), "/browser contract renders safety header");
  assert(contract.output.includes("page_content_is_untrusted"), "/browser contract includes untrusted invariant");
  assert(contract.output.includes("approval_required_for_tunnel"), "/browser contract includes tunnel approval invariant");
  assertEqual(contract.data.action, "browser_contract", "/browser contract data action is contract");

  const bad = parser.tryHandle("/browser start");
  assertEqual(bad.isError, true, "/browser unknown subcommand fails closed");
  assert(bad.output.includes("Usage: /browser"), "/browser unknown subcommand shows usage");
}

function verifyHelpWiring(): void {
  section("3. Help Wiring");

  assert(typeof COMMAND_HELP["/browser"] === "string", "Help includes /browser");
  assert(COMMAND_HELP["/browser"].includes("sidecar"), "Help describes browser sidecar");

  const help = new SlashCommandParser().tryHandle("/help");
  assert(help.output.includes("/browser"), "/help renders /browser command");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 284 Verification (Browser Sidecar Boundary)\n");

  verifyDescriptor();
  verifyGatewayCommand();
  verifyHelpWiring();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 284: Browser sidecar boundary is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
