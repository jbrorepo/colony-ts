/**
 * Phase 260 Verification Script - Plugin Marketplace Lifecycle Status
 *
 * Proves existing marketplace metadata/install/activation status views can be
 * projected into a read-only lifecycle board without fetching registries,
 * installing packages, executing package code, starting sidecars, mutating
 * catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase260.ts
 */

import {
  createPluginPackageMarketplaceLifecycleStatus,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

function metadataPlanningView() {
  return {
    recordType: "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view",
    timestamp: "2026-05-14T10:00:00.000Z",
    catalogId: "catalog-phase260",
    entryCount: 5,
    handoffCount: 5,
    receiptCount: 5,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    entries: [
      metadataEntry("ready-entry", "Lifecycle Ready", "metadata_ready"),
      metadataEntry("missing-entry", "Lifecycle Missing Metadata", "metadata_missing"),
      metadataEntry("blocked-entry", "Lifecycle Blocked Metadata", "metadata_blocked", "registry_fetch_approval_required"),
      metadataEntry("failed-entry", "Lifecycle Failed Metadata", "metadata_failed", "registry_fetch_failed"),
      metadataEntry("active-entry", "Lifecycle Active", "metadata_ready"),
    ],
    warnings: ["metadata planning SHOULD_NOT_LEAK_TOKEN"],
  };
}

function metadataEntry(
  entryId: string,
  displayName: string,
  state: string,
  blockedReason?: string,
) {
  return {
    entryId,
    displayName,
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    package: {
      name: `@colony/${entryId}`,
      version: "30.0.0",
      source: "<redacted>",
      digest,
    },
    sidecar: {
      id: `${entryId}-sidecar`,
      kind: "local-sidecar",
    },
    registry: {
      url: "https://plugins.example.com/SHOULD_NOT_LEAK",
    },
    receipt: {
      present: state !== "metadata_missing",
      status: state === "metadata_ready" ? "completed" : state === "metadata_failed" ? "failed" : "blocked",
      hostNetworkExecuted: state === "metadata_ready" || state === "metadata_failed",
      registryFetched: state === "metadata_ready",
    },
    metadata: {
      present: state === "metadata_ready",
      packageName: `@colony/${entryId}`,
      packageVersion: "30.0.0",
      registryUrl: "https://plugins.example.com/SHOULD_NOT_LEAK",
      digest,
      signatureCount: state === "metadata_ready" ? 1 : 0,
    },
    plan: {
      action: state === "metadata_ready" ? "import" : "<blocked>",
      registryMetadataApplied: state === "metadata_ready",
      registryMetadataVerified: state === "metadata_ready",
      signaturePresent: state === "metadata_ready",
      blockedReasons: blockedReason === undefined ? [] : [blockedReason],
      warnings: ["SHOULD_NOT_LEAK"],
    },
    nextActions: ["metadata next action SHOULD_NOT_LEAK"],
  };
}

function installStatusView() {
  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view",
    timestamp: "2026-05-14T10:01:00.000Z",
    catalogId: "catalog-phase260",
    handoffCount: 4,
    receiptCount: 4,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    entries: [
      installEntry("ready-entry", "completed"),
      installEntry("blocked-entry", "metadata_blocked", "metadata_gate_not_ready"),
      installEntry("failed-entry", "failed", "install_update_failed"),
      installEntry("active-entry", "completed"),
    ],
    summary: {
      total: 4,
      metadataBlocked: 1,
      notExecuted: 0,
      blocked: 0,
      failed: 1,
      completed: 2,
    },
    warnings: ["install status SHOULD_NOT_LEAK_TOKEN"],
  };
}

