/**
 * Phase 276 Verification Script - Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard Review
 *
 * Proves lifecycle default UX command panel digest clipboard packets can be
 * projected into a bounded operator/reviewer review checklist. The review
 * remains a read-only projection and does not fetch registries, install
 * packages, execute package code, activate sidecars, mutate catalogs, or
 * persist credentials.
 *
 * Run: bun run src/verify-phase276.ts
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
    catalogId: "catalog-phase276",
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
    timestamp: "2026-05-14T16:40:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_panel_digest_clipboard_review",
    timestamp: "2026-05-14T16:41:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T16:42:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T16:43:00.000Z",
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
        expiresAt: "2026-05-14T17:44:00.000Z",
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
    timestamp: "2026-05-14T16:44:00.000Z",
  });
}

function commandPanelDigestClipboardView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T16:45:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T16:46:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T16:47:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T16:48:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T16:49:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T16:50:00.000Z",
  });
  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T16:51:00.000Z",
  });
  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: brief,
    timestamp: "2026-05-14T16:52:00.000Z",
  });
  const panel = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: transcript,
    timestamp: "2026-05-14T16:53:00.000Z",
  });
  const digestView = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest({
    commandPanelView: panel,
    timestamp: "2026-05-14T16:54:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard({
    commandPanelDigestView: digestView,
    timestamp: "2026-05-14T16:55:00.000Z",
  });
}

function verifyClipboardReviewProjectsChecklist(): void {
  section("1. Lifecycle Default UX Command Panel Digest Clipboard Review Projects Checklist");

  const review = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReview({
    commandPanelDigestClipboardView: commandPanelDigestClipboardView(),
    timestamp: "2026-05-14T16:56:00.000Z",
  });

  assertEqual(
    review.recordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_view",
    "Clipboard review uses stable record type",
  );
  assertEqual(
    review.commandPanelDigestClipboardRecordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_view",
    "Clipboard review records source clipboard view",
  );
  assertEqual(review.sourceClipboardItemCount, 4, "Clipboard review records source clipboard item count");
  assertEqual(review.reviewItemCount, 4, "Clipboard review includes each clipboard item by default");
  assertEqual(review.reviewTitle, "Plugin lifecycle command clipboard review", "Clipboard review uses stable title");
  assertEqual(review.networkFetched, false, "Clipboard review fetches no registry");
  assertEqual(review.packageInstalled, false, "Clipboard review performs no package install");
  assertEqual(review.packageExecuted, false, "Clipboard review performs no package-code execution");
  assertEqual(review.activation, false, "Clipboard review performs no activation");
  assertEqual(review.sidecarStarted, false, "Clipboard review starts no sidecar");
  assertEqual(review.catalogMutated, false, "Clipboard review mutates no catalog");
  assertEqual(review.credentialsPersisted, false, "Clipboard review persists no credentials");
  assertEqual(review.defaultLiveExecution, false, "Clipboard review does not enable default live execution");
  assertEqual(review.summary.readyCommands, 1, "Summary counts ready command review items");
  assertEqual(review.summary.approvalRemediation, 3, "Summary counts approval remediation review items");
  assertEqual(review.summary.readyToCopy, 1, "Summary counts copy-ready review items");
  assertEqual(review.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch review blockers");
  assertEqual(review.summary.blockedApprovalExpired, 1, "Summary counts expired approval review blockers");
  assertEqual(review.summary.blockedMissingApproval, 1, "Summary counts missing approval review blockers");
  assertEqual(review.summary.readyReviewCount, 1, "Summary counts review-ready items");
  assertEqual(review.summary.blockerReviewCount, 3, "Summary counts blocked review items");
  assert(review.summary.reviewTextLineCount >= 5, "Summary records bounded review text line count");
  assert(review.sections.safetySummary.length >= 4, "Clipboard review preserves fixed safety summary lines");

  const ready = review.sections.readyCommands[0]!;
  assert(ready.reviewItemId.startsWith("review-clipboard-digest-panel-transcript-brief-"), "Ready review item id is derived from clipboard id");
  assertEqual(ready.section, "ready_commands", "Ready clipboard item maps to ready command review section");
  assertEqual(ready.itemState, "ready_to_copy", "Ready review item remains copy-ready");
  assertEqual(ready.reviewState, "ready_to_copy", "Ready review item gets ready review state");
  assertEqual(ready.executionMode, "operator_only", "Ready review item stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready review item denies host action");
  assertEqual(ready.reviewMutable, false, "Ready review item denies review mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready review item denies default live execution");
  assert(ready.label.includes("Request metadata handoff"), "Ready review label preserves clipboard label");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready review copy text preserves command id");
  assert(ready.clipboardLine.includes("Request metadata handoff"), "Ready review line preserves clipboard line");
  assert(ready.reviewLine.includes("Ready to copy"), "Ready review line names copy readiness");
  assert(ready.reviewLine.includes("plugin.lifecycle.request.metadata"), "Ready review line includes copy command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready review terminal hint names operator-only mode");
  assert(ready.badges.includes("read-only"), "Ready review item includes read-only badge");
  assert(ready.badges.includes("no-live-execution"), "Ready review item includes no-live-execution badge");
  assert(ready.badges.includes("review-ready"), "Ready review item includes review-ready badge");
  assert(review.sections.approvalRemediation.every((item) => item.section === "approval_remediation"), "Blocked clipboard items map to approval remediation review items");
  assert(review.sections.approvalRemediation.every((item) => item.reviewState === "blocked"), "Blocked clipboard items get blocked review state");
  assert(review.sections.approvalRemediation.some((item) => item.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(review.sections.approvalRemediation.every((item) => item.badges.includes("review-blocked")), "Blocked review items include review-blocked badge");
  assert(review.sections.reviewText.includes("Ready to copy"), "Review text includes ready command line");
  assert(review.sections.safetySummary.some((line) => line.includes("No registry fetch")), "Review safety summary states no registry fetch");
  assert(review.sections.safetySummary.some((line) => line.includes("No credentials")), "Review safety summary states no credential persistence");
  assert(!JSON.stringify(review).includes("SHOULD_NOT_LEAK"), "Clipboard review redacts unsafe approval signatures");
  assert(!JSON.stringify(review).includes("plugins.example.com"), "Clipboard review does not leak registry URLs");
}

function verifyClipboardReviewCanFocusReadyItems(): void {
  section("2. Lifecycle Default UX Command Panel Digest Clipboard Review Focuses Ready Items");

  const review = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReview({
    commandPanelDigestClipboardView: commandPanelDigestClipboardView(),
    includeSections: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T16:57:00.000Z",
  });

  assertEqual(review.audience, "reviewer", "Clipboard review audience can be reviewer");
  assertEqual(review.reviewItemCount, 1, "Focused clipboard review respects maxItems");
  assertEqual(review.sections.readyCommands[0]?.phase, "metadata", "Focused clipboard review keeps ready metadata phase");
  assertEqual(review.sections.readyCommands[0]?.section, "ready_commands", "Focused clipboard review keeps ready section");
  assertEqual(review.sections.readyCommands[0]?.itemState, "ready_to_copy", "Focused clipboard review keeps copy-ready state");
  assertEqual(review.sections.readyCommands[0]?.reviewState, "ready_to_copy", "Focused clipboard review keeps ready review state");
  assertEqual(review.summary.omittedBySectionFilter, 3, "Focused clipboard review reports section-filter omissions");
  assertEqual(review.summary.omittedByStateFilter, 0, "Focused clipboard review reports no state-filter omissions after section filtering");
  assertEqual(review.summary.omittedByCap, 0, "Focused clipboard review reports no cap omission");
  assert(!review.sections.reviewText.includes("approval mismatch"), "Focused clipboard review omits remediation text");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Panel Digest Clipboard Review Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file(
    "src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review.ts",
  ).text();
  assert(!source.includes("fetch("), "Clipboard review runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Clipboard review runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Clipboard review runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 276 Verification (Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard Review)\n");

  verifyClipboardReviewProjectsChecklist();
  verifyClipboardReviewCanFocusReadyItems();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 276 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 276: plugin marketplace lifecycle default UX command panel digest clipboard review is GREEN.");
}

run().catch((error) => {
  console.error("Phase 276 verification crashed:", error);
  process.exit(1);
});
