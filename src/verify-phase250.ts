/**
 * Phase 250 Verification Script - Marketplace Registry Fetch Execution Status
 *
 * Proves marketplace registry fetch handoff descriptors can be projected into
 * a read-only operator execution status view from supplied registry-fetch
 * receipts without fetching registries, installing packages, executing package
 * code, activating sidecars, starting sidecars, mutating catalogs, or
 * persisting credentials.
 *
 * Run: bun run src/verify-phase250.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceRegistryFetchExecutionStatus,
  createPluginPackageMarketplaceRegistryFetchHandoff,
  executeApprovedPluginPackageRegistryFetch,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
  type PluginPackageMarketplaceRegistryFetchHandoff,
  type PluginPackageRegistryFetchExecutionReceipt,
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
    packageName: "@colony/plugin-phase250",
    packageVersion: "20.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase250.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase250-plugin",
        sidecarId: "phase250-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase250-sidecar",
        expectedServerVersion: "20.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase250-entry",
    displayName: "Phase 250 Registry Tools",
    summary: "Safe local MCP registry metadata execution-status fixture for marketplace entries.",
    tags: ["mcp", "registry", "status"],
    manifest: manifest(),
    featured: true,
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
  registryUrl = "https://registry.example.com/plugins/phase250",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const signature = registrySignature(candidate, registryUrl);
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase250",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: signature,
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T07:30:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase250 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
  }
  return handoff;
}

async function receiptFor(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  status = 200,
  timestamp = "2026-05-14T07:31:00.000Z",
): Promise<PluginPackageRegistryFetchExecutionReceipt> {
  const bodyText = JSON.stringify({
    packageName: handoff.package.name,
    packageVersion: handoff.package.version,
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    registryUrl: handoff.hostAction.registryUrl,
    fetchedAt: "2026-05-14T07:30:30.000Z",
    signatures: [
      {
        keyId: "phase250-key",
        algorithm: "ed25519",
        signature: "SHOULD_NOT_LEAK_SIGNATURE_MATERIAL",
      },
    ],
  });
  return await executeApprovedPluginPackageRegistryFetch({
    handoff: handoff.registryFetchHandoff,
    approval: { approved: true, signature: handoff.approval.signature },
    executor: async () => ({
      status,
      headers: { "content-type": "application/json" },
      bodyText,
    }),
    timestamp,
  });
}

async function verifyCompletedReceiptStatus(): Promise<void> {
  section("1. Completed Registry Fetch Receipt Projects Read-Only Status");

  const handoff = readyHandoff();
  const receipt = await receiptFor(handoff);
  const status = createPluginPackageMarketplaceRegistryFetchExecutionStatus({
    handoffs: [handoff],
    receipts: [receipt],
    timestamp: "2026-05-14T07:32:00.000Z",
  });
  const entryStatus = status.entries[0];

  assertEqual(status.recordType, "mcp_plugin_package_marketplace_registry_fetch_execution_status_view", "Status view uses registry fetch execution status record type");
  assertEqual(status.networkFetched, false, "Status view itself fetches no registry");
  assertEqual(status.packageInstalled, false, "Status view performs no package install");
  assertEqual(status.packageExecuted, false, "Status view performs no package-code execution");
  assertEqual(status.activation, false, "Status view performs no activation");
  assertEqual(status.sidecarStarted, false, "Status view starts no sidecar");
  assertEqual(status.catalogMutated, false, "Status view mutates no catalog");
  assertEqual(status.credentialsPersisted, false, "Status view persists no credentials");
  assertEqual(entryStatus?.state, "completed", "Completed receipt renders completed state");
  assertEqual(entryStatus?.receipt.present, true, "Receipt presence is visible");
  assertEqual(entryStatus?.receipt.hostNetworkExecuted, true, "Host network execution truth is visible");
  assertEqual(entryStatus?.receipt.registryFetched, true, "Registry fetched truth is visible from receipt");
  assertEqual(entryStatus?.receipt.statusCode, 200, "HTTP status is visible");
  assert(entryStatus?.receipt.responseBytes !== undefined && entryStatus.receipt.responseBytes > 0, "Response byte count is visible without body text");
  assert(entryStatus?.nextActions.some((actionText) => actionText.includes("Inspect fetched registry metadata")) === true, "Completed status suggests inspection instead of execution");
  assert(!JSON.stringify(status).includes("plugins.example.com"), "Status view redacts package source URLs");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Status view redacts approval and registry signature material");
}

async function verifyFailedBlockedAndNotExecutedStates(): Promise<void> {
  section("2. Failed, Blocked, And Not Executed States Are Deterministic");

  const handoff = readyHandoff();
  const failedReceipt = await receiptFor(handoff, 503, "2026-05-14T07:33:00.000Z");
  const failedStatus = createPluginPackageMarketplaceRegistryFetchExecutionStatus({
    handoffs: [handoff],
    receipts: [failedReceipt],
  });
  assertEqual(failedStatus.entries[0]?.state, "failed", "Failed receipt renders failed state");
  assertEqual(failedStatus.entries[0]?.receipt.blockedReason, "http_status_rejected", "Failed reason is projected");

  const blockedHandoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase250",
    entries: [entry()],
    entryId: "phase250-entry",
    registryUrl: "https://registry.example.com/plugins/phase250",
    approvalSignature: "mcp-registry-fetch:000000000000000000000000",
  });
  const blockedStatus = createPluginPackageMarketplaceRegistryFetchExecutionStatus({
    handoffs: [blockedHandoff],
    receipts: [],
  });
  assertEqual(blockedStatus.entries[0]?.state, "blocked", "Blocked handoff renders blocked state");
  assertEqual(blockedStatus.entries[0]?.receipt.present, false, "Blocked handoff does not claim receipt presence");
  assertEqual(blockedStatus.entries[0]?.nextActions[0], "Resolve the blocked registry fetch handoff before retrying host execution.", "Blocked state has bounded next action");

  const notExecuted = createPluginPackageMarketplaceRegistryFetchExecutionStatus({
    handoffs: [handoff],
    receipts: [],
  });
  assertEqual(notExecuted.entries[0]?.state, "not_executed", "Missing receipt renders not executed state");
  assertEqual(notExecuted.entries[0]?.receipt.hostNetworkExecuted, false, "Missing receipt reports no host network execution");
}

async function verifyMismatchedReceiptsAreIgnored(): Promise<void> {
  section("3. Mismatched Or Unsafe Receipts Are Ignored");

  const handoff = readyHandoff();
  const receipt = await receiptFor(handoff);
  const wrongSignature: PluginPackageRegistryFetchExecutionReceipt = {
    ...receipt,
    handoffSignature: "mcp-registry-fetch:000000000000000000000000",
  };
  const unsafeReceipt: PluginPackageRegistryFetchExecutionReceipt = {
    ...receipt,
    package: {
      ...receipt.package,
      name: "SHOULD_NOT_LEAK_SECRET_PACKAGE",
    },
  };
  const status = createPluginPackageMarketplaceRegistryFetchExecutionStatus({
    handoffs: [handoff],
    receipts: [wrongSignature, unsafeReceipt],
  });

  assertEqual(status.entries[0]?.state, "not_executed", "Mismatched/unsafe receipts do not attach to handoff");
  assertEqual(status.entries[0]?.receipt.present, false, "No unsafe receipt is reported as present");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Unsafe receipt content is redacted");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("4. Status Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-registry-fetch-execution-status.ts").text();
  assert(!source.includes("fetch("), "Status runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Status runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Status runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 250 Verification (Marketplace Registry Fetch Execution Status)\n");

  await verifyCompletedReceiptStatus();
  await verifyFailedBlockedAndNotExecutedStates();
  await verifyMismatchedReceiptsAreIgnored();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 250 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 250: marketplace registry fetch execution status is GREEN.");
}

run().catch((error) => {
  console.error("Phase 250 verification crashed:", error);
  process.exit(1);
});
