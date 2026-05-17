/**
 * Phase 245 Verification Script - Plugin Marketplace Activation Execution Status
 *
 * Proves approved marketplace activation execution receipts can be projected
 * into a read-only operator status view without starting sidecars, fetching
 * registries, installing packages, executing package code, mutating catalogs,
 * or persisting credentials.
 *
 * Run: bun run src/verify-phase245.ts
 */

import {
  createPluginPackageMarketplaceActivationExecutionStatus,
  createPluginPackageMarketplaceActivationHandoff,
  createPluginPackageMarketplaceActivationReadiness,
  executeApprovedPluginPackageInstallUpdate,
  executeApprovedPluginPackageMarketplaceActivationHandoff,
  planPluginPackageManifest,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarSupervisorSnapshot,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateReceipt,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
  type PluginPackageMarketplaceActivationHandoffExecutionReceipt,
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
    packageName: "@colony/plugin-phase245",
    packageVersion: "1.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase245.tgz",
    packageDigest: "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    reviewed: true,
    sidecars: [
      {
        id: "phase245-plugin",
        sidecarId: "phase245-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase245-entry",
    displayName: "Phase 245 Echo Tools",
    summary: "Safe activation execution status fixture for bundled marketplace descriptors.",
    tags: ["mcp", "activation", "status"],
    manifest: manifest(),
    ...overrides,
  };
}

function actionFor(packageManifest: PluginPackageManifest = manifest()): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(packageManifest);
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature || !action.definition) {
    throw new Error("phase245 fixture did not create an import action");
  }
  return action;
}

function approval(action: PluginPackagePlanActionRecord, overrides: Partial<PluginPackageInstallUpdateApproval> = {}): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "activation execution status SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

async function completedInstallReceipt(action: PluginPackagePlanActionRecord): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: approval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase245-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed SHOULD_NOT_LEAK" }),
    timestamp: "2026-05-14T05:52:00.000Z",
  });
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
        connectedAt: "2026-05-14T05:53:00.000Z",
        protocolVersion: "SHOULD_NOT_LEAK_PROTOCOL",
        serverInfo: { name: "SHOULD_NOT_LEAK_SERVER", version: "1.0.0" },
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
  receipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt;
}> {
  const action = actionFor();
  const installReceipt = await completedInstallReceipt(action);
  const readinessView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase245",
    entries: [entry()],
    completedInstallReceipts: [installReceipt],
    approvedActivationSignatures: [action.signature ?? ""],
    timestamp: "2026-05-14T05:54:00.000Z",
  });
  const handoff = createPluginPackageMarketplaceActivationHandoff({
    readinessView,
    entryId: "phase245-entry",
    sidecarSignature: action.signature ?? "",
    approvalSignature: action.signature ?? "",
    approvedBy: "operator",
    timestamp: "2026-05-14T05:55:00.000Z",
  });
  const receipt = await executeApprovedPluginPackageMarketplaceActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action),
    supervisor: supervisor(startResult),
    timestamp: "2026-05-14T05:56:00.000Z",
  });
  return { action, installReceipt, receipt };
}

async function verifyCompletedReceiptStatus(): Promise<void> {
  section("1. Completed Execution Receipt Projects Read-Only Status");

  const { action, installReceipt, receipt } = await executionFixture();
  const readinessView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase245",
    entries: [entry()],
    completedInstallReceipts: [installReceipt],
    approvedActivationSignatures: [action.signature ?? ""],
    timestamp: "2026-05-14T05:57:00.000Z",
  });
  const status = createPluginPackageMarketplaceActivationExecutionStatus({
    readinessView,
    executionReceipts: [receipt],
    timestamp: "2026-05-14T05:58:00.000Z",
  });

  const sidecar = status.entries[0]?.sidecars[0];
  assertEqual(status.recordType, "mcp_plugin_package_activation_execution_status_view", "Status view uses execution status record type");
  assertEqual(status.networkFetched, false, "Status view fetches no registry");
  assertEqual(status.packageInstalled, false, "Status view performs no package install");
  assertEqual(status.packageExecuted, false, "Status view performs no package-code execution");
  assertEqual(status.activation, false, "Status view performs no activation");
  assertEqual(status.sidecarStarted, false, "Status view starts no sidecar");
  assertEqual(status.catalogMutated, false, "Status view mutates no catalog");
  assertEqual(status.credentialsPersisted, false, "Status view persists no credentials");
  assertEqual(sidecar?.state, "completed", "Completed execution receipt renders completed state");
  assertEqual(sidecar?.receipt.present, true, "Receipt presence is visible");
  assertEqual(sidecar?.receipt.hostActionExecuted, true, "Host action execution truth is visible");
  assertEqual(sidecar?.receipt.activation, true, "Receipt activation truth is visible without new activation");
  assertEqual(sidecar?.receipt.sidecarStarted, true, "Receipt sidecar-start truth is visible without starting a sidecar");
  assert(sidecar?.nextActions.some((actionText) => actionText.includes("Inspect running sidecar")) === true, "Completed status suggests inspection instead of activation");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Status view redacts package sources, approvals, and lifecycle internals");
}

