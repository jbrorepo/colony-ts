/**
 * Phase 263 Verification Script - Plugin Marketplace Lifecycle Approval Packets
 *
 * Proves lifecycle runbook steps can be projected into bounded read-only
 * operator/reviewer approval packets without fetching registries, installing
 * packages, executing package code, activating or starting sidecars, mutating
 * catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase263.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalPackets,
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

const digest = "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef";

function lifecycleRunbookView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase263",
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
    timestamp: "2026-05-14T10:51:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_approval_packets",
    timestamp: "2026-05-14T10:52:00.000Z",
  });

  return createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T10:53:00.000Z",
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
      version: "33.0.0",
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

function verifyApprovalPacketsProjectApprovalRequiredSteps(): void {
  section("1. Lifecycle Approval Packets Project Approval-Required Steps");

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: lifecycleRunbookView(),
    timestamp: "2026-05-14T10:54:00.000Z",
  });

  assertEqual(packets.recordType, "mcp_plugin_package_marketplace_lifecycle_approval_packets_view", "Approval packets use stable record type");
  assertEqual(packets.runbookRecordType, "mcp_plugin_package_marketplace_lifecycle_runbook_view", "Approval packets record source runbook projection");
  assertEqual(packets.networkFetched, false, "Approval packets fetch no registry");
  assertEqual(packets.packageInstalled, false, "Approval packets perform no package install");
  assertEqual(packets.packageExecuted, false, "Approval packets perform no package-code execution");
  assertEqual(packets.activation, false, "Approval packets perform no activation");
  assertEqual(packets.sidecarStarted, false, "Approval packets start no sidecar");
  assertEqual(packets.catalogMutated, false, "Approval packets mutate no catalog");
  assertEqual(packets.credentialsPersisted, false, "Approval packets persist no credentials");
  assertEqual(packets.runbookStepCount, 6, "Approval packets retain source runbook step count");
  assertEqual(packets.packetCount, 4, "Approval packets include approval-required steps by default");
  assertEqual(packets.packets[0]?.phase, "metadata", "Metadata packet comes first");
  assertEqual(packets.packets[1]?.phase, "install", "Install approval packet follows metadata");
  assertEqual(packets.packets[2]?.phase, "activation", "Activation readiness packet follows install");
  assertEqual(packets.packets[3]?.phase, "activation", "Activation handoff packet follows readiness");
  assertEqual(packets.packets[0]?.approvalSubject, "plugin-marketplace:metadata", "Metadata approval subject is explicit");
  assertEqual(packets.packets[1]?.approvalSubject, "plugin-marketplace:install-update", "Install approval subject is explicit");
  assertEqual(packets.packets[2]?.approvalSubject, "plugin-marketplace:activation-readiness", "Readiness approval subject is explicit");
  assertEqual(packets.packets[3]?.approvalSubject, "plugin-marketplace:activation", "Activation approval subject is explicit");
  assert(packets.packets.every((packet) => packet.executionMode === "operator_only"), "Every approval packet is operator-only");
  assert(packets.packets.every((packet) => packet.approvalRequired), "Every approval packet requires explicit approval");
  assertEqual(packets.summary.metadataPackets, 1, "Summary counts metadata packets");
  assertEqual(packets.summary.installPackets, 1, "Summary counts install packets");
  assertEqual(packets.summary.activationPackets, 2, "Summary counts activation packets");
  assertEqual(packets.summary.inspectionPackets, 0, "Summary records no inspection approval packets");
  assertEqual(packets.summary.omittedInspectOnlySteps, 2, "Summary reports inspect-only runbook steps omitted");
  assert(!JSON.stringify(packets).includes("SHOULD_NOT_LEAK"), "Approval packets redact unsafe nested content");
  assert(!JSON.stringify(packets).includes("plugins.example.com"), "Approval packets do not leak registry URLs");
}

function verifyApprovalPacketsCanFocusReviewerQueue(): void {
  section("2. Lifecycle Approval Packets Focus Reviewer Queue");

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: lifecycleRunbookView(),
    includePhases: ["activation"],
    maxPackets: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T10:55:00.000Z",
  });

  assertEqual(packets.audience, "reviewer", "Approval packet audience can be reviewer");
  assertEqual(packets.packetCount, 1, "Focused packets respect maxPackets");
  assertEqual(packets.packets[0]?.phase, "activation", "Focused packets keep requested phase");
  assertEqual(packets.packets[0]?.approvalSubject, "plugin-marketplace:activation-readiness", "Focused queue preserves approval order within phase");
  assertEqual(packets.summary.omittedApprovalPackets, 1, "Focused packets report approval packets omitted by cap");
  assertEqual(packets.summary.omittedInspectOnlySteps, 0, "Focused phase reports no omitted inspect-only activation steps in fixture");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Approval Packets Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-approval-packets.ts").text();
  assert(!source.includes("fetch("), "Approval packets runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Approval packets runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Approval packets runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 263 Verification (Plugin Marketplace Lifecycle Approval Packets)\n");

  verifyApprovalPacketsProjectApprovalRequiredSteps();
  verifyApprovalPacketsCanFocusReviewerQueue();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 263 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 263: plugin marketplace lifecycle approval packets are GREEN.");
}

run().catch((error) => {
  console.error("Phase 263 verification crashed:", error);
  process.exit(1);
});
