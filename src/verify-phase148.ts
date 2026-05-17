/** Phase 148 Verification - External Media Transfer Manual Retry Replay Host Action */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplayHostAction,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplayHostAction,
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

function fileRefs(prefix = "phase148_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-148-report-${index}.pdf`,
    title: `Phase 148 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T148PRIVATE",
    accountId: "A148PRIVATE",
    targetKind: "channel",
    targetId: "C148PRIVATE",
    threadId: "171000.1480",
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
      approvedAt: "2026-05-08T12:24:00.000Z",
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
        retryAfterSeconds: 19,
        reason: "source locked artifact:phase148_report_0 https://files.slack.com/private?token=xoxb-phase148-secret",
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
        retryAfterSeconds: 27,
        reason: "vendor ambiguous targetId=C148PRIVATE retry-ledger://phase148-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase148_report") ||
    text.includes("artifact:phase148_alt") ||
    text.includes("T148PRIVATE") ||
    text.includes("A148PRIVATE") ||
    text.includes("C148PRIVATE") ||
    text.includes("C148PRIVATE_ALT") ||
    text.includes("171000.1480") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase148-forged") ||
    text.includes("durable-audit://phase148-forged") ||
    text.includes("xoxb-phase148-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

function assertHostActionSafe(
  action: ExternalChannelMediaTransferManualRetryReplayHostAction | undefined,
  expectedStage: "source_resolution" | "vendor_send",
): asserts action is ExternalChannelMediaTransferManualRetryReplayHostAction {
  assert(Boolean(action), "accepted replay includes a host action");
  if (!action) return;
  assertEqual(action.action, "external_media_transfer_manual_retry_reinvoke", "host action names manual retry reinvoke");
  assertEqual(action.replayMode, "manual_operator_reinvoke_preflight", "host action is produced from preflight mode");
  assertEqual(action.replayActionVersion, 1, "host action version is bounded");
  assertEqual(action.retryStage, expectedStage, "host action carries expected retry stage");
  assertEqual(action.requiresFreshApprovalSignature, true, "host action requires fresh approval signature");
  assertEqual(action.requiresSourceRefRevalidation, true, "host action requires source ref revalidation");
  assertEqual(action.requiresFreshSourceResolution, true, "host action requires fresh source resolution");
  assertEqual(action.mustNotReuseResolvedFiles, true, "host action forbids stale resolved-file reuse");
  assertEqual(action.requiresVendorStateCheck, expectedStage === "vendor_send", "host action vendor-state requirement follows stage");
  assertEqual(action.replayAcceptedByHostClaim, false, "host action does not claim host execution acceptance");
  assertEqual(action.hostExecutionRequired, true, "host action leaves execution to host/operator");
  assertEqual(action.colonyExecutedHostHandler, false, "host action executes no host handler");
  assertEqual(action.workItemPersisted, false, "host action persists no work item");
  assertEqual(action.retryLedgerCreated, false, "host action creates no retry ledger");
  assertEqual(action.durableRetryAuditRecordCreated, false, "host action creates no durable audit record");
  assertEqual(action.backgroundRetryCreated, false, "host action creates no background retry");
  assertEqual(action.retryWorkerCreated, false, "host action creates no retry worker");
  assertEqual(action.retryScheduleCreated, false, "host action creates no retry schedule");
  assertEqual(action.automaticVendorRetryAllowed, false, "host action permits no automatic vendor retry");
  assertEqual(action.credentialPersistenceCreated, false, "host action creates no credential persistence");
  assertEqual(action.defaultLiveDeliveryEnabled, false, "host action enables no default live delivery");
  assertEqual(action.publicHostingEnabled, false, "host action enables no public hosting");
  assertEqual(action.replayActionTruth, "credential_free_host_owned_manual_reinvoke_action_no_execution", "host action truth is explicit");
  assert(Array.isArray(action.sourceRefFingerprints) && action.sourceRefFingerprints.length > 0, "host action carries bounded source fingerprints");
  assert(action.sourceRefFingerprints.every((entry) => entry.sourceRefRevalidationRequired === true), "host action source fingerprints require revalidation");
  assert(!("files" in action), "host action carries no raw files");
  assert(!("targetId" in action), "host action carries no raw target id");
  assert(!("workspaceId" in action), "host action carries no raw workspace id");
  assert(!("accountId" in action), "host action carries no raw account id");
  assert(!("threadId" in action), "host action carries no raw thread id");
  assert(!("approval" in action), "host action carries no approval object");
  assert(!("approvalSignature" in action), "host action carries no approval signature");
}

async function verifySourceReplayHostActionAccepted(): Promise<void> {
  section("1. Source Replay Host Action Is Credential-Free And Manual Only");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplayHostAction({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "source_resolution",
    freshApprovalRequiredAfter: "2026-05-08T12:23:59.000Z",
  });

  assertEqual(result.accepted, true, "source replay host action is accepted");
  assertEqual(result.preflight.accepted, true, "source replay host action includes accepted preflight");
  assertHostActionSafe(result.hostAction, "source_resolution");
  assertEqual(result.hostAction.workItemCorrelationId, item.workItemCorrelationId, "source host action carries supplied correlation id");
  assertEqual(result.hostAction.expectedWorkItemCorrelationId, item.workItemCorrelationId, "source host action carries recomputed expected correlation id");
  assertEqual(result.hostAction.transferKey, item.transferKey, "source host action carries current transfer key");
  assertEqual(result.hostAction.targetCorrelationFingerprint, item.targetCorrelationFingerprint, "source host action carries target fingerprint only");
  assert(!containsForbiddenTruth(result), "source host action leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorReplayHostActionAccepted(): Promise<void> {
  section("2. Vendor Replay Host Action Requires Vendor State Check Without Automatic Retry");
  const { candidate, approval, item } = await vendorRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplayHostAction({
    candidate,
    approval,
    workItem: item,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T12:23:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor replay host action is accepted");
  assertHostActionSafe(result.hostAction, "vendor_send");
  assertEqual(result.hostAction.requiresVendorStateCheck, true, "vendor host action requires operator vendor-state check");
  assertEqual(result.hostAction.automaticVendorRetryAllowed, false, "vendor host action still allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor host action leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyRejectedReplayCreatesNoHostAction(): Promise<void> {
  section("3. Rejected Replay Produces No Host Action");
  const { candidate, item } = await sourceRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplayHostAction({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T12:22:00.000Z",
    },
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:23:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval replay host action is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection is bounded");
  assertEqual(result.preflight.accepted, false, "stale approval preflight is rejected");
  assert(result.hostAction === undefined, "stale approval creates no host action");
  assertEqual(result.preflight.retryWorkerCreated, false, "stale approval creates no retry worker");
  assertEqual(result.preflight.retryLedgerCreated, false, "stale approval creates no retry ledger");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw signatures or target/source truth");
}

async function verifyTamperedReplayCreatesNoHostAction(): Promise<void> {
  section("4. Tampered Work Item Produces No Host Action");
  const { candidate, approval, item } = await sourceRetryFixture();
  const result = await createExternalChannelMediaTransferManualRetryReplayHostAction({
    candidate,
    approval,
    workItem: {
      ...item,
      workItemCorrelationId: "manual-retry-work-item:host-forged",
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T12:23:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered work item replay host action is rejected");
  assertEqual(result.reasonCode, "valid_work_item_required", "tampered work item rejection is bounded");
  assert(result.hostAction === undefined, "tampered work item creates no host action");
  assertEqual(result.preflight.retryLedgerCreated, false, "tampered work item cannot create retry ledger truth");
  assert(!containsForbiddenTruth(result), "tampered work item rejection redacts forged correlation and ledger claims");
}

async function verifyCurrentTruthMismatchCreatesNoHostAction(): Promise<void> {
  section("5. Current Truth Mismatch Produces No Host Action");
  const { item } = await sourceRetryFixture();
  const otherCandidate = safeCandidate({ targetId: "C148PRIVATE_ALT", threadId: "171000.1481" });
  const otherApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2026-05-08T12:25:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(otherCandidate),
  };
  const result = await createExternalChannelMediaTransferManualRetryReplayHostAction({
    candidate: otherCandidate,
    approval: otherApproval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T12:24:59.000Z",
  });

  assertEqual(result.accepted, false, "wrong-target replay host action is rejected");
  assertEqual(result.reasonCode, "work_item_current_truth_mismatch", "wrong-target rejection is bounded");
  assertEqual(result.preflight.targetCorrelationMatched, false, "wrong-target replay detects target mismatch");
  assert(result.hostAction === undefined, "wrong-target replay creates no host action");
  assert(!containsForbiddenTruth(result), "wrong-target rejection leaks no raw target/source/signature truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 148 Verification (External Media Transfer Manual Retry Replay Host Action)\n");
  await verifySourceReplayHostActionAccepted();
  await verifyVendorReplayHostActionAccepted();
  await verifyRejectedReplayCreatesNoHostAction();
  await verifyTamperedReplayCreatesNoHostAction();
  await verifyCurrentTruthMismatchCreatesNoHostAction();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 148: external media transfer manual retry replay host action is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
