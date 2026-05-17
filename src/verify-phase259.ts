/**
 * Phase 259 Verification Script - Metadata-Bound Activation Execution Status
 *
 * Proves approved metadata-bound marketplace activation execution receipts can
 * be projected into a read-only operator status view without starting sidecars,
 * fetching registries, installing packages, executing package code, mutating
 * catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase259.ts
 */

import {
  createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus,
  createPluginPackageMarketplaceMetadataBoundActivationHandoff,
  executeApprovedPluginPackageInstallUpdate,
  executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff,
  planPluginPackageManifest,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarSupervisorSnapshot,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateReceipt,
  type PluginPackageManifest,
  type PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt,
  type PluginPackageMarketplaceMetadataBoundActivationReadinessView,
  type PluginPackagePlanActionRecord,
  type PluginPackageSidecarActivationSupervisor,
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
    packageName: "@colony/plugin-phase259",
    packageVersion: "29.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase259.tgz",
    packageDigest: "sha256:fefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe",
    reviewed: true,
    sidecars: [
      {
        id: "phase259-plugin",
        sidecarId: "phase259-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase259-sidecar",
        expectedServerVersion: "29.0.0",
      },
    ],
    ...overrides,
  };
}

function importAction(): PluginPackagePlanActionRecord {
  const action = planPluginPackageManifest(manifest()).actions[0];
  if (!action || action.action !== "import" || !action.signature || !action.definition) {
    throw new Error("phase259 fixture did not create an import action");
  }
  return action;
}

function approval(
  action: PluginPackagePlanActionRecord,
  overrides: Partial<PluginPackageInstallUpdateApproval> = {},
): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "metadata-bound activation execution status SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

async function completedInstallReceipt(action: PluginPackagePlanActionRecord): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: approval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase259-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed SHOULD_NOT_LEAK_TOKEN" }),
    timestamp: "2026-05-14T09:46:00.000Z",
  });
}

function readinessView(
  action: PluginPackagePlanActionRecord,
  state: "ready_for_activation_handoff" | "needs_activation_approval" | "active" = "ready_for_activation_handoff",
): PluginPackageMarketplaceMetadataBoundActivationReadinessView {
  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view",
    timestamp: "2026-05-14T09:47:00.000Z",
    catalogId: "catalog-phase259",
    installStatusRecordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view",
    installStatusEntryCount: 1,
    handoffCount: 1,
    entries: [
      {
        entryId: "phase259-entry",
        displayName: "Phase 259 Metadata-Bound Activation Status Tools",
        signature: action.signature ?? "",
        state,
        installExecution: {
          state: "completed",
          receiptPresent: true,
          packageInstalled: true,
          metadataGate: {
            required: true,
            state: "metadata_ready",
            registryMetadataApplied: true,
            registryMetadataVerified: true,
          },
        },
        activationApproval: {
          required: true,
          present: state !== "needs_activation_approval",
        },
        active: {
          present: state === "active",
        },
        nextAction: state === "active" ? "inspect_active_sidecar" : state === "needs_activation_approval" ? "collect_activation_approval" : "create_activation_handoff",
        activation: false,
        sidecarStarted: false,
        package: {
          name: action.package.name,
          version: action.package.version,
          source: "<redacted>",
          digest: action.package.digest,
        },
        sidecar: {
          id: action.sidecar.id,
          kind: action.sidecar.kind,
        },
      },
    ],
    summary: {
      total: 1,
      metadataBlocked: 0,
      installNotExecuted: 0,
      installBlocked: 0,
      installFailed: 0,
      needsActivationApproval: state === "needs_activation_approval" ? 1 : 0,
      readyForActivationHandoff: state === "ready_for_activation_handoff" ? 1 : 0,
      active: state === "active" ? 1 : 0,
    },
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: ["fixture readiness SHOULD_NOT_LEAK_TOKEN"],
  };
}

