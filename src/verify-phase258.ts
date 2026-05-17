/**
 * Phase 258 Verification Script - Metadata-Bound Activation Handoff Execution
 *
 * Proves a ready metadata-bound marketplace activation handoff can be converted
 * into an approved sidecar activation receipt only through the existing injected
 * supervisor path, while blocked/tampered handoffs fail closed.
 *
 * Run: bun run src/verify-phase258.ts
 */

import {
  createPluginPackageMarketplaceMetadataBoundActivationHandoff,
  executeApprovedPluginPackageInstallUpdate,
  executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff,
  planPluginPackageManifest,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarSupervisorSnapshot,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateReceipt,
  type PluginPackageManifest,
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
    packageName: "@colony/plugin-phase258",
    packageVersion: "28.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase258.tgz",
    packageDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    reviewed: true,
    sidecars: [
      {
        id: "phase258-plugin",
        sidecarId: "phase258-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase258-sidecar",
        expectedServerVersion: "28.0.0",
      },
    ],
    ...overrides,
  };
}

function importAction(): PluginPackagePlanActionRecord {
  const action = planPluginPackageManifest(manifest()).actions[0];
  if (!action || action.action !== "import" || !action.signature || !action.definition) {
    throw new Error("phase258 fixture did not create an import action");
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
    reason: "metadata-bound activation handoff execution SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

async function completedInstallReceipt(action: PluginPackagePlanActionRecord): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: approval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase258-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed SHOULD_NOT_LEAK_TOKEN" }),
    timestamp: "2026-05-14T09:34:00.000Z",
  });
}

function readinessView(
  action: PluginPackagePlanActionRecord,
  state: "ready_for_activation_handoff" | "needs_activation_approval" | "active" = "ready_for_activation_handoff",
): PluginPackageMarketplaceMetadataBoundActivationReadinessView {
  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view",
    timestamp: "2026-05-14T09:35:00.000Z",
    catalogId: "catalog-phase258",
    installStatusRecordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view",
    installStatusEntryCount: 1,
    handoffCount: 1,
    entries: [
      {
        entryId: "phase258-entry",
        displayName: "Phase 258 Metadata-Bound Activation Execution Tools",
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

async function readyFixture() {
  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const handoff = createPluginPackageMarketplaceMetadataBoundActivationHandoff({
    readinessView: readinessView(action),
    entryId: "phase258-entry",
    sidecarSignature: action.signature ?? "",
    approvalSignature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T09:36:00.000Z",
  });
  return { action, installReceipt, handoff };
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
            connectedAt: "2026-05-14T09:37:00.000Z",
            protocolVersion: "SHOULD_NOT_LEAK_PROTOCOL",
            serverInfo: { name: "SHOULD_NOT_LEAK_SERVER", version: "28.0.0" },
            expectations: {},
          },
          ...result,
        };
      },
    },
  };
}

async function verifyReadyMetadataBoundHandoffExecutesThroughInjectedSupervisor(): Promise<void> {
  section("1. Ready Metadata-Bound Handoff Executes Through Existing Activation Helper");

  const { action, installReceipt, handoff } = await readyFixture();
  const fake = supervisor();
  const receipt = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
    timestamp: "2026-05-14T09:38:00.000Z",
  });

  assertEqual(receipt.recordType, "mcp_plugin_package_marketplace_metadata_bound_activation_handoff_execution_receipt", "Execution receipt uses metadata-bound record type");
  assertEqual(receipt.status, "completed", "Ready metadata-bound handoff execution completes");
  assertEqual(receipt.hostActionExecuted, true, "Receipt records host action execution");
  assertEqual(receipt.activation, true, "Receipt marks activation true only after supervisor start");
  assertEqual(receipt.sidecarStarted, true, "Receipt marks sidecar started only after supervisor start");
  assertEqual(receipt.requiresInjectedSupervisor, true, "Receipt requires injected supervisor");
  assertEqual(receipt.metadataBoundInstallRequired, true, "Receipt preserves metadata-bound install requirement");
  assertEqual(receipt.networkFetched, false, "Execution fetches no registry");
  assertEqual(receipt.packageInstalled, false, "Execution performs no package install");
  assertEqual(receipt.packageExecuted, false, "Execution performs no package-code execution");
  assertEqual(receipt.catalogMutated, false, "Execution mutates no catalog");
  assertEqual(receipt.credentialsPersisted, false, "Execution persists no credentials");
  assertEqual(receipt.handoff.hostActionKind, "start_metadata_bound_plugin_package_sidecar", "Receipt preserves metadata-bound host action kind");
  assertEqual(receipt.installReceipt.present, true, "Matching install receipt is summarized");
  assertEqual(receipt.delegatedActivationReceipt.present, true, "Delegated activation receipt is summarized");
  assertEqual(receipt.delegatedActivationReceipt.status, "completed", "Delegated activation completed");
  assertEqual(fake.calls.length, 1, "Supervisor is called exactly once");
  assertEqual(fake.calls[0]?.definition.id, "phase258-plugin", "Supervisor receives trusted sidecar definition");
  assertEqual(fake.calls[0]?.approvalSignature, action.signature, "Supervisor receives exact trust signature");
  assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Execution receipt redacts secrets and lifecycle internals");
  assert(!JSON.stringify(receipt).includes("plugins.example.com"), "Execution receipt does not leak package source URLs");
  assert(!JSON.stringify(receipt).includes("definition"), "Execution receipt omits sidecar definitions");
}

