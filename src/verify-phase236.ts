/**
 * Phase 236 Verification Script - Plugin Package Sidecar Activation Controls
 *
 * Proves reviewed plugin package import/update actions can advance from
 * approved install/update receipts to approval-gated sidecar activation through
 * an injected supervisor, while preserving exact approval, install-receipt,
 * sidecar-kind, signature, and redaction boundaries.
 *
 * Run: bun run src/verify-phase236.ts
 */

import {
  executeApprovedPluginPackageInstallUpdate,
  executeApprovedPluginPackageSidecarActivation,
  planPluginPackageManifest,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarSupervisorSnapshot,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateReceipt,
  type PluginPackageManifest,
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
    packageName: "@colony/plugin-phase236",
    packageVersion: "10.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase236.tgz",
    packageDigest: "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    reviewed: true,
    sidecars: [
      {
        id: "phase236-plugin",
        sidecarId: "phase236-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase236-plugin-sidecar",
        expectedServerVersion: "10.0.0",
      },
    ],
    ...overrides,
  };
}

function importAction(overrides: Partial<PluginPackageManifest> = {}): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(manifest(overrides));
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature || !action.definition) {
    throw new Error("phase236 fixture did not create an import action");
  }
  return action;
}

function approval(action: PluginPackagePlanActionRecord, overrides: Partial<PluginPackageInstallUpdateApproval> = {}): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "activation approval SHOULD_NOT_LEAK_TOKEN_DETAIL",
    ...overrides,
  };
}

async function completedInstallReceipt(action: PluginPackagePlanActionRecord): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: approval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase236-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed" }),
    timestamp: "2026-05-13T05:25:00.000Z",
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
        calls.push({
          definition,
          approvalSignature: trustApproval.signature,
        });
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
            connectedAt: "2026-05-13T05:26:00.000Z",
            protocolVersion: "SHOULD_NOT_LEAK_TOKEN_PROTOCOL",
            serverInfo: {
              name: "SHOULD_NOT_LEAK_TOKEN_SERVER",
              version: "10.0.0",
            },
            expectations: {},
          },
          ...result,
        };
      },
    },
  };
}

async function verifyApprovedActivationReceipt(): Promise<void> {
  section("1. Approved Activation Calls Injected Supervisor");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const fake = supervisor();
  const receipt = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:27:00.000Z",
  });

  assertEqual(receipt.status, "completed", "Approved activation completes");
  assertEqual(receipt.action, "import", "Receipt preserves import action");
  assertEqual(receipt.activation, true, "Receipt marks activation true only after supervisor start");
  assertEqual(receipt.sidecarStarted, true, "Receipt marks sidecarStarted true only after supervisor start");
  assertEqual(receipt.registryFetched, false, "Activation performs no registry fetch");
  assertEqual(receipt.installReceipt.status, "completed", "Receipt records completed install receipt boundary");
  assertEqual(receipt.supervisor.state, "running", "Receipt records supervisor running state");
  assertEqual(fake.calls.length, 1, "Supervisor start is called exactly once");
  assertEqual(fake.calls[0]?.definition.id, "phase236-plugin", "Supervisor receives trusted sidecar definition");
  assertEqual(fake.calls[0]?.approvalSignature, action.signature, "Supervisor receives exact trust signature");

  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes("plugins.example.com"), "Activation receipt redacts package and supervisor source URLs");
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Activation receipt redacts approval and supervisor lifecycle secrets");
  assert(!serialized.includes("definition"), "Activation receipt omits trusted sidecar definition bodies");
  assert(!serialized.includes("approvalRequest"), "Activation receipt omits approval request bodies");
  assert(!serialized.includes("sidecarTransport") && !serialized.includes("\"client\""), "Activation receipt omits transport/client internals");
}

async function verifyApprovalBlocks(): Promise<void> {
  section("2. Approval Blocks Before Supervisor Start");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const fake = supervisor();

  const missing = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt,
    approval: { approved: false, signature: action.signature ?? "" },
    supervisor: fake.run,
    timestamp: "2026-05-13T05:28:00.000Z",
  });
  assertEqual(missing.status, "blocked", "Missing approval blocks activation");
  assertEqual(missing.blockedReason, "approval_required", "Missing approval reason is explicit");
  assertEqual(fake.calls.length, 0, "Missing approval does not call supervisor");

  const wrongSignature = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt,
    approval: approval(action, { signature: "mcp-plugin:000000000000000000000000" }),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:29:00.000Z",
  });
  assertEqual(wrongSignature.status, "blocked", "Wrong approval signature blocks activation");
  assertEqual(wrongSignature.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(fake.calls.length, 0, "Wrong approval does not call supervisor");
}

