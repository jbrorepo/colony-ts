/**
 * Phase 273 Verification Script - Plugin Marketplace Lifecycle Default UX Command Panel
 *
 * Proves lifecycle default UX command transcripts can be projected into a
 * read-only operator panel model. The panel groups bounded command cards,
 * approval remediation, and safety summaries without fetching registries,
 * installing packages, executing package code, activating sidecars, mutating
 * catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase273.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafa";

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

function lifecycleApprovalReviewView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase273",
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
    timestamp: "2026-05-14T14:20:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_panel",
    timestamp: "2026-05-14T14:21:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T14:22:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T14:23:00.000Z",
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
        expiresAt: "2026-05-14T15:24:00.000Z",
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
    timestamp: "2026-05-14T14:24:00.000Z",
  });
}

function commandTranscriptView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T14:25:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T14:26:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T14:27:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T14:28:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T14:29:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T14:30:00.000Z",
  });
  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T14:31:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: brief,
    timestamp: "2026-05-14T14:32:00.000Z",
  });
}

function verifyCommandPanelProjectsTranscriptLines(): void {
  section("1. Lifecycle Default UX Command Panel Projects Transcript Lines");

  const panel = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: commandTranscriptView(),
    timestamp: "2026-05-14T14:33:00.000Z",
  });

  assertEqual(panel.recordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_view", "Command panel uses stable record type");
  assertEqual(panel.commandTranscriptRecordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_transcript_view", "Command panel records source transcript view");
  assertEqual(panel.sourceTranscriptLineCount, 4, "Command panel records source transcript line count");
  assertEqual(panel.panelCardCount, 4, "Command panel includes each transcript line by default");
  assertEqual(panel.networkFetched, false, "Command panel fetches no registry");
  assertEqual(panel.packageInstalled, false, "Command panel performs no package install");
  assertEqual(panel.packageExecuted, false, "Command panel performs no package-code execution");
  assertEqual(panel.activation, false, "Command panel performs no activation");
  assertEqual(panel.sidecarStarted, false, "Command panel starts no sidecar");
  assertEqual(panel.catalogMutated, false, "Command panel mutates no catalog");
  assertEqual(panel.credentialsPersisted, false, "Command panel persists no credentials");
  assertEqual(panel.defaultLiveExecution, false, "Command panel does not enable default live execution");
  assertEqual(panel.summary.readyCommands, 1, "Summary counts ready command panel cards");
  assertEqual(panel.summary.approvalRemediation, 3, "Summary counts approval remediation panel cards");
  assertEqual(panel.summary.readyToCopy, 1, "Summary counts copy-ready panel cards");
  assertEqual(panel.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch panel blockers");
  assertEqual(panel.summary.blockedApprovalExpired, 1, "Summary counts expired approval panel blockers");
  assertEqual(panel.summary.blockedMissingApproval, 1, "Summary counts missing approval panel blockers");
  assert(panel.lanes.safetySummary.length >= 4, "Panel preserves fixed safety summary lines");

  const ready = panel.lanes.readyCommands[0]!;
  assert(ready.cardId.startsWith("panel-transcript-brief-"), "Ready panel card id is derived from transcript line id");
  assertEqual(ready.lane, "ready_commands", "Ready transcript line maps to ready command panel lane");
  assertEqual(ready.cardState, "ready_to_copy", "Ready panel card remains copy-ready");
  assertEqual(ready.executionMode, "operator_only", "Ready panel card stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready panel card denies host action");
  assertEqual(ready.panelMutable, false, "Ready panel card denies panel mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready panel card denies default live execution");
  assert(ready.title.includes("Request metadata handoff"), "Ready panel title includes command label");
  assert(ready.subtitle.includes("@colony/metadata-entry"), "Ready panel subtitle includes package name");
  assert(ready.subtitle.includes("request"), "Ready panel subtitle includes request context");
  assert(ready.body.includes("[metadata]"), "Ready panel body preserves transcript phase marker");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready panel copy text preserves command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready panel terminal hint names operator-only mode");
  assert(ready.badges.includes("read-only"), "Ready panel includes read-only badge");
  assert(ready.badges.includes("no-live-execution"), "Ready panel includes no-live-execution badge");
  assert(panel.lanes.approvalRemediation.every((card) => card.lane === "approval_remediation"), "Blocked transcript lines map to approval remediation panel cards");
  assert(panel.lanes.approvalRemediation.some((card) => card.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(panel.lanes.safetySummary.some((line) => line.includes("No registry fetch")), "Panel safety summary states no registry fetch");
  assert(panel.lanes.safetySummary.some((line) => line.includes("No credentials")), "Panel safety summary states no credential persistence");
  assert(!JSON.stringify(panel).includes("SHOULD_NOT_LEAK"), "Command panel redacts unsafe approval signatures");
  assert(!JSON.stringify(panel).includes("plugins.example.com"), "Command panel does not leak registry URLs");
}

function verifyCommandPanelCanFocusReadyCards(): void {
  section("2. Lifecycle Default UX Command Panel Focuses Ready Cards");

  const panel = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: commandTranscriptView(),
    includeLanes: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxCards: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T14:34:00.000Z",
  });

  assertEqual(panel.audience, "reviewer", "Command panel audience can be reviewer");
  assertEqual(panel.panelCardCount, 1, "Focused panel respects maxCards");
  assertEqual(panel.lanes.readyCommands[0]?.phase, "metadata", "Focused panel keeps ready metadata phase");
  assertEqual(panel.lanes.readyCommands[0]?.lane, "ready_commands", "Focused panel keeps ready lane");
  assertEqual(panel.lanes.readyCommands[0]?.cardState, "ready_to_copy", "Focused panel keeps copy-ready state");
  assertEqual(panel.summary.omittedByLaneFilter, 3, "Focused panel reports lane-filter omissions");
  assertEqual(panel.summary.omittedByStateFilter, 0, "Focused panel reports no state-filter omissions after lane filtering");
  assertEqual(panel.summary.omittedByCap, 0, "Focused panel reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Panel Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel.ts").text();
  assert(!source.includes("fetch("), "Command panel runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Command panel runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Command panel runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 273 Verification (Plugin Marketplace Lifecycle Default UX Command Panel)\n");

  verifyCommandPanelProjectsTranscriptLines();
  verifyCommandPanelCanFocusReadyCards();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 273 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 273: plugin marketplace lifecycle default UX command panel is GREEN.");
}

run().catch((error) => {
  console.error("Phase 273 verification crashed:", error);
  process.exit(1);
});
