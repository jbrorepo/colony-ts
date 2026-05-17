/**
 * Phase 80 Verification Script - Approval-Gated Plugin Package Catalog Staging
 *
 * Proves reviewed dry-run package plans can be staged into a durable redacted
 * catalog candidate journal only with explicit approval, without installing
 * packages, executing code, fetching registries, or starting sidecars.
 *
 * Run: bun run src/verify-phase80.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  JsonPluginPackageCatalogStagingStore,
  planPluginPackageManifest,
  pluginMcpSidecarTrustSignature,
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
    packageName: "@colony/plugin-phase80",
    packageVersion: "6.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase80.tgz",
    packageDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    reviewed: true,
    sidecars: [
      {
        id: "phase80-plugin",
        sidecarId: "phase80-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase80-plugin-sidecar",
        expectedServerVersion: "6.0.0",
      },
    ],
    ...overrides,
  };
}

function approved(overrides: Partial<PluginPackageCatalogApproval> = {}): PluginPackageCatalogApproval {
  return {
    approved: true,
    approvedBy: "operator",
    reason: "reviewed-local-package-plan",
    ...overrides,
  };
}

function verifyApprovedStaging(): void {
  section("1. Explicit Approval Stages Redacted Catalog Records");

  const plan = planPluginPackageManifest(manifest());
  const result = stagePluginPackageCatalogRecords({
    plan,
    catalogId: "catalog-phase80",
    timestamp: "2026-04-30T00:10:00.000Z",
    approval: approved({
      approvedBy: "operator-token-SHOULD_NOT_LEAK",
      reason: "approval reason with SHOULD_NOT_LEAK_TOKEN_DETAIL",
    }),
  });

  assertEqual(result.status, "staged", "Approved request returns staged status");
  assertEqual(result.records.length, 1, "Approved import creates one staged catalog record");
  assertEqual(result.blocked.length, 0, "Approved import has no blocked records");
  const record = result.records[0]!;
  assertEqual(record.recordType, "mcp_plugin_package_catalog_candidate", "Record uses catalog candidate type");
  assertEqual(record.catalogId, "catalog-phase80", "Record preserves safe catalog id");
  assertEqual(record.timestamp, "2026-04-30T00:10:00.000Z", "Record preserves timestamp");
  assertEqual(record.action, "import", "Record preserves import action");
  assertEqual(record.status, "staged", "Record is staged, not active");
  assertEqual(record.dryRun, true, "Record remains dry-run");
  assertEqual(record.activation, false, "Record does not activate sidecars");
  assertEqual(record.approval.approved, true, "Record records explicit approval");
  assertEqual(record.approval.reason, "<redacted>", "Record redacts approval reason body");
  assertEqual(record.approval.approvedBy, "<redacted>", "Record redacts secret-like approver labels");
  assertEqual(record.package.source, "<redacted>", "Record redacts package source");
  assertEqual(record.package.digest, "sha256:eeeeeeeeeee...eeeeeeee", "Record stores shortened digest only");
  assert(record.signature.startsWith("mcp-plugin:"), "Record preserves exact plugin trust signature namespace");

  const serialized = JSON.stringify(result);
  assert(!serialized.includes("plugins.example.com"), "Staged result does not leak package source host");
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Staged result does not leak approval or actor secrets");
  assert(!serialized.includes("approvalRequest"), "Staged result omits approval request bodies");
  assert(!serialized.includes("definition"), "Staged result omits trusted sidecar definitions");
  assert(!serialized.includes("installCommand"), "Staged result has no install command field");
  assert(!serialized.includes("startSidecar"), "Staged result has no sidecar start field");
}

function verifyApprovalGateAndSkippedActions(): void {
  section("2. Approval Gate and Non-Staged Actions");

  const plan = planPluginPackageManifest(manifest());
  const unapproved = stagePluginPackageCatalogRecords({
    plan,
    catalogId: "catalog-unapproved",
    timestamp: "2026-04-30T00:11:00.000Z",
    approval: { approved: false, approvedBy: "operator", reason: "not approved" },
  });

  assertEqual(unapproved.status, "blocked", "Unapproved request is blocked");
  assertEqual(unapproved.records.length, 0, "Unapproved request stages no records");
  assertEqual(unapproved.blocked.length, 1, "Unapproved import is reported as blocked");
  assertEqual(unapproved.blocked[0]?.reason, "approval_required", "Unapproved import states approval is required");

  const keepPlan = planPluginPackageManifest(manifest(), {
    installedSignatures: {
      "phase80-plugin": plan.actions[0]?.signature ?? "",
    },
  });
  const keepResult = stagePluginPackageCatalogRecords({
    plan: keepPlan,
    catalogId: "catalog-keep",
    timestamp: "2026-04-30T00:11:30.000Z",
    approval: approved(),
  });
  assertEqual(keepResult.status, "blocked", "Keep-only request does not stage catalog writes");
  assertEqual(keepResult.records.length, 0, "Keep actions are not staged");
  assertEqual(keepResult.blocked[0]?.reason, "not_catalog_write_action", "Keep action is reported as non-write");

  const rejectedPlan = planPluginPackageManifest(manifest({
    packageName: "SHOULD_NOT_LEAK_TOKEN_PACKAGE",
    packageSource: "https://token@example.invalid/pkg.tgz?token=SHOULD_NOT_LEAK",
    sidecars: [{ id: "SHOULD_NOT_LEAK_TOKEN_SIDECAR", sidecarId: "bad", sidecarKind: "local-sidecar" }],
  }));
  const rejectedResult = stagePluginPackageCatalogRecords({
    plan: rejectedPlan,
    catalogId: "catalog-reject",
    timestamp: "2026-04-30T00:12:00.000Z",
    approval: approved(),
  });
  const rejectedSerialized = JSON.stringify(rejectedResult);
  assertEqual(rejectedResult.records.length, 0, "Rejected actions are not staged");
  assert(!rejectedSerialized.includes("SHOULD_NOT_LEAK"), "Rejected blocked summaries do not leak unsafe manifest text");

  const unknownPlan = planPluginPackageManifest(manifest({
    sidecars: [{ id: "phase80-unknown", sidecarId: "phase80-unknown-sidecar", sidecarKind: "unknown" }],
  }), { acceptUnknownSidecars: true });
  const unknownResult = stagePluginPackageCatalogRecords({
    plan: unknownPlan,
    catalogId: "catalog-unknown",
    timestamp: "2026-04-30T00:12:30.000Z",
    approval: approved(),
  });
  assertEqual(unknownResult.records.length, 0, "Unknown sidecar kinds are not staged as catalog candidates");
  assertEqual(unknownResult.blocked[0]?.reason, "invalid_sidecar_kind", "Unknown sidecar kind is reported");

  const mixedPlan = planPluginPackageManifest(manifest({
    sidecars: [
      manifest().sidecars[0]!,
      { id: "phase80-unknown-mixed", sidecarId: "phase80-unknown-mixed-sidecar", sidecarKind: "unknown" },
    ],
  }), { acceptUnknownSidecars: true });
  const mixedResult = stagePluginPackageCatalogRecords({
    plan: mixedPlan,
    catalogId: "catalog-mixed",
    timestamp: "2026-04-30T00:12:45.000Z",
    approval: approved(),
  });
  assertEqual(mixedResult.status, "blocked", "Mixed valid/blocked plans fail closed");
  assertEqual(mixedResult.records.length, 0, "Mixed valid/blocked plans expose no appendable staged records");
  assert(mixedResult.blocked.some((blocked) => blocked.reason === "invalid_sidecar_kind"), "Mixed plan reports blocked sidecar reason");
}

async function verifyDurableCatalogStore(): Promise<void> {
  section("3. Durable Catalog Candidate Store");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-catalog-"));
  try {
    const store = new JsonPluginPackageCatalogStagingStore({ rootDir: root });
    const plan = planPluginPackageManifest(manifest());
    const result = stagePluginPackageCatalogRecords({
      plan,
      catalogId: "catalog-store",
      timestamp: "2026-04-30T00:13:00.000Z",
      approval: approved(),
    });

    await store.append(result.records);
    const loaded = await store.load();
    assertEqual(loaded.length, 1, "Store loads appended catalog records");
    assertEqual(loaded[0]?.catalogId, "catalog-store", "Loaded record preserves catalog id");
    assertEqual(loaded[0]?.sequence, 0, "Loaded record preserves sequence");
    assertEqual(loaded[0]?.activation, false, "Loaded record remains inactive");

    const raw = await readFile(join(root, "plugin-package-catalog-candidates.jsonl"), "utf8");
    assert(raw.endsWith("\n"), "Store writes newline-delimited JSON");
    assert(!raw.includes("plugins.example.com"), "Store does not persist package source URLs");
    assert(!raw.includes("approvalRequest"), "Store does not persist approval requests");
    assert(!raw.includes("definition"), "Store does not persist trusted definitions");
    assert(!raw.includes("transport"), "Store does not persist transport details");
    assert(!raw.includes("installCommand"), "Store has no install command field");
    assert(!raw.includes("startSidecar"), "Store has no sidecar start field");
    assert(!raw.includes("postinstall"), "Store has no postinstall field");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyCatalogLoadFailsClosed(): Promise<void> {
  section("4. Catalog Store Fails Closed");

  const malformedRoot = await mkdtemp(join(tmpdir(), "colony-plugin-catalog-bad-"));
  try {
    await mkdir(malformedRoot, { recursive: true });
    await writeFile(
      join(malformedRoot, "plugin-package-catalog-candidates.jsonl"),
      "{\"recordType\":\"mcp_plugin_package_catalog_candidate\",\"package\":{\"source\":\"SHOULD_NOT_LEAK_TOKEN_SOURCE\"}}\nnot-json-SHOULD_NOT_LEAK_TOKEN_BODY\n",
      "utf8",
    );
    const store = new JsonPluginPackageCatalogStagingStore({ rootDir: malformedRoot });
    await expectRejects(
      "Malformed catalog load fails with generic redacted error",
      () => store.load(),
      (error) => error.message === "Plugin package catalog candidate journal is invalid" && !error.message.includes("SHOULD_NOT_LEAK"),
    );
  } finally {
    await rm(malformedRoot, { recursive: true, force: true });
  }

  const forbiddenRoot = await mkdtemp(join(tmpdir(), "colony-plugin-catalog-forbidden-"));
  try {
    await mkdir(forbiddenRoot, { recursive: true });
    await writeFile(
      join(forbiddenRoot, "plugin-package-catalog-candidates.jsonl"),
      JSON.stringify({
        recordType: "mcp_plugin_package_catalog_candidate",
        catalogId: "catalog-forbidden",
        sequence: 0,
        timestamp: "2026-04-30T00:14:00.000Z",
        action: "import",
        status: "staged",
        dryRun: true,
        activation: false,
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
        approval: { approved: true, approvedBy: "operator", reason: "<redacted>" },
        approvalRequest: { details: "SHOULD_NOT_LEAK_TOKEN_APPROVAL" },
        definition: { packageSource: "SHOULD_NOT_LEAK_TOKEN_DEFINITION" },
      }) + "\n",
      "utf8",
    );
    const store = new JsonPluginPackageCatalogStagingStore({ rootDir: forbiddenRoot });
    await expectRejects(
      "Catalog load rejects forbidden durable fields instead of normalizing around them",
      () => store.load(),
      (error) => error.message === "Plugin package catalog candidate journal is invalid" && !error.message.includes("SHOULD_NOT_LEAK"),
    );
  } finally {
    await rm(forbiddenRoot, { recursive: true, force: true });
  }

  const badSequenceRoot = await mkdtemp(join(tmpdir(), "colony-plugin-catalog-bad-sequence-"));
  try {
    await mkdir(badSequenceRoot, { recursive: true });
    const plan = planPluginPackageManifest(manifest());
    const result = stagePluginPackageCatalogRecords({
      plan,
      catalogId: "catalog-bad-sequence",
      timestamp: "2026-04-30T00:14:15.000Z",
      approval: approved(),
    });
    await writeFile(
      join(badSequenceRoot, "plugin-package-catalog-candidates.jsonl"),
      JSON.stringify({ ...result.records[0]!, sequence: "not-a-number" }) + "\n",
      "utf8",
    );
    const store = new JsonPluginPackageCatalogStagingStore({ rootDir: badSequenceRoot });
    await expectRejects(
      "Catalog load rejects malformed sequence fields instead of defaulting them",
      () => store.load(),
      (error) => error.message === "Plugin package catalog candidate journal is invalid",
    );
  } finally {
    await rm(badSequenceRoot, { recursive: true, force: true });
  }

  const unknownRoot = await mkdtemp(join(tmpdir(), "colony-plugin-catalog-unknown-"));
  try {
    const store = new JsonPluginPackageCatalogStagingStore({ rootDir: unknownRoot });
    const plan = planPluginPackageManifest(manifest());
    const result = stagePluginPackageCatalogRecords({
      plan,
      catalogId: "catalog-store-unknown",
      timestamp: "2026-04-30T00:14:30.000Z",
      approval: approved(),
    });
    const unknownRecord = {
      ...result.records[0]!,
      sidecar: { ...result.records[0]!.sidecar, kind: "unknown" as const },
    };
    await expectRejects(
      "Store append rejects unknown sidecar catalog candidates",
      () => store.append([unknownRecord]),
      (error) => error.message === "Plugin package catalog candidate append rejected",
    );
  } finally {
    await rm(unknownRoot, { recursive: true, force: true });
  }
}

function verifySignatureNamespace(): void {
  section("5. Plugin Signature Namespace Enforcement");

  const plan = planPluginPackageManifest(manifest());
  const result = stagePluginPackageCatalogRecords({
    plan: {
      ...plan,
      actions: plan.actions.map((action) => ({ ...action, signature: "mcp-http:aaaaaaaaaaaaaaaaaaaaaaaa" })),
    },
    catalogId: "catalog-bad-signature",
    timestamp: "2026-04-30T00:15:00.000Z",
    approval: approved(),
  });

  assertEqual(result.status, "blocked", "Cross-namespace signatures are blocked");
  assertEqual(result.records.length, 0, "Bad signature namespace produces no staged records");
  assertEqual(result.blocked[0]?.reason, "invalid_plugin_signature", "Bad signature namespace is reported");

  const signedPlan = planPluginPackageManifest(manifest());
  const mutatedSummaryResult = stagePluginPackageCatalogRecords({
    plan: {
      ...signedPlan,
      actions: signedPlan.actions.map((action) => ({
        ...action,
        package: {
          name: "forged-package-name",
          version: "999.0.0",
          source: "forged-source",
          digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
        sidecar: {
          id: "forged-sidecar-id",
          kind: "daemon-bridge" as const,
        },
      })),
    },
    catalogId: "catalog-mutated-summary",
    timestamp: "2026-04-30T00:15:15.000Z",
    approval: approved(),
  });
  const mutatedRecord = mutatedSummaryResult.records[0]!;
  assertEqual(mutatedSummaryResult.status, "staged", "Valid signed definition can stage despite mutable summaries");
  assertEqual(mutatedRecord.package.name, "@colony/plugin-phase80", "Staged package name derives from signed definition");
  assertEqual(mutatedRecord.package.version, "6.0.0", "Staged package version derives from signed definition");
  assertEqual(mutatedRecord.package.digest, "sha256:eeeeeeeeeee...eeeeeeee", "Staged package digest derives from signed definition");
  assertEqual(mutatedRecord.sidecar.id, "phase80-plugin", "Staged sidecar id derives from signed definition");
  assertEqual(mutatedRecord.sidecar.kind, "local-sidecar", "Staged sidecar kind derives from signed definition");

  const missingKindPlan = planPluginPackageManifest(manifest());
  const missingKindResult = stagePluginPackageCatalogRecords({
    plan: {
      ...missingKindPlan,
      actions: missingKindPlan.actions.map((action) => {
        const { sidecarKind: _sidecarKind, ...definitionWithoutKind } = action.definition!;
        return {
          ...action,
          definition: definitionWithoutKind as typeof action.definition,
          signature: pluginMcpSidecarTrustSignature(definitionWithoutKind as never),
        };
      }),
    },
    catalogId: "catalog-missing-kind",
    timestamp: "2026-04-30T00:15:20.000Z",
    approval: approved(),
  });
  assertEqual(missingKindResult.status, "blocked", "Definitions normalized to unknown sidecar kind are blocked");
  assertEqual(missingKindResult.records.length, 0, "Definitions normalized to unknown sidecar kind expose no records");
  assertEqual(missingKindResult.blocked[0]?.reason, "invalid_sidecar_kind", "Missing sidecar kind reports invalid kind after normalization");

  const forgedPlan = planPluginPackageManifest(manifest());
  const forgedResult = stagePluginPackageCatalogRecords({
    plan: {
      ...forgedPlan,
      dryRun: false as true,
      approvalRequired: false as true,
      actions: forgedPlan.actions.map((action) => ({
        ...action,
        dryRun: false as true,
        definition: undefined,
        signature: "mcp-plugin:aaaaaaaaaaaaaaaaaaaaaaaa",
      })),
    },
    catalogId: "catalog-forged",
    timestamp: "2026-04-30T00:15:30.000Z",
    approval: approved(),
  });
  assertEqual(forgedResult.status, "blocked", "Forged non-dry-run plans are blocked");
  assertEqual(forgedResult.records.length, 0, "Forged non-dry-run plans expose no staged records");
  assertEqual(forgedResult.blocked[0]?.reason, "invalid_plan_boundary", "Forged plan reports invalid boundary");
}

async function verifyStoreRequiresStagingProof(): Promise<void> {
  section("6. Store Append Requires Staging Output");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-catalog-proof-"));
  try {
    const store = new JsonPluginPackageCatalogStagingStore({ rootDir: root });
    const plan = planPluginPackageManifest(manifest());
    const result = stagePluginPackageCatalogRecords({
      plan,
      catalogId: "catalog-proof",
      timestamp: "2026-04-30T00:16:00.000Z",
      approval: approved(),
    });
    await store.append(result.records);
    const forgedClone = JSON.parse(JSON.stringify(result.records[0]));
    await expectRejects(
      "Store append rejects structurally forged candidate records",
      () => store.append([forgedClone]),
      (error) => error.message === "Plugin package catalog candidate append rejected",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 80 Verification (Approval-Gated Plugin Package Catalog Staging)\n");

  verifyApprovedStaging();
  verifyApprovalGateAndSkippedActions();
  await verifyDurableCatalogStore();
  await verifyCatalogLoadFailsClosed();
  verifySignatureNamespace();
  await verifyStoreRequiresStagingProof();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 80: approval-gated plugin package catalog staging is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