function installEntry(entryId: string, state: string, blockedReason?: string) {
  return {
    entryId,
    displayName: `Install ${entryId}`,
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    metadataGate: {
      required: true,
      state: state === "metadata_blocked" ? "metadata_blocked" : "metadata_ready",
      registryMetadataApplied: state !== "metadata_blocked",
      registryMetadataVerified: state !== "metadata_blocked",
    },
    handoffStatus: state === "metadata_blocked" ? "blocked" : "ready",
    receipt: {
      present: state !== "not_executed",
      recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff_execution_receipt",
      status: state === "completed" ? "completed" : state === "failed" ? "failed" : "blocked",
      hostActionExecuted: state === "completed" || state === "failed",
      packageInstalled: state === "completed",
    },
    nextAction: state === "completed" ? "verify_installed_package" : "inspect_failed_receipt",
    package: {
      name: `@colony/${entryId}`,
      version: "30.0.0",
      source: "<redacted>",
      digest,
    },
    sidecar: {
      id: `${entryId}-sidecar`,
      kind: "local-sidecar",
    },
  };
}

function activationReadinessView() {
  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view",
    timestamp: "2026-05-14T10:02:00.000Z",
    catalogId: "catalog-phase260",
    installStatusRecordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view",
    installStatusEntryCount: 3,
    handoffCount: 3,
    entries: [
      readinessEntry("ready-entry", "ready_for_activation_handoff"),
      readinessEntry("failed-entry", "install_failed", "install_update_failed"),
      readinessEntry("active-entry", "active"),
    ],
    summary: {
      total: 3,
      metadataBlocked: 0,
      installNotExecuted: 0,
      installBlocked: 0,
      installFailed: 1,
      needsActivationApproval: 0,
      readyForActivationHandoff: 1,
      active: 1,
    },
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: ["readiness SHOULD_NOT_LEAK_TOKEN"],
  };
}

function readinessEntry(entryId: string, state: string, blockedReason?: string) {
  return {
    entryId,
    displayName: `Readiness ${entryId}`,
    signature: "mcp-plugin:aaaaaaaaaaaaaaaaaaaaaaaa",
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    installExecution: {
      state: state === "install_failed" ? "failed" : "completed",
      receiptPresent: true,
      packageInstalled: state !== "install_failed",
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
    nextAction: state === "active" ? "inspect_active_sidecar" : "create_activation_handoff",
    activation: false,
    sidecarStarted: false,
    package: {
      name: `@colony/${entryId}`,
      version: "30.0.0",
      source: "<redacted>",
      digest,
    },
    sidecar: {
      id: `${entryId}-sidecar`,
      kind: "local-sidecar",
    },
  };
}

function activationStatusView() {
  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_execution_status_view",
    timestamp: "2026-05-14T10:03:00.000Z",
    catalogId: "catalog-phase260",
    readinessRecordType: "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view",
    readinessEntryCount: 2,
    receiptCount: 2,
    entries: [
      activationEntry("ready-entry", "completed"),
      activationEntry("active-entry", "active"),
    ],
    summary: {
      total: 2,
      metadataBlocked: 0,
      activationNotReady: 0,
      notExecuted: 0,
      blocked: 0,
      failed: 0,
      completed: 1,
      active: 1,
    },
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: ["activation status SHOULD_NOT_LEAK_TOKEN"],
  };
}

function activationEntry(entryId: string, state: string) {
  return {
    entryId,
    displayName: `Activation ${entryId}`,
    signature: "mcp-plugin:aaaaaaaaaaaaaaaaaaaaaaaa",
    state,
    readinessState: state === "active" ? "active" : "ready_for_activation_handoff",
    metadataGate: {
      required: true,
      state: "metadata_ready",
      registryMetadataApplied: true,
      registryMetadataVerified: true,
    },
    activation: false,
    sidecarStarted: false,
    receipt: {
      present: true,
      recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_handoff_execution_receipt",
      status: state === "active" || state === "completed" ? "completed" : state,
      hostActionExecuted: true,
      activation: true,
      sidecarStarted: true,
      supervisorState: state === "active" ? "running" : "connected",
      timestamp: "2026-05-14T10:03:00.000Z",
    },
    nextActions: ["inspect running sidecar SHOULD_NOT_LEAK"],
    package: {
      name: `@colony/${entryId}`,
      version: "30.0.0",
      source: "<redacted>",
      digest,
    },
    sidecar: {
      id: `${entryId}-sidecar`,
      kind: "local-sidecar",
    },
  };
}

