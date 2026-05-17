/**
 * Phase 277 Verification Script - Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard Review Closeout
 *
 * Proves lifecycle default UX command panel digest clipboard review packets can
 * be projected into bounded operator/reviewer closeout packets. The closeout
 * remains a read-only projection and does not fetch registries, install
 * packages, execute package code, activate sidecars, mutate catalogs, or
 * persist credentials.
 *
 * Run: bun run src/verify-phase277.ts
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
    catalogId: "catalog-phase277",
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
    timestamp: "2026-05-14T17:00:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_panel_digest_clipboard_review_closeout",
    timestamp: "2026-05-14T17:01:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T17:02:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T17:03:00.000Z",
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
        expiresAt: "2026-05-14T18:04:00.000Z",
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
    timestamp: "2026-05-14T17:04:00.000Z",
  });
}

function commandPanelDigestClipboardReviewView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T17:05:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T17:06:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T17:07:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T17:08:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T17:09:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T17:10:00.000Z",
  });
  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T17:11:00.000Z",
  });
  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: brief,
    timestamp: "2026-05-14T17:12:00.000Z",
  });
  const panel = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: transcript,
    timestamp: "2026-05-14T17:13:00.000Z",
  });
  const digestView = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest({
    commandPanelView: panel,
    timestamp: "2026-05-14T17:14:00.000Z",
  });
  const clipboard = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard({
    commandPanelDigestView: digestView,
    timestamp: "2026-05-14T17:15:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReview({
    commandPanelDigestClipboardView: clipboard,
    timestamp: "2026-05-14T17:16:00.000Z",
  });
}

function verifyClipboardReviewCloseoutProjectsChecklist(): void {
  section("1. Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Projects Checklist");

  const closeout = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseout({
    commandPanelDigestClipboardReviewView: commandPanelDigestClipboardReviewView(),
    timestamp: "2026-05-14T17:17:00.000Z",
  });

  assertEqual(
    closeout.recordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_closeout_view",
    "Clipboard review closeout uses stable record type",
  );
  assertEqual(
    closeout.commandPanelDigestClipboardReviewRecordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_view",
    "Clipboard review closeout records source review view",
  );
  assertEqual(closeout.sourceReviewItemCount, 4, "Clipboard review closeout records source review item count");
  assertEqual(closeout.closeoutItemCount, 4, "Clipboard review closeout includes each review item by default");
  assertEqual(closeout.closeoutTitle, "Plugin lifecycle command clipboard review closeout", "Closeout uses stable title");
  assertEqual(closeout.networkFetched, false, "Closeout fetches no registry");
  assertEqual(closeout.packageInstalled, false, "Closeout performs no package install");
  assertEqual(closeout.packageExecuted, false, "Closeout performs no package-code execution");
  assertEqual(closeout.activation, false, "Closeout performs no activation");
  assertEqual(closeout.sidecarStarted, false, "Closeout starts no sidecar");
  assertEqual(closeout.catalogMutated, false, "Closeout mutates no catalog");
  assertEqual(closeout.credentialsPersisted, false, "Closeout persists no credentials");
  assertEqual(closeout.defaultLiveExecution, false, "Closeout does not enable default live execution");
  assertEqual(closeout.summary.readyCommands, 1, "Summary counts ready command closeout items");
  assertEqual(closeout.summary.approvalRemediation, 3, "Summary counts approval remediation closeout items");
  assertEqual(closeout.summary.readyToCopy, 1, "Summary counts copy-ready closeout items");
  assertEqual(closeout.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch closeout blockers");
  assertEqual(closeout.summary.blockedApprovalExpired, 1, "Summary counts expired approval closeout blockers");
  assertEqual(closeout.summary.blockedMissingApproval, 1, "Summary counts missing approval closeout blockers");
  assertEqual(closeout.summary.readyCloseoutCount, 1, "Summary counts closeout-ready items");
  assertEqual(closeout.summary.blockerCloseoutCount, 3, "Summary counts blocked closeout items");
  assert(closeout.summary.closeoutTextLineCount >= 5, "Summary records bounded closeout text line count");
  assert(closeout.sections.safetySummary.length >= 4, "Closeout preserves fixed safety summary lines");

  const ready = closeout.sections.readyCommands[0]!;
  assert(
    ready.closeoutItemId.startsWith("closeout-review-clipboard-digest-panel-transcript-brief-"),
    "Ready closeout item id is derived from review id",
  );
  assertEqual(ready.section, "ready_commands", "Ready review item maps to ready command closeout section");
  assertEqual(ready.itemState, "ready_to_copy", "Ready closeout item remains copy-ready");
  assertEqual(ready.closeoutState, "ready_to_copy", "Ready closeout item gets ready closeout state");
  assertEqual(ready.executionMode, "operator_only", "Ready closeout item stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready closeout item denies host action");
  assertEqual(ready.closeoutMutable, false, "Ready closeout item denies closeout mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready closeout item denies default live execution");
  assert(ready.label.includes("Request metadata handoff"), "Ready closeout label preserves review label");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready closeout copy text preserves command id");
  assert(ready.clipboardLine.includes("Request metadata handoff"), "Ready closeout line preserves clipboard line");
  assert(ready.reviewLine.includes("Ready to copy"), "Ready closeout preserves review line");
  assert(ready.closeoutLine.includes("Closeout ready"), "Ready closeout line names closeout readiness");
  assert(ready.closeoutLine.includes("plugin.lifecycle.request.metadata"), "Ready closeout line includes copy command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready closeout terminal hint names operator-only mode");
  assert(ready.badges.includes("read-only"), "Ready closeout item includes read-only badge");
  assert(ready.badges.includes("no-live-execution"), "Ready closeout item includes no-live-execution badge");
  assert(ready.badges.includes("closeout-ready"), "Ready closeout item includes closeout-ready badge");
  assert(
    closeout.sections.approvalRemediation.every((item) => item.section === "approval_remediation"),
    "Blocked review items map to approval remediation closeout items",
  );
  assert(
    closeout.sections.approvalRemediation.every((item) => item.closeoutState === "blocked"),
    "Blocked review items get blocked closeout state",
  );
  assert(
    closeout.sections.approvalRemediation.some((item) => item.nextAction === "refresh_expired_approval"),
    "Expired blockers preserve approval refresh next action",
  );
  assert(
    closeout.sections.approvalRemediation.every((item) => item.badges.includes("closeout-blocked")),
    "Blocked closeout items include closeout-blocked badge",
  );
  assert(closeout.sections.closeoutText.includes("Closeout ready"), "Closeout text includes ready command line");
  assert(closeout.sections.safetySummary.some((line) => line.includes("No registry fetch")), "Closeout safety summary states no registry fetch");
  assert(closeout.sections.safetySummary.some((line) => line.includes("No credentials")), "Closeout safety summary states no credential persistence");
  assert(!JSON.stringify(closeout).includes("SHOULD_NOT_LEAK"), "Closeout redacts unsafe approval signatures");
  assert(!JSON.stringify(closeout).includes("plugins.example.com"), "Closeout does not leak registry URLs");
}

function verifyClipboardReviewCloseoutCanFocusReadyItems(): void {
  section("2. Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Focuses Ready Items");

  const closeout = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseout({
    commandPanelDigestClipboardReviewView: commandPanelDigestClipboardReviewView(),
    includeSections: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T17:18:00.000Z",
  });

  assertEqual(closeout.audience, "reviewer", "Clipboard review closeout audience can be reviewer");
  assertEqual(closeout.closeoutItemCount, 1, "Focused closeout respects maxItems");
  assertEqual(closeout.sections.readyCommands[0]?.phase, "metadata", "Focused closeout keeps ready metadata phase");
  assertEqual(closeout.sections.readyCommands[0]?.section, "ready_commands", "Focused closeout keeps ready section");
  assertEqual(closeout.sections.readyCommands[0]?.itemState, "ready_to_copy", "Focused closeout keeps copy-ready state");
  assertEqual(closeout.sections.readyCommands[0]?.closeoutState, "ready_to_copy", "Focused closeout keeps ready closeout state");
  assertEqual(closeout.summary.omittedBySectionFilter, 3, "Focused closeout reports section-filter omissions");
  assertEqual(closeout.summary.omittedByStateFilter, 0, "Focused closeout reports no state-filter omissions after section filtering");
  assertEqual(closeout.summary.omittedByCap, 0, "Focused closeout reports no cap omission");
  assert(!closeout.sections.closeoutText.includes("approval mismatch"), "Focused closeout omits remediation text");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Panel Digest Clipboard Review Closeout Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file(
    "src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review-closeout.ts",
  ).text();
  assert(!source.includes("fetch("), "Closeout runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Closeout runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Closeout runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log(
    "THE COLONY - Phase 277 Verification (Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard Review Closeout)\n",
  );

  verifyClipboardReviewCloseoutProjectsChecklist();
  verifyClipboardReviewCloseoutCanFocusReadyItems();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 277 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 277: plugin marketplace lifecycle default UX command panel digest clipboard review closeout is GREEN.");
}

run().catch((error) => {
  console.error("Phase 277 verification crashed:", error);
  process.exit(1);
});
