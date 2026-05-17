/** Phase 144 Verification - External Media Transfer Vendor-Send Target Context */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferVendorSendRequest,
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

type TargetAwareVendorRequest = ExternalChannelMediaTransferVendorSendRequest & {
  targetKind?: string;
  targetCorrelationFingerprint?: string;
  targetContextTruth?: string;
  rawTargetIdsPersisted?: boolean;
};

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T144PRIVATE",
    accountId: "A144PRIVATE",
    targetKind: "channel",
    targetId: "C144PRIVATE",
    threadId: "171000.1440",
    enabled: true,
    fileRefs: [{
      sourceRef: "artifact:phase144_report",
      name: "phase-144-report.pdf",
      title: "Phase 144 report",
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
      approvedAt: "2026-05-08T11:11:00.000Z",
      signature,
    },
  };
}

async function executeWithWorker(
  handler: ReturnType<typeof createExternalChannelMediaTransferWorkerHandler>,
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate(overrides);
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler,
  });
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase144_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("T144PRIVATE") ||
    text.includes("A144PRIVATE") ||
    text.includes("C144PRIVATE") ||
    text.includes("C144PRIVATE2") ||
    text.includes("171000.1440") ||
    text.includes("171000.1441") ||
    text.includes("targetCorrelationFingerprint=vendor-forged") ||
    text.includes("targetContextTruth=host-forged") ||
    text.includes("rawTargetIdsPersisted=true") ||
    text.includes("xoxb-phase144-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase144");
}

function assertTargetRequestContext(request: TargetAwareVendorRequest | undefined, label: string): void {
  assert(Boolean(request), `${label}: sender received a request context`);
  if (!request) return;
  assertEqual(request.targetKind, "channel", `${label}: request carries bounded target kind`);
  assert(
    typeof request.targetCorrelationFingerprint === "string" &&
      /^vendor-send-target:[a-f0-9]{64}$/.test(String(request.targetCorrelationFingerprint)),
    `${label}: request carries bounded target correlation fingerprint`,
  );
  assertEqual(request.targetContextTruth, "request_only_from_approval_bound_target_no_raw_target_ids", `${label}: target context truth is request-only`);
  assertEqual(request.rawTargetIdsPersisted, false, `${label}: request states raw target ids are not persisted`);
  assertEqual("targetId" in request, false, `${label}: request does not duplicate raw target id`);
  assertEqual("workspaceId" in request, false, `${label}: request does not duplicate raw workspace id`);
  assertEqual("accountId" in request, false, `${label}: request does not duplicate raw account id`);
  assertEqual("threadId" in request, false, `${label}: request does not duplicate raw thread id`);
}

function assertNoDurableTargetContext(data: Record<string, unknown>, label: string): void {
  assertEqual("targetCorrelationFingerprint" in data, false, `${label}: durable data has no request target fingerprint`);
  assertEqual("targetContextTruth" in data, false, `${label}: durable data has no request target truth`);
  assertEqual("rawTargetIdsPersisted" in data, false, `${label}: durable data has no request raw-target flag`);
}

async function verifySenderReceivesRequestOnlyTargetContext(): Promise<void> {
  section("1. Vendor Sender Receives Request-Only Target Context");
  let observedRequest: TargetAwareVendorRequest | undefined;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action, _files, request) => {
      observedRequest = request as TargetAwareVendorRequest;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, false, "successful send remains successful");
  assertTargetRequestContext(observedRequest, "successful send");
  assertNoDurableTargetContext(result.data, "successful send");
  assertEqual(result.data.liveDeliveryEnabled, false, "success does not enable default live delivery");
  assertEqual(result.data.defaultPublicHostingEnabled, false, "success does not enable public hosting");
  assertEqual(result.data.credentialPersistenceCreated, false, "success does not persist credentials");
  assert(!containsForbiddenDurableTruth(result), "success leaks no raw target ids, refs, credentials, URLs, bytes, or request-only target context");
}

async function verifyRetryFailureRedactsRequestOnlyTargetContext(): Promise<void> {
  section("2. Vendor Retry Failure Redacts Request-Only Target Context");
  let observedRequest: TargetAwareVendorRequest | undefined;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (_action, _files, request) => {
      observedRequest = request as TargetAwareVendorRequest;
      return {
        accepted: false,
        retryable: true,
        reason: [
          "vendor temporarily rejected",
          "targetCorrelationFingerprint=vendor-forged:xoxb-phase144-secret",
          "targetContextTruth=host-forged",
          "rawTargetIdsPersisted=true",
          "targetId=C144PRIVATE",
          "workspaceId:T144PRIVATE",
          "accountId: A144PRIVATE",
          "\"threadId\":\"171000.1440\"",
          "https://files.slack.com/private-download-url?token=xoxb-phase144-secret",
        ].join(" "),
      };
    },
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains failed");
  assertEqual(result.data.manualRetryStage, "vendor_send", "retry remains vendor-send scoped");
  assertTargetRequestContext(observedRequest, "retryable vendor rejection");
  assertNoDurableTargetContext(result.data, "retryable vendor rejection");
  assertEqual(result.data.retryWorkerCreated, false, "retry failure creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "retry failure creates no retry schedule");
  assertEqual(result.data.automaticRetryCreated, false, "retry failure creates no automatic retry");
  assert(!containsForbiddenDurableTruth(result), "retry failure leaks no raw target ids, refs, credentials, URLs, bytes, forged request-only fields, or request target context");
}

async function verifyDifferentTargetChangesRequestFingerprint(): Promise<void> {
  section("3. Different Approved Target Changes Request Fingerprint");
  let firstRequest: TargetAwareVendorRequest | undefined;
  let secondRequest: TargetAwareVendorRequest | undefined;
  await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action, _files, request) => {
      firstRequest = request as TargetAwareVendorRequest;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));
  await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action, _files, request) => {
      secondRequest = request as TargetAwareVendorRequest;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }), {
    targetId: "C144PRIVATE2",
    threadId: "171000.1441",
  });

  assertTargetRequestContext(firstRequest, "first target");
  assertTargetRequestContext(secondRequest, "second target");
  assert(
    firstRequest?.targetCorrelationFingerprint !== secondRequest?.targetCorrelationFingerprint,
    "different approval-bound target derives different request target fingerprint",
  );
}

async function verifySourceFailureDoesNotCreateVendorTargetContext(): Promise<void> {
  section("4. Source Failure Does Not Create Vendor Target Context");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      reason: "source store locked targetCorrelationFingerprint=vendor-forged targetId:C144PRIVATE \"workspaceId\":\"T144PRIVATE\" accountId=A144PRIVATE threadId: 171000.1440",
    }),
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "source retry remains failed");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertEqual(senderCalled, false, "source failure does not call vendor sender");
  assertNoDurableTargetContext(result.data, "source retry");
  assert(!containsForbiddenDurableTruth(result), "source retry leaks no raw target ids, refs, credentials, URLs, bytes, or request target context");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 144 Verification (External Media Transfer Vendor-Send Target Context)\n");
  await verifySenderReceivesRequestOnlyTargetContext();
  await verifyRetryFailureRedactsRequestOnlyTargetContext();
  await verifyDifferentTargetChangesRequestFingerprint();
  await verifySourceFailureDoesNotCreateVendorTargetContext();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 144: external media transfer vendor-send target context is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
