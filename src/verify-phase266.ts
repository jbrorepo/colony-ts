/**
 * Phase 266 Verification Script - Plugin Marketplace Lifecycle Approval Handoff Preflight
 *
 * Proves lifecycle approval handoffs can be projected into read-only host-handoff
 * preflight descriptors while preserving missing, mismatched, and expired
 * approval blockers without fetching registries, installing packages, executing
 * package code, activating or starting sidecars, mutating catalogs, or
 * persisting credentials.
 *
 * Run: bun run src/verify-phase266.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase266",
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
    timestamp: "2026-05-14T11:20:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_approval_handoff_preflight",
    timestamp: "2026-05-14T11:21:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T11:22:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T11:23:00.000Z",
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
    timestamp: "2026-05-14T11:24:00.000Z",
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
      version: "36.0.0",
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

function verifyApprovalHandoffPreflightProjectsHostBoundary(): void {
  section("1. Lifecycle Approval Handoff Preflight Projects Host Boundary");

  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T11:25:00.000Z",
  });

  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T11:26:00.000Z",
  });

  assertEqual(preflight.recordType, "mcp_plugin_package_marketplace_lifecycle_approval_handoff_preflight_view", "Approval handoff preflight uses stable record type");
  assertEqual(preflight.approvalHandoffRecordType, "mcp_plugin_package_marketplace_lifecycle_approval_handoff_view", "Approval handoff preflight records source handoff view");
  assertEqual(preflight.sourceHandoffCount, 4, "Approval handoff preflight records source handoff count");
  assertEqual(preflight.preflightCount, 4, "Approval handoff preflight includes each handoff by default");
  assertEqual(preflight.networkFetched, false, "Approval handoff preflight fetches no registry");
  assertEqual(preflight.packageInstalled, false, "Approval handoff preflight performs no package install");
  assertEqual(preflight.packageExecuted, false, "Approval handoff preflight performs no package-code execution");
  assertEqual(preflight.activation, false, "Approval handoff preflight performs no activation");
  assertEqual(preflight.sidecarStarted, false, "Approval handoff preflight starts no sidecar");
  assertEqual(preflight.catalogMutated, false, "Approval handoff preflight mutates no catalog");
  assertEqual(preflight.credentialsPersisted, false, "Approval handoff preflight persists no credentials");
  assertEqual(preflight.preflights[0]?.preflightState, "ready_for_host_handoff_preflight", "Ready approval handoff becomes ready preflight descriptor");
  assertEqual(preflight.preflights[1]?.preflightState, "blocked_approval_mismatch", "Wrong approval subject stays blocked");
  assertEqual(preflight.preflights[2]?.preflightState, "blocked_approval_expired", "Expired approval stays blocked");
  assertEqual(preflight.preflights[3]?.preflightState, "blocked_missing_approval", "Missing approval stays blocked");
  assertEqual(preflight.preflights[0]?.nextAction, "request_explicit_host_handoff", "Ready preflight requires explicit host handoff request");
  assertEqual(preflight.preflights[1]?.nextAction, "collect_matching_approval", "Mismatch preflight asks for matching approval");
  assertEqual(preflight.preflights[2]?.nextAction, "refresh_expired_approval", "Expired preflight asks for approval refresh");
  assert(preflight.preflights.every((item) => item.executionMode === "operator_only"), "Every approval handoff preflight is operator-only");
  assert(preflight.preflights.every((item) => item.hostActionAllowed === false), "Approval handoff preflight never authorizes direct host action");
  assertEqual(preflight.preflights[0]?.hostHandoff.kind, "metadata", "Metadata ready preflight maps host handoff kind");
  assertEqual(preflight.preflights[0]?.hostHandoff.source, "<redacted>", "Host handoff source stays redacted");
  assertEqual(preflight.summary.readyForHostHandoffPreflight, 1, "Summary counts ready host handoff preflights");
  assertEqual(preflight.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(preflight.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(preflight.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");
  assert(!JSON.stringify(preflight).includes("SHOULD_NOT_LEAK"), "Approval handoff preflight redacts unsafe approval signatures");
  assert(!JSON.stringify(preflight).includes("plugins.example.com"), "Approval handoff preflight does not leak registry URLs");
}

function verifyApprovalHandoffPreflightCanFocusReadyInstallQueue(): void {
  section("2. Lifecycle Approval Handoff Preflight Focuses Ready Install Queue");

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
    timestamp: "2026-05-14T11:27:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: installReview,
    includePhases: ["install"],
    includeActionKinds: ["prepare_metadata_bound_install_update_handoff"],
    maxHandoffs: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:28:00.000Z",
  });

  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    includePreflightStates: ["ready_for_host_handoff_preflight"],
    maxPreflights: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:29:00.000Z",
  });

  assertEqual(preflight.audience, "reviewer", "Approval handoff preflight audience can be reviewer");
  assertEqual(preflight.preflightCount, 1, "Focused preflight respects maxPreflights");
  assertEqual(preflight.preflights[0]?.phase, "install", "Focused preflight keeps install phase");
  assertEqual(preflight.preflights[0]?.preflightState, "ready_for_host_handoff_preflight", "Focused preflight keeps ready descriptor");
  assertEqual(preflight.preflights[0]?.operatorAction, "prepare_install_update_handoff", "Install ready preflight preserves install operator action");
  assertEqual(preflight.preflights[0]?.hostHandoff.kind, "install_update", "Install ready preflight maps host handoff kind");
  assertEqual(preflight.summary.omittedByStateFilter, 0, "Focused preflight reports no state-filter omission");
  assertEqual(preflight.summary.omittedByCap, 0, "Focused preflight reports cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Approval Handoff Preflight Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-approval-handoff-preflight.ts").text();
  assert(!source.includes("fetch("), "Approval handoff preflight runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Approval handoff preflight runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Approval handoff preflight runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 266 Verification (Plugin Marketplace Lifecycle Approval Handoff Preflight)\n");

  verifyApprovalHandoffPreflightProjectsHostBoundary();
  verifyApprovalHandoffPreflightCanFocusReadyInstallQueue();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 266 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 266: plugin marketplace lifecycle approval handoff preflight is GREEN.");
}

run().catch((error) => {
  console.error("Phase 266 verification crashed:", error);
  process.exit(1);
});