async function verifyReceiptAndActionBlocks(): Promise<void> {
  section("3. Install Receipt, Action, and Sidecar Boundary Blocks");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const fake = supervisor();

  const missingReceipt = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt: undefined,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:30:00.000Z",
  });
  assertEqual(missingReceipt.status, "blocked", "Missing install receipt blocks activation");
  assertEqual(missingReceipt.blockedReason, "install_receipt_required", "Missing receipt reason is explicit");

  const failedInstall: PluginPackageInstallUpdateReceipt = {
    ...installReceipt,
    status: "failed",
    blockedReason: "executor_failed",
  };
  const failedReceipt = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt: failedInstall,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:31:00.000Z",
  });
  assertEqual(failedReceipt.status, "blocked", "Failed install receipt blocks activation");
  assertEqual(failedReceipt.blockedReason, "install_receipt_required", "Failed receipt reason is explicit");

  const mismatchedReceipt: PluginPackageInstallUpdateReceipt = {
    ...installReceipt,
    signature: "mcp-plugin:111111111111111111111111",
  };
  const mismatch = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt: mismatchedReceipt,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:32:00.000Z",
  });
  assertEqual(mismatch.status, "blocked", "Mismatched install receipt blocks activation");
  assertEqual(mismatch.blockedReason, "install_receipt_mismatch", "Mismatched receipt reason is explicit");

  const keepAction: PluginPackagePlanActionRecord = {
    ...action,
    action: "keep",
    reasons: ["signature_current"],
  };
  const unsupported = await executeApprovedPluginPackageSidecarActivation({
    action: keepAction,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:33:00.000Z",
  });
  assertEqual(unsupported.status, "blocked", "Keep action cannot activate");
  assertEqual(unsupported.blockedReason, "unsupported_action", "Unsupported action reason is explicit");

  const unknownPlan = planPluginPackageManifest(manifest({
    sidecars: [
      {
        id: "phase236-unknown",
        sidecarId: "phase236-unknown-sidecar",
        sidecarKind: "unknown",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
      },
    ],
  }), { acceptUnknownSidecars: true });
  const unknownAction = unknownPlan.actions[0];
  if (!unknownAction || unknownAction.action !== "import") {
    throw new Error("phase236 unknown-sidecar fixture did not create an import action");
  }
  const unknownReceipt = await completedInstallReceipt(unknownAction);
  const unknownBlocked = await executeApprovedPluginPackageSidecarActivation({
    action: unknownAction,
    installReceipt: unknownReceipt,
    approval: approval(unknownAction),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:34:00.000Z",
  });
  assertEqual(unknownBlocked.status, "blocked", "Unknown sidecar kind blocks activation");
  assertEqual(unknownBlocked.blockedReason, "invalid_sidecar_kind", "Unknown kind reason is explicit");

  assertEqual(fake.calls.length, 0, "Blocked receipt/action cases do not call supervisor");
}

async function verifySignatureTamperAndSupervisorFailure(): Promise<void> {
  section("4. Signature Tamper and Supervisor Failure");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const tamperedAction: PluginPackagePlanActionRecord = {
    ...action,
    definition: action.definition === undefined
      ? undefined
      : {
        ...action.definition,
        packageVersion: "10.0.1",
      },
  };
  const fake = supervisor();
  const tampered = await executeApprovedPluginPackageSidecarActivation({
    action: tamperedAction,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-13T05:35:00.000Z",
  });
  assertEqual(tampered.status, "blocked", "Tampered action definition blocks activation");
  assertEqual(tampered.blockedReason, "invalid_plugin_signature", "Tamper reason is explicit");
  assertEqual(fake.calls.length, 0, "Tampered action does not call supervisor");

  const failingSupervisor: PluginPackageSidecarActivationSupervisor = {
    start: async () => {
      throw new Error("supervisor failed SHOULD_NOT_LEAK_TOKEN");
    },
  };
  const failedStart = await executeApprovedPluginPackageSidecarActivation({
    action,
    installReceipt,
    approval: approval(action),
    supervisor: failingSupervisor,
    timestamp: "2026-05-13T05:36:00.000Z",
  });
  assertEqual(failedStart.status, "failed", "Supervisor failure returns failed activation receipt");
  assertEqual(failedStart.blockedReason, "supervisor_start_failed", "Supervisor failure reason is explicit");
  assertEqual(failedStart.activation, false, "Failed supervisor start does not activate");
  assertEqual(failedStart.sidecarStarted, false, "Failed supervisor start does not mark sidecar started");
  assert(!JSON.stringify(failedStart).includes("SHOULD_NOT_LEAK"), "Failed supervisor receipt redacts errors");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 236 Verification (Plugin Package Sidecar Activation Controls)\n");

  await verifyApprovedActivationReceipt();
  await verifyApprovalBlocks();
  await verifyReceiptAndActionBlocks();
  await verifySignatureTamperAndSupervisorFailure();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 236 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 236: plugin package sidecar activation controls are GREEN.");
}

run().catch((error) => {
  console.error("Phase 236 verification crashed:", error);
  process.exit(1);
});
