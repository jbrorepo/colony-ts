/**
 * Phase 244 Verification Script - Plugin Marketplace Activation Handoff Execution
 *
 * Proves a ready marketplace activation handoff can be converted into an
 * approved sidecar activation receipt only through the existing injected
 * supervisor path, while blocked/tampered handoffs fail closed.
 *
 * Run: bun run src/verify-phase244.ts
 */

import {
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
    packageName: "@colony/plugin-phase244",
    packageVersion: "1.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase244.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase244-plugin",
        sidecarId: "phase244-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
      },
    ],
    ...overrides,
  };
}

function entry(): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase244-entry",
    displayName: "Phase 244 Echo Tools",
    summary: "Safe activation handoff execution fixture for bundled marketplace descriptors.",
    tags: ["mcp", "activation", "handoff"],
    manifest: manifest(),
  };
}

function importAction(): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(manifest());
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature || !action.definition) {
    throw new Error("phase244 fixture did not create an import action");
  }
  return action;
}

function approval(action: PluginPackagePlanActionRecord, overrides: Partial<PluginPackageInstallUpdateApproval> = {}): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "activation handoff execution SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

async function completedInstallReceipt(action: PluginPackagePlanActionRecord): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: approval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase244-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed SHOULD_NOT_LEAK" }),
    timestamp: "2026-05-14T05:40:00.000Z",
  });
}

function supervisor(result: Partial<PluginMcpSidecarSupervisorSnapshot> = {}): {
  calls: Array<{ definition: PluginMcpSidecarDefinition; approvalSignature: string }>;
  run: PluginPackageSidecarActivationSupervisor;
} {
  const calls: Array<{ definition: PluginMcpSidecarDefinition; approvalSignature: string }> = [];
  return {
    calls,
    run: {
      start: async (definition, trustApproval) => {
        calls.push({ definition, approvalSignature: trustApproval.signature });
        return {
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
            connectedAt: "2026-05-14T05:41:00.000Z",
            protocolVersion: "SHOULD_NOT_LEAK_PROTOCOL",
            serverInfo: { name: "SHOULD_NOT_LEAK_SERVER", version: "1.0.0" },
            expectations: {},
          },
          ...result,
        };
      },
    },
  };
}

async function readyFixture() {
  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const readinessView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase244",
    entries: [entry()],
    completedInstallReceipts: [installReceipt],
    approvedActivationSignatures: [action.signature ?? ""],
    timestamp: "2026-05-14T05:42:00.000Z",
  });
  const handoff = createPluginPackageMarketplaceActivationHandoff({
    readinessView,
    entryId: "phase244-entry",
    sidecarSignature: action.signature ?? "",
    approvalSignature: action.signature ?? "",
    approvedBy: "operator",
    timestamp: "2026-05-14T05:43:00.000Z",
  });
  return { action, installReceipt, handoff };
}

async function verifyReadyHandoffExecutesThroughInjectedSupervisor(): Promise<void> {
  section("1. Ready Handoff Executes Through Existing Activation Helper");

  const { action, installReceipt, handoff } = await readyFixture();
  const fake = supervisor();
  const receipt = await executeApprovedPluginPackageMarketplaceActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-14T05:44:00.000Z",
  });

  assertEqual(receipt.recordType, "mcp_plugin_package_activation_handoff_execution_receipt", "Execution receipt uses handoff execution record type");
  assertEqual(receipt.status, "completed", "Ready handoff execution completes");
  assertEqual(receipt.hostActionExecuted, true, "Receipt records host action execution");
  assertEqual(receipt.activation, true, "Receipt marks activation true only after supervisor start");
  assertEqual(receipt.sidecarStarted, true, "Receipt marks sidecar started only after supervisor start");
  assertEqual(receipt.networkFetched, false, "Execution fetches no registry");
  assertEqual(receipt.packageInstalled, false, "Execution performs no package install");
  assertEqual(receipt.packageExecuted, false, "Execution performs no package-code execution");
  assertEqual(receipt.catalogMutated, false, "Execution mutates no catalog");
  assertEqual(receipt.credentialsPersisted, false, "Execution persists no credentials");
  assertEqual(receipt.activationReceipt.status, "completed", "Underlying activation receipt is summarized as completed");
  assertEqual(fake.calls.length, 1, "Supervisor is called exactly once");
  assertEqual(fake.calls[0]?.definition.id, "phase244-plugin", "Supervisor receives trusted sidecar definition");
  assertEqual(fake.calls[0]?.approvalSignature, action.signature, "Supervisor receives exact trust signature");
  assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Execution receipt redacts secrets and lifecycle internals");
  assert(!JSON.stringify(receipt).includes("definition"), "Execution receipt omits sidecar definitions");
  assert(!JSON.stringify(receipt).includes("approvalRequest"), "Execution receipt omits approval request bodies");
}

