/** Phase 141 Verification - External Media Transfer Manual Retry Backoff Correlation Handoff */

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
    workspaceId: "T141",
    targetKind: "channel",
    targetId: "C141",
    threadId: "171000.1410",
    enabled: true,
    fileRefs: [{
      sourceRef: "artifact:phase141_report",
      name: "phase-141-report.pdf",
      title: "Phase 141 report",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      checksumSha256: "e".repeat(64),
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
      approvedAt: "2026-05-08T10:31:00.000Z",
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
  return text.includes("artifact:phase141_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("manual_retry_backoff_request_context") ||
    text.includes("retryPolicy") ||
    text.includes("attemptNumber") ||
    text.includes("xoxb-phase141-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase141") ||
    text.includes("host-forged-transfer-key") ||
    text.includes("host-forged-backoff-correlation-id");
}

function assertBackoffCorrelationBase(data: Record<string, unknown>, wait: number | "none", label: string): void {
  assert(typeof data.manualRetryTransferKey === "string" && /^media-transfer:[a-f0-9]{64}$/.test(String(data.manualRetryTransferKey)), `${label}: retry carries bounded transfer key for correlation handoff`);
  assertEqual(data.manualRetryBackoffCorrelationTruth, "transfer_key_and_bounded_retry_after_only_no_timer_schedule_or_durable_audit_record", `${label}: retry backoff correlation truth is bounded`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
  assertEqual(data.retryBackoffTimerCreated, false, `${label}: no retry backoff timer is created`);
  assertEqual(data.retryBackoffScheduleCreated, false, `${label}: no retry backoff schedule is created`);
  assertEqual(data.retryBackoffPersistenceCreated, false, `${label}: no retry backoff persistence is created`);
  assertEqual(data.automaticRetryCreated, false, `${label}: no automatic retry is created`);
  const expectedCorrelationId = `manual-retry-backoff:${String(data.manualRetryTransferKey).slice("media-transfer:".length)}:${wait}`;
  assertEqual(data.manualRetryBackoffCorrelationId, expectedCorrelationId, `${label}: retry backoff correlation id is deterministic`);
}

async function verifySourceRetryAfterCarriesCorrelationHandoff(): Promise<void> {
  section("1. Source Retry-After Carries Backoff Correlation Handoff");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 23,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase141-secret",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));

  assertEqual(result.isError, true, "retryable source rejection remains failed");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertEqual(result.data.manualRetryRecommendedWaitSeconds, 23, "source retry keeps bounded recommended wait");
  assertBackoffCorrelationBase(result.data, 23, "source rejection");
  assert(!containsForbiddenDurableTruth(result), "source retry leaks no request context, refs, credentials, URLs, bytes, host-forged correlation ids, or signatures");
}

async function verifyVendorRetryAfterCarriesClampedCorrelationHandoff(): Promise<void> {
  section("2. Vendor Retry-After Carries Clamped Backoff Correlation Handoff");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 999999,
      reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase141-secret",
    }),
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains failed");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertEqual(result.data.manualRetryRecommendedWaitSeconds, 3600, "vendor retry keeps clamped recommended wait");
  assertBackoffCorrelationBase(result.data, 3600, "vendor rejection");
  assert(!containsForbiddenDurableTruth(result), "vendor retry leaks no request context, refs, credentials, URLs, bytes, host-forged correlation ids, or signatures");
}

async function verifyGenericRetryableFailureCarriesNoWaitCorrelationClaim(): Promise<void> {
  section("3. Generic Retryable Failure Carries No Wait-Time Correlation Claim");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: true,
      reason: "temporary host queue saturation",
    }),
  });

  assertEqual(result.isError, true, "generic retryable host rejection remains failed");
  assertEqual(result.data.retryAfterSeconds, undefined, "generic retryable host rejection carries no retry-after claim");
  assertEqual(result.data.manualRetryRecommendedWaitSeconds, undefined, "generic retryable host rejection carries no recommended wait claim");
  assertBackoffCorrelationBase(result.data, "none", "generic host rejection");
  assert(!containsForbiddenDurableTruth(result), "generic host retry leaks no request context, refs, credentials, URLs, bytes, host-forged correlation ids, or signatures");
}

async function verifyHostCannotForgeBackoffCorrelationHandoff(): Promise<void> {
  section("4. Host Cannot Forge Backoff Correlation Handoff");
  const { candidate, approval } = await approvedCandidate();
  let hostActionTransferKey = "";
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action): Promise<ExternalChannelMediaTransferHandlerResult & Record<string, unknown>> => {
      hostActionTransferKey = action.transferKey;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 11,
        reason: "temporary host queue saturation",
        manualRetryTransferKey: "media-transfer:host-forged-transfer-key",
        manualRetryBackoffCorrelationId: "host-forged-backoff-correlation-id:xoxb-phase141-secret",
        manualRetryBackoffCorrelationTruth: "host_claimed_timer_created",
        retryWorkerCreated: true,
        retryScheduleCreated: true,
        retryBackoffTimerCreated: true,
        retryBackoffScheduleCreated: true,
        retryBackoffPersistenceCreated: true,
        automaticRetryCreated: true,
      };
    },
  });

  assertEqual(result.isError, true, "forged host retry result remains failed");
  assertEqual(result.data.retryAfterSeconds, 11, "forged host retry keeps bounded retry-after");
  assertEqual(result.data.manualRetryTransferKey, hostActionTransferKey, "forged host retry uses Colony action transfer key");
  assertBackoffCorrelationBase(result.data, 11, "forged host rejection");
  assert(!containsForbiddenDurableTruth(result), "forged host retry leaks no forged correlation id, timer claim, raw refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 141 Verification (External Media Transfer Manual Retry Backoff Correlation Handoff)\n");
  await verifySourceRetryAfterCarriesCorrelationHandoff();
  await verifyVendorRetryAfterCarriesClampedCorrelationHandoff();
  await verifyGenericRetryableFailureCarriesNoWaitCorrelationClaim();
  await verifyHostCannotForgeBackoffCorrelationHandoff();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 141: external media transfer manual retry backoff correlation handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
