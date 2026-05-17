/**
 * Phase 275 Verification Script - Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard
 *
 * Proves lifecycle default UX command panel digests can be projected into a
 * bounded, copy-safe clipboard packet for operators. The packet remains a
 * read-only projection and does not fetch registries, install packages, execute
 * package code, activate sidecars, mutate catalogs, or persist credentials.
 *
 * Run: bun run src/verify-phase275.ts
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
    catalogId: "catalog-phase275",
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
    timestamp: "2026-05-14T16:20:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_panel_digest_clipboard",
    timestamp: "2026-05-14T16:21:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T16:22:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T16:23:00.000Z",
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
        expiresAt: "2026-05-14T17:24:00.000Z",
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
    timestamp: "2026-05-14T16:24:00.000Z",
  });
}

function commandPanelDigestView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T16:25:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T16:26:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T16:27:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T16:28:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T16:29:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T16:30:00.000Z",
  });
  const brief = createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T16:31:00.000Z",
  });
  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: brief,
    timestamp: "2026-05-14T16:32:00.000Z",
  });
  const panel = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel({
    commandTranscriptView: transcript,
    timestamp: "2026-05-14T16:33:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest({
    commandPanelView: panel,
    timestamp: "2026-05-14T16:34:00.000Z",
  });
}

function verifyCommandPanelDigestClipboardProjectsDigestItems(): void {
  section("1. Lifecycle Default UX Command Panel Digest Clipboard Projects Digest Items");

  const clipboard = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard({
    commandPanelDigestView: commandPanelDigestView(),
    timestamp: "2026-05-14T16:35:00.000Z",
  });

  assertEqual(
    clipboard.recordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_view",
    "Digest clipboard uses stable record type",
  );
  assertEqual(
    clipboard.commandPanelDigestRecordType,
    "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_view",
    "Digest clipboard records source digest view",
  );
  assertEqual(clipboard.sourceDigestItemCount, 4, "Digest clipboard records source digest item count");
  assertEqual(clipboard.clipboardItemCount, 4, "Digest clipboard includes each digest item by default");
  assertEqual(clipboard.clipboardTitle, "Plugin lifecycle command clipboard", "Digest clipboard uses stable title");
  assertEqual(clipboard.networkFetched, false, "Digest clipboard fetches no registry");
  assertEqual(clipboard.packageInstalled, false, "Digest clipboard performs no package install");
  assertEqual(clipboard.packageExecuted, false, "Digest clipboard performs no package-code execution");
  assertEqual(clipboard.activation, false, "Digest clipboard performs no activation");
  assertEqual(clipboard.sidecarStarted, false, "Digest clipboard starts no sidecar");
  assertEqual(clipboard.catalogMutated, false, "Digest clipboard mutates no catalog");
  assertEqual(clipboard.credentialsPersisted, false, "Digest clipboard persists no credentials");
  assertEqual(clipboard.defaultLiveExecution, false, "Digest clipboard does not enable default live execution");
  assertEqual(clipboard.summary.readyCommands, 1, "Summary counts ready command clipboard items");
  assertEqual(clipboard.summary.approvalRemediation, 3, "Summary counts approval remediation clipboard items");
  assertEqual(clipboard.summary.readyToCopy, 1, "Summary counts copy-ready clipboard items");
  assertEqual(clipboard.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch clipboard blockers");
  assertEqual(clipboard.summary.blockedApprovalExpired, 1, "Summary counts expired approval clipboard blockers");
  assertEqual(clipboard.summary.blockedMissingApproval, 1, "Summary counts missing approval clipboard blockers");
  assert(clipboard.summary.clipboardTextLineCount >= 5, "Summary records bounded clipboard text line count");
  assert(clipboard.sections.safetySummary.length >= 4, "Digest clipboard preserves fixed safety summary lines");

  const ready = clipboard.sections.readyCommands[0]!;
  assert(ready.clipboardItemId.startsWith("clipboard-digest-panel-transcript-brief-"), "Ready clipboard item id is derived from digest id");
  assertEqual(ready.section, "ready_commands", "Ready digest item maps to ready command clipboard section");
  assertEqual(ready.itemState, "ready_to_copy", "Ready clipboard item remains copy-ready");
  assertEqual(ready.executionMode, "operator_only", "Ready clipboard item stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready clipboard item denies host action");
  assertEqual(ready.clipboardMutable, false, "Ready clipboard item denies clipboard mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready clipboard item denies default live execution");
  assert(ready.label.includes("Request metadata handoff"), "Ready clipboard label preserves digest heading");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready clipboard copy text preserves command id");
  assert(ready.clipboardLine.includes("Request metadata handoff"), "Ready clipboard line includes command title");
  assert(ready.clipboardLine.includes("plugin.lifecycle.request.metadata"), "Ready clipboard line includes copy command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready clipboard terminal hint names operator-only mode");
  assert(ready.badges.includes("read-only"), "Ready clipboard item includes read-only badge");
  assert(ready.badges.includes("no-live-execution"), "Ready clipboard item includes no-live-execution badge");
  assert(ready.badges.includes("clipboard-ready"), "Ready clipboard item includes clipboard-ready badge");
  assert(clipboard.sections.approvalRemediation.every((item) => item.section === "approval_remediation"), "Blocked digest items map to approval remediation clipboard items");
  assert(clipboard.sections.approvalRemediation.some((item) => item.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(clipboard.sections.clipboardText.includes("Request metadata handoff"), "Clipboard text includes ready command line");
  assert(clipboard.sections.safetySummary.some((line) => line.includes("No registry fetch")), "Clipboard safety summary states no registry fetch");
  assert(clipboard.sections.safetySummary.some((line) => line.includes("No credentials")), "Clipboard safety summary states no credential persistence");
  assert(!JSON.stringify(clipboard).includes("SHOULD_NOT_LEAK"), "Digest clipboard redacts unsafe approval signatures");
  assert(!JSON.stringify(clipboard).includes("plugins.example.com"), "Digest clipboard does not leak registry URLs");
}

function verifyCommandPanelDigestClipboardCanFocusReadyItems(): void {
  section("2. Lifecycle Default UX Command Panel Digest Clipboard Focuses Ready Items");

  const clipboard = createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard({
    commandPanelDigestView: commandPanelDigestView(),
    includeSections: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T16:36:00.000Z",
  });

  assertEqual(clipboard.audience, "reviewer", "Digest clipboard audience can be reviewer");
  assertEqual(clipboard.clipboardItemCount, 1, "Focused digest clipboard respects maxItems");
  assertEqual(clipboard.sections.readyCommands[0]?.phase, "metadata", "Focused digest clipboard keeps ready metadata phase");
  assertEqual(clipboard.sections.readyCommands[0]?.section, "ready_commands", "Focused digest clipboard keeps ready section");
  assertEqual(clipboard.sections.readyCommands[0]?.itemState, "ready_to_copy", "Focused digest clipboard keeps copy-ready state");
  assertEqual(clipboard.summary.omittedBySectionFilter, 3, "Focused digest clipboard reports section-filter omissions");
  assertEqual(clipboard.summary.omittedByStateFilter, 0, "Focused digest clipboard reports no state-filter omissions after section filtering");
  assertEqual(clipboard.summary.omittedByCap, 0, "Focused digest clipboard reports no cap omission");
  assert(!clipboard.sections.clipboardText.includes("approval mismatch"), "Focused digest clipboard omits remediation text");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Panel Digest Clipboard Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard.ts").text();
  assert(!source.includes("fetch("), "Digest clipboard runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Digest clipboard runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Digest clipboard runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 275 Verification (Plugin Marketplace Lifecycle Default UX Command Panel Digest Clipboard)\n");

  verifyCommandPanelDigestClipboardProjectsDigestItems();
  verifyCommandPanelDigestClipboardCanFocusReadyItems();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 275 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 275: plugin marketplace lifecycle default UX command panel digest clipboard is GREEN.");
}

run().catch((error) => {
  console.error("Phase 275 verification crashed:", error);
  process.exit(1);
});
