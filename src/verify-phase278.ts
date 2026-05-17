/**
 * Phase 278 Verification Script - Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Summary
 *
 * Proves lifecycle default UX command panel digest clipboard review closeout
 * packets can be projected into bounded operator/reviewer summary packets. The
 * summary remains read-only and does not fetch registries, install packages,
 * execute package code, activate sidecars, mutate catalogs, or persist
 * credentials.
 *
 * Run: bun run src/verify-phase278.ts
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
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReview,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseout,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummary,
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
      version: "42.0.0",
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
    catalogId: "catalog-phase278",
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
    timestamp: "2026-05-14T18:00:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_panel_digest_clipboard_review_closeout_summary",
    timestamp: "2026-05-14T18:01:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T18:02:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T18:03:00.000Z",
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
        expiresAt: "2026-05-14T19:04:00.000Z",
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
    timestamp: "2026-05-14T18:04:00.000Z",
  });
}

function commandPanelDigestClipboardReviewCloseoutView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T18:05:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T18:06:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T18:07:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T18:08:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T18:09:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T18:10:00.000Z",
  });
  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T18:11:00.000Z",
  });
  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: brief,
    timestamp: "2026-05-14T18:12:00.000Z",
  });
  const panel = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: transcript,
    timestamp: "2026-05-14T18:13:00.000Z",
  });
  const digestView = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest({
    commandPanelView: panel,
    timestamp: "2026-05-14T18:14:00.000Z",
  });
  const clipboard = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard({
    commandPanelDigestView: digestView,
    timestamp: "2026-05-14T18:15:00.000Z",
  });
  const clipboardReview = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReview({
    commandPanelDigestClipboardView: clipboard,
    timestamp: "2026-05-14T18:16:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseout({
    commandPanelDigestClipboardReviewView: clipboardReview,
    timestamp: "2026-05-14T18:17:00.000Z",
  });
}

function verifyCloseoutSummaryProjectsOperatorSummary(): void {
  section("1. Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Summary Projects Operator Summary");

  const summary = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummary({
    commandPanelDigestClipboardReviewCloseoutView: commandPanelDigestClipboardReviewCloseoutView(),
    timestamp: "2026-05-14T18:18:00.000Z",
  });

  assertEqual(
    summary.recordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_closeout_summary_view",
    "Closeout summary uses stable record type",
  );
  assertEqual(
    summary.commandPanelDigestClipboardReviewCloseoutRecordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_closeout_view",
    "Closeout summary records source closeout view",
  );
  assertEqual(summary.sourceCloseoutItemCount, 4, "Closeout summary records source closeout item count");
  assertEqual(summary.summaryItemCount, 4, "Closeout summary includes each closeout item by default");
  assertEqual(summary.summaryTitle, "Plugin lifecycle command clipboard review closeout summary", "Closeout summary uses stable title");
  assertEqual(summary.networkFetched, false, "Closeout summary fetches no registry");
  assertEqual(summary.packageInstalled, false, "Closeout summary performs no package install");
  assertEqual(summary.packageExecuted, false, "Closeout summary performs no package-code execution");
  assertEqual(summary.activation, false, "Closeout summary performs no activation");
  assertEqual(summary.sidecarStarted, false, "Closeout summary starts no sidecar");
  assertEqual(summary.catalogMutated, false, "Closeout summary mutates no catalog");
  assertEqual(summary.credentialsPersisted, false, "Closeout summary persists no credentials");
  assertEqual(summary.defaultLiveExecution, false, "Closeout summary does not enable default live execution");
  assertEqual(summary.summary.readyCommands, 1, "Summary counts ready command summary items");
  assertEqual(summary.summary.approvalRemediation, 3, "Summary counts approval remediation summary items");
  assertEqual(summary.summary.readyToCopy, 1, "Summary counts copy-ready summary items");
  assertEqual(summary.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch summary blockers");
  assertEqual(summary.summary.blockedApprovalExpired, 1, "Summary counts expired approval summary blockers");
  assertEqual(summary.summary.blockedMissingApproval, 1, "Summary counts missing approval summary blockers");
  assertEqual(summary.summary.readySummaryCount, 1, "Summary counts summary-ready items");
  assertEqual(summary.summary.blockerSummaryCount, 3, "Summary counts blocked summary items");
  assert(summary.summary.summaryTextLineCount >= 5, "Summary records bounded summary text line count");
  assert(summary.sections.safetySummary.length >= 4, "Closeout summary preserves fixed safety summary lines");

  const ready = summary.sections.readyCommands[0]!;
  assert(
    ready.summaryItemId.startsWith("summary-closeout-review-clipboard-digest-panel-transcript-brief-"),
    "Ready summary item id is derived from closeout id",
  );
  assertEqual(ready.section, "ready_commands", "Ready closeout item maps to ready command summary section");
  assertEqual(ready.itemState, "ready_to_copy", "Ready summary item remains copy-ready");
  assertEqual(ready.summaryState, "ready_to_copy", "Ready summary item gets ready summary state");
  assertEqual(ready.executionMode, "operator_only", "Ready summary item stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready summary item denies host action");
  assertEqual(ready.summaryMutable, false, "Ready summary item denies summary mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready summary item denies default live execution");
  assert(ready.label.includes("Request metadata handoff"), "Ready summary label preserves closeout label");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready summary copy text preserves command id");
  assert(ready.clipboardLine.includes("Request metadata handoff"), "Ready summary preserves clipboard line");
  assert(ready.reviewLine.includes("Ready to copy"), "Ready summary preserves review line");
  assert(ready.closeoutLine.includes("Closeout ready"), "Ready summary preserves closeout line");
  assert(ready.summaryLine.includes("Summary ready"), "Ready summary line names summary readiness");
  assert(ready.summaryLine.includes("plugin.lifecycle.request.metadata"), "Ready summary line includes copy command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready summary terminal hint names operator-only mode");
  assert(ready.badges.includes("read-only"), "Ready summary item includes read-only badge");
  assert(ready.badges.includes("no-live-execution"), "Ready summary item includes no-live-execution badge");
  assert(ready.badges.includes("summary-ready"), "Ready summary item includes summary-ready badge");
  assert(
    summary.sections.approvalRemediation.every((item) => item.section === "approval_remediation"),
    "Blocked closeout items map to approval remediation summary items",
  );
  assert(
    summary.sections.approvalRemediation.every((item) => item.summaryState === "blocked"),
    "Blocked closeout items get blocked summary state",
  );
  assert(
    summary.sections.approvalRemediation.some((item) => item.nextAction === "refresh_expired_approval"),
    "Expired blockers preserve approval refresh next action",
  );
  assert(
    summary.sections.approvalRemediation.every((item) => item.badges.includes("summary-blocked")),
    "Blocked summary items include summary-blocked badge",
  );
  assert(summary.sections.summaryText.includes("Summary ready"), "Summary text includes ready command line");
  assert(summary.sections.safetySummary.some((line) => line.includes("No registry fetch")), "Summary safety states no registry fetch");
  assert(summary.sections.safetySummary.some((line) => line.includes("No credentials")), "Summary safety states no credential persistence");
  assert(!JSON.stringify(summary).includes("SHOULD_NOT_LEAK"), "Closeout summary redacts unsafe approval signatures");
  assert(!JSON.stringify(summary).includes("plugins.example.com"), "Closeout summary does not leak registry URLs");
}

function verifyCloseoutSummaryCanFocusReadyItems(): void {
  section("2. Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Summary Focuses Ready Items");

  const summary = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummary({
    commandPanelDigestClipboardReviewCloseoutView: commandPanelDigestClipboardReviewCloseoutView(),
    includeSections: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T18:19:00.000Z",
  });

  assertEqual(summary.audience, "reviewer", "Closeout summary audience can be reviewer");
  assertEqual(summary.summaryItemCount, 1, "Focused closeout summary respects maxItems");
  assertEqual(summary.sections.readyCommands[0]?.phase, "metadata", "Focused closeout summary keeps ready metadata phase");
  assertEqual(summary.sections.readyCommands[0]?.section, "ready_commands", "Focused summary keeps ready section");
  assertEqual(summary.sections.readyCommands[0]?.itemState, "ready_to_copy", "Focused summary keeps copy-ready state");
  assertEqual(summary.sections.readyCommands[0]?.summaryState, "ready_to_copy", "Focused summary keeps ready state");
  assertEqual(summary.summary.omittedBySectionFilter, 3, "Focused summary reports section-filter omissions");
  assertEqual(summary.summary.omittedByStateFilter, 0, "Focused summary reports no state-filter omissions after section filtering");
  assertEqual(summary.summary.omittedByCap, 0, "Focused summary reports no cap omission");
  assert(!summary.sections.summaryText.includes("approval mismatch"), "Focused summary omits remediation text");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Summary Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file(
    "src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review-closeout-summary.ts",
  ).text();
  assert(!source.includes("fetch("), "Closeout summary runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Closeout summary runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Closeout summary runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log(
    "THE COLONY - Phase 278 Verification (Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Summary)\n",
  );

  verifyCloseoutSummaryProjectsOperatorSummary();
  verifyCloseoutSummaryCanFocusReadyItems();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 278 verification FAILED");
    process.exit(1);
  }

  console.log(
    "\nPhase 278: plugin marketplace lifecycle default UX command panel digest clipboard review closeout summary is GREEN.",
  );
}

run().catch((error) => {
  console.error("Phase 278 verification crashed:", error);
  process.exit(1);
});
