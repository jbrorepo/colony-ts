/**
 * Phase 256 Verification Script - Metadata-Bound Marketplace Activation Readiness
 *
 * Proves metadata-bound marketplace install/update execution status can be
 * projected into activation readiness without fetching registries, installing
 * packages, executing package code, activating sidecars, starting sidecars,
 * mutating catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase256.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceMetadataBoundActivationReadiness,
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
    packageName: "@colony/plugin-phase256",
    packageVersion: "26.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase256.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase256-plugin",
        sidecarId: "phase256-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase256-sidecar",
        expectedServerVersion: "26.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase256-entry",
    displayName: "Phase 256 Metadata-Bound Activation Tools",
    summary: "Safe local MCP metadata-bound activation readiness fixture.",
    tags: ["mcp", "registry", "activation", "readiness"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase256",
    packageVersion: "26.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase256.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    registryUrl: "https://registry.example.com/plugins/phase256",
    fetchedAt: "2026-05-14T09:00:00.000Z",
    integrity: "sha256-abababababababababababababababababababababababababababababababab",
    signatures: [
      {
        keyId: "phase256-key",
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
  registryUrl = "https://registry.example.com/plugins/phase256",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase256",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T09:01:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase256 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
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
    reason: "install metadata-bound activation SHOULD_NOT_LEAK_TOKEN",
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
    timestamp: "2026-05-14T09:02:00.000Z",
  });
  const metadataPlanningView = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase256",
    entries: [candidate],
    handoffs: [registryHandoff],
    receipts: [registryReceipt],
    registryMetadata: {
      "@colony/plugin-phase256@26.0.0": metadata(),
    },
    timestamp: "2026-05-14T09:03:00.000Z",
  });
  const action = planPluginPackageManifest(candidate.manifest).actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase256 fixture did not create an import action");
  }
  const handoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase256",
    entries: [candidate],
    metadataPlanningView,
    entryId: candidate.entryId,
    approvalSignature: action.signature,
    packageRoot: root,
    packagePath: join(root, "phase256-plugin"),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T09:04:00.000Z",
  });
  return { action, handoff };
}

async function verifyCompletedInstallNeedsActivationApproval(): Promise<void> {
  section("1. Completed Metadata-Bound Install Requires Activation Approval");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase256-plugin"),
      executor: installExecutor(),
      timestamp: "2026-05-14T09:05:00.000Z",
    });
    const installStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase256",
      handoffs: [handoff],
      receipts: [receipt],
      timestamp: "2026-05-14T09:06:00.000Z",
    });
    const readiness = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: installStatus,
      handoffs: [handoff],
      timestamp: "2026-05-14T09:07:00.000Z",
    });

    const item = readiness.entries[0];
    assertEqual(readiness.recordType, "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view", "Readiness view uses metadata-bound activation record type");
    assertEqual(readiness.summary.needsActivationApproval, 1, "Completed install increments activation-approval summary");
    assertEqual(readiness.networkFetched, false, "Readiness view fetches no registry");
    assertEqual(readiness.packageInstalled, false, "Readiness view performs no package install");
    assertEqual(readiness.packageExecuted, false, "Readiness view performs no package-code execution");
    assertEqual(readiness.activation, false, "Readiness view performs no activation");
    assertEqual(readiness.sidecarStarted, false, "Readiness view starts no sidecar");
    assertEqual(readiness.catalogMutated, false, "Readiness view mutates no catalog");
    assertEqual(readiness.credentialsPersisted, false, "Readiness view persists no credentials");
    assertEqual(item?.state, "needs_activation_approval", "Completed install without activation approval needs approval");
    assertEqual(item?.signature, action.signature, "Safe sidecar signature is preserved for operator correlation");
    assertEqual(item?.installExecution.state, "completed", "Install execution state is visible");
    assertEqual(item?.activationApproval.present, false, "Activation approval is absent");
    assertEqual(item?.nextAction, "collect_activation_approval", "Next action collects activation approval");
    assert(!JSON.stringify(readiness).includes("plugins.example.com"), "Readiness view redacts package source URLs");
    assert(!JSON.stringify(readiness).includes("SHOULD_NOT_LEAK"), "Readiness view redacts approvals and executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyApprovalAndActiveStates(): Promise<void> {
  section("2. Activation Approval And Active States Are Read-Only");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-approved-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase256-plugin"),
      executor: installExecutor(),
    });
    const installStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase256",
      handoffs: [handoff],
      receipts: [receipt],
    });

    const approved = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: installStatus,
      handoffs: [handoff],
      approvedActivationSignatures: [action.signature ?? ""],
    });
    assertEqual(approved.entries[0]?.state, "ready_for_activation_handoff", "Activation approval makes completed install ready for handoff");
    assertEqual(approved.entries[0]?.activationApproval.present, true, "Approval presence is visible");
    assertEqual(approved.entries[0]?.nextAction, "create_activation_handoff", "Ready state suggests handoff creation");

    const active = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: installStatus,
      handoffs: [handoff],
      approvedActivationSignatures: [action.signature ?? ""],
      activeSidecarSignatures: [action.signature ?? ""],
    });
    assertEqual(active.entries[0]?.state, "active", "Active sidecar signature overrides ready-for-handoff state");
    assertEqual(active.entries[0]?.active.present, true, "Active presence is visible");
    assertEqual(active.entries[0]?.activation, false, "Active state is still inspection-only");
    assertEqual(active.entries[0]?.sidecarStarted, false, "Active state starts no sidecar");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyInstallPrerequisiteStates(): Promise<void> {
  section("3. Install Prerequisite States Are Deterministic");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-states-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const notExecutedStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase256",
      handoffs: [handoff],
      receipts: [],
    });
    const notExecuted = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: notExecutedStatus,
      handoffs: [handoff],
    });
    assertEqual(notExecuted.entries[0]?.state, "install_not_executed", "Missing install receipt blocks activation readiness");
    assertEqual(notExecuted.entries[0]?.nextAction, "run_metadata_bound_install_update", "Missing install suggests running metadata-bound install");

    const failedReceipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase256-plugin"),
      executor: installExecutor(9),
    });
    const failedStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase256",
      handoffs: [handoff],
      receipts: [failedReceipt],
    });
    const failedReadiness = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: failedStatus,
      handoffs: [handoff],
    });
    assertEqual(failedReadiness.entries[0]?.state, "install_failed", "Failed install receipt blocks activation readiness");
    assertEqual(failedReadiness.entries[0]?.blockedReason, "install_update_failed", "Failed install reason is projected");

    const metadataBlockedStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase256",
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
    const metadataBlocked = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: metadataBlockedStatus,
      handoffs: [handoff],
    });
    assertEqual(metadataBlocked.entries[0]?.state, "metadata_blocked", "Metadata-blocked install status blocks activation readiness");
    assertEqual(metadataBlocked.entries[0]?.nextAction, "resolve_metadata_gate", "Metadata-blocked state suggests resolving metadata");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyUnsafeInputsAndRuntime(): Promise<void> {
  section("4. Unsafe Input And Runtime Mutation Primitives Are Blocked");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-unsafe-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase256-plugin"),
      executor: installExecutor(),
    });
    const installStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase256",
      handoffs: [handoff],
      receipts: [receipt],
    });
    const readiness = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: installStatus,
      handoffs: [
        {
          ...handoff,
          installUpdateHandoff: {
            ...handoff.installUpdateHandoff,
            approval: {
              ...handoff.installUpdateHandoff.approval,
              signature: "token-SHOULD_NOT_LEAK",
            },
          },
        },
      ],
      approvedActivationSignatures: ["token-SHOULD_NOT_LEAK"],
      activeSidecarSignatures: ["token-SHOULD_NOT_LEAK"],
    });

    assertEqual(readiness.entries[0]?.state, "install_blocked", "Unsafe or missing matching signature blocks activation readiness");
    assertEqual(readiness.entries[0]?.signature, "<redacted>", "Unsafe signature is redacted");
    assert(!JSON.stringify(readiness).includes("SHOULD_NOT_LEAK"), "Unsafe signatures are not echoed");

    const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-activation-readiness.ts").text();
    assert(!source.includes("fetch("), "Readiness runtime contains no direct network fetch");
    assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Readiness runtime contains no process spawn");
    assert(!source.includes("writeFile") && !source.includes("appendFile"), "Readiness runtime contains no catalog write path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 256 Verification (Metadata-Bound Marketplace Activation Readiness)\n");

  await verifyCompletedInstallNeedsActivationApproval();
  await verifyApprovalAndActiveStates();
  await verifyInstallPrerequisiteStates();
  await verifyUnsafeInputsAndRuntime();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 256 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 256: metadata-bound marketplace activation readiness is GREEN.");
}

run().catch((error) => {
  console.error("Phase 256 verification crashed:", error);
  process.exit(1);
});
