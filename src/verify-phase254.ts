/**
 * Phase 254 Verification Script - Metadata-Bound Marketplace Install Handoff Execution
 *
 * Proves a Phase 253 metadata-bound marketplace install/update handoff must be
 * ready before approved install/update execution can delegate to the existing
 * injected executor helper.
 *
 * Run: bun run src/verify-phase254.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildPluginPackageRegistryFetchApprovalRequest,
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
    packageName: "@colony/plugin-phase254",
    packageVersion: "24.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase254.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase254-plugin",
        sidecarId: "phase254-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase254-sidecar",
        expectedServerVersion: "24.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase254-entry",
    displayName: "Phase 254 Metadata-Bound Execution Tools",
    summary: "Safe local MCP metadata-bound install execution fixture.",
    tags: ["mcp", "registry", "install", "execution"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase254",
    packageVersion: "24.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase254.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    registryUrl: "https://registry.example.com/plugins/phase254",
    fetchedAt: "2026-05-14T08:30:00.000Z",
    integrity: "sha256-cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    signatures: [
      {
        keyId: "phase254-key",
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
  registryUrl = "https://registry.example.com/plugins/phase254",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase254",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T08:31:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase254 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
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

function registryExecutor(options: { status?: number } = {}): PluginPackageRegistryFetchExecutor {
  return () => ({
    status: options.status ?? 200,
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
    reason: "install metadata-bound handoff SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

function installExecutor(code = 0): {
  calls: Parameters<PluginPackageInstallUpdateExecutor>[0][];
  run: PluginPackageInstallUpdateExecutor;
} {
  const calls: Parameters<PluginPackageInstallUpdateExecutor>[0][] = [];
  return {
    calls,
    run: async (request) => {
      calls.push(request);
      return {
        code,
        stdout: "installed SHOULD_NOT_LEAK_TOKEN",
        stderr: code === 0 ? "" : "failure SHOULD_NOT_LEAK_SECRET",
      };
    },
  };
}

async function readyFixture(root: string): Promise<{
  action: PluginPackagePlanActionRecord;
  candidate: PluginPackageMarketplaceCatalogEntry;
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff;
}> {
  const candidate = entry();
  const registryHandoff = readyRegistryHandoff(candidate);
  const registryReceipt = await executeApprovedPluginPackageRegistryFetch({
    handoff: registryHandoff.registryFetchHandoff,
    approval: registryApproval(registryHandoff),
    executor: registryExecutor(),
    timestamp: "2026-05-14T08:32:00.000Z",
  });
  const metadataPlanningView = createPluginPackageMarketplaceRegistryFetchMetadataPlanning({
    catalogId: "catalog-phase254",
    entries: [candidate],
    handoffs: [registryHandoff],
    receipts: [registryReceipt],
    registryMetadata: {
      "@colony/plugin-phase254@24.0.0": metadata(),
    },
    timestamp: "2026-05-14T08:33:00.000Z",
  });
  const action = planPluginPackageManifest(candidate.manifest).actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase254 fixture did not create an import action");
  }
  const handoff = createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
    catalogId: "catalog-phase254",
    entries: [candidate],
    metadataPlanningView,
    entryId: candidate.entryId,
    approvalSignature: action.signature,
    packageRoot: root,
    packagePath: join(root, "phase254-plugin"),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T08:34:00.000Z",
  });
  return { action, candidate, handoff };
}

async function verifyReadyMetadataBoundHandoffExecutesThroughInjectedExecutor(): Promise<void> {
  section("1. Ready Metadata-Bound Handoff Delegates Through Existing Install/Update Helper");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-exec-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = installExecutor();
    const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase254-plugin"),
      executor: fake.run,
      timestamp: "2026-05-14T08:35:00.000Z",
    });

    assertEqual(receipt.recordType, "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff_execution_receipt", "Execution receipt uses metadata-bound record type");
    assertEqual(receipt.status, "completed", "Ready metadata-bound handoff execution completes");
    assertEqual(receipt.metadataGate.state, "metadata_ready", "Metadata-ready gate is preserved");
    assertEqual(receipt.metadataGate.registryMetadataApplied, true, "Metadata applied truth is preserved");
    assertEqual(receipt.metadataGate.registryMetadataVerified, true, "Metadata verified truth is preserved");
    assertEqual(receipt.hostActionExecuted, true, "Receipt records host action execution");
    assertEqual(receipt.handoffExecutionReceipt.present, true, "Nested handoff execution receipt is summarized");
    assertEqual(receipt.handoffExecutionReceipt.status, "completed", "Nested handoff execution completed");
    assertEqual(fake.calls.length, 1, "Executor is called exactly once");
    assertEqual(fake.calls[0]?.signature, action.signature, "Executor receives exact trust signature");
    assertEqual(receipt.networkFetched, false, "Execution fetches no registry");
    assertEqual(receipt.packageInstalled, true, "Completed execution marks approved install/update as performed");
    assertEqual(receipt.packageExecuted, false, "Execution performs no package-code execution");
    assertEqual(receipt.activation, false, "Execution performs no sidecar activation");
    assertEqual(receipt.sidecarStarted, false, "Execution starts no sidecar");
    assertEqual(receipt.catalogMutated, false, "Execution mutates no catalog");
    assertEqual(receipt.credentialsPersisted, false, "Execution persists no credentials");
    assert(!JSON.stringify(receipt).includes("plugins.example.com"), "Execution receipt redacts package source URLs");
    assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Execution receipt redacts approvals, signatures, and executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyBlockedMetadataBoundHandoffDoesNotExecute(): Promise<void> {
  section("2. Blocked Metadata-Bound Handoff Does Not Execute");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-block-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = installExecutor();
    const blocked = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff: {
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
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase254-plugin"),
      executor: fake.run,
    });

    assertEqual(blocked.status, "blocked", "Blocked metadata-bound handoff returns blocked execution receipt");
    assertEqual(blocked.blockedReason, "metadata_bound_handoff_not_ready", "Blocked metadata-bound reason is explicit");
    assertEqual(blocked.hostActionExecuted, false, "Blocked metadata-bound handoff executes no host action");
    assertEqual(fake.calls.length, 0, "Blocked metadata-bound handoff does not call executor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyNestedTamperAndApprovalMismatchStayClosed(): Promise<void> {
  section("3. Nested Handoff Tamper And Approval Mismatch Stay Closed");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-tamper-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = installExecutor();
    const tampered = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
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
      packagePath: join(root, "phase254-plugin"),
      executor: fake.run,
    });

    assertEqual(tampered.status, "blocked", "Tampered nested handoff blocks before executor");
    assertEqual(tampered.blockedReason, "install_update_handoff_not_ready", "Nested handoff tamper reason is explicit");
    assertEqual(fake.calls.length, 0, "Tampered nested handoff does not call executor");

    const wrongApproval = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff,
      action,
      approval: installApproval(action, { signature: "mcp-plugin:111111111111111111111111" }),
      packageRoot: root,
      packagePath: join(root, "phase254-plugin"),
      executor: fake.run,
    });

    assertEqual(wrongApproval.status, "blocked", "Wrong approval blocks before executor");
    assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
    assertEqual(fake.calls.length, 0, "Wrong approval does not call executor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyDelegateFailureIsSummarizedAndStops(): Promise<void> {
  section("4. Delegated Failure Is Summarized And Stops");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-metadata-bound-failure-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = installExecutor(7);
    const failedReceipt = await executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff({
      handoff: {
        ...handoff,
        installUpdateHandoff: {
          ...handoff.installUpdateHandoff,
          commands: [
            { executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] },
            { executable: "npm", arguments: ["ci", "--ignore-scripts"] },
          ],
        },
      },
      action,
      approval: installApproval(action),
      packageRoot: root,
      packagePath: join(root, "phase254-plugin"),
      executor: fake.run,
    });

    assertEqual(failedReceipt.status, "failed", "Executor failure returns failed metadata-bound receipt");
    assertEqual(failedReceipt.blockedReason, "install_update_failed", "Executor failure reason is explicit");
    assertEqual(failedReceipt.hostActionExecuted, true, "Failed executor call records attempted host execution");
    assertEqual(failedReceipt.handoffExecutionReceipt.present, true, "Failed nested execution is summarized");
    assertEqual(failedReceipt.handoffExecutionReceipt.status, "failed", "Failed nested execution status is preserved");
    assertEqual(fake.calls.length, 1, "Executor is not called after first failed command");
    assert(!JSON.stringify(failedReceipt).includes("SHOULD_NOT_LEAK"), "Failed execution receipt redacts executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive(): Promise<void> {
  section("5. Metadata-Bound Handoff Execution Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-install-handoff-execution.ts").text();
  assert(!source.includes("fetch("), "Metadata-bound handoff execution runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Metadata-bound handoff execution runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Metadata-bound handoff execution runtime contains no catalog write path");
  assert(source.includes("executeApprovedPluginPackageMarketplaceInstallUpdateHandoff"), "Metadata-bound handoff execution delegates to existing marketplace install/update execution helper");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 254 Verification (Metadata-Bound Marketplace Install Handoff Execution)\n");

  await verifyReadyMetadataBoundHandoffExecutesThroughInjectedExecutor();
  await verifyBlockedMetadataBoundHandoffDoesNotExecute();
  await verifyNestedTamperAndApprovalMismatchStayClosed();
  await verifyDelegateFailureIsSummarizedAndStops();
  await verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 254 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 254: metadata-bound marketplace install handoff execution is GREEN.");
}

run().catch((error) => {
  console.error("Phase 254 verification crashed:", error);
  process.exit(1);
});