async function verifyFailureBlockedAndActiveStates(): Promise<void> {
  section("2. Failed, Blocked, Active, And Not Executed States Are Deterministic");

  const { action, installReceipt, receipt: completed } = await executionFixture();
  const failedReceipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt = {
    ...completed,
    timestamp: "2026-05-14T05:59:00.000Z",
    status: "failed",
    blockedReason: "activation_failed",
    hostActionExecuted: true,
    activation: false,
    sidecarStarted: false,
    activationReceipt: {
      ...completed.activationReceipt,
      status: "failed",
      blockedReason: "supervisor_start_failed",
      activation: false,
      sidecarStarted: false,
      supervisorState: "failed",
    },
  };
  const blockedReceipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt = {
    ...completed,
    timestamp: "2026-05-14T06:00:00.000Z",
    status: "blocked",
    blockedReason: "approval_required",
    hostActionExecuted: false,
    activation: false,
    sidecarStarted: false,
  };
  const readinessView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase245",
    entries: [entry()],
    completedInstallReceipts: [installReceipt],
    approvedActivationSignatures: [action.signature ?? ""],
    timestamp: "2026-05-14T06:01:00.000Z",
  });

  const failedStatus = createPluginPackageMarketplaceActivationExecutionStatus({
    readinessView,
    executionReceipts: [failedReceipt],
  });
  assertEqual(failedStatus.entries[0]?.sidecars[0]?.state, "failed", "Failed receipt renders failed state");
  assertEqual(failedStatus.entries[0]?.sidecars[0]?.receipt.blockedReason, "activation_failed", "Failed reason is projected");

  const blockedStatus = createPluginPackageMarketplaceActivationExecutionStatus({
    readinessView,
    executionReceipts: [blockedReceipt],
  });
  assertEqual(blockedStatus.entries[0]?.sidecars[0]?.state, "blocked", "Blocked receipt renders blocked state");
  assertEqual(blockedStatus.entries[0]?.sidecars[0]?.nextActions[0], "Resolve the blocked activation receipt before retrying the operator handoff.", "Blocked state has bounded next action");

  const activeStatus = createPluginPackageMarketplaceActivationExecutionStatus({
    readinessView,
    executionReceipts: [completed],
    activeSidecarSignatures: [action.signature ?? ""],
  });
  assertEqual(activeStatus.entries[0]?.sidecars[0]?.state, "active", "Active supervisor signature overrides completed execution state");

  const notExecuted = createPluginPackageMarketplaceActivationExecutionStatus({
    readinessView,
    executionReceipts: [],
  });
  assertEqual(notExecuted.entries[0]?.sidecars[0]?.state, "not_executed", "Missing receipt renders not executed state");
}

async function verifyMismatchedReceiptsAreIgnored(): Promise<void> {
  section("3. Mismatched Or Unsafe Receipts Are Ignored");

  const { action, installReceipt, receipt } = await executionFixture();
  const readinessView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase245",
    entries: [entry()],
    completedInstallReceipts: [installReceipt],
    approvedActivationSignatures: [action.signature ?? ""],
  });
  const mismatchedReceipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt = {
    ...receipt,
    handoff: {
      ...receipt.handoff,
      sidecarSignature: "mcp-plugin:000000000000000000000000",
      approvalSignature: "mcp-plugin:000000000000000000000000",
    },
  };
  const unsafeReceipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt = {
    ...receipt,
    package: {
      ...receipt.package,
      name: "SHOULD_NOT_LEAK_SECRET_PACKAGE",
      version: "1.0.0",
    },
  };

  const status = createPluginPackageMarketplaceActivationExecutionStatus({
    readinessView,
    executionReceipts: [mismatchedReceipt, unsafeReceipt],
    activeSidecarSignatures: ["mcp-plugin:SHOULD_NOT_LEAK"],
  });

  const sidecar = status.entries[0]?.sidecars[0];
  assertEqual(sidecar?.state, "not_executed", "Mismatched/unsafe receipts do not attach to readiness sidecar");
  assertEqual(sidecar?.receipt.present, false, "No unsafe receipt is reported as present");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Unsafe receipt content and active signatures are redacted");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("4. Status Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-activation-execution-status.ts").text();
  assert(!source.includes("fetch("), "Status runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Status runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Status runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 245 Verification (Plugin Marketplace Activation Execution Status)\n");

  await verifyCompletedReceiptStatus();
  await verifyFailureBlockedAndActiveStates();
  await verifyMismatchedReceiptsAreIgnored();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 245 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 245: plugin marketplace activation execution status is GREEN.");
}

run().catch((error) => {
  console.error("Phase 245 verification crashed:", error);
  process.exit(1);
});
