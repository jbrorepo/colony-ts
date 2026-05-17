/**
 * Phase 269 Verification Script - Plugin Marketplace Lifecycle Default UX Plan
 *
 * Proves lifecycle operator queues can be projected into a read-only default UX
 * prompt plan. The plan prepares presentation-safe operator prompts for
 * approval collection, metadata, install/update, activation-readiness, and
 * activation handoffs without fetching registries, installing packages,
 * executing package code, activating sidecars, mutating catalogs, or persisting
 * credentials.
 *
 * Run: bun run src/verify-phase269.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleDefaultUxPlan,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase269",
    metadataPlanningView: {
      entries: [
        stageEntry("metadata-entry", "Metadata Missing", "metadata_missing"),
        stageEntry("install-entry", "Install Pending", "metadata_ready"),
        stageEntry("readiness-entry", "Readiness Pending", "metadata_ready"),
        stageEntry("activation-entry", "Activation Pending", "metadata_ready"),
      ],
      warnings: ["metadata SHOULD_NOT_LEAK https://plugins.example.com/private"],
    },
    installStatusView: {
      entries: [
        stageEntry("readiness-entry", "Readiness Pending", "completed"),
        stageEntry("activation-entry", "Activation Pending", "completed"),
      ],
      warnings: ["install SHOULD_NOT_LEAK"],
    },
    activationReadinessView: {
      entries: [
        stageEntry("activation-entry", "Activation Pending", "ready_for_activation_handoff"),
      ],
      warnings: ["readiness SHOULD_NOT_LEAK"],
    },
    activationExecutionStatusView: {
      entries: [],
      warnings: ["activation SHOULD_NOT_LEAK"],
    },
    timestamp: "2026-05-14T12:16:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_plan",
    timestamp: "2026-05-14T12:17:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T12:18:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T12:19:00.000Z",
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
        expiresAt: "2026-05-14T13:20:00.000Z",
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
    timestamp: "2026-05-14T12:20:00.000Z",
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
      version: "39.0.0",
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

function operatorQueueView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T12:21:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T12:22:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T12:23:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T12:24:00.000Z",
  });
}

function verifyDefaultUxPlanProjectsQueuePrompts(): void {
  section("1. Lifecycle Default UX Plan Projects Queue Prompts");

  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: operatorQueueView(),
    timestamp: "2026-05-14T12:25:00.000Z",
  });

  assertEqual(plan.recordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_plan_view", "Default UX plan uses stable record type");
  assertEqual(plan.operatorQueueRecordType, "mcp_plugin_package_marketplace_lifecycle_operator_queue_view", "Default UX plan records source queue view");
  assertEqual(plan.sourceQueueItemCount, 4, "Default UX plan records source queue item count");
  assertEqual(plan.promptCount, 4, "Default UX plan includes each queue item by default");
  assertEqual(plan.networkFetched, false, "Default UX plan fetches no registry");
  assertEqual(plan.packageInstalled, false, "Default UX plan performs no package install");
  assertEqual(plan.packageExecuted, false, "Default UX plan performs no package-code execution");
  assertEqual(plan.activation, false, "Default UX plan performs no activation");
  assertEqual(plan.sidecarStarted, false, "Default UX plan starts no sidecar");
  assertEqual(plan.catalogMutated, false, "Default UX plan mutates no catalog");
  assertEqual(plan.credentialsPersisted, false, "Default UX plan persists no credentials");
  assertEqual(plan.defaultLiveExecution, false, "Default UX plan does not enable default live execution");
  assertEqual(plan.summary.metadataPrompts, 1, "Summary counts metadata prompts");
  assertEqual(plan.summary.approvalCollectionPrompts, 2, "Summary counts approval collection prompts");
  assertEqual(plan.summary.approvalRefreshPrompts, 1, "Summary counts approval refresh prompts");
  assertEqual(plan.summary.readyToPresentDefaultPrompt, 1, "Summary counts ready default prompts");
  assertEqual(plan.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(plan.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(plan.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");

  const ready = plan.prompts.find((prompt) => prompt.commandKind === "metadata_prompt")!;
  assertEqual(ready.promptId, "default-ux-queue-host-request-preflight-approval-handoff-review-approval-001-metadata-entry", "Ready prompt id is derived from queue item id");
  assertEqual(ready.itemState, "ready_to_present_default_prompt", "Ready queue item becomes presentable prompt");
  assertEqual(ready.commandKind, "metadata_prompt", "Ready metadata item maps default command kind");
  assertEqual(ready.nextAction, "present_default_prompt", "Ready metadata prompt presents default prompt");
  assertEqual(ready.defaultCommandId, "plugin.lifecycle.request.metadata", "Ready metadata prompt gets stable default command id");
  assertEqual(ready.defaultCommandLabel, "Request metadata handoff", "Ready metadata prompt gets operator label");
  assertEqual(ready.sourceRequestCommand, "request_metadata_host_handoff", "Ready prompt preserves source request command");
  assertEqual(ready.hostRequestSummary.payloadMode, "descriptor_only", "Ready prompt preserves descriptor-only host payload");
  assertEqual(ready.hostRequestSummary.source, "<redacted>", "Ready prompt redacts host request source");
  assertEqual(ready.executionMode, "operator_only", "Ready prompt stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready prompt denies host action");
  assertEqual(ready.promptMutable, false, "Ready prompt denies prompt mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready prompt denies default live execution");
  assert(plan.prompts.filter((prompt) => prompt.commandKind === "approval_collection_prompt").every((prompt) => prompt.nextAction === "collect_matching_approval"), "Missing/mismatch blockers collect matching approval");
  assert(plan.prompts.filter((prompt) => prompt.commandKind === "approval_refresh_prompt").every((prompt) => prompt.nextAction === "refresh_expired_approval"), "Expired blockers refresh approval");
  assert(!JSON.stringify(plan).includes("SHOULD_NOT_LEAK"), "Default UX plan redacts unsafe approval signatures");
  assert(!JSON.stringify(plan).includes("plugins.example.com"), "Default UX plan does not leak registry URLs");
}

function verifyDefaultUxPlanCanFocusInstallPrompt(): void {
  section("2. Lifecycle Default UX Plan Focuses Install Prompt");

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
    timestamp: "2026-05-14T12:26:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: installReview,
    includePhases: ["install"],
    includeActionKinds: ["prepare_metadata_bound_install_update_handoff"],
    maxHandoffs: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:27:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    includePreflightStates: ["ready_for_host_handoff_preflight"],
    maxPreflights: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:28:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    includeRequestStates: ["ready_for_explicit_host_handoff_request"],
    includeHostKinds: ["install_update"],
    maxRequests: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:29:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    includeLanes: ["install_update_requests"],
    includeStates: ["ready_for_operator_presentation"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:30:00.000Z",
  });

  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    includeCommandKinds: ["install_update_prompt"],
    includeStates: ["ready_to_present_default_prompt"],
    maxPrompts: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:31:00.000Z",
  });

  assertEqual(plan.audience, "reviewer", "Default UX plan audience can be reviewer");
  assertEqual(plan.promptCount, 1, "Focused plan respects maxPrompts");
  assertEqual(plan.prompts[0]?.phase, "install", "Focused plan keeps install phase");
  assertEqual(plan.prompts[0]?.commandKind, "install_update_prompt", "Focused plan keeps install prompt kind");
  assertEqual(plan.prompts[0]?.defaultCommandId, "plugin.lifecycle.request.install_update", "Install prompt gets stable default command id");
  assertEqual(plan.prompts[0]?.defaultCommandLabel, "Request install/update handoff", "Install prompt gets operator label");
  assertEqual(plan.prompts[0]?.itemState, "ready_to_present_default_prompt", "Focused plan keeps ready prompt state");
  assertEqual(plan.summary.omittedByKindFilter, 0, "Focused plan reports no kind-filter omission");
  assertEqual(plan.summary.omittedByStateFilter, 0, "Focused plan reports no state-filter omission");
  assertEqual(plan.summary.omittedByCap, 0, "Focused plan reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Plan Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-plan.ts").text();
  assert(!source.includes("fetch("), "Default UX plan runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Default UX plan runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Default UX plan runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 269 Verification (Plugin Marketplace Lifecycle Default UX Plan)\n");

  verifyDefaultUxPlanProjectsQueuePrompts();
  verifyDefaultUxPlanCanFocusInstallPrompt();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 269 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 269: plugin marketplace lifecycle default UX plan is GREEN.");
}

run().catch((error) => {
  console.error("Phase 269 verification crashed:", error);
  process.exit(1);
});
