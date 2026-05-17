/**
 * Phase 247 Verification Script - Plugin Marketplace Install/Update Execution Status
 *
 * Proves marketplace install/update handoff descriptors can be projected into
 * a read-only operator execution status view from supplied install/update
 * receipts without fetching registries, installing packages, executing package
 * code, activating sidecars, starting sidecars, mutating catalogs, or
 * persisting credentials.
 *
 * Run: bun run src/verify-phase247.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  createPluginPackageMarketplaceInstallUpdateExecutionStatus,
  createPluginPackageMarketplaceInstallUpdateHandoff,
  executeApprovedPluginPackageInstallUpdate,
  planPluginPackageManifest,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateReceipt,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
  type PluginPackageMarketplaceInstallUpdateHandoff,
  type PluginPackagePlanActionRecord,
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
    packageName: "@colony/plugin-phase247",
    packageVersion: "17.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase247.tgz",
    packageDigest: "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa",
    reviewed: true,
    sidecars: [
      {
        id: "phase247-plugin",
        sidecarId: "phase247-sidecar",
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
    entryId: "phase247-entry",
    displayName: "Phase 247 Echo Tools",
    summary: "Safe install execution status fixture for bundled marketplace descriptors.",
    tags: ["mcp", "install", "status"],
    manifest: manifest(),
    ...overrides,
  };
}

function actionFor(packageManifest: PluginPackageManifest = manifest()): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(packageManifest);
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase247 fixture did not create an import action");
  }
  return action;
}

function approval(action: PluginPackagePlanActionRecord, overrides: Partial<PluginPackageInstallUpdateApproval> = {}): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "install execution status SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

async function readyHandoff(
  root: string,
  candidate: PluginPackageMarketplaceCatalogEntry = entry(),
): Promise<{
  action: PluginPackagePlanActionRecord;
  handoff: PluginPackageMarketplaceInstallUpdateHandoff;
}> {
  const action = actionFor(candidate.manifest);
  const handoff = createPluginPackageMarketplaceInstallUpdateHandoff({
    catalogId: "catalog-phase247",
    entries: [candidate],
    entryId: candidate.entryId,
    approvalSignature: action.signature ?? "",
    packageRoot: root,
    packagePath: join(root, "phase247-plugin"),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T06:40:00.000Z",
  });
  return { action, handoff };
}

async function receiptFor(
  root: string,
  action: PluginPackagePlanActionRecord,
  code = 0,
  timestamp = "2026-05-14T06:41:00.000Z",
): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: approval(action),
    packageRoot: root,
    packagePath: join(root, "phase247-plugin"),
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code, stdout: "installed SHOULD_NOT_LEAK", stderr: "stderr SHOULD_NOT_LEAK" }),
    timestamp,
  });
}

async function verifyCompletedReceiptStatus(): Promise<void> {
  section("1. Completed Receipt Projects Read-Only Status");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-status-root-"));
  try {
    const { action, handoff } = await readyHandoff(root);
    const receipt = await receiptFor(root, action);
    const status = createPluginPackageMarketplaceInstallUpdateExecutionStatus({
      handoffs: [handoff],
      receipts: [receipt],
      timestamp: "2026-05-14T06:42:00.000Z",
    });

    const entryStatus = status.entries[0];
    assertEqual(status.recordType, "mcp_plugin_package_install_update_execution_status_view", "Status view uses install/update execution status record type");
    assertEqual(status.networkFetched, false, "Status view fetches no registry");
    assertEqual(status.packageInstalled, false, "Status view performs no package install");
    assertEqual(status.packageExecuted, false, "Status view performs no package-code execution");
    assertEqual(status.activation, false, "Status view performs no activation");
    assertEqual(status.sidecarStarted, false, "Status view starts no sidecar");
    assertEqual(status.catalogMutated, false, "Status view mutates no catalog");
    assertEqual(status.credentialsPersisted, false, "Status view persists no credentials");
    assertEqual(entryStatus?.state, "completed", "Completed receipt renders completed state");
    assertEqual(entryStatus?.receipt.present, true, "Receipt presence is visible");
    assertEqual(entryStatus?.receipt.hostActionExecuted, true, "Host execution truth is visible from receipt steps");
    assertEqual(entryStatus?.receipt.stepCount, 1, "Step count is visible without stdout/stderr bodies");
    assertEqual(entryStatus?.receipt.latestStepCode, 0, "Latest step code is visible");
    assert(entryStatus?.nextActions.some((actionText) => actionText.includes("Inspect installed package receipt")) === true, "Completed status suggests inspection instead of execution");
    assert(!JSON.stringify(status).includes("plugins.example.com"), "Status view redacts package source URLs");
    assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Status view redacts approvals and executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyFailedBlockedAndNotExecutedStates(): Promise<void> {
  section("2. Failed, Blocked, And Not Executed States Are Deterministic");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-status-state-root-"));
  try {
    const { action, handoff } = await readyHandoff(root);
    const failedReceipt = await receiptFor(root, action, 7, "2026-05-14T06:43:00.000Z");
    const failedStatus = createPluginPackageMarketplaceInstallUpdateExecutionStatus({
      handoffs: [handoff],
      receipts: [failedReceipt],
    });
    assertEqual(failedStatus.entries[0]?.state, "failed", "Failed receipt renders failed state");
    assertEqual(failedStatus.entries[0]?.receipt.blockedReason, "executor_failed", "Failed reason is projected");

    const blockedHandoff = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase247",
      entries: [entry()],
      entryId: "phase247-entry",
      approvalSignature: "mcp-plugin:000000000000000000000000",
      packageRoot: root,
      packagePath: join(root, "phase247-plugin"),
    });
    const blockedStatus = createPluginPackageMarketplaceInstallUpdateExecutionStatus({
      handoffs: [blockedHandoff],
      receipts: [],
    });
    assertEqual(blockedStatus.entries[0]?.state, "blocked", "Blocked handoff renders blocked state");
    assertEqual(blockedStatus.entries[0]?.receipt.present, false, "Blocked handoff does not claim receipt presence");
    assertEqual(blockedStatus.entries[0]?.nextActions[0], "Resolve the blocked install/update handoff before retrying host execution.", "Blocked state has bounded next action");

    const notExecuted = createPluginPackageMarketplaceInstallUpdateExecutionStatus({
      handoffs: [handoff],
      receipts: [],
    });
    assertEqual(notExecuted.entries[0]?.state, "not_executed", "Missing receipt renders not executed state");
    assertEqual(notExecuted.entries[0]?.receipt.hostActionExecuted, false, "Missing receipt reports no host action execution");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyMismatchedReceiptsAreIgnored(): Promise<void> {
  section("3. Mismatched Or Unsafe Receipts Are Ignored");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-status-mismatch-root-"));
  try {
    const { action, handoff } = await readyHandoff(root);
    const receipt = await receiptFor(root, action);
    const wrongSignature: PluginPackageInstallUpdateReceipt = {
      ...receipt,
      signature: "mcp-plugin:000000000000000000000000",
    };
    const unsafeReceipt: PluginPackageInstallUpdateReceipt = {
      ...receipt,
      package: {
        ...receipt.package,
        name: "SHOULD_NOT_LEAK_SECRET_PACKAGE",
      },
    };
    const status = createPluginPackageMarketplaceInstallUpdateExecutionStatus({
      handoffs: [handoff],
      receipts: [wrongSignature, unsafeReceipt],
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

  const source = await Bun.file("src/mcp/plugin-package-marketplace-install-execution-status.ts").text();
  assert(!source.includes("fetch("), "Status runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Status runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Status runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 247 Verification (Plugin Marketplace Install/Update Execution Status)\n");

  await verifyCompletedReceiptStatus();
  await verifyFailedBlockedAndNotExecutedStates();
  await verifyMismatchedReceiptsAreIgnored();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 247 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 247: plugin marketplace install/update execution status is GREEN.");
}

run().catch((error) => {
  console.error("Phase 247 verification crashed:", error);
  process.exit(1);
});
