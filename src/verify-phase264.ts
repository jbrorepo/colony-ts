/**
 * Phase 264 Verification Script - Plugin Marketplace Lifecycle Approval Review
 *
 * Proves lifecycle approval packets can be reviewed against supplied approval
 * evidence into read-only ready/missing/mismatch/expired states without
 * fetching registries, installing packages, executing package code, activating
 * or starting sidecars, mutating catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase264.ts
 */

import {
  createPluginPackageMarketplaceLifecycleApprovalPackets,
  createPluginPackageMarketplaceLifecycleApprovalReview,
  createPluginPackageMarketplaceLifecycleHandoff,
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

const digest = "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef";

function lifecycleApprovalPacketsView() {
  const status = createPluginPackageMarketplaceLifecycleStatus({
    catalogId: "catalog-phase264",
    metadataPlanningView: {
      entries: [
        stageEntry("metadata-entry", "Metadata Missing", "metadata_missing"),
        stageEntry("install-entry", "Install Pending", "metadata_ready"),
        stageEntry("readiness-entry", "Readiness Pending", "metadata_ready"),
        stageEntry("activation-entry", "Activation Pending", "metadata_ready"),
        stageEntry("active-entry", "Active Sidecar", "metadata_ready"),
        stageEntry("failed-entry", "Install Failed", "metadata_ready"),
      ],
      warnings: ["metadata SHOULD_NOT_LEAK https://plugins.example.com/private"],
    },
    installStatusView: {
      entries: [
        stageEntry("readiness-entry", "Readiness Pending", "completed"),
        stageEntry("activation-entry", "Activation Pending", "completed"),
        stageEntry("active-entry", "Active Sidecar", "completed"),
        stageEntry("failed-entry", "Install Failed", "failed", "install_update_failed"),
      ],
      warnings: ["install SHOULD_NOT_LEAK"],
    },
    activationReadinessView: {
      entries: [
        stageEntry("activation-entry", "Activation Pending", "ready_for_activation_handoff"),
        stageEntry("active-entry", "Active Sidecar", "active"),
        stageEntry("failed-entry", "Install Failed", "install_failed", "install_update_failed"),
      ],
      warnings: ["readiness SHOULD_NOT_LEAK"],
    },
    activationExecutionStatusView: {
      entries: [
        {
          ...stageEntry("active-entry", "Active Sidecar", "active"),
          receipt: { present: true },
        },
      ],
      warnings: ["activation SHOULD_NOT_LEAK"],
    },
    timestamp: "2026-05-14T11:01:00.000Z",
  });

  const handoff = createPluginPackageMarketplaceLifecycleHandoff({
    lifecycleStatusView: status,
    operatorIntent: "produce_safe_marketplace_approval_review",
    timestamp: "2026-05-14T11:02:00.000Z",
  });

  const runbook = createPluginPackageMarketplaceLifecycleRunbook({
    lifecycleHandoffView: handoff,
    timestamp: "2026-05-14T11:03:00.000Z",
  });

  return createPluginPackageMarketplaceLifecycleApprovalPackets({
    lifecycleRunbookView: runbook,
    timestamp: "2026-05-14T11:04:00.000Z",
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
      version: "34.0.0",
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

function verifyApprovalReviewClassifiesPackets(): void {
  section("1. Lifecycle Approval Review Classifies Approval Evidence");

  const packets = lifecycleApprovalPacketsView();
  const review = createPluginPackageMarketplaceLifecycleApprovalReview({
    approvalPacketsView: packets,
    approvalEvidence: [
      {
        packetId: packets.packets[0]!.packetId,
        approvalSubject: packets.packets[0]!.approvalSubject,
        approved: true,
        approvalSignature: "approval-metadata-entry-SHOULD_NOT_LEAK",
        approver: "operator@example.test",
        expiresAt: "2026-05-14T12:00:00.000Z",
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
    timestamp: "2026-05-14T11:06:00.000Z",
  });

  assertEqual(review.recordType, "mcp_plugin_package_marketplace_lifecycle_approval_review_view", "Approval review uses stable record type");
  assertEqual(review.approvalPacketsRecordType, "mcp_plugin_package_marketplace_lifecycle_approval_packets_view", "Approval review records source approval packets");
  assertEqual(review.packetReviewCount, 4, "Approval review includes each approval packet by default");
  assertEqual(review.networkFetched, false, "Approval review fetches no registry");
  assertEqual(review.packageInstalled, false, "Approval review performs no package install");
  assertEqual(review.packageExecuted, false, "Approval review performs no package-code execution");
  assertEqual(review.activation, false, "Approval review performs no activation");
  assertEqual(review.sidecarStarted, false, "Approval review starts no sidecar");
  assertEqual(review.catalogMutated, false, "Approval review mutates no catalog");
  assertEqual(review.credentialsPersisted, false, "Approval review persists no credentials");
  assertEqual(review.reviews[0]?.reviewState, "ready_for_operator_handoff", "Matching approval evidence is ready for handoff");
  assertEqual(review.reviews[1]?.reviewState, "approval_mismatch", "Wrong approval subject is rejected as mismatch");
  assertEqual(review.reviews[2]?.reviewState, "approval_expired", "Expired approval evidence is rejected");
  assertEqual(review.reviews[3]?.reviewState, "missing_approval", "Missing approval evidence remains blocked");
  assert(review.reviews.every((item) => item.executionMode === "operator_only"), "Every approval review item is operator-only");
  assert(review.reviews.every((item) => item.hostActionAllowed === false), "Approval review never authorizes direct host action");
  assertEqual(review.summary.readyForOperatorHandoff, 1, "Summary counts ready approval evidence");
  assertEqual(review.summary.approvalMismatches, 1, "Summary counts approval mismatches");
  assertEqual(review.summary.approvalExpired, 1, "Summary counts expired approvals");
  assertEqual(review.summary.missingApprovals, 1, "Summary counts missing approvals");
  assert(!JSON.stringify(review).includes("SHOULD_NOT_LEAK"), "Approval review redacts unsafe approval signatures");
  assert(!JSON.stringify(review).includes("plugins.example.com"), "Approval review does not leak registry URLs");
}

function verifyApprovalReviewCanFocusReadyQueue(): void {
  section("2. Lifecycle Approval Review Focuses Ready Queue");

  const packets = lifecycleApprovalPacketsView();
  const review = createPluginPackageMarketplaceLifecycleApprovalReview({
    approvalPacketsView: packets,
    approvalEvidence: [
      {
        packetId: packets.packets[0]!.packetId,
        approvalSubject: packets.packets[0]!.approvalSubject,
        approved: true,
      },
      {
        packetId: packets.packets[1]!.packetId,
        approvalSubject: packets.packets[1]!.approvalSubject,
        approved: true,
      },
    ],
    includeReviewStates: ["ready_for_operator_handoff"],
    maxItems: 1,
    audience: "reviewer",
    timestamp: "2026-05-14T11:07:00.000Z",
  });

  assertEqual(review.audience, "reviewer", "Approval review audience can be reviewer");
  assertEqual(review.packetReviewCount, 1, "Focused review respects maxItems");
  assertEqual(review.reviews[0]?.reviewState, "ready_for_operator_handoff", "Focused review keeps requested state");
  assertEqual(review.reviews[0]?.approvalSubject, "plugin-marketplace:metadata", "Focused review preserves source packet order");
  assertEqual(review.summary.omittedByStateFilter, 2, "Focused review reports packets omitted by state filter");
  assertEqual(review.summary.omittedByCap, 1, "Focused review reports packets omitted by cap");
}

async function verifyRuntimeHasNoDirectMutationPrimitives(): Promise<void> {
  section("3. Lifecycle Approval Review Runtime Contains No Direct Mutation Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-lifecycle-approval-review.ts").text();
  assert(!source.includes("fetch("), "Approval review runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Approval review runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Approval review runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 264 Verification (Plugin Marketplace Lifecycle Approval Review)\n");

  verifyApprovalReviewClassifiesPackets();
  verifyApprovalReviewCanFocusReadyQueue();
  await verifyRuntimeHasNoDirectMutationPrimitives();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 264 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 264: plugin marketplace lifecycle approval review is GREEN.");
}

run().catch((error) => {
  console.error("Phase 264 verification crashed:", error);
  process.exit(1);
});
