/** Phase 151 Verification - External Media Transfer Manual Retry Source Revalidation Checklist Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
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

function fileRefs(prefix = "phase151_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-151-report-${index}.pdf`,
    title: `Phase 151 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T151PRIVATE",
    accountId: "A151PRIVATE",
    targetKind: "channel",
    targetId: "C151PRIVATE",
    threadId: "171000.1510",
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
      approvedAt: "2026-05-08T13:08:00.000Z",
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
        reason: "source locked artifact:phase151_report_0 https://files.slack.com/private?token=xoxb-phase151-secret",
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
        reason: "vendor ambiguous targetId=C151PRIVATE retry-ledger://phase151-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

async function checklistFor(
  candidate: ExternalChannelMediaTransferCandidate,
  approval: ExternalChannelMediaTransferApproval,
  item: ExternalChannelMediaTransferManualRetryWorkItem,
): Promise<ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist> {
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T13:07:59.000Z",
  });
  assertEqual(result.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(result.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  return result.sourceRevalidationChecklist as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist;
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase151_report") ||
    text.includes("artifact:phase151_alt") ||
    text.includes("T151PRIVATE") ||
    text.includes("A151PRIVATE") ||
    text.includes("C151PRIVATE") ||
    text.includes("C151PRIVATE_ALT") ||
    text.includes("171000.1510") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase151-forged") ||
    text.includes("durable-audit://phase151-forged") ||
    text.includes("xoxb-phase151-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

async function verifySourceChecklistPreflightAccepted(): Promise<void> {
  section("1. Source Checklist Preflight Accepts Fresh Recomputed Truth");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    expectedRetryStage: "source_resolution",
    freshApprovalRequiredAfter: "2026-05-08T13:07:59.000Z",
  });

  assertEqual(result.accepted, true, "source checklist preflight is accepted");
  assertEqual(result.preflight.accepted, true, "source checklist preflight includes accepted work-item preflight");
  assertEqual(result.checklistIdMatched, true, "source checklist id matches current truth");
  assertEqual(result.retryStageMatched, true, "source checklist stage matches current truth");
  assertEqual(result.transferKeyMatched, true, "source checklist transfer key matches current truth");
  assertEqual(result.workItemCorrelationMatched, true, "source checklist work-item correlation matches current truth");
  assertEqual(result.sourceRefFingerprintsMatched, true, "source checklist fingerprints match current truth");
  assertEqual(result.checklistStepOrderMatched, true, "source checklist step order matches current truth");
  assertEqual(result.requiresVendorStateCheck, false, "source checklist does not require vendor-state verification");
  assertEqual(result.checklistPreflightTruth, "recomputed_from_current_replay_truth_and_supplied_checklist_no_execution", "source checklist preflight truth is explicit");
  assertEqual(result.colonyExecutedHostHandler, false, "source checklist preflight executes no host handler");
  assertEqual(result.checklistPersisted, false, "source checklist preflight persists no checklist");
  assertEqual(result.retryWorkerCreated, false, "source checklist preflight creates no retry worker");
  assertEqual(result.retryLedgerCreated, false, "source checklist preflight creates no retry ledger");
  assertEqual(result.automaticVendorRetryAllowed, false, "source checklist preflight allows no automatic vendor retry");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "source checklist preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "source checklist preflight enables no public hosting");
  assert(Boolean(result.sourceRevalidationChecklist), "accepted source preflight returns the current expected checklist");
  assert(!containsForbiddenTruth(result), "source checklist preflight leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorChecklistPreflightAccepted(): Promise<void> {
  section("2. Vendor Checklist Preflight Requires Vendor State Truth");
  const { candidate, approval, item } = await vendorRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T13:07:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor checklist preflight is accepted");
  assertEqual(result.requiresVendorStateCheck, true, "vendor checklist preflight preserves vendor-state requirement");
  assertEqual(result.sourceRevalidationChecklist?.requiresVendorStateCheck, true, "returned vendor checklist requires vendor-state check");
  assertEqual(result.retryStageMatched, true, "vendor checklist retry stage matches current truth");
  assertEqual(result.checklistStepOrderMatched, true, "vendor checklist step order matches current truth");
  assert(!containsForbiddenTruth(result), "vendor checklist preflight leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyMalformedChecklistRejected(): Promise<void> {
  section("3. Malformed Checklist Claims Are Rejected Before Replay");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: {
      ...checklist,
      retryWorkerCreated: true,
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T13:07:59.000Z",
  });

  assertEqual(result.accepted, false, "malformed checklist preflight is rejected");
  assertEqual(result.reasonCode, "valid_source_revalidation_checklist_required", "malformed checklist rejection is bounded");
  assertEqual(result.checklistIdMatched, false, "malformed checklist id is not trusted");
  assert(result.sourceRevalidationChecklist === undefined, "malformed checklist rejection returns no checklist");
  assertEqual(result.retryWorkerCreated, false, "malformed checklist cannot claim a retry worker");
  assertEqual(result.retryLedgerCreated, false, "malformed checklist cannot claim a retry ledger");
  assertEqual(result.durableRetryAuditRecordCreated, false, "malformed checklist cannot claim durable audit");
  assert(!containsForbiddenTruth(result), "malformed checklist rejection leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyCurrentChecklistMismatchRejected(): Promise<void> {
  section("4. Current Checklist Truth Mismatch Is Rejected");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const tampered = {
    ...checklist,
    sourceRefFingerprints: [
      { ...checklist.sourceRefFingerprints[0], sourceRefFingerprint: "f".repeat(64) },
      ...checklist.sourceRefFingerprints.slice(1),
    ],
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: tampered,
    freshApprovalRequiredAfter: "2026-05-08T13:07:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered checklist preflight is rejected");
  assertEqual(result.reasonCode, "source_revalidation_checklist_current_truth_mismatch", "tampered checklist rejection is bounded");
  assertEqual(result.checklistIdMatched, true, "tampered checklist id comparison is explicit");
  assertEqual(result.sourceRefFingerprintsMatched, false, "tampered checklist source fingerprints mismatch");
  assertEqual(result.checklistStepOrderMatched, true, "unchanged checklist steps still match");
  assert(result.sourceRevalidationChecklist === undefined, "tampered checklist rejection returns no checklist");
  assert(!containsForbiddenTruth(result), "tampered checklist rejection leaks no raw source or target truth");
}

async function verifyStaleApprovalRejectedBeforeChecklistTrust(): Promise<void> {
  section("5. Stale Approval Rejects Checklist Preflight Before Checklist Trust");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T13:06:00.000Z",
    },
    workItem: item,
    sourceRevalidationChecklist: checklist,
    freshApprovalRequiredAfter: "2026-05-08T13:07:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval checklist preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection reuses bounded preflight reason");
  assertEqual(result.preflight.accepted, false, "stale approval rejects work-item preflight");
  assertEqual(result.checklistIdMatched, false, "stale approval does not trust supplied checklist id");
  assert(result.hostAction === undefined, "stale approval creates no host action");
  assert(result.sourceRevalidationPlan === undefined, "stale approval creates no source revalidation plan");
  assert(result.sourceRevalidationChecklist === undefined, "stale approval returns no checklist");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw signatures or target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 151 Verification (External Media Transfer Manual Retry Source Revalidation Checklist Preflight)\n");
  await verifySourceChecklistPreflightAccepted();
  await verifyVendorChecklistPreflightAccepted();
  await verifyMalformedChecklistRejected();
  await verifyCurrentChecklistMismatchRejected();
  await verifyStaleApprovalRejectedBeforeChecklistTrust();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 151: external media transfer manual retry source revalidation checklist preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