async function verifyBlockedAndTamperedHandoffsDoNotExecute(): Promise<void> {
  section("2. Blocked And Tampered Metadata-Bound Handoffs Do Not Execute");

  const { action, installReceipt, handoff } = await readyFixture();
  const fake = supervisor();
  const blocked = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
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
  assertEqual(blocked.status, "blocked", "Blocked metadata-bound handoff returns blocked execution receipt");
  assertEqual(blocked.blockedReason, "handoff_not_ready", "Blocked metadata-bound handoff reason is explicit");
  assertEqual(blocked.hostActionExecuted, false, "Blocked handoff executes no host action");
  assertEqual(fake.calls.length, 0, "Blocked handoff does not call supervisor");

  const tampered = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
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

  const forgedMetadataGate = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
    handoff: {
      ...handoff,
      installExecution: {
        ...handoff.installExecution,
        state: "blocked",
        receiptPresent: false,
        packageInstalled: false,
        metadataGate: {
          ...handoff.installExecution.metadataGate,
          state: "metadata_blocked",
          registryMetadataApplied: false,
          registryMetadataVerified: false,
        },
      },
    },
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
  });
  assertEqual(forgedMetadataGate.status, "blocked", "Forged metadata-bound install gate blocks execution");
  assertEqual(forgedMetadataGate.blockedReason, "handoff_not_ready", "Forged metadata-bound install gate reason is explicit");
  assertEqual(fake.calls.length, 0, "Forged metadata-bound install gate does not call supervisor");

  const missingHandoffApproval = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
    handoff: {
      ...handoff,
      approval: {
        ...handoff.approval,
        present: false,
      },
    },
    action,
    installReceipt,
    approval: approval(action),
    supervisor: fake.run,
  });
  assertEqual(missingHandoffApproval.status, "blocked", "Missing handoff approval summary blocks execution");
  assertEqual(missingHandoffApproval.blockedReason, "handoff_not_ready", "Missing handoff approval summary reason is explicit");
  assertEqual(fake.calls.length, 0, "Missing handoff approval summary does not call supervisor");
}

async function verifyApprovalInstallReceiptAndSupervisorFailureAreBounded(): Promise<void> {
  section("3. Approval, Install Receipt, And Supervisor Failure Are Bounded");

  const { action, installReceipt, handoff } = await readyFixture();
  const fake = supervisor();
  const wrongApproval = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
    handoff,
    action,
    installReceipt,
    approval: approval(action, { signature: "mcp-plugin:111111111111111111111111" }),
    supervisor: fake.run,
  });
  assertEqual(wrongApproval.status, "blocked", "Wrong approval blocks execution before supervisor");
  assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(fake.calls.length, 0, "Wrong approval does not call supervisor");

  const missingInstallReceipt = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
    handoff,
    action,
    approval: approval(action),
    supervisor: fake.run,
  });
  assertEqual(missingInstallReceipt.status, "blocked", "Missing install receipt blocks execution before supervisor");
  assertEqual(missingInstallReceipt.blockedReason, "install_receipt_mismatch", "Missing install receipt reason is explicit");
  assertEqual(fake.calls.length, 0, "Missing install receipt does not call supervisor");

  const failingSupervisor: PluginPackageSidecarActivationSupervisor = {
    start: async () => {
      throw new Error("metadata-bound supervisor SHOULD_NOT_LEAK_TOKEN failure");
    },
  };
  const failed = await executeApprovedPluginPackageMarketplaceMetadataBoundActivationHandoff({
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
  section("4. Metadata-Bound Handoff Execution Runtime Contains No Direct Network Or Process Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-metadata-bound-activation-handoff-execution.ts").text();
  assert(!source.includes("fetch("), "Metadata-bound execution runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Metadata-bound execution runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Metadata-bound execution runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 258 Verification (Metadata-Bound Activation Handoff Execution)\n");

  await verifyReadyMetadataBoundHandoffExecutesThroughInjectedSupervisor();
  await verifyBlockedAndTamperedHandoffsDoNotExecute();
  await verifyApprovalInstallReceiptAndSupervisorFailureAreBounded();
  await verifyRuntimeHasNoDirectNetworkOrProcessPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 258 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 258: metadata-bound marketplace activation handoff execution is GREEN.");
}

run().catch((error) => {
  console.error("Phase 258 verification crashed:", error);
  process.exit(1);
});
