/**
 * Phase 271 Verification Script - Plugin Marketplace Lifecycle Default UX Command Brief
 *
 * Proves lifecycle default UX command palettes can be projected into a read-only
 * operator command brief. The brief prepares copy-safe command lines and
 * approval-remediation guidance without fetching registries, installing
 * packages, executing package code, activating sidecars, mutating catalogs, or
 * persisting credentials.
 *
 * Run: bun run src/verify-phase271.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief,
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
    catalogId: "catalog-phase271",
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
      entries: [stageEntry("activation-entry", "Activation Pending", "ready_for_activation_handoff")],
      warnings: ["readiness SHOULD_NOT_LEAK"],
    },
    activationExecutionStatusView: {
      entries: [],
      warnings: ["activation SHOULD_NOT_LEAK"],
    },
    timestamp: "2026-05-14T13:02:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_brief",
    timestamp: "2026-05-14T13:03:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T13:04:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T13:05:00.000Z",
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
        expiresAt: "2026-05-14T14:06:00.000Z",
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
    timestamp: "2026-05-14T13:06:00.000Z",
  });
}

function stageEntry(entryId: string, displayName: string, state: string) {
  return {
    entryId,
    displayName,
    state,
    package: {
      name: `@colony/${entryId}`,
      version: "41.0.0",
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
    timestamp: "2026-05-14T13:07:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T13:08:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T13:09:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T13:10:00.000Z",
  });
}

function commandPaletteView() {
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: operatorQueueView(),
    timestamp: "2026-05-14T13:11:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T13:12:00.000Z",
  });
}

function verifyCommandBriefProjectsPaletteEntries(): void {
  section("1. Lifecycle Default UX Command Brief Projects Palette Entries");

  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: commandPaletteView(),
    timestamp: "2026-05-14T13:13:00.000Z",
  });

  assertEqual(brief.recordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_brief_view", "Command brief uses stable record type");
  assertEqual(brief.commandPaletteRecordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_palette_view", "Command brief records source palette view");
  assertEqual(brief.sourceEntryCount, 4, "Command brief records source palette entry count");
  assertEqual(brief.lineCount, 4, "Command brief includes each palette entry by default");
  assertEqual(brief.networkFetched, false, "Command brief fetches no registry");
  assertEqual(brief.packageInstalled, false, "Command brief performs no package install");
  assertEqual(brief.packageExecuted, false, "Command brief performs no package-code execution");
  assertEqual(brief.activation, false, "Command brief performs no activation");
  assertEqual(brief.sidecarStarted, false, "Command brief starts no sidecar");
  assertEqual(brief.catalogMutated, false, "Command brief mutates no catalog");
  assertEqual(brief.credentialsPersisted, false, "Command brief persists no credentials");
  assertEqual(brief.defaultLiveExecution, false, "Command brief does not enable default live execution");
  assertEqual(brief.summary.readyCommands, 1, "Summary counts ready command lines");
  assertEqual(brief.summary.approvalRemediation, 3, "Summary counts approval remediation lines");
  assertEqual(brief.summary.readyToCopy, 1, "Summary counts copy-ready command lines");
  assertEqual(brief.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(brief.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(brief.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");

  const ready = brief.sections.readyCommands[0]!;
  assertEqual(ready.lineId, "brief-palette-default-ux-queue-host-request-preflight-approval-handoff-review-approval-001-metadata-entry", "Ready brief line id is derived from palette entry id");
  assertEqual(ready.lineState, "ready_to_copy", "Ready palette entry becomes copy-ready brief line");
  assertEqual(ready.section, "ready_commands", "Ready palette entry maps to ready command section");
  assertEqual(ready.commandId, "plugin.lifecycle.request.metadata", "Ready brief line preserves stable command id");
  assertEqual(ready.commandLabel, "Request metadata handoff", "Ready brief line preserves command label");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready brief copy text includes command id");
  assert(ready.copyText.includes(ready.requestId), "Ready brief copy text includes request id");
  assert(ready.displayText.includes("Request metadata handoff"), "Ready brief display text includes command label");
  assert(ready.displayText.includes("@colony/metadata-entry"), "Ready brief display text includes package name");
  assertEqual(ready.executionMode, "operator_only", "Ready brief line stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready brief line denies host action");
  assertEqual(ready.briefMutable, false, "Ready brief line denies brief mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready brief line denies default live execution");
  assert(ready.safetyBadges.includes("read-only"), "Ready brief line includes read-only badge");
  assert(ready.safetyBadges.includes("descriptor-only"), "Ready brief line includes descriptor-only badge");
  assert(ready.safetyBadges.includes("no-live-execution"), "Ready brief line includes no-live-execution badge");
  assert(brief.sections.approvalRemediation.every((line) => line.section === "approval_remediation"), "Blocked palette entries map to approval remediation");
  assert(brief.sections.approvalRemediation.some((line) => line.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(!JSON.stringify(brief).includes("SHOULD_NOT_LEAK"), "Command brief redacts unsafe approval signatures");
  assert(!JSON.stringify(brief).includes("plugins.example.com"), "Command brief does not leak registry URLs");
}

function verifyCommandBriefCanFocusCopyReadyLines(): void {
  section("2. Lifecycle Default UX Command Brief Focuses Copy-Ready Lines");

  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: commandPaletteView(),
    includeSections: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxLines: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T13:14:00.000Z",
  });

  assertEqual(brief.audience, "reviewer", "Command brief audience can be reviewer");
  assertEqual(brief.lineCount, 1, "Focused brief respects maxLines");
  assertEqual(brief.sections.readyCommands[0]?.phase, "metadata", "Focused brief keeps ready metadata phase");
  assertEqual(brief.sections.readyCommands[0]?.section, "ready_commands", "Focused brief keeps ready section");
  assertEqual(brief.sections.readyCommands[0]?.lineState, "ready_to_copy", "Focused brief keeps copy-ready state");
  assertEqual(brief.summary.omittedBySectionFilter, 3, "Focused brief reports section-filter omissions");
  assertEqual(brief.summary.omittedByStateFilter, 0, "Focused brief reports no state-filter omissions after section filtering");
  assertEqual(brief.summary.omittedByCap, 0, "Focused brief reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Brief Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-brief.ts").text();
  assert(!source.includes("fetch("), "Command brief runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Command brief runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Command brief runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 271 Verification (Plugin Marketplace Lifecycle Default UX Command Brief)\n");

  verifyCommandBriefProjectsPaletteEntries();
  verifyCommandBriefCanFocusCopyReadyLines();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 271 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 271: plugin marketplace lifecycle default UX command brief is GREEN.");
}

run().catch((error) => {
  console.error("Phase 271 verification crashed:", error);
  process.exit(1);
});
