/** Phase 142 Verification - External Media Transfer Manual Retry Approval Replay Guard */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHandlerResult,
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

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T142",
    targetKind: "channel",
    targetId: "C142",
    threadId: "171000.1420",
    enabled: true,
    fileRefs: [{
      sourceRef: "artifact:phase142_report",
      name: "phase-142-report.pdf",
      title: "Phase 142 report",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      checksumSha256: "f".repeat(64),
    }],
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
      approvedAt: "2026-05-08T10:43:00.000Z",
      signature,
    },
  };
}

async function executeWithWorker(
  handler: ReturnType<typeof createExternalChannelMediaTransferWorkerHandler>,
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate();
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler,
  });
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase142_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("channel-media-transfer:") ||
    text.includes("host-forged-approval-signature") ||
    text.includes("previous approval reusable") ||
    text.includes("xoxb-phase142-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase142");
}

function assertApprovalReplayGuardBase(data: Record<string, unknown>, label: string): void {
  assertEqual(data.manualRetryRequiresFreshApprovalCheck, true, `${label}: retry requires fresh approval check`);
  assertEqual(data.manualRetryFreshApprovalSignatureRequired, true, `${label}: retry requires fresh approval signature`);
  assertEqual(data.manualRetryPreviousApprovalSignatureReusable, false, `${label}: previous approval signature is not reusable`);
  assertEqual(data.manualRetryPreviousApprovalSignaturePersisted, false, `${label}: previous approval signature is not persisted for retry`);
  assertEqual(data.manualRetryApprovalReplayTruth, "previous_approval_signature_not_persisted_or_reusable_fresh_operator_signature_required", `${label}: approval replay truth is claim-safe`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
  assertEqual(data.automaticRetryCreated, false, `${label}: no automatic retry is created`);
}

function assertNoApprovalReplayGuard(data: Record<string, unknown>, label: string): void {
  assertEqual("manualRetryFreshApprovalSignatureRequired" in data, false, `${label}: no fresh approval signature retry claim`);
  assertEqual("manualRetryPreviousApprovalSignatureReusable" in data, false, `${label}: no previous approval reuse claim`);
  assertEqual("manualRetryPreviousApprovalSignaturePersisted" in data, false, `${label}: no previous approval persistence claim`);
  assertEqual("manualRetryApprovalReplayTruth" in data, false, `${label}: no approval replay truth on non-retry path`);
}

async function verifySourceRetryRequiresFreshApprovalSignature(): Promise<void> {
  section("1. Source Retry Requires Fresh Approval Signature");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 9,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase142-secret",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));

  assertEqual(result.isError, true, "retryable source rejection remains failed");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertApprovalReplayGuardBase(result.data, "source rejection");
  assert(!containsForbiddenDurableTruth(result), "source retry leaks no approval signature, raw refs, credentials, URLs, bytes, or forged approval claims");
}

async function verifyVendorRetryRequiresFreshApprovalSignature(): Promise<void> {
  section("2. Vendor Retry Requires Fresh Approval Signature");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => ({
      accepted: false,
      retryable: true,
      reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase142-secret",
    }),
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains failed");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertApprovalReplayGuardBase(result.data, "vendor rejection");
  assert(!containsForbiddenDurableTruth(result), "vendor retry leaks no approval signature, raw refs, credentials, URLs, bytes, or forged approval claims");
}

async function verifyHostCannotForgeApprovalReplayGuard(): Promise<void> {
  section("3. Host Cannot Forge Approval Replay Guard");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & Record<string, unknown>> => ({
      accepted: false,
      retryable: true,
      reason: "temporary host queue saturation",
      manualRetryFreshApprovalSignatureRequired: false,
      manualRetryPreviousApprovalSignatureReusable: true,
      manualRetryPreviousApprovalSignaturePersisted: true,
      manualRetryApprovalReplayTruth: "previous approval reusable host-forged-approval-signature:xoxb-phase142-secret",
      previousApprovalSignature: "channel-media-transfer:slack:host-forged-approval-signature",
      retryWorkerCreated: true,
      retryScheduleCreated: true,
      automaticRetryCreated: true,
    }),
  });

  assertEqual(result.isError, true, "forged host retry result remains failed");
  assertApprovalReplayGuardBase(result.data, "forged host rejection");
  assert(!containsForbiddenDurableTruth(result), "forged host retry leaks no reusable approval claim, signature, raw refs, credentials, URLs, bytes, or forged authorization truth");
}

async function verifyNonRetryableFailureCarriesNoApprovalReplayGuard(): Promise<void> {
  section("4. Non-Retryable Failure Carries No Approval Replay Guard");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: false,
      reason: "permanent host policy denial",
    }),
  });

  assertEqual(result.isError, true, "non-retryable host rejection remains failed");
  assertEqual(result.data.retryable, false, "non-retryable host rejection stays non-retryable");
  assertNoApprovalReplayGuard(result.data, "non-retryable host rejection");
  assert(!containsForbiddenDurableTruth(result), "non-retryable host rejection leaks no approval signature, raw refs, credentials, URLs, or bytes");
}

async function verifySuccessCarriesNoApprovalReplayGuard(): Promise<void> {
  section("5. Success Carries No Approval Replay Guard");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: 1,
    }),
  });

  assertEqual(result.isError, false, "successful host handoff remains successful");
  assertEqual(result.data.retryable, false, "successful host handoff is not retryable");
  assertNoApprovalReplayGuard(result.data, "successful host handoff");
  assert(!containsForbiddenDurableTruth(result), "successful host handoff leaks no approval signature, raw refs, credentials, URLs, or bytes");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 142 Verification (External Media Transfer Manual Retry Approval Replay Guard)\n");
  await verifySourceRetryRequiresFreshApprovalSignature();
  await verifyVendorRetryRequiresFreshApprovalSignature();
  await verifyHostCannotForgeApprovalReplayGuard();
  await verifyNonRetryableFailureCarriesNoApprovalReplayGuard();
  await verifySuccessCarriesNoApprovalReplayGuard();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 142: external media transfer manual retry approval replay guard is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
