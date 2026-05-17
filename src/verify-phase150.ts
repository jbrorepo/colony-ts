/** Phase 150 Verification - External Media Transfer Manual Retry Source Revalidation Checklist */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
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

function fileRefs(prefix = "phase150_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-150-report-${index}.pdf`,
    title: `Phase 150 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T150PRIVATE",
    accountId: "A150PRIVATE",
    targetKind: "channel",
    targetId: "C150PRIVATE",
    threadId: "171000.1500",
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
      approvedAt: "2026-05-08T12:55:00.000Z",
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
        reason: "source locked artifact:phase150_report_0 https://files.slack.com/private?token=xoxb-phase150-secret",
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
        reason: "vendor ambiguous targetId=C150PRIVATE retry-ledger://phase150-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase150_report") ||
    text.includes("artifact:phase150_alt") ||
    text.includes("T150PRIVATE") ||
    text.includes("A150PRIVATE") ||
    text.includes("C150PRIVATE") ||
    text.includes("C150PRIVATE_ALT") ||
    text.includes("171000.1500") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase150-forged") ||
    text.includes("durable-audit://phase150-forged") ||
    text.includes("xoxb-phase150-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

function assertChecklistSafe(
  checklist: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist | undefined,
  expectedStage: "source_resolution" | "vendor_send",
): asserts checklist is ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist {
  assert(Boolean(checklist), "accepted replay includes a source revalidation checklist");
  if (!checklist) return;
  assertEqual(checklist.checklistKind, "external_media_transfer_manual_retry_source_revalidation_checklist", "checklist kind is explicit");
  assertEqual(checklist.checklistVersion, 1, "checklist version is bounded");
  assert(/^manual-retry-source-checklist:[a-f0-9]{64}$/.test(checklist.checklistId), "checklist id is deterministic and domain separated");
  assertEqual(checklist.retryStage, expectedStage, "checklist carries expected retry stage");
  assertEqual(checklist.requiresFreshApprovalSignature, true, "checklist requires fresh approval signature");
  assertEqual(checklist.requiresSourceRefRevalidation, true, "checklist requires source ref revalidation");
  assertEqual(checklist.requiresFreshSourceResolution, true, "checklist requires fresh source resolution");
  assertEqual(checklist.mustNotReuseResolvedFiles, true, "checklist forbids stale resolved-file reuse");
  assertEqual(checklist.requiresVendorStateCheck, expectedStage === "vendor_send", "checklist vendor-state requirement follows stage");
  assertEqual(checklist.hostExecutionRequired, true, "checklist leaves execution to host/operator");
  assertEqual(checklist.colonyResolvedSources, false, "checklist resolves no sources");
  assertEqual(checklist.colonyFetchedFiles, false, "checklist fetches no files");
  assertEqual(checklist.colonyDownloadedFiles, false, "checklist downloads no files");
  assertEqual(checklist.colonyUploadedFiles, false, "checklist uploads no files");
  assertEqual(checklist.colonyPreviewedFiles, false, "checklist previews no files");
  assertEqual(checklist.sourceRevalidationPersisted, false, "checklist persists no source revalidation");
  assertEqual(checklist.checklistPersisted, false, "checklist is not persisted");
  assertEqual(checklist.workItemPersisted, false, "checklist persists no work item");
  assertEqual(checklist.retryLedgerCreated, false, "checklist creates no retry ledger");
  assertEqual(checklist.durableRetryAuditRecordCreated, false, "checklist creates no durable audit record");
  assertEqual(checklist.backgroundRetryCreated, false, "checklist creates no background retry");
  assertEqual(checklist.retryWorkerCreated, false, "checklist creates no retry worker");
  assertEqual(checklist.retryScheduleCreated, false, "checklist creates no retry schedule");
  assertEqual(checklist.automaticVendorRetryAllowed, false, "checklist permits no automatic vendor retry");
  assertEqual(checklist.credentialPersistenceCreated, false, "checklist creates no credential persistence");
  assertEqual(checklist.defaultLiveDeliveryEnabled, false, "checklist enables no default live delivery");
  assertEqual(checklist.publicHostingEnabled, false, "checklist enables no public hosting");
  assertEqual(checklist.checklistTruth, "operator_checklist_only_no_resolution_or_delivery", "checklist truth is explicit");
  assert(Array.isArray(checklist.sourceRefFingerprints) && checklist.sourceRefFingerprints.length > 0, "checklist carries bounded source fingerprints");
  assert(checklist.steps.length >= checklist.sourceRefFingerprints.length + 2, "checklist includes approval, per-source, and final reinvoke steps");
  assertEqual(checklist.steps[0]?.actionCode, "verify_fresh_approval_signature", "checklist starts with fresh approval verification");
  if (expectedStage === "vendor_send") {
    assertEqual(checklist.steps[1]?.actionCode, "verify_vendor_state_before_reinvoke", "vendor checklist checks vendor state before source resolution");
  } else {
    assert(!checklist.steps.some((step) => step.actionCode === "verify_vendor_state_before_reinvoke"), "source checklist omits vendor state step");
  }
  assertEqual(checklist.steps[checklist.steps.length - 1]?.actionCode, "run_host_owned_manual_reinvoke", "checklist ends with host-owned manual reinvoke");
  for (const [index, step] of checklist.steps.entries()) {
    assertEqual(step.stepIndex, index + 1, `step ${index} has one-based stable ordering`);
    assertEqual(step.required, true, `step ${index} is required`);
    assertEqual(step.hostOwned, true, `step ${index} is host-owned`);
    assertEqual(step.colonyExecuted, false, `step ${index} is not Colony-executed`);
    assertEqual(step.rawSourceRefIncluded, false, `step ${index} includes no raw source ref`);
    assertEqual(step.rawTargetIncluded, false, `step ${index} includes no raw target`);
    assertEqual(step.approvalSignatureIncluded, false, `step ${index} includes no approval signature`);
    assertEqual(step.credentialIncluded, false, `step ${index} includes no credential`);
    assertEqual(step.fileBytesIncluded, false, `step ${index} includes no file bytes`);
    assertEqual(step.privateUrlIncluded, false, `step ${index} includes no private URL`);
    assertEqual(step.persisted, false, `step ${index} is not persisted`);
  }
  for (const source of checklist.sourceRefFingerprints) {
    assert(
      checklist.steps.some((step) =>
        step.actionCode === "resolve_source_from_approved_ref" &&
        step.fileIndex === source.fileIndex &&
        step.sourceRefFingerprint === source.sourceRefFingerprint
      ),
      `checklist resolves source fingerprint ${source.fileIndex}`,
    );
    assert(
      checklist.steps.some((step) =>
        step.actionCode === "verify_no_stale_resolved_file_reuse" &&
        step.fileIndex === source.fileIndex &&
        step.sourceRefFingerprint === source.sourceRefFingerprint
      ),
      `checklist verifies stale-file boundary ${source.fileIndex}`,
    );
  }
  assert(!("files" in checklist), "checklist carries no raw files");
  assert(!("targetId" in checklist), "checklist carries no raw target id");
  assert(!("workspaceId" in checklist), "checklist carries no raw workspace id");
  assert(!("accountId" in checklist), "checklist carries no raw account id");
  assert(!("threadId" in checklist), "checklist carries no raw thread id");
  assert(!("approval" in checklist), "checklist carries no approval object");
  assert(!("approvalSignature" in checklist), "checklist carries no approval signature");
}

async function verifySourceChecklistAccepted(): Promise<void> {
  section("1. Source Replay Source Revalidation Checklist Is Fingerprint-Only And Manual");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "source_resolution",
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });

  assertEqual(result.accepted, true, "source replay checklist is accepted");
  assertEqual(result.preflight.accepted, true, "checklist result includes accepted preflight");
  assert(Boolean(result.hostAction), "checklist result includes host action context");
  assert(Boolean(result.sourceRevalidationPlan), "checklist result includes source revalidation plan context");
  assertChecklistSafe(result.sourceRevalidationChecklist, "source_resolution");
  assertEqual(result.sourceRevalidationChecklist.workItemCorrelationId, item.workItemCorrelationId, "source checklist carries supplied correlation id");
  assertEqual(result.sourceRevalidationChecklist.transferKey, item.transferKey, "source checklist carries current transfer key");
  assert(!containsForbiddenTruth(result), "source checklist leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorChecklistAccepted(): Promise<void> {
  section("2. Vendor Replay Checklist Requires Vendor State Before Source Resolution");
  const { candidate, approval, item } = await vendorRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor replay checklist is accepted");
  assertChecklistSafe(result.sourceRevalidationChecklist, "vendor_send");
  assertEqual(result.sourceRevalidationChecklist.requiresVendorStateCheck, true, "vendor checklist requires vendor-state check");
  assertEqual(result.sourceRevalidationChecklist.automaticVendorRetryAllowed, false, "vendor checklist still allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor checklist leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyChecklistIdDeterminismAndDivergence(): Promise<void> {
  section("3. Checklist Id Is Stable For Same Replay And Changes With Current Truth");
  const { candidate, approval, item } = await sourceRetryFixture();
  const first = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });
  const second = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });
  assertEqual(first.accepted, true, "first same replay checklist is accepted");
  assertEqual(second.accepted, true, "second same replay checklist is accepted");
  assertEqual(first.sourceRevalidationChecklist?.checklistId, second.sourceRevalidationChecklist?.checklistId, "same replay checklist id is stable");

  const alternate = await vendorRetryFixture();
  const alternateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate: alternate.candidate,
    approval: alternate.approval,
    workItem: alternate.item,
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });
  assertEqual(alternateResult.accepted, true, "alternate replay checklist is accepted");
  assert(first.sourceRevalidationChecklist?.checklistId !== alternateResult.sourceRevalidationChecklist?.checklistId, "different replay truth changes checklist id");
}

async function verifyRejectedReplayCreatesNoChecklist(): Promise<void> {
  section("4. Rejected Replay Produces No Source Revalidation Checklist");
  const { candidate, item } = await sourceRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T12:53:00.000Z",
    },
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval checklist is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection is bounded");
  assertEqual(result.preflight.accepted, false, "stale approval preflight is rejected");
  assert(result.hostAction === undefined, "stale approval creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "stale approval creates no source revalidation plan");
  assert(result.sourceRevalidationChecklist === undefined, "stale approval creates no source revalidation checklist");
  assertEqual(result.preflight.retryWorkerCreated, false, "stale approval creates no retry worker");
  assertEqual(result.preflight.retryLedgerCreated, false, "stale approval creates no retry ledger");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw signatures or target/source truth");
}

async function verifyTamperedReplayCreatesNoChecklist(): Promise<void> {
  section("5. Tampered Work Item Produces No Source Revalidation Checklist");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: {
      ...item,
      workItemCorrelationId: "manual-retry-work-item:host-forged",
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered work item checklist is rejected");
  assertEqual(result.reasonCode, "valid_work_item_required", "tampered work item rejection is bounded");
  assert(result.hostAction === undefined, "tampered work item creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "tampered work item creates no source revalidation plan");
  assert(result.sourceRevalidationChecklist === undefined, "tampered work item creates no source revalidation checklist");
  assertEqual(result.preflight.retryLedgerCreated, false, "tampered work item cannot create retry ledger truth");
  assert(!containsForbiddenTruth(result), "tampered work item rejection redacts forged correlation and ledger claims");
}

async function verifyCurrentTruthMismatchCreatesNoChecklist(): Promise<void> {
  section("6. Current Truth Mismatch Produces No Source Revalidation Checklist");
  const { item } = await sourceRetryFixture();
  const changedSourceCandidate = safeCandidate({ fileRefs: fileRefs("phase150_alt") });
  const changedSourceApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2026-05-08T12:56:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(changedSourceCandidate),
  };
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate: changedSourceCandidate,
    approval: changedSourceApproval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:54:59.000Z",
  });

  assertEqual(result.accepted, false, "changed-source checklist is rejected");
  assertEqual(result.reasonCode, "work_item_current_truth_mismatch", "changed-source rejection is bounded");
  assertEqual(result.preflight.sourceRefFingerprintsMatched, false, "changed-source replay detects source fingerprint mismatch");
  assert(result.hostAction === undefined, "changed-source replay creates no host action context");
  assert(result.sourceRevalidationPlan === undefined, "changed-source replay creates no source revalidation plan");
  assert(result.sourceRevalidationChecklist === undefined, "changed-source replay creates no source revalidation checklist");
  assert(!containsForbiddenTruth(result), "changed-source rejection leaks no raw target/source/signature truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 150 Verification (External Media Transfer Manual Retry Source Revalidation Checklist)\n");
  await verifySourceChecklistAccepted();
  await verifyVendorChecklistAccepted();
  await verifyChecklistIdDeterminismAndDivergence();
  await verifyRejectedReplayCreatesNoChecklist();
  await verifyTamperedReplayCreatesNoChecklist();
  await verifyCurrentTruthMismatchCreatesNoChecklist();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 150: external media transfer manual retry source revalidation checklist is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
