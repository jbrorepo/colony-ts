/**
 * Phase 265 Verification Script - Plugin Marketplace Lifecycle Approval Handoff
 *
 * Proves reviewed lifecycle approval packets can be projected into read-only
 * operator handoff descriptors while preserving missing, mismatched, and
 * expired approval blockers without fetching registries, installing packages,
 * executing package code, activating or starting sidecars, mutating catalogs, or
 * persisting credentials.
 *
 * Run: bun run src/verify-phase265.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
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

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase265",
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
    timestamp: "2026-05-14T11:08:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_approval_handoff",
    timestamp: "2026-05-14T11:09:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T11:10:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T11:11:00.000Z",
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
        expiresAt: "2026-05-14T12:00:00.000Z",
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
    timestamp: "2026-05-14T11:12:00.000Z",
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
      version: "35.0.0",
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

function verifyApprovalHandoffProjectsReviewStates(): void {
  section("1. Lifecycle Approval Handoff Projects Review States");

  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T11:13:00.000Z",
  });

  assertEqual(handoff.recordType, "mcp_plugin_package_marketplace_lifecycle_approval_handoff_view", "Approval handoff uses stable record type");
  assertEqual(handoff.approvalReviewRecordType, "mcp_plugin_package_marketplace_lifecycle_approval_review_view", "Approval handoff records source approval review");
  assertEqual(handoff.sourceReviewCount, 4, "Approval handoff records source review count");
  assertEqual(handoff.handoffCount, 4, "Approval handoff includes each review by default");
  assertEqual(handoff.networkFetched, false, "Approval handoff fetches no registry");
  assertEqual(handoff.packageInstalled, false, "Approval handoff performs no package install");
  assertEqual(handoff.packageExecuted, false, "Approval handoff performs no package-code execution");
  assertEqual(handoff.activation, false, "Approval handoff performs no activation");
  assertEqual(handoff.sidecarStarted, false, "Approval handoff starts no sidecar");
  assertEqual(handoff.catalogMutated, false, "Approval handoff mutates no catalog");
  assertEqual(handoff.credentialsPersisted, false, "Approval handoff persists no credentials");
  assertEqual(handoff.handoffs[0]?.handoffState, "ready_for_operator_handoff", "Matching approval becomes ready handoff descriptor");
  assertEqual(handoff.handoffs[1]?.handoffState, "blocked_approval_mismatch", "Wrong approval subject stays blocked");
  assertEqual(handoff.handoffs[2]?.handoffState, "blocked_approval_expired", "Expired approval stays blocked");
  assertEqual(handoff.handoffs[3]?.handoffState, "blocked_missing_approval", "Missing approval stays blocked");
  assertEqual(handoff.handoffs[0]?.operatorAction, "prepare_metadata_handoff", "Metadata ready handoff maps to metadata operator action");
  assertEqual(handoff.handoffs[1]?.operatorAction, "collect_matching_approval", "Mismatch handoff asks for matching approval");
  assertEqual(handoff.handoffs[2]?.operatorAction, "refresh_expired_approval", "Expired handoff asks for approval refresh");
  assert(handoff.handoffs.every((item) => item.executionMode === "operator_only"), "Every approval handoff is operator-only");
  assert(handoff.handoffs.every((item) => item.hostActionAllowed === false), "Approval handoff never authorizes direct host action");
  assertEqual(handoff.summary.readyForOperatorHandoff, 1, "Summary counts ready handoff descriptors");
  assertEqual(handoff.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(handoff.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(handoff.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");
  assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Approval handoff redacts unsafe approval signatures");
  assert(!JSON.stringify(handoff).includes("plugins.example.com"), "Approval handoff does not leak registry URLs");
}

function verifyApprovalHandoffCanFocusReadyInstallQueue(): void {
  section("2. Lifecycle Approval Handoff Focuses Ready Install Queue");

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
    timestamp: "2026-05-14T11:14:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: installReview,
    includePhases: ["install"],
    includeActionKinds: ["prepare_metadata_bound_install_update_handoff"],
    maxHandoffs: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:15:00.000Z",
  });

  assertEqual(handoff.audience, "reviewer", "Approval handoff audience can be reviewer");
  assertEqual(handoff.handoffCount, 1, "Focused handoff respects maxHandoffs");
  assertEqual(handoff.handoffs[0]?.phase, "install", "Focused handoff keeps install phase");
  assertEqual(handoff.handoffs[0]?.handoffState, "ready_for_operator_handoff", "Focused handoff keeps ready descriptor");
  assertEqual(handoff.handoffs[0]?.operatorAction, "prepare_install_update_handoff", "Install ready handoff maps to install operator action");
  assertEqual(handoff.summary.omittedByPhaseFilter, 3, "Focused handoff reports reviews omitted by phase filter");
  assertEqual(handoff.summary.omittedByActionFilter, 0, "Focused handoff reports no action-filter omission after phase filter");
  assertEqual(handoff.summary.omittedByCap, 0, "Focused handoff reports cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Approval Handoff Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-approval-handoff.ts").text();
  assert(!source.includes("fetch("), "Approval handoff runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Approval handoff runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Approval handoff runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 265 Verification (Plugin Marketplace Lifecycle Approval Handoff)\n");

  verifyApprovalHandoffProjectsReviewStates();
  verifyApprovalHandoffCanFocusReadyInstallQueue();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 265 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 265: plugin marketplace lifecycle approval handoff is GREEN.");
}

run().catch((error) => {
  console.error("Phase 265 verification crashed:", error);
  process.exit(1);
});
