/**
 * Phase 252 Verification Script - Marketplace Registry Fetch Metadata Planning
 *
 * Proves completed marketplace registry-fetch receipts can be used as a
 * read-only planning gate for host-supplied full registry metadata, while
 * redacted receipts alone do not become package trust input.
 *
 * Run: bun run src/verify-phase252.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceRegistryFetchHandoff,
  createPluginPackageMarketplaceRegistryFetchMetadataPlanning,
  executeApprovedPluginPackageRegistryFetch,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
  type PluginPackageMarketplaceRegistryFetchHandoff,
  type PluginPackageRegistryFetchApproval,
  type PluginPackageRegistryFetchExecutor,
  type PluginPackageRegistryMetadata,
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
    packageName: "@colony/plugin-phase252",
    packageVersion: "22.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase252.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase252-plugin",
        sidecarId: "phase252-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase252-sidecar",
        expectedServerVersion: "22.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase252-entry",
    displayName: "Phase 252 Registry Planning Tools",
    summary: "Safe local MCP registry metadata planning fixture for marketplace entries.",
    tags: ["mcp", "registry", "planning"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase252",
    packageVersion: "22.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase252.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    registryUrl: "https://registry.example.com/plugins/phase252",
    fetchedAt: "2026-05-14T07:58:00.000Z",
    integrity: "sha256-abababababababababababababababababababababababababababababababab",
    signatures: [
      {
        keyId: "phase252-key",
        algorithm: "ed25519",
        signature: "SHOULD_NOT_LEAK_SIGNATURE_BODY",
      },
    ],
    ...overrides,
  };
}

function registrySignature(candidate: PluginPackageMarketplaceCatalogEntry, registryUrl: string): string {
  return buildPluginPackageRegistryFetchApprovalRequest({
    packageName: candidate.manifest.packageName,
    packageVersion: candidate.manifest.packageVersion,
    packageSource: candidate.manifest.packageSource,
    packageDigest: candidate.manifest.packageDigest,
    registryUrl,
  }).signature;
}

function readyHandoff(
  candidate: PluginPackageMarketplaceCatalogEntry = entry(),
  registryUrl = "https://registry.example.com/plugins/phase252",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase252",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T07:59:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase252 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
  }
  return handoff;
}

function approval(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  overrides: Partial<PluginPackageRegistryFetchApproval> = {},
): PluginPackageRegistryFetchApproval {
  return {
    approved: true,
    signature: handoff.approval.signature,
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "fetch registry metadata SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

function executor(options: { status?: number } = {}): PluginPackageRegistryFetchExecutor {
  return () => ({
    status: options.status ?? 200,
    headers: { "content-type": "application/json" },
    bodyText: JSON.stringify(metadata()),
  });
}

async function completedReceipt(handoff: PluginPackageMarketplaceRegistryFetchHandoff) {
  return executeApprovedPluginPackageRegistryFetch({
    handoff: handoff.registryFetchHandoff,
    approval: approval(handoff),
    executor: executor(),
    timestamp: "2026-05-14T08:00:00.000Z",
  });
}

async function verifyCompletedReceiptPlusSuppliedMetadataPlansSafely(): Promise<void> {
  section("1. Completed Receipt Plus Supplied Metadata Plans Safely");

  const candidate = entry();
  const handoff = readyHandoff(candidate);
  const receipt = await completedReceipt(handoff);
  const view = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase252",
    entries: [candidate],
    handoffs: [handoff],
    receipts: [receipt],
    registryMetadata: {
      "@colony/plugin-phase252@22.0.0": metadata(),
    },
    timestamp: "2026-05-14T08:01:00.000Z",
  });
  const projected = view.entries[0];

  assertEqual(view.recordType, "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view", "Planning view uses expected record type");
  assertEqual(projected?.state, "metadata_ready", "Completed receipt plus supplied metadata is ready for planning");
  assertEqual(projected?.receipt.present, true, "Completed receipt is attached");
  assertEqual(projected?.receipt.status, "completed", "Receipt status is visible");
  assertEqual(projected?.metadata.present, true, "Supplied metadata summary is present");
  assertEqual(projected?.metadata.signatureCount, 1, "Signature count is bounded");
  assertEqual(projected?.plan.registryMetadataApplied, true, "Registry metadata is applied only after receipt match");
  assertEqual(projected?.plan.action, "import", "Planner action remains import");
  assertEqual(projected?.plan.registryMetadataVerified, true, "Planner exposes verified registry metadata summary");
  assertEqual(view.networkFetched, false, "View performs no registry fetch");
  assertEqual(view.packageInstalled, false, "View installs no package");
  assertEqual(view.packageExecuted, false, "View executes no package code");
  assertEqual(view.activation, false, "View performs no activation");
  assertEqual(view.sidecarStarted, false, "View starts no sidecar");
  assertEqual(view.catalogMutated, false, "View mutates no catalog");
  assertEqual(view.credentialsPersisted, false, "View persists no credentials");
  assert(!JSON.stringify(view).includes("plugins.example.com/colony/plugin-phase252.tgz"), "Planning view redacts package source URLs");
  assert(!JSON.stringify(view).includes("SHOULD_NOT_LEAK"), "Planning view redacts approvals and signature material");
}

async function verifyCompletedReceiptAloneDoesNotBecomeTrustInput(): Promise<void> {
  section("2. Completed Receipt Alone Does Not Become Trust Input");

  const candidate = entry();
  const handoff = readyHandoff(candidate);
  const receipt = await completedReceipt(handoff);
  const view = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase252",
    entries: [candidate],
    handoffs: [handoff],
    receipts: [receipt],
    timestamp: "2026-05-14T08:02:00.000Z",
  });
  const projected = view.entries[0];

  assertEqual(projected?.state, "metadata_missing", "Redacted completed receipt alone leaves metadata missing");
  assertEqual(projected?.metadata.present, false, "No full supplied metadata is summarized");
  assertEqual(projected?.plan.registryMetadataApplied, false, "Redacted receipt is not converted into registry metadata");
  assert(projected?.nextActions.some((action) => action.includes("host-supplied full registry metadata")) === true, "Next action asks for supplied full metadata");
}

async function verifyFailedAndRejectedMetadataStayBounded(): Promise<void> {
  section("3. Failed And Rejected Metadata Stay Bounded");

  const candidate = entry();
  const handoff = readyHandoff(candidate);
  const failedReceipt = await executeApprovedPluginPackageRegistryFetch({
    handoff: handoff.registryFetchHandoff,
    approval: approval(handoff),
    executor: executor({ status: 503 }),
    timestamp: "2026-05-14T08:03:00.000Z",
  });
  const failedView = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase252",
    entries: [candidate],
    handoffs: [handoff],
    receipts: [failedReceipt],
    registryMetadata: {
      "@colony/plugin-phase252@22.0.0": metadata(),
    },
  });
  assertEqual(failedView.entries[0]?.state, "metadata_failed", "Failed receipt blocks metadata planning");
  assertEqual(failedView.entries[0]?.plan.registryMetadataApplied, false, "Failed receipt does not apply metadata");
  assertEqual(failedView.entries[0]?.receipt.blockedReason, "http_status_rejected", "Failed receipt reason is preserved");

  const completed = await completedReceipt(handoff);
  const rejectedView = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase252",
    entries: [candidate],
    handoffs: [handoff],
    receipts: [completed],
    registryMetadata: {
      "@colony/plugin-phase252@22.0.0": metadata({
        packageDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      }),
    },
  });
  assertEqual(rejectedView.entries[0]?.state, "metadata_rejected", "Mismatched supplied metadata is rejected");
  assert(rejectedView.entries[0]?.plan.blockedReasons.includes("registry_digest_mismatch") === true, "Digest mismatch reason is visible");
  assertEqual(rejectedView.entries[0]?.plan.registryMetadataApplied, false, "Rejected metadata is not applied");
}

async function verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive(): Promise<void> {
  section("4. Metadata Planning Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-registry-fetch-metadata-planning.ts").text();
  assert(!source.includes("fetch("), "Metadata planning runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Metadata planning runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Metadata planning runtime contains no catalog write path");
  assert(source.includes("planPluginPackageManifest"), "Metadata planning delegates trust decisions to existing package planner");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 252 Verification (Marketplace Registry Fetch Metadata Planning)\n");

  await verifyCompletedReceiptPlusSuppliedMetadataPlansSafely();
  await verifyCompletedReceiptAloneDoesNotBecomeTrustInput();
  await verifyFailedAndRejectedMetadataStayBounded();
  await verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 252 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 252: marketplace registry fetch metadata planning is GREEN.");
}

run().catch((error) => {
  console.error("Phase 252 verification crashed:", error);
  process.exit(1);
});
