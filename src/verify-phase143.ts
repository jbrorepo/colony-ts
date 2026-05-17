/** Phase 143 Verification - External Media Transfer Manual Retry Target Correlation Handoff */

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
    workspaceId: "T143PRIVATE",
    accountId: "A143PRIVATE",
    targetKind: "channel",
    targetId: "C143PRIVATE",
    threadId: "171000.1430",
    enabled: true,
    fileRefs: [{
      sourceRef: "artifact:phase143_report",
      name: "phase-143-report.pdf",
      title: "Phase 143 report",
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
      approvedAt: "2026-05-08T10:58:00.000Z",
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
  return text.includes("artifact:phase143_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("T143PRIVATE") ||
    text.includes("A143PRIVATE") ||
    text.includes("C143PRIVATE") ||
    text.includes("C143PRIVATE2") ||
    text.includes("171000.1430") ||
    text.includes("171000.1431") ||
    text.includes("manual-retry-target:host-forged-target") ||
    text.includes("host-forged-target-correlation") ||
    text.includes("xoxb-phase143-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase143");
}

function assertTargetCorrelationBase(data: Record<string, unknown>, label: string): void {
  assertEqual(data.manualRetryTargetKind, "channel", `${label}: retry carries bounded target kind`);
  assert(
    typeof data.manualRetryTargetCorrelationFingerprint === "string" &&
      /^manual-retry-target:[a-f0-9]{64}$/.test(String(data.manualRetryTargetCorrelationFingerprint)),
    `${label}: retry carries bounded target correlation fingerprint`,
  );
  assertEqual(data.manualRetryTargetCorrelationTruth, "fingerprint_only_from_approval_bound_target_no_raw_target_ids", `${label}: target correlation truth is claim-safe`);
  assertEqual(data.manualRetryRawTargetIdsPersisted, false, `${label}: raw target ids are not persisted`);
  assertEqual(data.manualRetryHostTargetClaimsAccepted, false, `${label}: host target claims are not accepted`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
  assertEqual(data.automaticRetryCreated, false, `${label}: no automatic retry is created`);
  assertEqual(data.liveDeliveryEnabled, false, `${label}: default live delivery is not enabled`);
  assertEqual(data.defaultPublicHostingEnabled, false, `${label}: public hosting is not enabled`);
  assertEqual(data.credentialPersistenceCreated, false, `${label}: credential persistence is not created`);
}

function assertNoTargetCorrelation(data: Record<string, unknown>, label: string): void {
  assertEqual("manualRetryTargetKind" in data, false, `${label}: no retry target kind claim`);
  assertEqual("manualRetryTargetCorrelationFingerprint" in data, false, `${label}: no retry target correlation fingerprint`);
  assertEqual("manualRetryTargetCorrelationTruth" in data, false, `${label}: no retry target correlation truth`);
  assertEqual("manualRetryRawTargetIdsPersisted" in data, false, `${label}: no raw-target persistence claim`);
}

async function verifySourceRetryCarriesTargetCorrelation(): Promise<void> {
  section("1. Source Retry Carries Target Correlation Handoff");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase143-secret",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));

  assertEqual(result.isError, true, "retryable source rejection remains failed");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertTargetCorrelationBase(result.data, "source rejection");
  assert(!containsForbiddenDurableTruth(result), "source retry leaks no raw target ids, refs, credentials, URLs, bytes, or forged target claims");
}

async function verifyVendorRetryCarriesSameTargetCorrelation(): Promise<void> {
  section("2. Vendor Retry Carries Same Target Correlation Handoff");
  const sourceResult = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      reason: "temporary media store lock",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));
  const vendorResult = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => ({
      accepted: false,
      retryable: true,
      reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase143-secret",
    }),
  }));

  assertEqual(vendorResult.isError, true, "retryable vendor rejection remains failed");
  assertEqual(vendorResult.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertTargetCorrelationBase(vendorResult.data, "vendor rejection");
  assertEqual(
    vendorResult.data.manualRetryTargetCorrelationFingerprint,
    sourceResult.data.manualRetryTargetCorrelationFingerprint,
    "same approval-bound target derives same retry target fingerprint across retry stages",
  );
  assert(!containsForbiddenDurableTruth(vendorResult), "vendor retry leaks no raw target ids, refs, credentials, URLs, bytes, or forged target claims");
}

