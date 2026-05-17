/**
 * Phase 241 Verification Script - Built-In Plugin Marketplace View
 *
 * Proves Colony can expose a default read-only plugin marketplace view and
 * query UX on top of existing package planners without fetching registries,
 * installing packages, executing code, activating sidecars, mutating catalogs,
 * or persisting credentials.
 *
 * Run: bun run src/verify-phase241.ts
 */

import {
  createDefaultPluginPackageMarketplaceView,
  createPluginPackageMarketplaceView,
  planPluginPackageManifest,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
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

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function manifest(overrides: Partial<PluginPackageManifest> = {}): PluginPackageManifest {
  return {
    packageName: "@colony/plugin-phase241",
    packageVersion: "15.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase241.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase241-plugin",
        sidecarId: "phase241-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase241-entry",
    displayName: "Phase 241 Echo Tools",
    summary: "Safe local MCP echo tooling for marketplace planning.",
    tags: ["mcp", "local-sidecar", "echo"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function verifyDefaultMarketplaceView(): void {
  section("1. Default Marketplace View Is Read-Only And Claim-Safe");

  const view = createDefaultPluginPackageMarketplaceView({
    catalogId: "colony-default",
    timestamp: "2026-05-14T05:10:00.000Z",
  });

  assertEqual(view.recordType, "mcp_plugin_package_marketplace_view", "View uses marketplace record type");
  assertEqual(view.catalogId, "colony-default", "Default view preserves safe catalog id");
  assert(view.totalEntries >= 1, "Default marketplace has at least one built-in entry");
  assert(view.entries.length >= 1, "Default marketplace renders entries");
  assertEqual(view.networkFetched, false, "Default marketplace performs no network fetch");
  assertEqual(view.packageInstalled, false, "Default marketplace installs no packages");
  assertEqual(view.packageExecuted, false, "Default marketplace executes no package code");
  assertEqual(view.activation, false, "Default marketplace activates no sidecars");
  assertEqual(view.catalogMutated, false, "Default marketplace mutates no catalog");
  assertEqual(view.credentialsPersisted, false, "Default marketplace persists no credentials");
  assert(view.entries.every((item) => item.package.source === "<redacted>"), "Default marketplace redacts package sources");
  assert(view.entries.some((item) => item.actionSummary.importCount >= 1 || item.actionSummary.reviewCount >= 1), "Default marketplace exposes package plan summaries");
  assert(!JSON.stringify(view).includes("approvalRequest"), "Default marketplace does not expose approval request bodies");
  assert(!JSON.stringify(view).includes("definition"), "Default marketplace does not expose trusted sidecar definitions");
}

function verifyQueryFilteringAndRedaction(): void {
  section("2. Query Filtering Does Not Echo Raw Query Text");

  const secretQuery = "echo SHOULD_NOT_LEAK_TOKEN";
  const view = createPluginPackageMarketplaceView({
    catalogId: "catalog-phase241",
    entries: [
      entry(),
      entry({
        entryId: "phase241-db",
        displayName: "Database Tools",
        summary: "Database inspection helper.",
        tags: ["database"],
        manifest: manifest({
          packageName: "@colony/plugin-phase241-db",
          packageDigest: "sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
          sidecars: [{ id: "phase241-db", sidecarId: "phase241-db-sidecar", sidecarKind: "local-sidecar", allowedTools: ["db_inspect"] }],
        }),
        featured: false,
      }),
    ],
    query: secretQuery,
    timestamp: "2026-05-14T05:11:00.000Z",
  });

  assertEqual(view.query.present, true, "View records that a query was supplied");
  assert(view.query.hash.startsWith("q:"), "View records a bounded query hash");
  assert(!JSON.stringify(view).includes(secretQuery), "View does not echo raw query text");
  assert(!JSON.stringify(view).includes("SHOULD_NOT_LEAK"), "View redacts secret-like query material");
  assertEqual(view.entries.length, 1, "Query filters marketplace entries");
  assertEqual(view.entries[0]?.entryId, "phase241-entry", "Query matches expected echo entry");
}

function verifyInstalledSignatureSummaries(): void {
  section("3. Installed Signature State Produces Keep Summaries");

  const importPlan = planPluginPackageManifest(manifest());
  const signature = importPlan.actions[0]?.signature ?? "";
  const view = createPluginPackageMarketplaceView({
    catalogId: "catalog-installed",
    entries: [entry()],
    installedSignatures: { "phase241-plugin": signature },
  });

  const rendered = view.entries[0];
  assertEqual(rendered?.actionSummary.keepCount, 1, "Installed signature renders keep summary");
  assertEqual(rendered?.recommendedAction, "keep", "Recommended marketplace action is keep");
  assertEqual(rendered?.approvalRequired, true, "Marketplace still communicates approval boundary");
  assertEqual(rendered?.package.digest, "sha256:abababababa...abababab", "Digest is shortened");
}

function verifyUnsafeEntriesFailClosed(): void {
  section("4. Unsafe Entries Are Redacted And Non-Executable");

  const view = createPluginPackageMarketplaceView({
    catalogId: "catalog-unsafe-token-SHOULD_NOT_LEAK",
    entries: [
      entry({
        entryId: "unsafe-token-SHOULD_NOT_LEAK",
        displayName: "unsafe token SHOULD_NOT_LEAK",
        summary: "secret SHOULD_NOT_LEAK",
        tags: ["token-SHOULD_NOT_LEAK"],
        manifest: manifest({
          packageName: "token-SHOULD_NOT_LEAK",
          packageSource: "https://token@example.invalid/pkg.tgz?token=SHOULD_NOT_LEAK",
          sidecars: [{ id: "token-SHOULD_NOT_LEAK", sidecarId: "bad", sidecarKind: "local-sidecar" }],
        }),
      }),
    ],
  });

  assertEqual(view.catalogId, "<redacted>", "Unsafe catalog id is redacted");
  assertEqual(view.entries.length, 1, "Unsafe entry still renders as blocked evidence");
  assertEqual(view.entries[0]?.recommendedAction, "reject", "Unsafe entry recommends reject");
  assert((view.entries[0]?.blockedReasons ?? []).length > 0, "Unsafe entry carries blocked reasons");
  assertEqual(view.networkFetched, false, "Unsafe entry view performs no network fetch");
  assertEqual(view.packageInstalled, false, "Unsafe entry view installs no package");
  assertEqual(view.packageExecuted, false, "Unsafe entry view executes no package code");
  assert(!JSON.stringify(view).includes("SHOULD_NOT_LEAK"), "Unsafe entry output redacts secrets");
  assert(!JSON.stringify(view).includes("?token="), "Unsafe entry output redacts URL query");
}

async function verifyRuntimeHasNoHostExecution(): Promise<void> {
  section("5. Marketplace Runtime Contains No Host Execution Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace.ts").text();
  assert(!source.includes("fetch("), "Marketplace runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Marketplace runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Marketplace runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 241 Verification (Built-In Plugin Marketplace View)\n");

  verifyDefaultMarketplaceView();
  verifyQueryFilteringAndRedaction();
  verifyInstalledSignatureSummaries();
  verifyUnsafeEntriesFailClosed();
  await verifyRuntimeHasNoHostExecution();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 241 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 241: built-in plugin marketplace view is GREEN.");
}

run().catch((error) => {
  console.error("Phase 241 verification crashed:", error);
  process.exit(1);
});
