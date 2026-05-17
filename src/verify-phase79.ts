/**
 * Phase 79 Verification Script - Durable Plugin Package Plan Events
 *
 * Proves plugin package discovery/import planning now has a durable, redacted
 * event journal for plan truth without installing packages, executing package
 * code, starting sidecars, fetching registries, or writing package/catalog state.
 *
 * Run: bun run src/verify-phase79.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  JsonPluginPackagePlanEventStore,
  buildPluginPackagePlanEvents,
  planPluginPackageManifest,
  planPluginPackageManifests,
  type PluginPackageManifest,
} from "./mcp";

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

async function expectRejects(label: string, run: () => Promise<unknown> | unknown, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function manifest(overrides: Partial<PluginPackageManifest> = {}): PluginPackageManifest {
  return {
    packageName: "@colony/plugin-phase79",
    packageVersion: "5.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase79.tgz",
    packageDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    reviewed: true,
    sidecars: [
      {
        id: "phase79-plugin",
        sidecarId: "phase79-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase79-plugin-sidecar",
        expectedServerVersion: "5.0.0",
      },
    ],
    ...overrides,
  };
}

function verifyEventProjection(): void {
  section("1. Redacted Plan Event Projection");

  const plan = planPluginPackageManifest(manifest());
  const events = buildPluginPackagePlanEvents(plan, {
    planId: "plan-phase79",
    timestamp: "2026-04-30T00:00:00.000Z",
    actor: "operator-token-SHOULD_NOT_LEAK",
  });

  assertEqual(events.length, 1, "One plan action projects to one durable event");
  const event = events[0]!;
  assertEqual(event.eventType, "mcp_plugin_package_plan", "Event uses plugin package plan event type");
  assertEqual(event.planId, "plan-phase79", "Event preserves safe plan id");
  assertEqual(event.timestamp, "2026-04-30T00:00:00.000Z", "Event preserves timestamp");
  assertEqual(event.action, "import", "Event preserves plan action");
  assertEqual(event.dryRun, true, "Event remains dry-run");
  assertEqual(event.approvalRequired, true, "Event preserves approval boundary");
  assertEqual(event.package.name, "@colony/plugin-phase79", "Event keeps safe package name");
  assertEqual(event.package.version, "5.0.0", "Event keeps safe package version");
  assertEqual(event.package.source, "<redacted>", "Event redacts package source for durable persistence");
  assertEqual(event.package.digest, "sha256:ccccccccccc...cccccccc", "Event stores shortened digest only");
  assert(event.signature?.startsWith("mcp-plugin:") ?? false, "Event preserves exact trust signature namespace");
  assert(!JSON.stringify(event).includes("operator-token-SHOULD_NOT_LEAK"), "Event redacts actor labels");
  assert(!JSON.stringify(event).includes("plugins.example.com"), "Event does not persist package source host");
  assert(!JSON.stringify(event).includes("approvalRequest"), "Event does not persist approval request body");
  assert(!JSON.stringify(event).includes("definition"), "Event does not persist trusted sidecar definition body");

  const highEntropyActor = "ABCDEFGHijklmnopQRSTUVWXyz123456";
  const entropyEvents = buildPluginPackagePlanEvents(plan, {
    planId: "plan-phase79-entropy",
    timestamp: "2026-04-30T00:00:30.000Z",
    actor: highEntropyActor,
  });
  assert(!JSON.stringify(entropyEvents).includes(highEntropyActor), "Event redacts generic high-entropy actor strings");
}

async function verifyDurableStore(): Promise<void> {
  section("2. Durable Append and Load");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-events-"));
  try {
    const store = new JsonPluginPackagePlanEventStore({ rootDir: root });
    const plan = planPluginPackageManifests([
      manifest(),
      manifest({
        packageName: "@colony/plugin-phase79-extra",
        sidecars: [{ id: "phase79-extra", sidecarId: "phase79-extra-sidecar", sidecarKind: "local-sidecar" }],
      }),
    ]);
    const events = buildPluginPackagePlanEvents(plan, {
      planId: "plan-phase79-store",
      timestamp: "2026-04-30T00:01:00.000Z",
      actor: "operator",
    });

    await store.append(events);
    const loaded = await store.load();
    assertEqual(loaded.length, 2, "Store loads appended events");
    assertEqual(loaded[0]?.planId, "plan-phase79-store", "Loaded event preserves plan id");
    assertEqual(loaded[0]?.sequence, 0, "Loaded event preserves deterministic sequence");
    assertEqual(loaded[1]?.sequence, 1, "Loaded event preserves second sequence");

    const raw = await readFile(join(root, "plugin-package-plan-events.jsonl"), "utf8");
    assert(raw.endsWith("\n"), "Store writes newline-delimited JSON");
    assert(!raw.includes("plugins.example.com"), "Store does not persist package source URLs");
    assert(!raw.includes("definition"), "Store does not persist trusted sidecar definitions");
    assert(!raw.includes("approvalRequest"), "Store does not persist approval request bodies");
    assert(!raw.includes("installCommand"), "Store has no install command field");
    assert(!raw.includes("startSidecar"), "Store has no sidecar start field");
    assert(!raw.includes("network"), "Store has no network execution field");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyMalformedStoreFailsClosed(): Promise<void> {
  section("3. Malformed Store Fails Closed");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-events-bad-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "plugin-package-plan-events.jsonl"),
      "{\"eventType\":\"mcp_plugin_package_plan\",\"package\":{\"source\":\"SHOULD_NOT_LEAK_TOKEN_SOURCE\"}}\nnot-json-SHOULD_NOT_LEAK_TOKEN_BODY\n",
      "utf8",
    );
    const store = new JsonPluginPackagePlanEventStore({ rootDir: root });
    await expectRejects(
      "Malformed event journal load fails with generic redacted error",
      () => store.load(),
      (error) => error.message === "Plugin package plan event journal is invalid" && !error.message.includes("SHOULD_NOT_LEAK"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const forbiddenRoot = await mkdtemp(join(tmpdir(), "colony-plugin-events-forbidden-"));
  try {
    await mkdir(forbiddenRoot, { recursive: true });
    await writeFile(
      join(forbiddenRoot, "plugin-package-plan-events.jsonl"),
      JSON.stringify({
        eventType: "mcp_plugin_package_plan",
        planId: "forbidden-plan",
        sequence: 0,
        timestamp: "2026-04-30T00:03:00.000Z",
        action: "import",
        dryRun: true,
        approvalRequired: true,
        package: {
          name: "@colony/forbidden",
          version: "1.0.0",
          source: "https://plugins.example.com/should-not-load.tgz",
          digest: "sha256:ddddddddddd...dddddddd",
        },
        sidecar: { id: "forbidden", kind: "local-sidecar" },
        reasons: ["missing_local"],
        warnings: [],
        signature: "mcp-plugin:aaaaaaaaaaaaaaaaaaaaaaaa",
        approvalRequest: { details: "SHOULD_NOT_LEAK_TOKEN_APPROVAL" },
        definition: { packageSource: "SHOULD_NOT_LEAK_TOKEN_DEFINITION" },
      }) + "\n",
      "utf8",
    );
    const store = new JsonPluginPackagePlanEventStore({ rootDir: forbiddenRoot });
    await expectRejects(
      "Journal load rejects forbidden persisted fields instead of normalizing around them",
      () => store.load(),
      (error) => error.message === "Plugin package plan event journal is invalid" && !error.message.includes("SHOULD_NOT_LEAK"),
    );
  } finally {
    await rm(forbiddenRoot, { recursive: true, force: true });
  }
}

async function verifyRejectedPlanEventRedaction(): Promise<void> {
  section("4. Rejected Plan Event Redaction");

  const secret = "SHOULD_NOT_LEAK_TOKEN_PACKAGE";
  const plan = planPluginPackageManifest(manifest({
    packageName: secret,
    packageSource: `https://${secret}@plugins.example.com/pkg.tgz?token=${secret}`,
    sidecars: [{ id: secret, sidecarId: secret, sidecarKind: "local-sidecar" }],
  }));
  const events = buildPluginPackagePlanEvents(plan, {
    planId: "plan-secret",
    timestamp: "2026-04-30T00:02:00.000Z",
  });
  const serialized = JSON.stringify(events);
  assertEqual(events[0]?.action, "reject", "Rejected plan action projects as rejected event");
  assert(!serialized.includes(secret), "Rejected event does not leak secret-like manifest text");
  assert(!serialized.includes("pkg.tgz"), "Rejected event does not leak unsafe package path");
  assertEqual(events[0]?.signature, undefined, "Rejected event has no trust signature");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 79 Verification (Durable Plugin Package Plan Events)\n");

  verifyEventProjection();
  await verifyDurableStore();
  await verifyMalformedStoreFailsClosed();
  await verifyRejectedPlanEventRedaction();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 79: durable plugin package plan events are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