async function verifyHostCannotForgeTargetCorrelation(): Promise<void> {
  section("3. Host Cannot Forge Target Correlation Handoff");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & Record<string, unknown>> => ({
      accepted: false,
      retryable: true,
      reason: "temporary host queue saturation",
      manualRetryTargetKind: "direct",
      manualRetryTargetCorrelationFingerprint: "manual-retry-target:host-forged-target:xoxb-phase143-secret",
      manualRetryTargetCorrelationTruth: "host-forged-target-correlation",
      manualRetryRawTargetIdsPersisted: true,
      rawTargetId: "C143PRIVATE",
      retryWorkerCreated: true,
      retryScheduleCreated: true,
      automaticRetryCreated: true,
    }),
  });

  assertEqual(result.isError, true, "forged host retry result remains failed");
  assertTargetCorrelationBase(result.data, "forged host rejection");
  assert(!containsForbiddenDurableTruth(result), "forged host retry leaks no raw target ids, forged target claim, refs, credentials, URLs, or bytes");
}

async function verifyDifferentTargetChangesFingerprint(): Promise<void> {
  section("4. Different Approved Target Changes Target Fingerprint");
  const first = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({ accepted: false, retryable: true }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));
  const second = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({ accepted: false, retryable: true }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }), {
    targetId: "C143PRIVATE2",
    threadId: "171000.1431",
  });

  assertTargetCorrelationBase(first.data, "first target");
  assertTargetCorrelationBase(second.data, "second target");
  assert(
    first.data.manualRetryTargetCorrelationFingerprint !== second.data.manualRetryTargetCorrelationFingerprint,
    "different approval-bound target derives different retry target fingerprint",
  );
  assert(!containsForbiddenDurableTruth(first), "first target retry leaks no raw target truth");
  assert(!containsForbiddenDurableTruth(second), "second target retry leaks no raw target truth");
}

async function verifyNonRetryableAndSuccessCarryNoTargetCorrelation(): Promise<void> {
  section("5. Non-Retryable Failure And Success Carry No Target Correlation");
  const { candidate, approval } = await approvedCandidate();
  const nonRetryable = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: false,
      reason: "permanent host policy denial",
    }),
  });
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

  assertEqual(nonRetryable.isError, true, "non-retryable host rejection remains failed");
  assertEqual(nonRetryable.data.retryable, false, "non-retryable host rejection stays non-retryable");
  assertNoTargetCorrelation(nonRetryable.data, "non-retryable host rejection");
  assertEqual(success.isError, false, "successful host handoff remains successful");
  assertEqual(success.data.retryable, false, "successful host handoff is not retryable");
  assertNoTargetCorrelation(success.data, "successful host handoff");
  assert(!containsForbiddenDurableTruth(nonRetryable), "non-retryable host rejection leaks no raw target ids, refs, credentials, URLs, or bytes");
  assert(!containsForbiddenDurableTruth(success), "successful host handoff leaks no raw target ids, refs, credentials, URLs, or bytes");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 143 Verification (External Media Transfer Manual Retry Target Correlation Handoff)\n");
  await verifySourceRetryCarriesTargetCorrelation();
  await verifyVendorRetryCarriesSameTargetCorrelation();
  await verifyHostCannotForgeTargetCorrelation();
  await verifyDifferentTargetChangesFingerprint();
  await verifyNonRetryableAndSuccessCarryNoTargetCorrelation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 143: external media transfer manual retry target correlation handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
