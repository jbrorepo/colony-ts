/**
 * Phase 253 Verification Script - Metadata-Bound Marketplace Install Handoff
 *
 * Proves marketplace install/update handoffs can be bound to the Phase 252
 * registry-fetch metadata planning gate without adding default registry fetch,
 * install, package-code execution, activation, catalog mutation, or credential
 * persistence.
 *
 * Run: bun run src/verify-phase253.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  createPluginPackageMarketplaceRegistryFetchHandoff,
  createPluginPackageMarketplaceRegistryFetchMetadataPlanning,
  executeApprovedPluginPackageRegistryFetch,
  planPluginPackageManifest,
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
    packageName: "@colony/plugin-phase253",
    packageVersion: "23.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase253.tgz",
    packageDigest: "sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
    reviewed: true,
    sidecars: [
      {
        id: "phase253-plugin",
        sidecarId: "phase253-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase253-sidecar",
        expectedServerVersion: "23.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase253-entry",
    displayName: "Phase 253 Metadata-Bound Install Tools",
    summary: "Safe local MCP registry metadata-bound install handoff fixture.",
    tags: ["mcp", "registry", "install"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase253",
    packageVersion: "23.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase253.tgz",
    packageDigest: "sha256:bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
    registryUrl: "https://registry.example.com/plugins/phase253",
    fetchedAt: "2026-05-14T08:15:00.000Z",
    integrity: "sha256-bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
    signatures: [
      {
        keyId: "phase253-key",
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

function readyRegistryHandoff(
  candidate: PluginPackageMarketplaceCatalogEntry = entry(),
  registryUrl = "https://registry.example.com/plugins/phase253",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase253",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T08:16:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase253 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
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

async function metadataPlanningView(options: { includeMetadata?: boolean; failedReceipt?: boolean; badMetadata?: boolean } = {}) {
  const candidate = entry();
  const handoff = readyRegistryHandoff(candidate);
  const receipt = await executeApprovedPluginPackageRegistryFetch({
    handoff: handoff.registryFetchHandoff,
    approval: approval(handoff),
    executor: executor({ status: options.failedReceipt ? 503 : 200 }),
    timestamp: "2026-05-14T08:17:00.000Z",
  });
  return {
    candidate,
    view: createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
      catalogId: "catalog-phase253",
      entries: [candidate],
      handoffs: [handoff],
      receipts: [receipt],
      registryMetadata: options.includeMetadata
        ? {
          "@colony/plugin-phase253@23.0.0": metadata(
            options.badMetadata
              ? { packageDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }
              : {},
          ),
        }
        : undefined,
      timestamp: "2026-05-14T08:18:00.000Z",
    }),
  };
}

async function verifyReadyMetadataCreatesBoundedInstallHandoff(): Promise<void> {
  section("1. Metadata-Ready Planning Creates Bounded Install Handoff");

  const { candidate, view } = await metadataPlanningView({ includeMetadata: true });
  const action = planPluginPackageManifest(candidate.manifest).actions[0];
  const approvalSignature = action?.signature ?? "";
  assertEqual(view.entries[0]?.plan.signaturePresent, true, "Metadata planning exposes an approval-bound action signature");

  const handoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase253",
    entries: [candidate],
    metadataPlanningView: view,
    entryId: candidate.entryId,
    approvalSignature,
    packageRoot: "D:/The Colony Test/colony-ts/.colony/plugin-packages",
    packagePath: "D:/The Colony Test/colony-ts/.colony/plugin-packages/phase253-plugin",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T08:19:00.000Z",
  });

  assertEqual(handoff.status, "ready", "Metadata-ready planning permits install/update handoff creation");
  assertEqual(handoff.metadataGate.state, "metadata_ready", "Metadata gate state is preserved");
  assertEqual(handoff.metadataGate.registryMetadataApplied, true, "Registry metadata application is preserved");
  assertEqual(handoff.installUpdateHandoff.status, "ready", "Nested install/update handoff is ready");
  assertEqual(handoff.installUpdateHandoff.action, "import", "Nested handoff uses planner action");
  assertEqual(handoff.networkFetched, false, "Wrapper performs no registry fetch");
  assertEqual(handoff.packageInstalled, false, "Wrapper performs no package install");
  assertEqual(handoff.packageExecuted, false, "Wrapper executes no package code");
  assertEqual(handoff.activation, false, "Wrapper performs no activation");
  assertEqual(handoff.sidecarStarted, false, "Wrapper starts no sidecar");
  assertEqual(handoff.catalogMutated, false, "Wrapper mutates no catalog");
  assertEqual(handoff.credentialsPersisted, false, "Wrapper persists no credentials");
  assert(!JSON.stringify(handoff).includes("plugins.example.com/colony/plugin-phase253.tgz"), "Wrapper redacts package source URLs");
  assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Wrapper redacts approval and signature material");
}

async function verifyMissingOrRejectedMetadataBlocksHandoff(): Promise<void> {
  section("2. Missing Or Rejected Metadata Blocks Handoff");

  const missing = await metadataPlanningView();
  const missingHandoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase253",
    entries: [missing.candidate],
    metadataPlanningView: missing.view,
    entryId: missing.candidate.entryId,
    approvalSignature: "mcp-plugin:000000000000000000000000",
    packageRoot: "D:/The Colony Test/colony-ts/.colony/plugin-packages",
    packagePath: "D:/The Colony Test/colony-ts/.colony/plugin-packages/phase253-plugin",
  });
  assertEqual(missingHandoff.status, "blocked", "Missing metadata blocks handoff");
  assertEqual(missingHandoff.blockedReason, "metadata_not_ready", "Missing metadata uses metadata_not_ready reason");
  assertEqual(missingHandoff.installUpdateHandoff.status, "blocked", "Nested install/update handoff remains blocked");
  assertEqual(missingHandoff.installUpdateHandoff.packageInstalled, false, "Blocked wrapper does not install package");

  const rejected = await metadataPlanningView({ includeMetadata: true, badMetadata: true });
  const rejectedHandoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase253",
    entries: [rejected.candidate],
    metadataPlanningView: rejected.view,
    entryId: rejected.candidate.entryId,
    approvalSignature: "mcp-plugin:000000000000000000000000",
    packageRoot: "D:/The Colony Test/colony-ts/.colony/plugin-packages",
    packagePath: "D:/The Colony Test/colony-ts/.colony/plugin-packages/phase253-plugin",
  });
  assertEqual(rejectedHandoff.status, "blocked", "Rejected metadata blocks handoff");
  assertEqual(rejectedHandoff.metadataGate.state, "metadata_rejected", "Rejected metadata state is preserved");
}

async function verifyMismatchAndUnsafePathsStayClosed(): Promise<void> {
  section("3. Approval Mismatch And Unsafe Paths Stay Closed");

  const { candidate, view } = await metadataPlanningView({ includeMetadata: true });
  const action = planPluginPackageManifest(candidate.manifest).actions[0];
  const correctApproval = action?.signature ?? "";
  const approvalSignature = "mcp-plugin:000000000000000000000000";
  const wrongApproval = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase253",
    entries: [candidate],
    metadataPlanningView: view,
    entryId: candidate.entryId,
    approvalSignature,
    packageRoot: "D:/The Colony Test/colony-ts/.colony/plugin-packages",
    packagePath: "D:/The Colony Test/colony-ts/.colony/plugin-packages/phase253-plugin",
  });
  assertEqual(wrongApproval.status, "blocked", "Wrong install approval blocks handoff");
  assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Approval mismatch reason is preserved");

  const pathEscape = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase253",
    entries: [candidate],
    metadataPlanningView: view,
    entryId: candidate.entryId,
    approvalSignature: correctApproval,
    packageRoot: "D:/The Colony Test/colony-ts/.colony/plugin-packages",
    packagePath: "D:/The Colony Test/colony-ts/outside-plugin",
  });
  assertEqual(pathEscape.status, "blocked", "Package path escape blocks handoff");
  assertEqual(pathEscape.blockedReason, "install_handoff_blocked", "Path escape is reported as delegated install handoff block");
}

async function verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive(): Promise<void> {
  section("4. Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-install-handoff.ts").text();
  assert(!source.includes("fetch("), "Metadata-bound install handoff contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Metadata-bound install handoff contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Metadata-bound install handoff contains no catalog write path");
  assert(source.includes("createPluginPackageMarketplaceInstallUpdateHandoff"), "Metadata-bound install handoff delegates to existing install/update handoff helper");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 253 Verification (Metadata-Bound Marketplace Install Handoff)\n");

  await verifyReadyMetadataCreatesBoundedInstallHandoff();
  await verifyMissingOrRejectedMetadataBlocksHandoff();
  await verifyMismatchAndUnsafePathsStayClosed();
  await verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 253 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 253: metadata-bound marketplace install handoff is GREEN.");
}

run().catch((error) => {
  console.error("Phase 253 verification crashed:", error);
  process.exit(1);
});
