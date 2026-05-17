/**
 * Phase 262 Verification Script - Plugin Marketplace Lifecycle Runbook
 *
 * Proves a lifecycle handoff can be turned into a bounded read-only operator
 * runbook without fetching registries, installing packages, executing package
 * code, activating or starting sidecars, mutating catalogs, or persisting
 * credentials.
 *
 * Run: bun run src/verify-phase262.ts
 */

import {
  createPluginPackageMarketplaceLifecycleHandoff,
  createPluginPackageMarketplaceLifecycleRunbook,
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

const digest = "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";

function lifecycleHandoffView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase262",
    metadataPlanningView: {
      entries: [
        stageEntry("metadata-entry", "Metadata Missing", "metadata_missing"),
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
    timestamp: "2026-05-14T10:42:00.000Z",
  });

  return createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_runbook",
    timestamp: "2026-05-14T10:43:00.000Z",
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
      version: "32.0.0",
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

function verifyLifecycleRunbookOrdersOperatorSteps(): void {
  section("1. Lifecycle Runbook Orders Operator Steps");

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: lifecycleHandoffView(),
    timestamp: "2026-05-14T10:44:00.000Z",
  });

  assertEqual(runbook.recordType, "mcp_plugin_package_marketplace_lifecycle_runbook_view", "Lifecycle runbook uses stable record type");
  assertEqual(runbook.handoffRecordType, "mcp_plugin_package_marketplace_lifecycle_handoff_view", "Lifecycle runbook records source handoff projection");
  assertEqual(runbook.networkFetched, false, "Lifecycle runbook fetches no registry");
  assertEqual(runbook.packageInstalled, false, "Lifecycle runbook performs no package install");
  assertEqual(runbook.packageExecuted, false, "Lifecycle runbook performs no package-code execution");
  assertEqual(runbook.activation, false, "Lifecycle runbook performs no activation");
  assertEqual(runbook.sidecarStarted, false, "Lifecycle runbook starts no sidecar");
  assertEqual(runbook.catalogMutated, false, "Lifecycle runbook mutates no catalog");
  assertEqual(runbook.credentialsPersisted, false, "Lifecycle runbook persists no credentials");
  assertEqual(runbook.steps.length, 6, "Lifecycle runbook keeps all handoff entries by default");
  assertEqual(runbook.steps[0]?.phase, "metadata", "Metadata work comes first");
  assertEqual(runbook.steps[1]?.phase, "install", "Install work follows metadata work");
  assertEqual(runbook.steps[2]?.phase, "install", "Install inspection stays in install phase");
  assertEqual(runbook.steps[3]?.phase, "activation", "Activation readiness follows install work");
  assertEqual(runbook.steps[4]?.phase, "activation", "Activation handoff follows activation readiness");
  assertEqual(runbook.steps[5]?.phase, "inspection", "Active sidecar inspection is last");
  assert(runbook.steps.every((step) => step.executionMode === "operator_only"), "Every runbook step is operator-only");
  assertEqual(runbook.summary.approvalRequiredSteps, 4, "Summary counts approval-required runbook steps");
  assertEqual(runbook.summary.inspectOnlySteps, 2, "Summary counts inspect-only runbook steps");
  assert(!JSON.stringify(runbook).includes("SHOULD_NOT_LEAK"), "Lifecycle runbook redacts unsafe nested content");
  assert(!JSON.stringify(runbook).includes("plugins.example.com"), "Lifecycle runbook does not leak registry URLs");
}

function verifyLifecycleRunbookCanFocusApprovalQueue(): void {
  section("2. Lifecycle Runbook Focuses Approval Queue");

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: lifecycleHandoffView(),
    includeInspectOnly: false,
    maxSteps: 3,
    audience: "reviewer",
    timestamp: "2026-05-14T10:45:00.000Z",
  });

  assertEqual(runbook.audience, "reviewer", "Runbook audience can be set to reviewer");
  assertEqual(runbook.steps.length, 3, "Focused runbook respects maxSteps");
  assert(runbook.steps.every((step) => step.requiresExplicitApproval), "Focused runbook omits inspect-only steps");
  assertEqual(runbook.summary.omittedSteps, 1, "Focused runbook reports approval steps omitted by cap");
  assertEqual(runbook.steps[0]?.phase, "metadata", "Focused runbook keeps metadata first");
  assertEqual(runbook.steps[1]?.phase, "install", "Focused runbook keeps install second");
  assertEqual(runbook.steps[2]?.phase, "activation", "Focused runbook keeps activation third");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Runbook Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-runbook.ts").text();
  assert(!source.includes("fetch("), "Lifecycle runbook runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Lifecycle runbook runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Lifecycle runbook runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 262 Verification (Plugin Marketplace Lifecycle Runbook)\n");

  verifyLifecycleRunbookOrdersOperatorSteps();
  verifyLifecycleRunbookCanFocusApprovalQueue();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 262 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 262: plugin marketplace lifecycle runbook is GREEN.");
}

run().catch((error) => {
  console.error("Phase 262 verification crashed:", error);
  process.exit(1);
});
