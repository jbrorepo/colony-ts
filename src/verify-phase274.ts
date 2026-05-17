/**
 * Phase 274 Verification Script - Plugin Marketplace Lifecycle Default UX Command Panel Digest
 *
 * Proves lifecycle default UX command panels can be projected into a concise
 * read-only operator digest suitable for summary and clipboard handoff. The
 * digest preserves ready/remediation command truth without fetching registries,
 * installing packages, executing package code, activating sidecars, mutating
 * catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase274.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest,
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
    catalogId: "catalog-phase274",
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
    timestamp: "2026-05-14T15:20:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_panel_digest",
    timestamp: "2026-05-14T15:21:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T15:22:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T15:23:00.000Z",
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
        expiresAt: "2026-05-14T16:24:00.000Z",
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
    timestamp: "2026-05-14T15:24:00.000Z",
  });
}

function commandPanelView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T15:25:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T15:26:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T15:27:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T15:28:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T15:29:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T15:30:00.000Z",
  });
  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T15:31:00.000Z",
  });
  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: brief,
    timestamp: "2026-05-14T15:32:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: transcript,
    timestamp: "2026-05-14T15:33:00.000Z",
  });
}

function verifyCommandPanelDigestProjectsPanelCards(): void {
  section("1. Lifecycle Default UX Command Panel Digest Projects Panel Cards");

  const digestView = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest({
    commandPanelView: commandPanelView(),
    timestamp: "2026-05-14T15:34:00.000Z",
  });

  assertEqual(
    digestView.recordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_view",
    "Command panel digest uses stable record type",
  );
  assertEqual(digestView.commandPanelRecordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_view", "Command panel digest records source panel view");
  assertEqual(digestView.sourcePanelCardCount, 4, "Command panel digest records source panel card count");
  assertEqual(digestView.digestItemCount, 4, "Command panel digest includes each panel card by default");
  assertEqual(digestView.digestTitle, "Plugin lifecycle command digest", "Command panel digest uses stable title");
  assertEqual(digestView.networkFetched, false, "Command panel digest fetches no registry");
  assertEqual(digestView.packageInstalled, false, "Command panel digest performs no package install");
  assertEqual(digestView.packageExecuted, false, "Command panel digest performs no package-code execution");
  assertEqual(digestView.activation, false, "Command panel digest performs no activation");
  assertEqual(digestView.sidecarStarted, false, "Command panel digest starts no sidecar");
  assertEqual(digestView.catalogMutated, false, "Command panel digest mutates no catalog");
  assertEqual(digestView.credentialsPersisted, false, "Command panel digest persists no credentials");
  assertEqual(digestView.defaultLiveExecution, false, "Command panel digest does not enable default live execution");
  assertEqual(digestView.summary.readyCommands, 1, "Summary counts ready command digest items");
  assertEqual(digestView.summary.approvalRemediation, 3, "Summary counts approval remediation digest items");
  assertEqual(digestView.summary.readyToCopy, 1, "Summary counts copy-ready digest items");
  assertEqual(digestView.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch digest blockers");
  assertEqual(digestView.summary.blockedApprovalExpired, 1, "Summary counts expired approval digest blockers");
  assertEqual(digestView.summary.blockedMissingApproval, 1, "Summary counts missing approval digest blockers");
  assert(digestView.groups.safetySummary.length >= 4, "Digest preserves fixed safety summary lines");

  const ready = digestView.groups.readyCommands[0]!;
  assert(ready.digestItemId.startsWith("digest-panel-transcript-brief-"), "Ready digest item id is derived from panel card id");
  assertEqual(ready.group, "ready_commands", "Ready panel card maps to ready command digest group");
  assertEqual(ready.itemState, "ready_to_copy", "Ready digest item remains copy-ready");
  assertEqual(ready.executionMode, "operator_only", "Ready digest item stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready digest item denies host action");
  assertEqual(ready.digestMutable, false, "Ready digest item denies digest mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready digest item denies default live execution");
  assert(ready.heading.includes("Request metadata handoff"), "Ready digest heading preserves panel title");
  assert(ready.detail.includes("@colony/metadata-entry"), "Ready digest detail includes package name");
  assert(ready.operatorLine.includes("Request metadata handoff"), "Ready digest operator line includes command title");
  assert(ready.operatorLine.includes("[metadata]"), "Ready digest operator line preserves transcript phase marker");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready digest copy text preserves command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready digest terminal hint names operator-only mode");
  assert(ready.badges.includes("read-only"), "Ready digest includes read-only badge");
  assert(ready.badges.includes("no-live-execution"), "Ready digest includes no-live-execution badge");
  assert(digestView.groups.approvalRemediation.every((item) => item.group === "approval_remediation"), "Blocked panel cards map to approval remediation digest items");
  assert(digestView.groups.approvalRemediation.some((item) => item.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(digestView.groups.safetySummary.some((line) => line.includes("No registry fetch")), "Digest safety summary states no registry fetch");
  assert(digestView.groups.safetySummary.some((line) => line.includes("No credentials")), "Digest safety summary states no credential persistence");
  assert(!JSON.stringify(digestView).includes("SHOULD_NOT_LEAK"), "Command panel digest redacts unsafe approval signatures");
  assert(!JSON.stringify(digestView).includes("plugins.example.com"), "Command panel digest does not leak registry URLs");
}

function verifyCommandPanelDigestCanFocusReadyItems(): void {
  section("2. Lifecycle Default UX Command Panel Digest Focuses Ready Items");

  const digestView = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest({
    commandPanelView: commandPanelView(),
    includeGroups: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T15:35:00.000Z",
  });

  assertEqual(digestView.audience, "reviewer", "Command panel digest audience can be reviewer");
  assertEqual(digestView.digestItemCount, 1, "Focused digest respects maxItems");
  assertEqual(digestView.groups.readyCommands[0]?.phase, "metadata", "Focused digest keeps ready metadata phase");
  assertEqual(digestView.groups.readyCommands[0]?.group, "ready_commands", "Focused digest keeps ready group");
  assertEqual(digestView.groups.readyCommands[0]?.itemState, "ready_to_copy", "Focused digest keeps copy-ready state");
  assertEqual(digestView.summary.omittedByGroupFilter, 3, "Focused digest reports group-filter omissions");
  assertEqual(digestView.summary.omittedByStateFilter, 0, "Focused digest reports no state-filter omissions after group filtering");
  assertEqual(digestView.summary.omittedByCap, 0, "Focused digest reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Panel Digest Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest.ts").text();
  assert(!source.includes("fetch("), "Command panel digest runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Command panel digest runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Command panel digest runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 274 Verification (Plugin Marketplace Lifecycle Default UX Command Panel Digest)\n");

  verifyCommandPanelDigestProjectsPanelCards();
  verifyCommandPanelDigestCanFocusReadyItems();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 274 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 274: plugin marketplace lifecycle default UX command panel digest is GREEN.");
}

run().catch((error) => {
  console.error("Phase 274 verification crashed:", error);
  process.exit(1);
});