async function verifyBlockedAndTamperedHandoffsDoNotExecute(): Promise<void> {
  section("2. Blocked And Tampered Handoffs Do Not Execute");

  const { action, installReceipt, handoff } = await readyFixture();
  const fake = supervisor();
  const blocked = await executeApprovedPluginPackageMarketplaceActivationHandoff({
    handoff: {
      ...handoff,
      status: "blocked",
      blockedReason: "readiness_not_ready",
      hostActionRequired: false,
      hostAction: { ...handoff.hostAction, kind: "<blocked>", supervisorPath: "<blocked>" },
    },
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
  });
  assertEqual(blocked.status, "blocked", "Blocked handoff returns blocked execution receipt");
  assertEqual(blocked.blockedReason, "handoff_not_ready", "Blocked handoff reason is explicit");
  assertEqual(blocked.hostActionExecuted, false, "Blocked handoff executes no host action");
  assertEqual(fake.calls.length, 0, "Blocked handoff does not call supervisor");

  const tampered = await executeApprovedPluginPackageMarketplaceActivationHandoff({
    handoff: {
      ...handoff,
      sidecarSignature: "mcp-plugin:000000000000000000000000",
      hostAction: { ...handoff.hostAction, sidecarSignature: "mcp-plugin:000000000000000000000000" },
    },
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
  });
  assertEqual(tampered.status, "blocked", "Tampered signature returns blocked execution receipt");
  assertEqual(tampered.blockedReason, "signature_mismatch", "Tamper reason is explicit");
  assertEqual(fake.calls.length, 0, "Tampered handoff does not call supervisor");
}

async function verifyApprovalAndSupervisorFailureAreBounded(): Promise<void> {
  section("3. Approval And Supervisor Failure Are Bounded");

  const { action, installReceipt, handoff } = await readyFixture();
  const fake = supervisor();
  const wrongApproval = await executeApprovedPluginPackageMarketplaceActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action, { signature: "mcp-plugin:111111111111111111111111" }),
    supervisor: fake.run,
  });
  assertEqual(wrongApproval.status, "blocked", "Wrong approval blocks execution before supervisor");
  assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(fake.calls.length, 0, "Wrong approval does not call supervisor");

  const failingSupervisor: PluginPackageSidecarActivationSupervisor = {
    start: async () => {
      throw new Error("supervisor SHOULD_NOT_LEAK_TOKEN failure");
    },
  };
  const failed = await executeApprovedPluginPackageMarketplaceActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action),
    supervisor: failingSupervisor,
  });
  assertEqual(failed.status, "failed", "Supervisor failure returns failed execution receipt");
  assertEqual(failed.blockedReason, "activation_failed", "Supervisor failure reason is explicit");
  assertEqual(failed.hostActionExecuted, true, "Failed supervisor start records attempted host execution");
  assertEqual(failed.activation, false, "Failed supervisor start does not activate");
  assertEqual(failed.sidecarStarted, false, "Failed supervisor start does not mark sidecar started");
  assert(!JSON.stringify(failed).includes("SHOULD_NOT_LEAK"), "Failed execution receipt redacts supervisor errors");
}

async function verifyRuntimeHasNoDirectNetworkOrProcessPrimitive(): Promise<void> {
  section("4. Handoff Execution Runtime Contains No Direct Network Or Process Primitive");

  const source = await Bun.file("src/mcp/plugin-package-activation-handoff-execution.ts").text();
  assert(!source.includes("fetch("), "Handoff execution runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff execution runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff execution runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 244 Verification (Plugin Marketplace Activation Handoff Execution)\n");

  await verifyReadyHandoffExecutesThroughInjectedSupervisor();
  await verifyBlockedAndTamperedHandoffsDoNotExecute();
  await verifyApprovalAndSupervisorFailureAreBounded();
  await verifyRuntimeHasNoDirectNetworkOrProcessPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 244 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 244: plugin marketplace activation handoff execution is GREEN.");
}

run().catch((error) => {
  console.error("Phase 244 verification crashed:", error);
  process.exit(1);
});
