/**
 * Phase 255 Verification Script - Metadata-Bound Marketplace Install Execution Status
 *
 * Proves Phase 253 metadata-bound marketplace install/update handoffs can be
 * projected against Phase 254 execution receipts without fetching registries,
 * installing packages, executing package code, activating sidecars, starting
 * sidecars, mutating catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase255.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus,
  createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  createPluginPackageMarketplaceRegistryFetchHandoff,
  createPluginPackageMarketplaceRegistryFetchMetadataPlanning,
  executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  executeApprovedPluginPackageRegistryFetch,
  planPluginPackageManifest,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateExecutor,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
  type PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  type PluginPackageMarketplaceRegistryFetchHandoff,
  type PluginPackagePlanActionRecord,
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
    packageName: "@colony/plugin-phase255",
    packageVersion: "25.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase255.tgz",
    packageDigest: "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    reviewed: true,
    sidecars: [
      {
        id: "phase255-plugin",
        sidecarId: "phase255-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase255-sidecar",
        expectedServerVersion: "25.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase255-entry",
    displayName: "Phase 255 Metadata-Bound Status Tools",
    summary: "Safe local MCP metadata-bound execution status fixture.",
    tags: ["mcp", "registry", "install", "status"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase255",
    packageVersion: "25.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase255.tgz",
    packageDigest: "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    registryUrl: "https://registry.example.com/plugins/phase255",
    fetchedAt: "2026-05-14T08:50:00.000Z",
    integrity: "sha256-efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    signatures: [
      {
        keyId: "phase255-key",
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
  registryUrl = "https://registry.example.com/plugins/phase255",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase255",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T08:51:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase255 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
  }
  return handoff;
}

function registryApproval(
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

function registryExecutor(): PluginPackageRegistryFetchExecutor {
  return () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    bodyText: JSON.stringify(metadata()),
  });
}

function installApproval(
  action: PluginPackagePlanActionRecord,
  overrides: Partial<PluginPackageInstallUpdateApproval> = {},
): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "install metadata-bound status SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

function installExecutor(code = 0): PluginPackageInstallUpdateExecutor {
  return async () => ({
    code,
    stdout: "installed SHOULD_NOT_LEAK_TOKEN",
    stderr: code === 0 ? "" : "failure SHOULD_NOT_LEAK_SECRET",
  });
}

async function readyFixture(root: string): Promise<{
  action: PluginPackagePlanActionRecord;
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff;
}> {
  const candidate = entry();
  const registryHandoff = readyRegistryHandoff(candidate);
  const registryReceipt = await executeApprovedPluginPackageRegistryFetch({
    handoff: registryHandoff.registryFetchHandoff,
    approval: registryApproval(registryHandoff),
    executor: registryExecutor(),
    timestamp: "2026-05-14T08:52:00.000Z",
  });
  const metadataPlanningView = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase255",
    entries: [candidate],
    handoffs: [registryHandoff],
    receipts: [registryReceipt],
    registryMetadata: {
      "@colony/plugin-phase255@25.0.0": metadata(),
    },
    timestamp: "2026-05-14T08:53:00.000Z",
  });
  const action = planPluginPackageManifest(candidate.manifest).actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase255 fixture did not create an import action");
  }
  const handoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase255",
    entries: [candidate],
    metadataPlanningView,
    entryId: candidate.entryId,
    approvalSignature: action.signature,
    packageRoot: root,
    packagePath: join(root, "phase255-plugin"),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T08:54:00.000Z",
  });
  return { action, handoff };
}

async function verifyCompletedReceiptStatus(): Promise<void> {
  section("1. Completed Metadata-Bound Receipt Projects Read-Only Status");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-status-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase255-plugin"),
      executor: installExecutor(),
      timestamp: "2026-05-14T08:55:00.000Z",
    });
    const status = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase255",
      handoffs: [handoff],
      receipts: [receipt],
      timestamp: "2026-05-14T08:56:00.000Z",
    });

    const entryStatus = status.entries[0];
    assertEqual(status.recordType, "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view", "Status view uses metadata-bound execution status record type");
    assertEqual(status.summary.completed, 1, "Completed summary increments");
    assertEqual(status.networkFetched, false, "Status view fetches no registry");
    assertEqual(status.packageInstalled, false, "Status view performs no package install");
    assertEqual(status.packageExecuted, false, "Status view performs no package-code execution");
    assertEqual(status.activation, false, "Status view performs no activation");
    assertEqual(status.sidecarStarted, false, "Status view starts no sidecar");
    assertEqual(status.catalogMutated, false, "Status view mutates no catalog");
    assertEqual(status.credentialsPersisted, false, "Status view persists no credentials");
    assertEqual(entryStatus?.state, "completed", "Completed receipt renders completed state");
    assertEqual(entryStatus?.metadataGate.state, "metadata_ready", "Metadata-ready gate is visible");
    assertEqual(entryStatus?.receipt.present, true, "Receipt presence is visible");
    assertEqual(entryStatus?.receipt.hostActionExecuted, true, "Host execution truth is visible");
    assertEqual(entryStatus?.receipt.packageInstalled, true, "Receipt package-installed truth is visible");
    assertEqual(entryStatus?.nextAction, "verify_installed_package", "Completed status suggests install verification");
    assert(!JSON.stringify(status).includes("plugins.example.com"), "Status view redacts package source URLs");
    assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Status view redacts approvals and executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyMetadataBlockedFailedAndNotExecutedStates(): Promise<void> {
  section("2. Metadata-Blocked, Failed, Blocked, And Not Executed States Are Deterministic");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-status-state-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const notExecuted = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase255",
      handoffs: [handoff],
      receipts: [],
    });
    assertEqual(notExecuted.entries[0]?.state, "not_executed", "Missing receipt renders not executed state");
    assertEqual(notExecuted.entries[0]?.nextAction, "run_approved_metadata_bound_install_update_handoff", "Not-executed state suggests approved handoff execution");

    const failedReceipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase255-plugin"),
      executor: installExecutor(7),
    });
    const failedStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase255",
      handoffs: [handoff],
      receipts: [failedReceipt],
    });
    assertEqual(failedStatus.entries[0]?.state, "failed", "Failed metadata-bound receipt renders failed state");
    assertEqual(failedStatus.entries[0]?.receipt.blockedReason, "install_update_failed", "Failed reason is projected");

    const blockedReceipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff: {
        ...handoff,
        installUpdateHandoff: {
          ...handoff.installUpdateHandoff,
          status: "blocked",
          blockedReason: "package_path_escape",
        },
      },
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase255-plugin"),
      executor: installExecutor(),
    });
    const blockedReceiptStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase255",
      handoffs: [handoff],
      receipts: [blockedReceipt],
    });
    assertEqual(blockedReceiptStatus.entries[0]?.state, "blocked", "Blocked receipt renders blocked state");
    assertEqual(blockedReceiptStatus.entries[0]?.nextAction, "inspect_blocked_receipt", "Blocked receipt suggests inspection");

    const metadataBlocked = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase255",
      handoffs: [
        {
          ...handoff,
          status: "blocked",
          blockedReason: "metadata_not_ready",
          metadataGate: {
            ...handoff.metadataGate,
            state: "metadata_missing" as any,
            registryMetadataApplied: false,
            registryMetadataVerified: false,
          },
        },
      ],
      receipts: [failedReceipt],
    });
    assertEqual(metadataBlocked.entries[0]?.state, "metadata_blocked", "Blocked metadata gate wins before receipt matching");
    assertEqual(metadataBlocked.entries[0]?.receipt.present, false, "Metadata-blocked handoff reports no attached receipt");
    assertEqual(metadataBlocked.entries[0]?.nextAction, "resolve_metadata_gate", "Metadata-blocked state suggests resolving the metadata gate");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyMismatchedReceiptsAreIgnored(): Promise<void> {
  section("3. Mismatched Metadata-Bound Receipts Are Ignored");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-status-mismatch-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase255-plugin"),
      executor: installExecutor(),
    });
    const wrongPackage = {
      ...receipt,
      package: {
        ...receipt.package,
        name: "@colony/plugin-other",
      },
    };
    const unsafeReceipt = {
      ...receipt,
      package: {
        ...receipt.package,
        name: "SHOULD_NOT_LEAK_SECRET_PACKAGE",
      },
    };
    const status = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase255",
      handoffs: [handoff],
      receipts: [wrongPackage, unsafeReceipt],
    });

    assertEqual(status.entries[0]?.state, "not_executed", "Mismatched/unsafe receipts do not attach to handoff");
    assertEqual(status.entries[0]?.receipt.present, false, "No unsafe receipt is reported as present");
    assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Unsafe receipt content is redacted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("4. Status Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-install-execution-status.ts").text();
  assert(!source.includes("fetch("), "Status runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Status runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Status runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 255 Verification (Metadata-Bound Marketplace Install Execution Status)\n");

  await verifyCompletedReceiptStatus();
  await verifyMetadataBlockedFailedAndNotExecutedStates();
  await verifyMismatchedReceiptsAreIgnored();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 255 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 255: metadata-bound marketplace install execution status is GREEN.");
}

run().catch((error) => {
  console.error("Phase 255 verification crashed:", error);
  process.exit(1);
});
