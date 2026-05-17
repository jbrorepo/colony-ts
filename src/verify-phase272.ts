/**
 * Phase 272 Verification Script - Plugin Marketplace Lifecycle Default UX Command Transcript
 *
 * Proves lifecycle default UX command briefs can be projected into a read-only
 * operator transcript/panel model. The transcript prepares bounded terminal
 * lines and safety summaries without fetching registries, installing packages,
 * executing package code, activating sidecars, mutating catalogs, or persisting
 * credentials.
 *
 * Run: bun run src/verify-phase272.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalHandoff,
  createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight,
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief,
  createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette,
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

const digest = "sha256:fafafafafafafafafafafafafafafafafafafafafafafafafafafafa";

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
    catalogId: "catalog-phase272",
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
    timestamp: "2026-05-14T13:20:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_default_ux_command_transcript",
    timestamp: "2026-05-14T13:21:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T13:22:00.000Z",
  });

  const packets = createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T13:23:00.000Z",
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
        expiresAt: "2026-05-14T14:24:00.000Z",
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
    timestamp: "2026-05-14T13:24:00.000Z",
  });
}

function commandBriefView() {
  const review = lifecycleApprovalReviewView();
  const handoff = createPluginPackageMarketplaceLifecycleApprovalHandoff({
    approvalReviewView: review,
    timestamp: "2026-05-14T13:25:00.000Z",
  });
  const preflight = createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight({
    approvalHandoffView: handoff,
    timestamp: "2026-05-14T13:26:00.000Z",
  });
  const request = createPluginPackageMarketplaceLifecycleHostHandoffRequest({
    approvalHandoffPreflightView: preflight,
    timestamp: "2026-05-14T13:27:00.000Z",
  });
  const queue = createPluginPackageMarketplaceLifecycleOperatorQueue({
    hostHandoffRequestView: request,
    timestamp: "2026-05-14T13:28:00.000Z",
  });
  const plan = createPluginPackageMarketplaceLifecycleDefaultUxPlan({
    operatorQueueView: queue,
    timestamp: "2026-05-14T13:29:00.000Z",
  });
  const palette = createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette({
    defaultUxPlanView: plan,
    timestamp: "2026-05-14T13:30:00.000Z",
  });
  return createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief({
    commandPaletteView: palette,
    timestamp: "2026-05-14T13:31:00.000Z",
  });
}

function verifyCommandTranscriptProjectsBriefLines(): void {
  section("1. Lifecycle Default UX Command Transcript Projects Brief Lines");

  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: commandBriefView(),
    timestamp: "2026-05-14T13:32:00.000Z",
  });

  assertEqual(transcript.recordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_transcript_view", "Command transcript uses stable record type");
  assertEqual(transcript.commandBriefRecordType, "mcp_plugin_package_marketplace_lifecycle_default_ux_command_brief_view", "Command transcript records source brief view");
  assertEqual(transcript.sourceLineCount, 4, "Command transcript records source brief line count");
  assertEqual(transcript.transcriptLineCount, 4, "Command transcript includes each brief line by default");
  assertEqual(transcript.networkFetched, false, "Command transcript fetches no registry");
  assertEqual(transcript.packageInstalled, false, "Command transcript performs no package install");
  assertEqual(transcript.packageExecuted, false, "Command transcript performs no package-code execution");
  assertEqual(transcript.activation, false, "Command transcript performs no activation");
  assertEqual(transcript.sidecarStarted, false, "Command transcript starts no sidecar");
  assertEqual(transcript.catalogMutated, false, "Command transcript mutates no catalog");
  assertEqual(transcript.credentialsPersisted, false, "Command transcript persists no credentials");
  assertEqual(transcript.defaultLiveExecution, false, "Command transcript does not enable default live execution");
  assertEqual(transcript.summary.readyCommands, 1, "Summary counts ready transcript lines");
  assertEqual(transcript.summary.approvalRemediation, 3, "Summary counts approval remediation transcript lines");
  assertEqual(transcript.summary.readyToCopy, 1, "Summary counts copy-ready transcript lines");
  assertEqual(transcript.summary.blockedApprovalMismatch, 1, "Summary counts approval mismatch blockers");
  assertEqual(transcript.summary.blockedApprovalExpired, 1, "Summary counts expired approval blockers");
  assertEqual(transcript.summary.blockedMissingApproval, 1, "Summary counts missing approval blockers");
  assert(transcript.sections.safetySummary.length >= 4, "Transcript includes fixed safety summary lines");

  const ready = transcript.sections.readyCommands[0]!;
  assert(ready.transcriptLineId.startsWith("transcript-brief-"), "Ready transcript line id is derived from brief line id");
  assertEqual(ready.section, "ready_commands", "Ready brief line maps to ready transcript section");
  assertEqual(ready.lineState, "ready_to_copy", "Ready transcript line remains copy-ready");
  assertEqual(ready.executionMode, "operator_only", "Ready transcript line stays operator-only");
  assertEqual(ready.hostActionAllowed, false, "Ready transcript line denies host action");
  assertEqual(ready.transcriptMutable, false, "Ready transcript line denies transcript mutation");
  assertEqual(ready.defaultLiveExecution, false, "Ready transcript line denies default live execution");
  assert(ready.text.includes("[metadata]"), "Ready transcript text includes phase marker");
  assert(ready.text.includes("Request metadata handoff"), "Ready transcript text includes command label");
  assert(ready.text.includes("@colony/metadata-entry"), "Ready transcript text includes package name");
  assert(ready.copyText.includes("plugin.lifecycle.request.metadata"), "Ready transcript copy text includes command id");
  assert(ready.terminalHint.includes("operator-only"), "Ready transcript terminal hint names operator-only mode");
  assert(ready.safetyBadges.includes("read-only"), "Ready transcript line includes read-only badge");
  assert(ready.safetyBadges.includes("no-live-execution"), "Ready transcript line includes no-live-execution badge");
  assert(transcript.sections.approvalRemediation.every((line) => line.section === "approval_remediation"), "Blocked brief lines map to approval remediation");
  assert(transcript.sections.approvalRemediation.some((line) => line.nextAction === "refresh_expired_approval"), "Expired blockers preserve approval refresh next action");
  assert(transcript.sections.safetySummary.some((line) => line.includes("No registry fetch")), "Safety summary states no registry fetch");
  assert(transcript.sections.safetySummary.some((line) => line.includes("No credentials")), "Safety summary states no credential persistence");
  assert(!JSON.stringify(transcript).includes("SHOULD_NOT_LEAK"), "Command transcript redacts unsafe approval signatures");
  assert(!JSON.stringify(transcript).includes("plugins.example.com"), "Command transcript does not leak registry URLs");
}

function verifyCommandTranscriptCanFocusReadyLines(): void {
  section("2. Lifecycle Default UX Command Transcript Focuses Ready Lines");

  const transcript = createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript({
    commandBriefView: commandBriefView(),
    includeSections: ["ready_commands"],
    includeStates: ["ready_to_copy"],
    maxLines: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T13:33:00.000Z",
  });

  assertEqual(transcript.audience, "reviewer", "Command transcript audience can be reviewer");
  assertEqual(transcript.transcriptLineCount, 1, "Focused transcript respects maxLines");
  assertEqual(transcript.sections.readyCommands[0]?.phase, "metadata", "Focused transcript keeps ready metadata phase");
  assertEqual(transcript.sections.readyCommands[0]?.section, "ready_commands", "Focused transcript keeps ready section");
  assertEqual(transcript.sections.readyCommands[0]?.lineState, "ready_to_copy", "Focused transcript keeps copy-ready state");
  assertEqual(transcript.summary.omittedBySectionFilter, 3, "Focused transcript reports section-filter omissions");
  assertEqual(transcript.summary.omittedByStateFilter, 0, "Focused transcript reports no state-filter omissions after section filtering");
  assertEqual(transcript.summary.omittedByCap, 0, "Focused transcript reports no cap omission");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Default UX Command Transcript Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-transcript.ts").text();
  assert(!source.includes("fetch("), "Command transcript runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Command transcript runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Command transcript runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 272 Verification (Plugin Marketplace Lifecycle Default UX Command Transcript)\n");

  verifyCommandTranscriptProjectsBriefLines();
  verifyCommandTranscriptCanFocusReadyLines();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 272 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 272: plugin marketplace lifecycle default UX command transcript is GREEN.");
}

run().catch((error) => {
  console.error("Phase 272 verification crashed:", error);
  process.exit(1);
});
