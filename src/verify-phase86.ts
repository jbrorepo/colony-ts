/**
 * Phase 86 Verification Script - Plugin Package Live Catalog Promotion
 *
 * Proves staged plugin package catalog metadata can be promoted into
 * live-disabled catalog records only after a second approval, can be rolled
 * back as metadata, and still cannot install packages, execute code, fetch
 * registries, or start sidecars.
 *
 * Run: bun run src/verify-phase86.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  JsonPluginPackageLiveCatalogStore,
  planPluginPackageManifest,
  promotePluginPackageLiveCatalogRecords,
  rollbackPluginPackageLiveCatalogRecords,
  stagePluginPackageCatalogRecords,
  type PluginPackageCatalogApproval,
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
    packageName: "@colony/plugin-phase86",
    packageVersion: "7.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase86.tgz",
    packageDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    reviewed: true,
    sidecars: [
      {
        id: "phase86-plugin",
        sidecarId: "phase86-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase86-plugin-sidecar",
        expectedServerVersion: "7.0.0",
      },
    ],
    ...overrides,
  };
}

function approved(overrides: Partial<PluginPackageCatalogApproval> = {}): PluginPackageCatalogApproval {
  return {
    approved: true,
    approvedBy: "operator",
    reason: "reviewed-live-catalog-change",
    ...overrides,
  };
}

function stagedCandidate(catalogId = "catalog-phase86") {
  const plan = planPluginPackageManifest(manifest());
  const staged = stagePluginPackageCatalogRecords({
    plan,
    catalogId,
    timestamp: "2026-05-01T00:00:00.000Z",
    approval: approved({ reason: "first approval SHOULD_NOT_LEAK_TOKEN_DETAIL" }),
  });
  return staged.records[0]!;
}

function verifySecondApprovalPromotion(): void {
  section("1. Second Approval Promotes Live-Disabled Records");

  const result = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    candidates: [stagedCandidate()],
    timestamp: "2026-05-01T00:01:00.000Z",
    approval: approved({
      approvedBy: "operator-token-SHOULD_NOT_LEAK",
      reason: "second approval SHOULD_NOT_LEAK_TOKEN_DETAIL",
    }),
  });

  assertEqual(result.status, "promoted", "Approved promotion returns promoted status");
  assertEqual(result.records.length, 1, "Approved promotion creates one live catalog record");
  assertEqual(result.blocked.length, 0, "Approved promotion has no blocked records");
  const record = result.records[0]!;
  assertEqual(record.recordType, "mcp_plugin_package_catalog_live_record", "Live record uses live catalog type");
  assertEqual(record.catalogId, "catalog-phase86", "Live record preserves safe catalog id");
  assertEqual(record.timestamp, "2026-05-01T00:01:00.000Z", "Live record preserves promotion timestamp");
  assertEqual(record.status, "live_disabled", "Live record is disabled by default");
  assertEqual(record.enabled, false, "Live record is not enabled");
  assertEqual(record.activation, false, "Live record does not activate sidecars");
  assertEqual(record.package.source, "<redacted>", "Live record keeps package source redacted");
  assertEqual(record.package.digest, "sha256:fffffffffff...ffffffff", "Live record preserves shortened digest only");
  assertEqual(record.sidecar.id, "phase86-plugin", "Live record preserves staged sidecar id");
  assertEqual(record.sidecar.kind, "local-sidecar", "Live record preserves staged sidecar kind");
  assertEqual(record.sourceCandidate.catalogId, "catalog-phase86", "Live record points to source staged candidate");
  assertEqual(record.sourceCandidate.sequence, 0, "Live record points to source sequence");
  assertEqual(record.approval.approved, true, "Live record records second approval");
  assertEqual(record.approval.reason, "<redacted>", "Live record redacts second approval reason");
  assertEqual(record.approval.approvedBy, "<redacted>", "Live record redacts secret-like second approver label");

  const serialized = JSON.stringify(result);
  assert(!serialized.includes("plugins.example.com"), "Live promotion does not leak package source host");
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Live promotion does not leak approval secrets");
  assert(!serialized.includes("approvalRequest"), "Live promotion omits approval request bodies");
  assert(!serialized.includes("definition"), "Live promotion omits trusted sidecar definitions");
  assert(!serialized.includes("installCommand"), "Live promotion has no install command field");
  assert(!serialized.includes("startSidecar"), "Live promotion has no sidecar start field");
  assert(!serialized.includes("registryFetch"), "Live promotion has no registry fetch field");
}

function verifySecondApprovalGateAndNamespaceIsolation(): void {
  section("2. Approval Gate and Namespace Isolation");

  const candidate = stagedCandidate();
  const unapproved = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-unapproved",
    candidates: [candidate],
    timestamp: "2026-05-01T00:02:00.000Z",
    approval: { approved: false, approvedBy: "operator", reason: "not approved" },
  });
  assertEqual(unapproved.status, "blocked", "Unapproved promotion is blocked");
  assertEqual(unapproved.records.length, 0, "Unapproved promotion creates no live records");
  assertEqual(unapproved.blocked[0]?.reason, "approval_required", "Unapproved promotion reports approval required");

  const forgedNamespace = {
    ...candidate,
    signature: "mcp-http:aaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const namespaceResult = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-namespace",
    candidates: [forgedNamespace],
    timestamp: "2026-05-01T00:02:30.000Z",
    approval: approved(),
  });
  assertEqual(namespaceResult.status, "blocked", "Cross-namespace signatures are blocked");
  assertEqual(namespaceResult.records.length, 0, "Cross-namespace signatures create no records");
  assertEqual(namespaceResult.blocked[0]?.reason, "invalid_plugin_signature", "Cross-namespace signature reason is reported");

  const catalogMismatch = promotePluginPackageLiveCatalogRecords({
    catalogId: "different-catalog",
    candidates: [candidate],
    timestamp: "2026-05-01T00:02:45.000Z",
    approval: approved(),
  });
  assertEqual(catalogMismatch.status, "blocked", "Candidates cannot be promoted into a different catalog namespace");
  assertEqual(catalogMismatch.blocked[0]?.reason, "catalog_mismatch", "Catalog namespace mismatch is reported");
}

function verifyMalformedCandidatesFailClosed(): void {
  section("3. Malformed Candidate Rejection");

  const candidate = stagedCandidate();
  const malformed = {
    ...candidate,
    status: "live_disabled",
    activation: true,
    definition: { packageSource: "SHOULD_NOT_LEAK_TOKEN_DEFINITION" },
    approvalRequest: { body: "SHOULD_NOT_LEAK_TOKEN_APPROVAL" },
  };
  const result = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    candidates: [malformed],
    timestamp: "2026-05-01T00:03:00.000Z",
    approval: approved(),
  });

  assertEqual(result.status, "blocked", "Malformed candidates are blocked");
  assertEqual(result.records.length, 0, "Malformed candidates create no live records");
  assertEqual(result.blocked[0]?.reason, "invalid_candidate", "Malformed candidate reason is reported");
  assert(!JSON.stringify(result).includes("SHOULD_NOT_LEAK"), "Malformed candidate output is redacted");

  const forged = JSON.parse(JSON.stringify(candidate));
  const forgedResult = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    candidates: [forged],
    timestamp: "2026-05-01T00:03:30.000Z",
    approval: approved(),
  });
  assertEqual(forgedResult.status, "blocked", "Structurally forged staged candidates are blocked");
  assertEqual(forgedResult.records.length, 0, "Structurally forged staged candidates create no live records");
  assertEqual(forgedResult.blocked[0]?.reason, "invalid_candidate", "Structurally forged staged candidates report invalid candidate");

  const invalidCatalogResult = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-token-SHOULD_NOT_LEAK",
    candidates: [stagedCandidate("other-token-SHOULD_NOT_LEAK")],
    timestamp: "2026-05-01T00:03:45.000Z",
    approval: approved(),
  });
  assertEqual(invalidCatalogResult.status, "blocked", "Invalid catalog IDs cannot collapse into a shared redacted namespace");
  assertEqual(invalidCatalogResult.records.length, 0, "Invalid catalog IDs create no live records");
  assert(!JSON.stringify(invalidCatalogResult).includes("SHOULD_NOT_LEAK"), "Invalid catalog ID output is redacted");
}

function verifyRollbackRecords(): void {
  section("4. Metadata Rollback");

  const promoted = promotePluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    candidates: [stagedCandidate()],
    timestamp: "2026-05-01T00:04:00.000Z",
    approval: approved(),
  });
  const rollback = rollbackPluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    records: promoted.records,
    timestamp: "2026-05-01T00:05:00.000Z",
    approval: approved({ reason: "rollback SHOULD_NOT_LEAK_TOKEN_REASON" }),
  });

  assertEqual(rollback.status, "rolled_back", "Rollback returns rolled_back status");
  assertEqual(rollback.records.length, 1, "Rollback creates one rollback record");
  assertEqual(rollback.blocked.length, 0, "Rollback has no blocked records");
  const record = rollback.records[0]!;
  assertEqual(record.recordType, "mcp_plugin_package_catalog_live_record", "Rollback uses live catalog record type");
  assertEqual(record.status, "rolled_back", "Rollback record marks rolled_back status");
  assertEqual(record.enabled, false, "Rollback record remains disabled");
  assertEqual(record.activation, false, "Rollback record does not activate sidecars");
  assertEqual(record.rollbackOf, promoted.records[0]?.signature, "Rollback points at promoted signature");
  assertEqual(record.approval.reason, "<redacted>", "Rollback approval reason is redacted");
  assert(!JSON.stringify(rollback).includes("SHOULD_NOT_LEAK"), "Rollback output does not leak approval secrets");

  const forged = JSON.parse(JSON.stringify(promoted.records[0]));
  const forgedRollback = rollbackPluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    records: [forged],
    timestamp: "2026-05-01T00:05:30.000Z",
    approval: approved(),
  });
  assertEqual(forgedRollback.status, "blocked", "Structurally forged live records cannot be rolled back");
  assertEqual(forgedRollback.records.length, 0, "Structurally forged live rollback creates no records");
  assertEqual(forgedRollback.blocked[0]?.reason, "invalid_live_record", "Structurally forged live rollback reports invalid live record");

  const rollbackOfRollback = rollbackPluginPackageLiveCatalogRecords({
    catalogId: "catalog-phase86",
    records: rollback.records,
    timestamp: "2026-05-01T00:05:45.000Z",
    approval: approved(),
  });
  assertEqual(rollbackOfRollback.status, "blocked", "Rollback records cannot be rolled back again");
  assertEqual(rollbackOfRollback.blocked[0]?.reason, "invalid_live_record", "Rollback-of-rollback reports invalid live record");
}

async function verifyDurableLiveStore(): Promise<void> {
  section("5. Durable Live Catalog Store");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-live-catalog-"));
  try {
    const store = new JsonPluginPackageLiveCatalogStore({ rootDir: root });
    const promoted = promotePluginPackageLiveCatalogRecords({
      catalogId: "catalog-store",
      candidates: [stagedCandidate("catalog-store")],
      timestamp: "2026-05-01T00:06:00.000Z",
      approval: approved(),
    });
    const rolledBack = rollbackPluginPackageLiveCatalogRecords({
      catalogId: "catalog-store",
      records: promoted.records,
      timestamp: "2026-05-01T00:07:00.000Z",
      approval: approved(),
    });

    await store.append([...promoted.records, ...rolledBack.records]);
    const loaded = await store.load();
    assertEqual(loaded.length, 2, "Store loads promoted and rollback records");
    assertEqual(loaded[0]?.status, "live_disabled", "Loaded promotion remains disabled");
    assertEqual(loaded[1]?.status, "rolled_back", "Loaded rollback remains rolled back");

    const raw = await readFile(join(root, "plugin-package-live-catalog.jsonl"), "utf8");
    assert(raw.endsWith("\n"), "Live store writes newline-delimited JSON");
    assert(!raw.includes("plugins.example.com"), "Live store does not persist package source URLs");
    assert(!raw.includes("approvalRequest"), "Live store does not persist approval requests");
    assert(!raw.includes("definition"), "Live store does not persist trusted definitions");
    assert(!raw.includes("transport"), "Live store does not persist transport details");
    assert(!raw.includes("installCommand"), "Live store has no install command field");
    assert(!raw.includes("startSidecar"), "Live store has no sidecar start field");
    assert(!raw.includes("registryFetch"), "Live store has no registry fetch field");

    const forgedClone = JSON.parse(JSON.stringify(promoted.records[0]));
    await expectRejects(
      "Store append rejects structurally forged live records",
      () => store.append([forgedClone]),
      (error) => error.message === "Plugin package live catalog append rejected",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyLiveStoreFailsClosed(): Promise<void> {
  section("6. Live Store Fails Closed");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-live-catalog-bad-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "plugin-package-live-catalog.jsonl"),
      "{\"recordType\":\"mcp_plugin_package_catalog_live_record\",\"package\":{\"source\":\"SHOULD_NOT_LEAK_TOKEN_SOURCE\"}}\nnot-json-SHOULD_NOT_LEAK_TOKEN_BODY\n",
      "utf8",
    );
    const store = new JsonPluginPackageLiveCatalogStore({ rootDir: root });
    await expectRejects(
      "Malformed live catalog load fails with generic redacted error",
      () => store.load(),
      (error) => error.message === "Plugin package live catalog journal is invalid" && !error.message.includes("SHOULD_NOT_LEAK"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 86 Verification (Plugin Live Catalog Promotion)\n");

  verifySecondApprovalPromotion();
  verifySecondApprovalGateAndNamespaceIsolation();
  verifyMalformedCandidatesFailClosed();
  verifyRollbackRecords();
  await verifyDurableLiveStore();
  await verifyLiveStoreFailsClosed();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 86: plugin live catalog promotion is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
