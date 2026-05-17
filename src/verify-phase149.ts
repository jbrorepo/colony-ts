/** Phase 149 Verification - External Media Transfer Manual Retry Source Revalidation Plan */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  planExternalChannelMediaTransferManualRetryReplaySourceRevalidation,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationPlan,
  type ExternalChannelMediaTransferManualRetryWorkItem,
} from "./channel";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  PASS ${label}`); passed++; } else { console.error(`  FAIL ${label}`); failed++; }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }

function fileRefs(prefix = "phase149_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-149-report-${index}.pdf`,
    title: `Phase 149 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T149PRIVATE",
    accountId: "A149PRIVATE",
    targetKind: "channel",
    targetId: "C149PRIVATE",
    threadId: "171000.1490",
    enabled: true,
    fileRefs: fileRefs(),
    ...overrides,
  };
}

async function approvedCandidate(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{ candidate: ExternalChannelMediaTransferCandidate; approval: ExternalChannelMediaTransferApproval }> {
  const candidate = safeCandidate(overrides);
  const signature = await createExternalChannelMediaTransferApprovalSignature(candidate);
  return {
    candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-08T12:38:00.000Z",
      signature,
    },
  };
}

function workItem(data: Record<string, unknown>): ExternalChannelMediaTransferManualRetryWorkItem {
  const item = data.manualRetryWorkItem;
  assert(Boolean(item) && typeof item === "object" && !Array.isArray(item), "retryable failure exposes manual retry work item");
  return item as ExternalChannelMediaTransferManualRetryWorkItem;
}

async function sourceRetryFixture() {
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      sourceResolveMaxAttempts: 1,
      resolveSourceRef: async () => ({
        accepted: false,
        retryable: true,
        retryAfterSeconds: 23,
        reason: "source locked artifact:phase149_report_0 https://files.slack.com/private?token=xoxb-phase149-secret",
      }),
      sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

async function vendorRetryFixture() {
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({
        accepted: false,
        retryable: true,
        retryAfterSeconds: 31,
        reason: "vendor ambiguous targetId=C149PRIVATE retry-ledger://phase149-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase149_report") ||
    text.includes("artifact:phase149_alt") ||
    text.includes("T149PRIVATE") ||
    text.includes("A149PRIVATE") ||
    text.includes("C149PRIVATE") ||
    text.includes("C149PRIVATE_ALT") ||
    text.includes("171000.1490") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase149-forged") ||
    text.includes("durable-audit://phase149-forged") ||
    text.includes("xoxb-phase149-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

function assertSourceRevalidationPlanSafe(
  plan: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationPlan | undefined,
  expectedStage: "source_resolution" | "vendor_send",
): asserts plan is ExternalChannelMediaTransferManualRetryReplaySourceRevalidationPlan {
  assert(Boolean(plan), "accepted replay includes a source revalidation plan");
  if (!plan) return;
  assertEqual(plan.planKind, "external_media_transfer_manual_retry_source_revalidation", "plan kind is explicit");
  assertEqual(plan.planVersion, 1, "plan version is bounded");
  assertEqual(plan.retryStage, expectedStage, "plan carries expected retry stage");
  assertEqual(plan.requiresFreshApprovalSignature, true, "plan requires fresh approval signature");
  assertEqual(plan.requiresSourceRefRevalidation, true, "plan requires source ref revalidation");
  assertEqual(plan.requiresFreshSourceResolution, true, "plan requires fresh source resolution");
  assertEqual(plan.mustNotReuseResolvedFiles, true, "plan forbids stale resolved-file reuse");
  assertEqual(plan.requiresVendorStateCheck, expectedStage === "vendor_send", "plan vendor-state requirement follows stage");
  assertEqual(plan.hostExecutionRequired, true, "plan leaves source resolution to host/operator");
  assertEqual(plan.colonyResolvedSources, false, "plan resolves no sources");
  assertEqual(plan.colonyFetchedFiles, false, "plan fetches no files");
  assertEqual(plan.colonyDownloadedFiles, false, "plan downloads no files");
  assertEqual(plan.colonyUploadedFiles, false, "plan uploads no files");
  assertEqual(plan.colonyPreviewedFiles, false, "plan previews no files");
  assertEqual(plan.sourceRevalidationPersisted, false, "plan persists no source revalidation");
  assertEqual(plan.workItemPersisted, false, "plan persists no work item");
  assertEqual(plan.retryLedgerCreated, false, "plan creates no retry ledger");
  assertEqual(plan.durableRetryAuditRecordCreated, false, "plan creates no durable audit record");
  assertEqual(plan.backgroundRetryCreated, false, "plan creates no background retry");
  assertEqual(plan.retryWorkerCreated, false, "plan creates no retry worker");
  assertEqual(plan.retryScheduleCreated, false, "plan creates no retry schedule");
  assertEqual(plan.automaticVendorRetryAllowed, false, "plan permits no automatic vendor retry");
  assertEqual(plan.credentialPersistenceCreated, false, "plan creates no credential persistence");
  assertEqual(plan.defaultLiveDeliveryEnabled, false, "plan enables no default live delivery");
  assertEqual(plan.publicHostingEnabled, false, "plan enables no public hosting");
  assertEqual(plan.planTruth, "fingerprint_only_source_revalidation_plan_no_resolution_or_delivery", "plan truth is explicit");
  assert(Array.isArray(plan.sourceRefFingerprints) && plan.sourceRefFingerprints.length > 0, "plan carries bounded source fingerprints");
  assertEqual(plan.steps.length, plan.sourceRefFingerprints.length, "plan has one step per source fingerprint");
  for (const [index, step] of plan.steps.entries()) {
    const source = plan.sourceRefFingerprints[index];
    assertEqual(step.fileIndex, source.fileIndex, `step ${index} carries source file index`);
    assertEqual(step.sourceRefFingerprint, source.sourceRefFingerprint, `step ${index} carries source fingerprint only`);
    assertEqual(step.sourceRefRevalidationRequired, true, `step ${index} requires source ref revalidation`);
    assertEqual(step.freshSourceResolutionRequired, true, `step ${index} requires fresh source resolution`);
    assertEqual(step.staleResolvedFileReuseAllowed, false, `step ${index} forbids stale resolved-file reuse`);
    assertEqual(step.hostMustResolveFromApprovedSourceRef, true, `step ${index} requires host approved source resolution`);
    assertEqual(step.rawSourceRefPersisted, false, `step ${index} persists no raw source ref`);
    assertEqual(step.sourceBytesPersisted, false, `step ${index} persists no source bytes`);
    assertEqual(step.privateUrlPersisted, false, `step ${index} persists no private URL`);
    assertEqual(step.credentialPersistenceCreated, false, `step ${index} creates no credential persistence`);
  }
  assert(!("files" in plan), "plan carries no raw files");
  assert(!("targetId" in plan), "plan carries no raw target id");
  assert(!("workspaceId" in plan), "plan carries no raw workspace id");
  assert(!("accountId" in plan), "plan carries no raw account id");
  assert(!("threadId" in plan), "plan carries no raw thread id");
  assert(!("approval" in plan), "plan carries no approval object");
  assert(!("approvalSignature" in plan), "plan carries no approval signature");
}

async function verifySourceRevalidationPlanAccepted(): Promise<void> {
  section("1. Source Replay Source Revalidation Plan Is Fingerprint-Only And Manual");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await planExternalChannelMediaTransferManualRetryReplaySourceRevalidation({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "source_resolution",
    freshApprovalRequiredAfter: "2026-05-08T12:37:59.000Z",
  });

  assertEqual(result.accepted, true, "source replay source revalidation plan is accepted");
  assertEqual(result.preflight.accepted, true, "source revalidation result includes accepted preflight");
  assert(Boolean(result.hostAction), "source revalidation result includes host action context");
  assertSourceRevalidationPlanSafe(result.sourceRevalidationPlan, "source_resolution");
  assertEqual(result.sourceRevalidationPlan.workItemCorrelationId, item.workItemCorrelationId, "source plan carries supplied correlation id");
  assertEqual(result.sourceRevalidationPlan.transferKey, item.transferKey, "source plan carries current transfer key");
  assert(!containsForbiddenTruth(result), "source plan leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorRevalidationPlanAccepted(): Promise<void> {
  section("2. Vendor Replay Source Revalidation Plan Requires Vendor State Check First");
  const { candidate, approval, item } = await vendorRetryFixture();
  const result = await planExternalChannelMediaTransferManualRetryReplaySourceRevalidation({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T12:37:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor replay source revalidation plan is accepted");
  assertSourceRevalidationPlanSafe(result.sourceRevalidationPlan, "vendor_send");
  assertEqual(result.sourceRevalidationPlan.requiresVendorStateCheck, true, "vendor plan requires vendor-state check before source revalidation");
  assertEqual(result.sourceRevalidationPlan.automaticVendorRetryAllowed, false, "vendor plan still allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor plan leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyRejectedReplayCreatesNoPlan(): Promise<void> {
  section("3. Rejected Replay Produces No Source Revalidation Plan");
  const { candidate, item } = await sourceRetryFixture();
  const result = await planExternalChannelMediaTransferManualRetryReplaySourceRevalidation({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T12:36:00.000Z",
    },
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:37:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval source revalidation plan is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection is bounded");
  assertEqual(result.preflight.accepted, false, "stale approval preflight is rejected");
  assert(result.hostAction === undefined, "stale approval creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "stale approval creates no source revalidation plan");
  assertEqual(result.preflight.retryWorkerCreated, false, "stale approval creates no retry worker");
  assertEqual(result.preflight.retryLedgerCreated, false, "stale approval creates no retry ledger");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw signatures or target/source truth");
}

async function verifyTamperedReplayCreatesNoPlan(): Promise<void> {
  section("4. Tampered Work Item Produces No Source Revalidation Plan");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await planExternalChannelMediaTransferManualRetryReplaySourceRevalidation({
    candidate,
    approval,
    workItem: {
      ...item,
      workItemCorrelationId: "manual-retry-work-item:host-forged",
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T12:37:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered work item source revalidation plan is rejected");
  assertEqual(result.reasonCode, "valid_work_item_required", "tampered work item rejection is bounded");
  assert(result.hostAction === undefined, "tampered work item creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "tampered work item creates no source revalidation plan");
  assertEqual(result.preflight.retryLedgerCreated, false, "tampered work item cannot create retry ledger truth");
  assert(!containsForbiddenTruth(result), "tampered work item rejection redacts forged correlation and ledger claims");
}

async function verifyCurrentTruthMismatchCreatesNoPlan(): Promise<void> {
  section("5. Current Truth Mismatch Produces No Source Revalidation Plan");
  const { item } = await sourceRetryFixture();
  const otherCandidate = safeCandidate({ targetId: "C149PRIVATE_ALT", threadId: "171000.1491" });
  const otherApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2026-05-08T12:39:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(otherCandidate),
  };
  const result = await planExternalChannelMediaTransferManualRetryReplaySourceRevalidation({
    candidate: otherCandidate,
    approval: otherApproval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:38:59.000Z",
  });

  assertEqual(result.accepted, false, "wrong-target source revalidation plan is rejected");
  assertEqual(result.reasonCode, "work_item_current_truth_mismatch", "wrong-target rejection is bounded");
  assertEqual(result.preflight.targetCorrelationMatched, false, "wrong-target replay detects target mismatch");
  assert(result.hostAction === undefined, "wrong-target replay creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "wrong-target replay creates no source revalidation plan");
  assert(!containsForbiddenTruth(result), "wrong-target rejection leaks no raw target/source/signature truth");
}

async function verifySourceTruthMismatchCreatesNoPlan(): Promise<void> {
  section("6. Source Truth Mismatch Produces No Source Revalidation Plan");
  const { item } = await sourceRetryFixture();
  const changedSourceCandidate = safeCandidate({ fileRefs: fileRefs("phase149_alt") });
  const changedSourceApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2026-05-08T12:39:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(changedSourceCandidate),
  };
  const result = await planExternalChannelMediaTransferManualRetryReplaySourceRevalidation({
    candidate: changedSourceCandidate,
    approval: changedSourceApproval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:38:59.000Z",
  });

  assertEqual(result.accepted, false, "changed-source source revalidation plan is rejected");
  assertEqual(result.reasonCode, "work_item_current_truth_mismatch", "changed-source rejection is bounded");
  assertEqual(result.preflight.sourceRefFingerprintsMatched, false, "changed-source replay detects source fingerprint mismatch");
  assert(result.hostAction === undefined, "changed-source replay creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "changed-source replay creates no source revalidation plan");
  assert(!containsForbiddenTruth(result), "changed-source rejection leaks no raw target/source/signature truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 149 Verification (External Media Transfer Manual Retry Source Revalidation Plan)\n");
  await verifySourceRevalidationPlanAccepted();
  await verifyVendorRevalidationPlanAccepted();
  await verifyRejectedReplayCreatesNoPlan();
  await verifyTamperedReplayCreatesNoPlan();
  await verifyCurrentTruthMismatchCreatesNoPlan();
  await verifySourceTruthMismatchCreatesNoPlan();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 149: external media transfer manual retry source revalidation plan is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