function supervisor(result: Partial<PluginMcpSidecarSupervisorSnapshot> = {}): PluginPackageSidecarActivationSupervisor {
  return {
    start: async (definition: PluginMcpSidecarDefinition, trustApproval) => ({
      serverId: definition.id,
      signature: trustApproval.signature,
      state: "running",
      package: {
        name: definition.packageName,
        version: definition.packageVersion,
        source: "https://SHOULD_NOT_LEAK_TOKEN@plugins.example.com/package.tgz",
        digest: definition.packageDigest,
      },
      sidecar: {
        id: definition.sidecarId,
        kind: definition.sidecarKind ?? "unknown",
      },
      restartCount: 0,
      lifecycle: {
        state: "connected",
        connectedAt: "2026-05-14T09:48:00.000Z",
        protocolVersion: "SHOULD_NOT_LEAK_PROTOCOL",
        serverInfo: { name: "SHOULD_NOT_LEAK_SERVER", version: "29.0.0" },
        expectations: {},
      },
      ...result,
    }),
  };
}

async function executionFixture(
  startResult: Partial<PluginMcpSidecarSupervisorSnapshot> = {},
): Promise<{
  action: PluginPackagePlanActionRecord;
  installReceipt: PluginPackageInstallUpdateReceipt;
  receipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt;
}> {
  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const handoff = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
    readinessView: readinessView(action),
    entryId: "phase259-entry",
    sidecarSignature: action.signature ?? "",
    approvalSignature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T09:49:00.000Z",
  });
  const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action),
    supervisor: supervisor(startResult),
    timestamp: "2026-05-14T09:50:00.000Z",
  });
  return { action, installReceipt, receipt };
}

async function verifyCompletedReceiptStatus(): Promise<void> {
  section("1. Completed Metadata-Bound Execution Receipt Projects Read-Only Status");

  const { action, receipt } = await executionFixture();
  const status = createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus({
    readinessView: readinessView(action),
    executionReceipts: [receipt],
    timestamp: "2026-05-14T09:51:00.000Z",
  });

  const entry = status.entries[0];
  assertEqual(status.recordType, "mcp_plugin_package_marketplace_metadata_bound_activation_execution_status_view", "Status view uses metadata-bound activation execution status record type");
  assertEqual(status.networkFetched, false, "Status view fetches no registry");
  assertEqual(status.packageInstalled, false, "Status view performs no package install");
  assertEqual(status.packageExecuted, false, "Status view performs no package-code execution");
  assertEqual(status.activation, false, "Status view performs no activation");
  assertEqual(status.sidecarStarted, false, "Status view starts no sidecar");
  assertEqual(status.catalogMutated, false, "Status view mutates no catalog");
  assertEqual(status.credentialsPersisted, false, "Status view persists no credentials");
  assertEqual(entry?.state, "completed", "Completed execution receipt renders completed state");
  assertEqual(entry?.metadataGate.state, "metadata_ready", "Metadata gate state is visible");
  assertEqual(entry?.receipt.present, true, "Receipt presence is visible");
  assertEqual(entry?.receipt.hostActionExecuted, true, "Host action execution truth is visible");
  assertEqual(entry?.receipt.activation, true, "Receipt activation truth is visible without new activation");
  assertEqual(entry?.receipt.sidecarStarted, true, "Receipt sidecar-start truth is visible without starting a sidecar");
  assertEqual(status.summary.completed, 1, "Summary counts completed execution state");
  assert(entry?.nextActions.some((actionText) => actionText.includes("Inspect running sidecar")) === true, "Completed status suggests inspection instead of activation");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Status view redacts package sources, approvals, and lifecycle internals");
  assert(!JSON.stringify(status).includes("plugins.example.com"), "Status view does not leak package source URLs");
}

