/**
 * Phase 270 Verification Script - Plugin Marketplace Lifecycle Default UX Command Palette
 *
 * Proves lifecycle default UX prompt plans can be projected into a read-only
 * operator command palette. The palette prepares presentation-safe command
 * entries for host handoff prompts and approval remediation without fetching
 * registries, installing packages, executing package code, activating sidecars,
 * mutating catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase270.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase270",
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
    timestamp: "2026-05-14T12:32:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_palette",
    timestamp: "2026-05-14T12:33:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T12:34:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T12:35:00.000Z",
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
        expiresAt: "2026-05-14T13:36:00.000Z",
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
    timestamp: "2026-05-14T12:36:00.000Z",
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
      version: "40.0.0",
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
    timestamp: "2026-05-14T12:37:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T12:38:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T12:39:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T12:40:00.000Z",
  });
}

function defaultUxPlanView() {
  return createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: operatorQueueView(),
    timestamp: "2026-05-14T12:41:00.000Z",
  });
}

function verifyCommandPaletteProjectsPromptCommands(): void {
  section("1. Lifecycle Default UX Command Palette Projects Prompt Commands");

  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: defaultUxPlanView(),
    timestamp: "2026-05-14T12:42:00.000Z",
  });

  assertEqual(palette.recordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_palette_view", "Command palette uses stable record type");
  assertEqual(palette.defaultUxPlanRecordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_plan_view", "Command palette records source plan view");
  assertEqual(palette.sourcePromptCount, 4, "Command palette records source prompt count");
  assertEqual(palette.entryCount, 4, "Command palette includes each prompt by default");
  assertEqual(palette.networkFetched, false, "Command palette fetches no registry");
  assertEqual(palette.packageInstalled, false, "Command palette performs no package install");
  assertEqual(palette.packageExecuted, false, "Command palette performs no package-code execution");
  assertEqual(palette.activation, false, "Command palette performs no activation");
  assertEqual(palette.sidecarStarted, false, "Command palette starts no sidecar");
  assertEqual(palette.catalogMutated, false, "Command palette mutates no catalog");
  assertEqual(palette.credentialsPersisted, false, "Command palette persists no credentials");
  assertEqual(palette.defaultLiveExecution, false, "Command palette does not enable default live execution");
  assertEqual(palette.summary.hostHandoffRequests, 1, "Summary counts host handoff request entries");
  assertEqual(palette.summary.approvalRemediation, 3, "Summary counts approval remediation entries");
  assertEqual(palette.summary.readyToShowCommand, 1, "Summary counts ready command entries");
  assertEqual(palette.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(palette.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(palette.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");

  const ready = palette.groups.hostHandoffRequests[0]!;
  assertEqual(ready.entryId, "palette-default-ux-queue-host-request-preflight-approval-handoff-review-approval-001-metadata-entry", "Ready palette entry id is derived from prompt id");
  assertEqual(ready.entryState, "ready_to_show_command", "Ready prompt becomes command-palette entry");
  assertEqual(ready.group, "host_handoff_requests", "Ready prompt maps to host handoff group");
  assertEqual(ready.commandKind, "metadata_prompt", "Ready metadata entry preserves command kind");
  assertEqual(ready.commandId, "plugin.lifecycle.request.metadata", "Ready metadata entry preserves stable command id");
  assertEqual(ready.commandLabel, "Request metadata handoff", "Ready metadata entry preserves command label");
  assert(ready.commandPreview.includes("plugin.lifecycle.request.metadata"), "Ready metadata entry command preview includes command id");
  assert(ready.commandPreview.includes(ready.requestId), "Ready metadata entry command preview includes request id");
  assertEqual(ready.renderMode, "operator_prompt", "Ready palette entry renders as operator prompt");
  assertEqual(ready.executionMode, "operator_only", "Ready palette entry stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready palette entry denies host action");
  assertEqual(ready.paletteMutable, false, "Ready palette entry denies palette mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready palette entry denies default live execution");
  assert(ready.safetyBadges.includes("read-only"), "Ready palette entry includes read-only badge");
  assert(ready.safetyBadges.includes("descriptor-only"), "Ready palette entry includes descriptor-only badge");
  assert(ready.safetyBadges.includes("no-live-execution"), "Ready palette entry includes no-live-execution badge");
  assert(palette.groups.approvalRemediation.every((entry) => entry.group === "approval_remediation"), "Blocked entries map to approval remediation");
  assert(palette.groups.approvalRemediation.some((entry) => entry.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(!JSON.stringify(palette).includes("SHOULD_NOT_LEAK"), "Command palette redacts unsafe approval signatures");
  assert(!JSON.stringify(palette).includes("plugins.example.com"), "Command palette does not leak registry URLs");
}

function verifyCommandPaletteCanFocusInstallCommand(): void {
  section("2. Lifecycle Default UX Command Palette Focuses Install Command");

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
    timestamp: "2026-05-14T12:43:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: installReview,
    includePhases: ["install"],
    includeActionKinds: ["prepare_metadata_bound_install_update_handoff"],
    maxHandoffs: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:44:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    includePreflightStates: ["ready_for_host_handoff_preflight"],
    maxPreflights: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:45:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    includeRequestStates: ["ready_for_explicit_host_handoff_request"],
    includeHostKinds: ["install_update"],
    maxRequests: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:46:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    includeLanes: ["install_update_requests"],
    includeStates: ["ready_for_operator_presentation"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:47:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    includeCommandKinds: ["install_update_prompt"],
    includeStates: ["ready_to_present_default_prompt"],
    maxPrompts: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:48:00.000Z",
  });

  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    includeGroups: ["host_handoff_requests"],
    includeStates: ["ready_to_show_command"],
    maxEntries: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T12:49:00.000Z",
  });

  assertEqual(palette.audience, "reviewer", "Command palette audience can be reviewer");
  assertEqual(palette.entryCount, 1, "Focused palette respects maxEntries");
  assertEqual(palette.groups.hostHandoffRequests[0]?.phase, "install", "Focused palette keeps install phase");
  assertEqual(palette.groups.hostHandoffRequests[0]?.commandKind, "install_update_prompt", "Focused palette keeps install command kind");
  assertEqual(palette.groups.hostHandoffRequests[0]?.commandId, "plugin.lifecycle.request.install_update", "Install palette entry gets stable command id");
  assertEqual(palette.groups.hostHandoffRequests[0]?.commandLabel, "Request install/update handoff", "Install palette entry gets operator label");
  assertEqual(palette.summary.omittedByGroupFilter, 0, "Focused palette reports no group-filter omission");
  assertEqual(palette.summary.omittedByStateFilter, 0, "Focused palette reports no state-filter omission");
  assertEqual(palette.summary.omittedByCap, 0, "Focused palette reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Palette Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-palette.ts").text();
  assert(!source.includes("fetch("), "Command palette runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Command palette runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Command palette runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 270 Verification (Plugin Marketplace Lifecycle Default UX Command Palette)\n");

  verifyCommandPaletteProjectsPromptCommands();
  verifyCommandPaletteCanFocusInstallCommand();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 270 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 270: plugin marketplace lifecycle default UX command palette is GREEN.");
}

run().catch((error) => {
  console.error("Phase 270 verification crashed:", error);
  process.exit(1);
});
