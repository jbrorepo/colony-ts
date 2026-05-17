/**
 * Phase 267 Verification Script - Plugin Marketplace Lifecycle Host Handoff Request
 *
 * Proves lifecycle approval handoff preflights can be projected into read-only
 * host handoff request descriptors while preserving approval blockers and
 * denying all direct host action. The request view packages bounded metadata for
 * an operator/host handoff without fetching registries, installing packages,
 * executing package code, activating sidecars, mutating catalogs, or persisting
 * credentials.
 *
 * Run: bun run src/verify-phase267.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleHandoff,
  createPluginPackageMarketplaceLifecycleHostHandoffRequest,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase267",
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
    timestamp: "2026-05-14T11:40:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_host_handoff_requests",
    timestamp: "2026-05-14T11:41:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T11:42:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T11:43:00.000Z",
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
    timestamp: "2026-05-14T11:44:00.000Z",
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
      version: "37.0.0",
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

function verifyHostHandoffRequestProjectsPreflightBoundary(): void {
  section("1. Lifecycle Host Handoff Request Projects Preflight Boundary");

  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T11:45:00.000Z",
  });

  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T11:46:00.000Z",
  });

  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T11:47:00.000Z",
  });

  assertEqual(request.recordType, "mcp_plugin_package_marketplace_lifecycle_host_handoff_request_view", "Host handoff request uses stable record type");
  assertEqual(request.approvalHandoffPreflightRecordType, "mcp_plugin_package_marketplace_lifecycle_approval_handoff_preflight_view", "Host handoff request records source preflight view");
  assertEqual(request.sourcePreflightCount, 4, "Host handoff request records source preflight count");
  assertEqual(request.requestCount, 4, "Host handoff request includes each preflight by default");
  assertEqual(request.networkFetched, false, "Host handoff request fetches no registry");
  assertEqual(request.packageInstalled, false, "Host handoff request performs no package install");
  assertEqual(request.packageExecuted, false, "Host handoff request performs no package-code execution");
  assertEqual(request.activation, false, "Host handoff request performs no activation");
  assertEqual(request.sidecarStarted, false, "Host handoff request starts no sidecar");
  assertEqual(request.catalogMutated, false, "Host handoff request mutates no catalog");
  assertEqual(request.credentialsPersisted, false, "Host handoff request persists no credentials");
  assertEqual(request.requests[0]?.requestState, "ready_for_explicit_host_handoff_request", "Ready preflight becomes explicit host handoff request descriptor");
  assertEqual(request.requests[1]?.requestState, "blocked_approval_mismatch", "Wrong approval subject stays blocked");
  assertEqual(request.requests[2]?.requestState, "blocked_approval_expired", "Expired approval stays blocked");
  assertEqual(request.requests[3]?.requestState, "blocked_missing_approval", "Missing approval stays blocked");
  assertEqual(request.requests[0]?.nextAction, "present_host_handoff_request", "Ready host request asks operator to present handoff request");
  assertEqual(request.requests[1]?.nextAction, "collect_matching_approval", "Mismatch request asks for matching approval");
  assertEqual(request.requests[2]?.nextAction, "refresh_expired_approval", "Expired request asks for approval refresh");
  assert(request.requests.every((item) => item.executionMode === "operator_only"), "Every host handoff request is operator-only");
  assert(request.requests.every((item) => item.hostActionAllowed === false), "Host handoff request never authorizes direct host action");
  assertEqual(request.requests[0]?.requestKind, "metadata", "Metadata ready request maps request kind");
  assertEqual(request.requests[0]?.operatorCommand, "request_metadata_host_handoff", "Metadata ready request maps operator command");
  assertEqual(request.requests[0]?.hostRequest.payloadMode, "descriptor_only", "Host request payload stays descriptor-only");
  assertEqual(request.requests[0]?.hostRequest.source, "<redacted>", "Host request source stays redacted");
  assertEqual(request.summary.readyForExplicitHostHandoffRequest, 1, "Summary counts ready explicit host handoff requests");
  assertEqual(request.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(request.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(request.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");
  assert(!JSON.stringify(request).includes("SHOULD_NOT_LEAK"), "Host handoff request redacts unsafe approval signatures");
  assert(!JSON.stringify(request).includes("plugins.example.com"), "Host handoff request does not leak registry URLs");
}

function verifyHostHandoffRequestCanFocusReadyInstallQueue(): void {
  section("2. Lifecycle Host Handoff Request Focuses Ready Install Queue");

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
    timestamp: "2026-05-14T11:48:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: installReview,
    includePhases: ["install"],
    includeActionKinds: ["prepare_metadata_bound_install_update_handoff"],
    maxHandoffs: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:49:00.000Z",
  });

  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    includePreflightStates: ["ready_for_host_handoff_preflight"],
    maxPreflights: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:50:00.000Z",
  });

  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    includeRequestStates: ["ready_for_explicit_host_handoff_request"],
    includeHostKinds: ["install_update"],
    maxRequests: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:51:00.000Z",
  });

  assertEqual(request.audience, "reviewer", "Host handoff request audience can be reviewer");
  assertEqual(request.requestCount, 1, "Focused request respects maxRequests");
  assertEqual(request.requests[0]?.phase, "install", "Focused request keeps install phase");
  assertEqual(request.requests[0]?.requestState, "ready_for_explicit_host_handoff_request", "Focused request keeps ready descriptor");
  assertEqual(request.requests[0]?.requestKind, "install_update", "Install ready request maps request kind");
  assertEqual(request.requests[0]?.operatorCommand, "request_install_update_host_handoff", "Install ready request maps operator command");
  assertEqual(request.summary.omittedByStateFilter, 0, "Focused request reports no state-filter omission");
  assertEqual(request.summary.omittedByKindFilter, 0, "Focused request reports no kind-filter omission");
  assertEqual(request.summary.omittedByCap, 0, "Focused request reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Host Handoff Request Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-host-handoff-request.ts").text();
  assert(!source.includes("fetch("), "Host handoff request runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Host handoff request runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Host handoff request runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 267 Verification (Plugin Marketplace Lifecycle Host Handoff Request)\n");

  verifyHostHandoffRequestProjectsPreflightBoundary();
  verifyHostHandoffRequestCanFocusReadyInstallQueue();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 267 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 267: plugin marketplace lifecycle host handoff request is GREEN.");
}

run().catch((error) => {
  console.error("Phase 267 verification crashed:", error);
  process.exit(1);
});
