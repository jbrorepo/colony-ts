/**
 * Phase 285 Verification Script - Browser Sidecar Lifecycle
 *
 * Verifies the first real browser sidecar foundation:
 *   1. local-only lifecycle runtime
 *   2. /browser start|stop|status wiring
 *   3. approval-required risky scopes and bounded untrusted page output
 *
 * Run: bun run src/verify-phase285.ts
 */

import {
  BrowserSidecarRuntime,
  redactAndBoundBrowserPageOutput,
} from "./browser/browser-sidecar-runtime";
import { buildBrowserCommandPayload } from "./gateway-browser";
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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

function verifyLifecycleRuntime(): void {
  section("1. Lifecycle Runtime");

  const runtime = new BrowserSidecarRuntime();
  const initial = runtime.snapshot();
  assertEqual(initial.status, "available", "Runtime starts available but inactive");
  assertEqual(initial.localOnly, true, "Runtime is local-only");
  assertEqual(initial.listenerBound, false, "Runtime does not bind listener by default");
  assertEqual(initial.browserSpawned, false, "Runtime does not spawn browser by default");
  assertEqual(initial.credentialsPersisted, false, "Runtime never persists credentials");
  assertEqual(initial.tunnelActive, false, "Runtime has no tunnel by default");

  const blockedStart = runtime.start();
  assertEqual(blockedStart.status, "blocked", "Start without approval is blocked");
  assert(blockedStart.reason.includes("approval"), "Blocked start explains approval requirement");
  assertEqual(runtime.snapshot().status, "available", "Blocked start does not mutate runtime active state");

  const started = runtime.start({ approved: true, approvedBy: "operator", reason: "local browser sidecar smoke" });
  assertEqual(started.status, "started", "Approved start succeeds");
  assertEqual(started.snapshot.status, "active", "Approved start marks runtime active");
  assertEqual(started.snapshot.listenerBound, false, "Approved start still does not bind listener in v1");
  assertEqual(started.snapshot.browserSpawned, false, "Approved start still does not spawn Chromium in v1");

  const stopped = runtime.stop();
  assertEqual(stopped.status, "stopped", "Stop succeeds");
  assertEqual(stopped.snapshot.status, "available", "Stop returns runtime to available");
}

function verifyGatewayLifecycle(): void {
  section("2. /browser Lifecycle Commands");

  const runtime = new BrowserSidecarRuntime();
  const status = buildBrowserCommandPayload(["status"], { runtime });
  assert(status.output.includes("Status: available"), "/browser status shows available runtime");
  assert(status.output.includes("Listener bound: no"), "/browser status shows no listener bound");
  assert(status.output.includes("Browser spawned: no"), "/browser status shows no browser spawned");

  const blocked = buildBrowserCommandPayload(["start"], { runtime });
  assertEqual(blocked.isError, true, "/browser start without approval fails closed");
  assert(blocked.output.includes("approval"), "/browser start explains approval blocker");
  assertEqual(blocked.data?.action, "browser_start_blocked", "/browser start blocked data action is stable");

  const approved = buildBrowserCommandPayload(["start", "--approved"], { runtime });
  assertEqual(approved.isError, undefined, "/browser start --approved succeeds");
  assert(approved.output.includes("Browser sidecar started"), "/browser start --approved reports started");
  assert(approved.output.includes("No listener bound"), "/browser start --approved preserves listener truth");
  assertEqual(approved.data?.action, "browser_start", "/browser start data action is stable");

  const stop = buildBrowserCommandPayload(["stop"], { runtime });
  assert(stop.output.includes("Browser sidecar stopped"), "/browser stop reports stopped");
  assertEqual(stop.data?.action, "browser_stop", "/browser stop data action is stable");

  const parser = new SlashCommandParser({ browser: { runtime: new BrowserSidecarRuntime() } });
  const parsedStart = parser.tryHandle("/browser start");
  assertEqual(parsedStart.isError, true, "Slash parser routes /browser start through runtime context");
}

function verifyPageOutputBoundary(): void {
  section("3. Page Output Boundary");

  const output = redactAndBoundBrowserPageOutput(
    "hello sk-phase285-secret ".repeat(80),
    { maxChars: 160 },
  );
  assertEqual(output.untrusted, true, "Page output is marked untrusted");
  assertEqual(output.truncated, true, "Page output is bounded");
  assert(output.text.includes("sk-phase285-secret") === false, "Page output redacts secret-like values");
  assert(output.text.length <= 160, "Page output respects max chars");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 285 Verification (Browser Sidecar Lifecycle)\n");
  verifyLifecycleRuntime();
  verifyGatewayLifecycle();
  verifyPageOutputBoundary();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 285: browser sidecar lifecycle is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