async function verifyFailureBlockedActiveAndNotExecutedStates(): Promise<void> {
  section("2. Failed, Blocked, Active, And Not Executed States Are Deterministic");

  const { action, receipt: completed } = await executionFixture();
  const failedReceipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt = {
    ...completed,
    timestamp: "2026-05-14T09:52:00.000Z",
    status: "failed",
    blockedReason: "activation_failed",
    hostActionExecuted: true,
    activation: false,
    sidecarStarted: false,
    delegatedActivationReceipt: {
      ...completed.delegatedActivationReceipt,
      status: "failed",
      blockedReason: "activation_failed",
      activation: false,
      sidecarStarted: false,
      supervisorState: "failed",
    },
  };
  const blockedReceipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt = {
    ...completed,
    timestamp: "2026-05-14T09:53:00.000Z",
    status: "blocked",
    blockedReason: "approval_required",
    hostActionExecuted: false,
    activation: false,
    sidecarStarted: false,
  };

  const failedStatus = createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus({
    readinessView: readinessView(action),
    executionReceipts: [failedReceipt],
  });
  assertEqual(failedStatus.entries[0]?.state, "failed", "Failed receipt renders failed state");
  assertEqual(failedStatus.entries[0]?.receipt.blockedReason, "activation_failed", "Failed reason is projected");

  const blockedStatus = createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus({
    readinessView: readinessView(action),
    executionReceipts: [blockedReceipt],
  });
  assertEqual(blockedStatus.entries[0]?.state, "blocked", "Blocked receipt renders blocked state");
  assertEqual(blockedStatus.entries[0]?.nextActions[0], "Resolve the blocked metadata-bound activation receipt before retrying the operator handoff.", "Blocked state has bounded next action");

  const activeStatus = createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus({
    readinessView: readinessView(action),
    executionReceipts: [completed],
    activeSidecarSignatures: [action.signature ?? ""],
  });
  assertEqual(activeStatus.entries[0]?.state, "active", "Active supervisor signature overrides completed execution state");

  const notExecuted = createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus({
    readinessView: readinessView(action),
    executionReceipts: [],
  });
  assertEqual(notExecuted.entries[0]?.state, "not_executed", "Missing receipt renders not executed state");
}

async function verifyMismatchedReceiptsAndMetadataGateAreIgnored(): Promise<void> {
  section("3. Mismatched Receipts And Stale Metadata Gates Are Ignored");

  const { action, receipt } = await executionFixture();
  const mismatchedReceipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt = {
    ...receipt,
    handoff: {
      ...receipt.handoff,
      sidecarSignature: "mcp-plugin:000000000000000000000000",
      approvalSignature: "mcp-plugin:000000000000000000000000",
    },
  };
  const unsafeReceipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt = {
    ...receipt,
    package: {
      ...receipt.package,
      name: "SHOULD_NOT_LEAK_SECRET_PACKAGE",
      version: "29.0.0",
    },
  };
  const staleGate = readinessView(action);
  staleGate.entries[0] = {
    ...staleGate.entries[0]!,
    state: "ready_for_activation_handoff",
    installExecution: {
      ...staleGate.entries[0]!.installExecution,
      state: "blocked",
      receiptPresent: false,
      packageInstalled: false,
      metadataGate: {
        ...staleGate.entries[0]!.installExecution.metadataGate,
        state: "metadata_blocked",
        registryMetadataApplied: false,
        registryMetadataVerified: false,
      },
    },
  };

  const status = createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus({
    readinessView: staleGate,
    executionReceipts: [receipt, mismatchedReceipt, unsafeReceipt],
    activeSidecarSignatures: ["mcp-plugin:SHOULD_NOT_LEAK"],
  });

  const entry = status.entries[0];
  assertEqual(entry?.state, "metadata_blocked", "Stale metadata gate blocks execution status attachment");
  assertEqual(entry?.receipt.present, false, "Stale metadata gate does not report matching receipt as present");
  assertEqual(entry?.blockedReason, "metadata_gate_not_ready", "Stale metadata gate reason is explicit");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Unsafe receipt content and active signatures are redacted");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("4. Status Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-activation-execution-status.ts").text();
  assert(!source.includes("fetch("), "Status runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Status runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Status runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 259 Verification (Metadata-Bound Activation Execution Status)\n");

  await verifyCompletedReceiptStatus();
  await verifyFailureBlockedActiveAndNotExecutedStates();
  await verifyMismatchedReceiptsAndMetadataGateAreIgnored();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 259 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 259: metadata-bound marketplace activation execution status is GREEN.");
}

run().catch((error) => {
  console.error("Phase 259 verification crashed:", error);
  process.exit(1);
});
