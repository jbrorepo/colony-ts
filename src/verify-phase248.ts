/**
 * Phase 248 Verification Script - Plugin Marketplace Install/Update Handoff Execution
 *
 * Proves a ready marketplace install/update handoff can be converted into an
 * approved install/update receipt only through the existing injected executor
 * helper, while blocked/tampered handoffs fail closed before host execution.
 *
 * Run: bun run src/verify-phase248.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  createPluginPackageMarketplaceInstallUpdateHandoff,
  executeApprovedPluginPackageMarketplaceInstallUpdateHandoff,
  planPluginPackageManifest,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateExecutor,
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
    packageName: "@colony/plugin-phase248",
    packageVersion: "18.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase248.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase248-plugin",
        sidecarId: "phase248-sidecar",
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
    entryId: "phase248-entry",
    displayName: "Phase 248 Echo Tools",
    summary: "Safe install/update handoff execution fixture for bundled marketplace descriptors.",
    tags: ["mcp", "install", "handoff", "execution"],
    manifest: manifest(),
    ...overrides,
  };
}

function actionFor(packageManifest: PluginPackageManifest = manifest()): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(packageManifest);
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase248 fixture did not create an import action");
  }
  return action;
}

function approval(action: PluginPackagePlanActionRecord, overrides: Partial<PluginPackageInstallUpdateApproval> = {}): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "install handoff execution SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

async function readyFixture(root: string): Promise<{
  action: PluginPackagePlanActionRecord;
  handoff: PluginPackageMarketplaceInstallUpdateHandoff;
}> {
  const candidate = entry();
  const action = actionFor(candidate.manifest);
  const handoff = createPluginPackageMarketplaceInstallUpdateHandoff({
    catalogId: "catalog-phase248",
    entries: [candidate],
    entryId: candidate.entryId,
    approvalSignature: action.signature ?? "",
    packageRoot: root,
    packagePath: join(root, "phase248-plugin"),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T06:55:00.000Z",
  });
  return { action, handoff };
}

function executor(code = 0): {
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

async function verifyReadyHandoffExecutesThroughInjectedExecutor(): Promise<void> {
  section("1. Ready Handoff Executes Through Existing Install/Update Helper");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-handoff-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = executor();
    const receipt = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
      handoff,
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase248-plugin"),
      executor: fake.run,
      timestamp: "2026-05-14T06:56:00.000Z",
    });

    assertEqual(receipt.recordType, "mcp_plugin_package_install_update_handoff_execution_receipt", "Execution receipt uses install/update handoff execution record type");
    assertEqual(receipt.status, "completed", "Ready handoff execution completes");
    assertEqual(receipt.hostActionExecuted, true, "Receipt records host action execution");
    assertEqual(receipt.installUpdateReceipt.present, true, "Underlying install/update receipt is summarized");
    assertEqual(receipt.installUpdateReceipt.status, "completed", "Underlying receipt completed");
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
    assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Execution receipt redacts approvals and executor output");
    assert(!JSON.stringify(receipt).includes("definition"), "Execution receipt omits sidecar definitions");
    assert(!JSON.stringify(receipt).includes("approvalRequest"), "Execution receipt omits approval request bodies");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyBlockedAndTamperedHandoffsDoNotExecute(): Promise<void> {
  section("2. Blocked And Tampered Handoffs Do Not Execute");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-handoff-block-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = executor();
    const blocked = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
      handoff: {
        ...handoff,
        status: "blocked",
        blockedReason: "approval_signature_mismatch",
      },
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase248-plugin"),
      executor: fake.run,
    });
    assertEqual(blocked.status, "blocked", "Blocked handoff returns blocked execution receipt");
    assertEqual(blocked.blockedReason, "handoff_not_ready", "Blocked handoff reason is explicit");
    assertEqual(blocked.hostActionExecuted, false, "Blocked handoff executes no host action");
    assertEqual(fake.calls.length, 0, "Blocked handoff does not call executor");

    const tampered = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
      handoff: {
        ...handoff,
        approval: { ...handoff.approval, signature: "mcp-plugin:000000000000000000000000" },
      },
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase248-plugin"),
      executor: fake.run,
    });
    assertEqual(tampered.status, "blocked", "Tampered approval signature returns blocked execution receipt");
    assertEqual(tampered.blockedReason, "approval_signature_mismatch", "Tamper reason is explicit");
    assertEqual(fake.calls.length, 0, "Tampered handoff does not call executor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyActionAndApprovalMismatchAreBounded(): Promise<void> {
  section("3. Action And Approval Mismatch Are Bounded");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-handoff-mismatch-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = executor();
    const wrongApproval = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
      handoff,
      action,
      approval: approval(action, { signature: "mcp-plugin:111111111111111111111111" }),
      packageRoot: root,
      packagePath: join(root, "phase248-plugin"),
      executor: fake.run,
    });
    assertEqual(wrongApproval.status, "blocked", "Wrong approval blocks execution before executor");
    assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
    assertEqual(fake.calls.length, 0, "Wrong approval does not call executor");

    const mismatched = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
      handoff: { ...handoff, action: "update" },
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase248-plugin"),
      executor: fake.run,
    });
    assertEqual(mismatched.status, "blocked", "Mismatched action blocks execution before executor");
    assertEqual(mismatched.blockedReason, "action_mismatch", "Mismatched action reason is explicit");
    assertEqual(fake.calls.length, 0, "Mismatched action does not call executor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyDelegateFailureIsSummarizedAndStops(): Promise<void> {
  section("4. Delegated Failure Is Summarized And Stops");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-handoff-failure-root-"));
  try {
    const { action, handoff } = await readyFixture(root);
    const fake = executor(7);
    const failed = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
      handoff: {
        ...handoff,
        commands: [
          { executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] },
          { executable: "npm", arguments: ["ci", "--ignore-scripts"] },
        ],
      },
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase248-plugin"),
      executor: fake.run,
    });

    assertEqual(failed.status, "failed", "Executor failure returns failed execution receipt");
    assertEqual(failed.blockedReason, "install_update_failed", "Executor failure reason is explicit");
    assertEqual(failed.hostActionExecuted, true, "Failed executor call records attempted host execution");
    assertEqual(failed.installUpdateReceipt.present, true, "Failed underlying receipt is summarized");
    assertEqual(failed.installUpdateReceipt.stepCount, 1, "Failed install/update stops after first failed step");
    assertEqual(fake.calls.length, 1, "Executor is not called after first failed command");
    assert(!JSON.stringify(failed).includes("SHOULD_NOT_LEAK"), "Failed execution receipt redacts executor output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive(): Promise<void> {
  section("5. Handoff Execution Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-install-handoff-execution.ts").text();
  assert(!source.includes("fetch("), "Handoff execution runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff execution runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff execution runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 248 Verification (Plugin Marketplace Install/Update Handoff Execution)\n");

  await verifyReadyHandoffExecutesThroughInjectedExecutor();
  await verifyBlockedAndTamperedHandoffsDoNotExecute();
  await verifyActionAndApprovalMismatchAreBounded();
  await verifyDelegateFailureIsSummarizedAndStops();
  await verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 248 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 248: plugin marketplace install/update handoff execution is GREEN.");
}

run().catch((error) => {
  console.error("Phase 248 verification crashed:", error);
  process.exit(1);
});
