/**
 * Phase 257 Verification Script - Metadata-Bound Marketplace Activation Handoff
 *
 * Proves metadata-bound activation readiness can produce a redacted operator
 * handoff descriptor only after metadata-bound install/update execution is
 * completed and activation approval is present, without fetching registries,
 * installing packages, executing package code, activating sidecars, starting
 * sidecars, mutating catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase257.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceMetadataBoundActivationHandoff,
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
    packageName: "@colony/plugin-phase257",
    packageVersion: "27.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase257.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase257-plugin",
        sidecarId: "phase257-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase257-sidecar",
        expectedServerVersion: "27.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase257-entry",
    displayName: "Phase 257 Metadata-Bound Activation Handoff Tools",
    summary: "Safe local MCP metadata-bound activation handoff fixture.",
    tags: ["mcp", "registry", "activation", "handoff"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase257",
    packageVersion: "27.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase257.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    registryUrl: "https://registry.example.com/plugins/phase257",
    fetchedAt: "2026-05-14T09:20:00.000Z",
    integrity: "sha256-cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    signatures: [
      {
        keyId: "phase257-key",
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
  registryUrl = "https://registry.example.com/plugins/phase257",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase257",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T09:21:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase257 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
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
    timestamp: "2026-05-14T09:22:00.000Z",
  });
  const metadataPlanningView = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase257",
    entries: [candidate],
    handoffs: [registryHandoff],
    receipts: [registryReceipt],
    registryMetadata: {
      "@colony/plugin-phase257@27.0.0": metadata(),
    },
    timestamp: "2026-05-14T09:23:00.000Z",
  });
  const action = planPluginPackageManifest(candidate.manifest).actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase257 fixture did not create an import action");
  }
  const handoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase257",
    entries: [candidate],
    metadataPlanningView,
    entryId: candidate.entryId,
    approvalSignature: action.signature,
    packageRoot: root,
    packagePath: join(root, "phase257-plugin"),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T09:24:00.000Z",
  });
  return { action, handoff };
}

async function readyReadiness(root: string, active = false) {
  const { action, handoff } = await readyFixture(root);
  const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    handoff,
    action,
    approval: installApproval(action),
    packageRoot: root,
    packagePath: join(root, "phase257-plugin"),
    executor: installExecutor(),
    timestamp: "2026-05-14T09:25:00.000Z",
  });
  const installStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
    catalogId: "catalog-phase257",
    handoffs: [handoff],
    receipts: [receipt],
    timestamp: "2026-05-14T09:26:00.000Z",
  });
  const signature = action.signature ?? "";
  const readiness = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
    installExecutionStatusView: installStatus,
    handoffs: [handoff],
    approvedActivationSignatures: [signature],
    activeSidecarSignatures: active ? [signature] : [],
    timestamp: "2026-05-14T09:27:00.000Z",
  });
  return { action, handoff, readiness };
}

async function verifyReadyHandoffIsMetadataBoundAndNonExecuting(): Promise<void> {
  section("1. Ready Metadata-Bound Handoff Is Approval-Bound And Non-Executing");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-handoff-root-"));
  try {
    const { action, readiness } = await readyReadiness(root);
    const handoff = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
      readinessView: readiness,
      entryId: "phase257-entry",
      sidecarSignature: action.signature ?? "",
      approvalSignature: action.signature ?? "",
      approvedBy: "operator-token-SHOULD_NOT_LEAK",
      timestamp: "2026-05-14T09:28:00.000Z",
    });

    assertEqual(handoff.recordType, "mcp_plugin_package_marketplace_metadata_bound_activation_handoff", "Handoff uses metadata-bound activation handoff record type");
    assertEqual(handoff.status, "ready", "Ready readiness and matching approval produce ready handoff");
    assertEqual(handoff.hostActionRequired, true, "Ready handoff requires host action");
    assertEqual(handoff.requiresInjectedSupervisor, true, "Ready handoff requires injected supervisor");
    assertEqual(handoff.metadataBoundInstallRequired, true, "Metadata-bound install/update completion remains required");
    assertEqual(handoff.activation, false, "Handoff performs no activation");
    assertEqual(handoff.sidecarStarted, false, "Handoff starts no sidecar");
    assertEqual(handoff.networkFetched, false, "Handoff fetches no registry");
    assertEqual(handoff.packageInstalled, false, "Handoff installs no package");
    assertEqual(handoff.packageExecuted, false, "Handoff executes no package code");
    assertEqual(handoff.catalogMutated, false, "Handoff mutates no catalog");
    assertEqual(handoff.credentialsPersisted, false, "Handoff persists no credentials");
    assertEqual(handoff.installExecution.state, "completed", "Completed metadata-bound install state is summarized");
    assertEqual(handoff.installExecution.metadataGate.state, "metadata_ready", "Metadata gate state is preserved");
    assertEqual(handoff.hostAction.kind, "start_metadata_bound_plugin_package_sidecar", "Host action names metadata-bound sidecar start");
    assertEqual(handoff.hostAction.supervisorPath, "executeApprovedPluginPackageMarketplaceActivationHandoff", "Host action points to injected supervisor execution path");
    assertEqual(handoff.hostAction.metadataBoundActivationReadinessRecordType, "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view", "Host action binds readiness record type");
    assertEqual(handoff.hostAction.approvalSignature, action.signature, "Host action binds exact approval signature");
    assertEqual(handoff.package.source, "<redacted>", "Package source is redacted");
    assert(!JSON.stringify(handoff).includes("plugins.example.com"), "Handoff does not leak package source URLs");
    assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Handoff redacts approvals, metadata, and executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyBlocksUntilReadinessIsReady(): Promise<void> {
  section("2. Handoff Blocks Until Metadata-Bound Readiness Is Ready");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-handoff-block-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const missingInstallStatus = createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus({
      catalogId: "catalog-phase257",
      handoffs: [handoff],
      receipts: [],
      timestamp: "2026-05-14T09:29:00.000Z",
    });
    const needsInstall = createPluginPackageMarketplaceMetadataBoundActivationReadiness({
      installExecutionStatusView: missingInstallStatus,
      handoffs: [handoff],
      approvedActivationSignatures: [action.signature ?? ""],
      timestamp: "2026-05-14T09:30:00.000Z",
    });
    const missingInstall = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
      readinessView: needsInstall,
      entryId: "phase257-entry",
      sidecarSignature: action.signature ?? "",
      approvalSignature: action.signature ?? "",
    });
    assertEqual(missingInstall.status, "blocked", "Missing metadata-bound install execution blocks handoff");
    assertEqual(missingInstall.blockedReason, "readiness_not_ready", "Missing install reason is readiness-not-ready");
    assertEqual(missingInstall.hostActionRequired, false, "Blocked handoff has no host action");

    const { readiness } = await readyReadiness(root);
    const wrongApproval = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
      readinessView: readiness,
      entryId: "phase257-entry",
      sidecarSignature: action.signature ?? "",
      approvalSignature: "mcp-plugin:000000000000000000000000",
    });
    assertEqual(wrongApproval.status, "blocked", "Wrong activation approval blocks handoff");
    assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");

    const missingEntry = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
      readinessView: readiness,
      entryId: "missing-entry",
      sidecarSignature: action.signature ?? "",
      approvalSignature: action.signature ?? "",
    });
    assertEqual(missingEntry.status, "blocked", "Missing readiness entry blocks handoff");
    assertEqual(missingEntry.blockedReason, "entry_not_found", "Missing entry reason is explicit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyActiveAndUnsafeInputsBlock(): Promise<void> {
  section("3. Active And Unsafe Input Blocks Are Bounded");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-activation-handoff-unsafe-root-"));
  try {
    const { action, readiness: activeReadiness } = await readyReadiness(root, true);
    const active = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
      readinessView: activeReadiness,
      entryId: "phase257-entry",
      sidecarSignature: action.signature ?? "",
      approvalSignature: action.signature ?? "",
    });
    assertEqual(active.status, "blocked", "Already-active sidecar blocks duplicate handoff");
    assertEqual(active.blockedReason, "already_active", "Already-active reason is explicit");

    const unsafe = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
      readinessView: activeReadiness,
      entryId: "phase257-entry\nSHOULD_NOT_LEAK",
      sidecarSignature: "secret-SHOULD_NOT_LEAK",
      approvalSignature: "secret-SHOULD_NOT_LEAK",
      approvedBy: "operator-token-SHOULD_NOT_LEAK",
    });
    assertEqual(unsafe.status, "blocked", "Unsafe selector blocks handoff");
    assertEqual(unsafe.blockedReason, "invalid_selector", "Unsafe selector reason is explicit");
    assert(!JSON.stringify(unsafe).includes("SHOULD_NOT_LEAK"), "Unsafe selector input is not echoed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyRuntimeHasNoExecutionPrimitive(): Promise<void> {
  section("4. Handoff Runtime Contains No Execution Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-activation-handoff.ts").text();
  assert(!source.includes("fetch("), "Handoff runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 257 Verification (Metadata-Bound Marketplace Activation Handoff)\n");

  await verifyReadyHandoffIsMetadataBoundAndNonExecuting();
  await verifyBlocksUntilReadinessIsReady();
  await verifyActiveAndUnsafeInputsBlock();
  await verifyRuntimeHasNoExecutionPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 257 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 257: metadata-bound marketplace activation handoff is GREEN.");
}

run().catch((error) => {
  console.error("Phase 257 verification crashed:", error);
  process.exit(1);
});
