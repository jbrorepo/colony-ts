/**
 * Phase 268 Verification Script - Plugin Marketplace Lifecycle Operator Queue
 *
 * Proves lifecycle host handoff requests can be projected into a read-only
 * operator queue grouped by approval blockers, metadata, install/update,
 * activation-readiness, and activation request lanes. The queue prepares the
 * default UX boundary without fetching registries, installing packages,
 * executing package code, activating sidecars, mutating catalogs, or persisting
 * credentials.
 *
 * Run: bun run src/verify-phase268.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleHandoff,
  createPluginPackageMarketplaceLifecycleHostHandoffRequest,
  createPluginPackageMarketplaceLifecycleOperatorQueue,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase268",
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
    timestamp: "2026-05-14T11:52:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_operator_queue",
    timestamp: "2026-05-14T11:53:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T11:54:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T11:55:00.000Z",
  });

  return createPluginPackageMarketplaceLifecycleApprovalReview({
    approvalPacketsView: packets,
    approvalEvidence: [
      {
        packetId: packets.packets[0]!.packetId,
        approvalSubject: packets.packets[0]!.approvalSubject,
        approved: true,
        approvalSignature: "approval-metadata-entry-SHOULD_NOT_LEAK",
        approver: "operator@example.test",
        expiresAt: "2026-05-14T12:20:00.000Z",
      },
      {
        packetId: packets.packets[1]!.packetId,
        approvalSubject: "plugin-marketplace:activation",
        approved: true,
        approvalSignature: "approval-install-entry-SHOULD_NOT_LEAK",
      },
      {
        packetId: packets.packets[2]!.packetId,
        approvalSubject: packets.packets[2]!.approvalSubject,
        approved: true,
        approvalSignature: "approval-readiness-entry-SHOULD_NOT_LEAK",
        expiresAt: "2026-05-14T10:00:00.000Z",
      },
    ],
    timestamp: "2026-05-14T11:56:00.000Z",
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
      version: "38.0.0",
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

function hostHandoffRequestView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T11:57:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T11:58:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T11:59:00.000Z",
  });
}

function verifyOperatorQueueGroupsRequestLanes(): void {
  section("1. Lifecycle Operator Queue Groups Request Lanes");

  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: hostHandoffRequestView(),
    timestamp: "2026-05-14T12:00:00.000Z",
  });

  assertEqual(queue.recordType, "mcp_plugin_package_marketplace_lifecycle_operator_queue_view", "Operator queue uses stable record type");
  assertEqual(queue.hostHandoffRequestRecordType, "mcp_plugin_package_marketplace_lifecycle_host_handoff_request_view", "Operator queue records source request view");
  assertEqual(queue.sourceRequestCount, 4, "Operator queue records source request count");
  assertEqual(queue.queueItemCount, 4, "Operator queue includes each request by default");
  assertEqual(queue.networkFetched, false, "Operator queue fetches no registry");
  assertEqual(queue.packageInstalled, false, "Operator queue performs no package install");
  assertEqual(queue.packageExecuted, false, "Operator queue performs no package-code execution");
  assertEqual(queue.activation, false, "Operator queue performs no activation");
  assertEqual(queue.sidecarStarted, false, "Operator queue starts no sidecar");
  assertEqual(queue.catalogMutated, false, "Operator queue mutates no catalog");
  assertEqual(queue.credentialsPersisted, false, "Operator queue persists no credentials");
  assertEqual(queue.defaultLiveExecution, false, "Operator queue does not enable default live execution");
  assertEqual(queue.lanes.metadataRequests.length, 1, "Ready metadata request lands in metadata lane");
  assertEqual(queue.lanes.approvalBlockers.length, 3, "Blocked requests land in approval blocker lane");
  assertEqual(queue.summary.metadataRequests, 1, "Summary counts metadata requests");
  assertEqual(queue.summary.approvalBlockers, 3, "Summary counts approval blockers");
  assertEqual(queue.summary.readyForOperatorPresentation, 1, "Summary counts ready operator presentation items");
  assertEqual(queue.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(queue.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(queue.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");

  const ready = queue.lanes.metadataRequests[0]!;
  assertEqual(ready.itemState, "ready_for_operator_presentation", "Ready request becomes presentable queue item");
  assertEqual(ready.operatorAction, "present_metadata_request", "Ready metadata item maps operator action");
  assertEqual(ready.nextAction, "present_request", "Ready item next action presents request");
  assertEqual(ready.requestCommand, "request_metadata_host_handoff", "Ready item keeps source request command");
  assertEqual(ready.hostRequest.payloadMode, "descriptor_only", "Ready item keeps descriptor-only payload");
  assertEqual(ready.hostRequest.source, "<redacted>", "Ready item redacts host request source");
  assertEqual(ready.executionMode, "operator_only", "Ready item stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready item denies host action");
  assertEqual(ready.queueMutable, false, "Ready item denies queue mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready item denies default live execution");
  assert(queue.lanes.approvalBlockers.every((item) => item.nextAction !== "present_request"), "Blockers do not present host requests");
  assert(queue.lanes.approvalBlockers.some((item) => item.nextAction === "refresh_expired_approval"), "Expired blocker asks for approval refresh");
  assert(!JSON.stringify(queue).includes("SHOULD_NOT_LEAK"), "Operator queue redacts unsafe approval signatures");
  assert(!JSON.stringify(queue).includes("plugins.example.com"), "Operator queue does not leak registry URLs");
}

function verifyOperatorQueueCanFocusReadyInstallLane(): void {
  section("2. Lifecycle Operator Queue Focuses Ready Install Lane");

  const baseReview = lifecycleApprovalReviewView();
  const installReview = createPluginPackageMarketplaceLifecycleApprovalReview({
    approvalPacketsView: {
      recordType: "mcp_plugin_package_marketplace_lifecycle_approval_packets_view",
      timestamp: baseReview.timestamp,
      catalogId: baseReview.catalogId,
      runbookRecordType: "mcp_plugin_package_marketplace_lifecycle_runbook_view",
      runbookStepCount: baseReview.sourcePacketCount,
      packetCount: baseReview.sourcePacketCount,
      audience: "operator",
      packets: baseReview.reviews.map((item) => ({
        packetId: item.packetId,
        stepId: item.stepId,
        phase: item.phase,
        entryId: item.entryId,
        displayName: item.displayName,
        lifecycleState: item.lifecycleState,
        actionKind: item.actionKind,
        executionMode: "operator_only",
        approvalRequired: true,
        approvalSubject: item.approvalSubject,
        approvalPrompt: item.approvalPrompt,
        approvalChecklist: item.approvalChecklist,
        package: item.package,
        sidecar: item.sidecar,
      })),
      summary: {
        total: baseReview.sourcePacketCount,
        metadataPackets: 1,
        installPackets: 1,
        activationPackets: 2,
        inspectionPackets: 0,
        omittedApprovalPackets: 0,
        omittedInspectOnlySteps: 0,
      },
      networkFetched: false,
      packageInstalled: false,
      packageExecuted: false,
      activation: false,
      sidecarStarted: false,
      catalogMutated: false,
      credentialsPersisted: false,
      warnings: [],
    },
    approvalEvidence: [
      {
        packetId: baseReview.reviews[0]!.packetId,
        approvalSubject: baseReview.reviews[0]!.approvalSubject,
        approved: true,
      },
      {
        packetId: baseReview.reviews[1]!.packetId,
        approvalSubject: baseReview.reviews[1]!.approvalSubject,
        approved: true,
      },
      {
        packetId: baseReview.reviews[2]!.packetId,
        approvalSubject: baseReview.reviews[2]!.approvalSubject,
        approved: true,
      },
    ],
    timestamp: "2026-05-14T12:01:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: installReview,
    includePhases: ["install"],
    includeActionKinds: ["prepare_metadata_bound_install_update_handoff"],
    maxHandoffs: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:02:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    includePreflightStates: ["ready_for_host_handoff_preflight"],
    maxPreflights: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:03:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    includeRequestStates: ["ready_for_explicit_host_handoff_request"],
    includeHostKinds: ["install_update"],
    maxRequests: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:04:00.000Z",
  });

  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    includeLanes: ["install_update_requests"],
    includeStates: ["ready_for_operator_presentation"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:05:00.000Z",
  });

  assertEqual(queue.audience, "reviewer", "Operator queue audience can be reviewer");
  assertEqual(queue.queueItemCount, 1, "Focused queue respects maxItems");
  assertEqual(queue.lanes.installUpdateRequests.length, 1, "Focused queue fills install/update lane");
  assertEqual(queue.lanes.metadataRequests.length, 0, "Focused queue excludes metadata lane");
  assertEqual(queue.lanes.approvalBlockers.length, 0, "Focused queue excludes blocker lane");
  assertEqual(queue.lanes.installUpdateRequests[0]?.phase, "install", "Focused queue keeps install phase");
  assertEqual(queue.lanes.installUpdateRequests[0]?.requestKind, "install_update", "Focused queue keeps install request kind");
  assertEqual(queue.lanes.installUpdateRequests[0]?.operatorAction, "present_install_update_request", "Install item maps operator action");
  assertEqual(queue.lanes.installUpdateRequests[0]?.itemState, "ready_for_operator_presentation", "Focused queue keeps ready item state");
  assertEqual(queue.summary.omittedByLaneFilter, 0, "Focused queue reports no lane-filter omission");
  assertEqual(queue.summary.omittedByStateFilter, 0, "Focused queue reports no state-filter omission");
  assertEqual(queue.summary.omittedByCap, 0, "Focused queue reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Operator Queue Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-operator-queue.ts").text();
  assert(!source.includes("fetch("), "Operator queue runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Operator queue runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Operator queue runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 268 Verification (Plugin Marketplace Lifecycle Operator Queue)\n");

  verifyOperatorQueueGroupsRequestLanes();
  verifyOperatorQueueCanFocusReadyInstallLane();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 268 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 268: plugin marketplace lifecycle operator queue is GREEN.");
}

run().catch((error) => {
  console.error("Phase 268 verification crashed:", error);
  process.exit(1);
});
