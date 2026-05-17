/**
 * Phase 261 Verification Script - Plugin Marketplace Lifecycle Handoff
 *
 * Proves the read-only marketplace lifecycle board can be converted into a
 * bounded operator handoff without fetching registries, installing packages,
 * executing package code, activating or starting sidecars, mutating catalogs,
 * or persisting credentials.
 *
 * Run: bun run src/verify-phase261.ts
 */

import {
  createPluginPackageMarketplaceLifecycleHandoff,
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

const digest = "sha256:abababababababababababababababababababababababababababababababab";

function lifecycleStatusView() {
  return createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase261",
    metadataPlanningView: {
      entries: [
        stageEntry("metadata-entry", "Metadata Missing", "metadata_missing"),
        stageEntry("blocked-entry", "Metadata Blocked", "metadata_blocked", "registry_fetch_approval_required"),
        stageEntry("install-entry", "Install Pending", "metadata_ready"),
        stageEntry("readiness-entry", "Readiness Pending", "metadata_ready"),
        stageEntry("activation-entry", "Activation Pending", "metadata_ready"),
        stageEntry("active-entry", "Active Sidecar", "metadata_ready"),
        stageEntry("failed-entry", "Install Failed", "metadata_ready"),
      ],
      warnings: ["metadata SHOULD_NOT_LEAK https://plugins.example.com/private"],
    },
    installStatusView: {
      entries: [
        stageEntry("readiness-entry", "Readiness Pending", "completed"),
        stageEntry("activation-entry", "Activation Pending", "completed"),
        stageEntry("active-entry", "Active Sidecar", "completed"),
        stageEntry("failed-entry", "Install Failed", "failed", "install_update_failed"),
      ],
      warnings: ["install SHOULD_NOT_LEAK"],
    },
    activationReadinessView: {
      entries: [
        stageEntry("activation-entry", "Activation Pending", "ready_for_activation_handoff"),
        stageEntry("active-entry", "Active Sidecar", "active"),
        stageEntry("failed-entry", "Install Failed", "install_failed", "install_update_failed"),
      ],
      warnings: ["readiness SHOULD_NOT_LEAK"],
    },
    activationExecutionStatusView: {
      entries: [
        {
          ...stageEntry("active-entry", "Active Sidecar", "active"),
          receipt: { present: true },
        },
      ],
      warnings: ["activation SHOULD_NOT_LEAK"],
    },
    timestamp: "2026-05-14T10:30:00.000Z",
  });
}

function stageEntry(entryId: string, displayName: string, state: string, blockedReason?: string) {
  return {
    entryId,
    displayName,
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    package: {
      name: `@colony/${entryId}`,
      version: "31.0.0",
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
    nextActions: ["nested next action SHOULD_NOT_LEAK"],
  };
}

function verifyLifecycleHandoffProjectsOperatorActions(): void {
  section("1. Lifecycle Handoff Projects Bounded Operator Actions");

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: lifecycleStatusView(),
    operatorIntent: "continue_safe_marketplace_progress",
    timestamp: "2026-05-14T10:31:00.000Z",
  });

  assertEqual(handoff.recordType, "mcp_plugin_package_marketplace_lifecycle_handoff_view", "Lifecycle handoff uses stable record type");
  assertEqual(handoff.lifecycleRecordType, "mcp_plugin_package_marketplace_lifecycle_status_view", "Lifecycle handoff records source lifecycle projection");
  assertEqual(handoff.networkFetched, false, "Lifecycle handoff fetches no registry");
  assertEqual(handoff.packageInstalled, false, "Lifecycle handoff performs no package install");
  assertEqual(handoff.packageExecuted, false, "Lifecycle handoff performs no package-code execution");
  assertEqual(handoff.activation, false, "Lifecycle handoff performs no activation");
  assertEqual(handoff.sidecarStarted, false, "Lifecycle handoff starts no sidecar");
  assertEqual(handoff.catalogMutated, false, "Lifecycle handoff mutates no catalog");
  assertEqual(handoff.credentialsPersisted, false, "Lifecycle handoff persists no credentials");
  assertEqual(handoff.entries.length, 7, "Lifecycle handoff preserves all lifecycle entries");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "metadata-entry")?.actionKind, "collect_registry_metadata_evidence", "Metadata-pending entries collect registry metadata evidence");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "blocked-entry")?.actionKind, "resolve_metadata_gate", "Metadata-blocked entries resolve the metadata gate");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "install-entry")?.actionKind, "prepare_metadata_bound_install_update_handoff", "Install-pending entries prepare install handoff");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "readiness-entry")?.actionKind, "collect_activation_readiness", "Readiness-pending entries collect activation readiness");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "activation-entry")?.actionKind, "prepare_metadata_bound_activation_handoff", "Activation-pending entries prepare activation handoff");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "active-entry")?.actionKind, "inspect_sidecar_status", "Active entries inspect sidecar status");
  assertEqual(handoff.entries.find((entry) => entry.entryId === "failed-entry")?.actionKind, "inspect_install_receipt", "Failed install entries inspect receipts");
  assert(handoff.entries.every((entry) => entry.executionMode === "operator_only"), "Every lifecycle handoff entry is operator-only");
  assertEqual(handoff.summary.total, 7, "Summary counts all handoff entries");
  assertEqual(handoff.summary.approvalRequired, 5, "Summary counts approval-required actions");
  assertEqual(handoff.summary.inspectOnly, 2, "Summary counts inspect-only actions");
  assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Lifecycle handoff redacts unsafe nested content");
  assert(!JSON.stringify(handoff).includes("plugins.example.com"), "Lifecycle handoff does not leak registry URLs");
}

function verifyLifecycleHandoffFiltersAndCaps(): void {
  section("2. Lifecycle Handoff Filters And Caps Operator Queue");

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: lifecycleStatusView(),
    includeStates: ["install_not_executed", "activation_not_executed", "active"],
    maxEntries: 2,
    timestamp: "2026-05-14T10:32:00.000Z",
  });

  assertEqual(handoff.entries.length, 2, "Filtered handoff respects maxEntries");
  assert(handoff.entries.every((entry) => ["install_not_executed", "activation_not_executed"].includes(entry.lifecycleState)), "Filtered handoff keeps only requested queued lifecycle states by priority");
  assertEqual(handoff.summary.omittedEntries, 1, "Summary reports requested entries omitted by cap");
  assertEqual(handoff.entries[0]?.lifecycleState, "install_not_executed", "Install handoff comes before activation handoff");
  assertEqual(handoff.entries[1]?.lifecycleState, "activation_not_executed", "Activation handoff remains queued after install handoff");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Handoff Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-handoff.ts").text();
  assert(!source.includes("fetch("), "Lifecycle handoff runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Lifecycle handoff runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Lifecycle handoff runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 261 Verification (Plugin Marketplace Lifecycle Handoff)\n");

  verifyLifecycleHandoffProjectsOperatorActions();
  verifyLifecycleHandoffFiltersAndCaps();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 261 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 261: plugin marketplace lifecycle handoff is GREEN.");
}

run().catch((error) => {
  console.error("Phase 261 verification crashed:", error);
  process.exit(1);
});
