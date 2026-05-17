/** Phase 147 Verification - External Media Transfer Manual Retry Work Item Replay Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryWorkItemReplay,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
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

function fileRefs(prefix = "phase147_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-147-report-${index}.pdf`,
    title: `Phase 147 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 2048 + index,
    checksumSha256: `${index.toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T147PRIVATE",
    accountId: "A147PRIVATE",
    targetKind: "channel",
    targetId: "C147PRIVATE",
    threadId: "171000.1470",
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
      approvedAt: "2026-05-08T12:02:00.000Z",
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
        retryAfterSeconds: 42,
        reason: "source locked artifact:phase147_report_0 https://files.slack.com/private?token=xoxb-phase147-secret",
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
        retryAfterSeconds: 33,
        reason: "vendor ambiguous targetId=C147PRIVATE retry-ledger://phase147-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase147_report") ||
    text.includes("artifact:phase147_alt") ||
    text.includes("T147PRIVATE") ||
    text.includes("A147PRIVATE") ||
    text.includes("C147PRIVATE") ||
    text.includes("C147PRIVATE_ALT") ||
    text.includes("171000.1470") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase147-forged") ||
    text.includes("durable-audit://phase147-forged") ||
    text.includes("xoxb-phase147-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

async function verifySourceReplayPreflightAccepted(): Promise<void> {
  section("1. Source Work Item Replay Preflight Requires Fresh Approval And Matches Current Truth");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "source_resolution",
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });

  assertEqual(result.accepted, true, "source work item replay preflight is accepted");
  assertEqual(result.retryStage, "source_resolution", "source replay stage is preserved");
  assertEqual(result.workItemCorrelationId, item.workItemCorrelationId, "source replay returns bounded supplied correlation id");
  assertEqual(result.expectedWorkItemCorrelationId, item.workItemCorrelationId, "source replay recomputes the expected correlation id");
  assertEqual(result.workItemCorrelationMatched, true, "source replay correlation matches");
  assertEqual(result.transferKeyMatched, true, "source replay transfer key matches current approval-bound candidate");
  assertEqual(result.sourceRefFingerprintsMatched, true, "source replay source fingerprints match current candidate");
  assertEqual(result.targetCorrelationMatched, true, "source replay target correlation matches current candidate");
  assertEqual(result.requiresFreshApprovalSignature, true, "source replay still requires a fresh approval signature");
  assertEqual(result.requiresSourceRefRevalidation, true, "source replay requires source ref revalidation");
  assertEqual(result.requiresFreshSourceResolution, true, "source replay requires fresh source resolution");
  assertEqual(result.mustNotReuseResolvedFiles, true, "source replay forbids stale resolved-file reuse");
  assertEqual(result.requiresVendorStateCheck, false, "source replay does not require vendor state check");
  assertEqual(result.replayMode, "manual_operator_reinvoke_preflight", "source replay is preflight only");
  assertEqual(result.replayAcceptedByHostClaim, false, "source replay does not claim host acceptance");
  assertEqual(result.retryWorkerCreated, false, "source replay creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "source replay creates no retry schedule");
  assertEqual(result.retryLedgerCreated, false, "source replay creates no retry ledger");
  assertEqual(result.durableRetryAuditRecordCreated, false, "source replay creates no durable audit record");
  assertEqual(result.automaticVendorRetryAllowed, false, "source replay permits no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "source replay leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorReplayPreflightAccepted(): Promise<void> {
  section("2. Vendor Work Item Replay Preflight Requires Vendor State Check");
  const { candidate, approval, item } = await vendorRetryFixture();
  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor work item replay preflight is accepted");
  assertEqual(result.retryStage, "vendor_send", "vendor replay stage is preserved");
  assertEqual(result.requiresVendorStateCheck, true, "vendor replay requires vendor state check before reinvoke");
  assertEqual(result.automaticVendorRetryAllowed, false, "vendor replay still permits no automatic vendor retry");
  assertEqual(result.backgroundRetryCreated, false, "vendor replay creates no background retry");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "vendor replay enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "vendor replay enables no public hosting");
  assert(!containsForbiddenTruth(result), "vendor replay leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyFreshApprovalRequired(): Promise<void> {
  section("3. Missing Or Stale Approval Is Rejected Before Replay");
  const { candidate, item } = await sourceRetryFixture();
  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval: { approvedBy: "operator", signature: "channel-media-transfer:slack:stale", approvedAt: "2026-05-08T12:02:00.000Z" },
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval replay preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection is bounded");
  assertEqual(result.requiresFreshApprovalSignature, true, "stale approval rejection still explains fresh approval requirement");
  assertEqual(result.workItemCorrelationMatched, false, "stale approval rejection does not trust work item correlation");
  assertEqual(result.retryWorkerCreated, false, "stale approval rejection creates no retry worker");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw signatures or target/source truth");

  const matchingSignatureStaleTime = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T12:01:00.000Z",
    },
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });
  assertEqual(matchingSignatureStaleTime.accepted, false, "matching signature with stale approvedAt is rejected");
  assertEqual(matchingSignatureStaleTime.reasonCode, "fresh_approval_required", "stale approvedAt rejection is bounded");
  assert(!containsForbiddenTruth(matchingSignatureStaleTime), "stale approvedAt rejection leaks no raw signatures or target/source truth");
}

async function verifyMismatchRejections(): Promise<void> {
  section("4. Tampered Or Mismatched Work Items Fail Closed");
  const { candidate, approval, item } = await sourceRetryFixture();
  const tamperedCorrelation = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval,
    workItem: {
      ...item,
      workItemCorrelationId: "manual-retry-work-item:host-forged",
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });
  assertEqual(tamperedCorrelation.accepted, false, "tampered work item is rejected");
  assertEqual(tamperedCorrelation.reasonCode, "valid_work_item_required", "tampered work item uses bounded rejection reason");
  assertEqual(tamperedCorrelation.retryLedgerCreated, false, "tampered work item cannot create retry ledger truth");
  assert(!containsForbiddenTruth(tamperedCorrelation), "tampered work item rejection redacts forged correlation and ledger claims");

  const extraForgedClaim = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval,
    workItem: {
      ...item,
      retryLedgerUri: "retry-ledger://phase147-forged",
    },
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });
  assertEqual(extraForgedClaim.accepted, false, "work item with extra forged ledger field is rejected");
  assertEqual(extraForgedClaim.reasonCode, "valid_work_item_required", "extra forged ledger field rejection is bounded");
  assert(!containsForbiddenTruth(extraForgedClaim), "extra forged ledger rejection leaks no forged ledger field");

  const extraMalformedSourceRef = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval,
    workItem: {
      ...item,
      sourceRefFingerprints: [
        ...item.sourceRefFingerprints,
        { fileIndex: 999, sourceRefFingerprint: "not-a-digest", sourceRefRevalidationRequired: true },
      ],
    },
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });
  assertEqual(extraMalformedSourceRef.accepted, false, "work item with malformed extra source fingerprint is rejected");
  assertEqual(extraMalformedSourceRef.reasonCode, "valid_work_item_required", "malformed extra source fingerprint rejection is bounded");
  assert(!containsForbiddenTruth(extraMalformedSourceRef), "malformed extra source fingerprint rejection leaks no raw source refs");

  const otherCandidate = safeCandidate({ targetId: "C147PRIVATE_ALT", threadId: "171000.1471" });
  const otherApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2026-05-08T12:03:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(otherCandidate),
  };
  const wrongTarget = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate: otherCandidate,
    approval: otherApproval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:02:59.000Z",
  });
  assertEqual(wrongTarget.accepted, false, "wrong-target replay preflight is rejected");
  assertEqual(wrongTarget.reasonCode, "work_item_current_truth_mismatch", "wrong-target rejection is bounded");
  assertEqual(wrongTarget.targetCorrelationMatched, false, "wrong-target replay detects target mismatch");
  assertEqual(wrongTarget.transferKeyMatched, false, "wrong-target replay detects transfer-key mismatch");
  assert(!containsForbiddenTruth(wrongTarget), "wrong-target rejection leaks no raw target/source/signature truth");

  const otherSourceCandidate = safeCandidate({ fileRefs: fileRefs("phase147_alt", 3) });
  const otherSourceApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2026-05-08T12:04:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(otherSourceCandidate),
  };
  const wrongSource = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate: otherSourceCandidate,
    approval: otherSourceApproval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:03:59.000Z",
  });
  assertEqual(wrongSource.accepted, false, "wrong-source replay preflight is rejected");
  assertEqual(wrongSource.sourceRefFingerprintsMatched, false, "wrong-source replay detects source fingerprint mismatch");
  assert(!containsForbiddenTruth(wrongSource), "wrong-source rejection leaks no raw source refs");
}

async function verifyMalformedOrSuccessRejected(): Promise<void> {
  section("5. Malformed Or Non-Retry Work Items Are Rejected Safely");
  const { candidate, approval } = await approvedCandidate({ fileRefs: fileRefs("phase147_single", 1) });
  const success = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: 1,
    }),
  });
  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemReplay({
    candidate,
    approval,
    workItem: success.data.manualRetryWorkItem,
    freshApprovalRequiredAfter: "2026-05-08T12:01:59.000Z",
  });

  assertEqual(success.isError, false, "successful host handoff remains successful");
  assertEqual(result.accepted, false, "missing success work item is rejected");
  assertEqual(result.reasonCode, "valid_work_item_required", "missing work item rejection is bounded");
  assertEqual(result.retryWorkerCreated, false, "missing work item rejection creates no retry worker");
  assert(!containsForbiddenTruth(result), "missing work item rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 147 Verification (External Media Transfer Manual Retry Work Item Replay Preflight)\n");
  await verifySourceReplayPreflightAccepted();
  await verifyVendorReplayPreflightAccepted();
  await verifyFreshApprovalRequired();
  await verifyMismatchRejections();
  await verifyMalformedOrSuccessRejected();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 147: external media transfer manual retry work item replay preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