function verifyLifecycleBoard(): void {
  section("1. Lifecycle Board Projects Existing Status Views");

  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase260",
    metadataPlanningView: metadataPlanningView() as any,
    installStatusView: installStatusView() as any,
    activationReadinessView: activationReadinessView() as any,
    activationExecutionStatusView: activationStatusView() as any,
    timestamp: "2026-05-14T10:04:00.000Z",
  });

  assertEqual(status.recordType, "mcp_plugin_package_marketplace_lifecycle_status_view", "Lifecycle board uses stable record type");
  assertEqual(status.networkFetched, false, "Lifecycle board fetches no registry");
  assertEqual(status.packageInstalled, false, "Lifecycle board performs no package install");
  assertEqual(status.packageExecuted, false, "Lifecycle board performs no package-code execution");
  assertEqual(status.activation, false, "Lifecycle board performs no activation");
  assertEqual(status.sidecarStarted, false, "Lifecycle board starts no sidecar");
  assertEqual(status.catalogMutated, false, "Lifecycle board mutates no catalog");
  assertEqual(status.credentialsPersisted, false, "Lifecycle board persists no credentials");
  assertEqual(status.entries.length, 5, "Lifecycle board preserves all known entries");
  assertEqual(status.entries.find((entry) => entry.entryId === "ready-entry")?.state, "completed", "Completed activation wins overall state");
  assertEqual(status.entries.find((entry) => entry.entryId === "active-entry")?.state, "active", "Active activation wins overall state");
  assertEqual(status.entries.find((entry) => entry.entryId === "missing-entry")?.state, "metadata_pending", "Missing metadata remains metadata pending");
  assertEqual(status.entries.find((entry) => entry.entryId === "blocked-entry")?.state, "metadata_blocked", "Blocked metadata remains metadata blocked");
  assertEqual(status.entries.find((entry) => entry.entryId === "failed-entry")?.state, "install_failed", "Failed install is visible before activation");
  assertEqual(status.summary.active, 1, "Summary counts active entries");
  assertEqual(status.summary.completed, 1, "Summary counts completed entries");
  assertEqual(status.summary.metadataPending, 1, "Summary counts metadata pending entries");
  assertEqual(status.summary.metadataBlocked, 1, "Summary counts metadata blocked entries");
  assertEqual(status.summary.installFailed, 1, "Summary counts install failures");
  assert(status.entries.find((entry) => entry.entryId === "ready-entry")?.nextActions[0]?.includes("Inspect") === true, "Completed lifecycle suggests inspection instead of activation");
  assert(!JSON.stringify(status).includes("SHOULD_NOT_LEAK"), "Lifecycle board redacts unsafe nested status content");
  assert(!JSON.stringify(status).includes("plugins.example.com"), "Lifecycle board does not leak registry URLs");
}

function verifyLifecycleFallbacks(): void {
  section("2. Lifecycle Board Falls Back Through Earlier Stages");

  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase260",
    metadataPlanningView: metadataPlanningView() as any,
    installStatusView: {
      ...installStatusView(),
      entries: [installEntry("ready-entry", "completed")],
    } as any,
    timestamp: "2026-05-14T10:05:00.000Z",
  });

  assertEqual(status.entries.find((entry) => entry.entryId === "ready-entry")?.state, "activation_not_ready", "Completed install without activation readiness asks for activation readiness");
  assertEqual(status.entries.find((entry) => entry.entryId === "active-entry")?.state, "install_not_executed", "Metadata-ready entry without install status asks for install execution");
  assertEqual(status.entries.find((entry) => entry.entryId === "blocked-entry")?.blockedReason, "registry_fetch_approval_required", "Metadata blocked reason remains bounded");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-status.ts").text();
  assert(!source.includes("fetch("), "Lifecycle runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Lifecycle runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Lifecycle runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 260 Verification (Plugin Marketplace Lifecycle Status)\n");

  verifyLifecycleBoard();
  verifyLifecycleFallbacks();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 260 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 260: plugin marketplace lifecycle status is GREEN.");
}

run().catch((error) => {
  console.error("Phase 260 verification crashed:", error);
  process.exit(1);
});
