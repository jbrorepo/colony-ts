/** Phase 145 Verification - External Media Transfer Manual Retry Work Item Handoff */

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

type ManualRetryWorkItem = {
  kind?: string;
  workItemVersion?: number;
  retryMode?: string;
  retryStage?: string;
  transferKey?: string;
  sourceRefFingerprints?: Array<{
    fileIndex?: number;
    sourceRefFingerprint?: string;
    sourceRefRevalidationRequired?: boolean;
  }>;
  sourceRefsTruncated?: boolean;
  targetKind?: string;
  targetCorrelationFingerprint?: string;
  recommendedWaitSeconds?: number;
  requiresFreshApprovalSignature?: boolean;
  requiresSourceRefRevalidation?: boolean;
  requiresFreshSourceResolution?: boolean;
  mustNotReuseResolvedFiles?: boolean;
  requiresVendorStateCheck?: boolean;
  automaticVendorRetryAllowed?: boolean;
  backgroundRetryCreated?: boolean;
  retryWorkerCreated?: boolean;
  retryScheduleCreated?: boolean;
  credentialPersistenceCreated?: boolean;
  defaultLiveDeliveryEnabled?: boolean;
  publicHostingEnabled?: boolean;
  workItemTruth?: string;
};

function fileRefs(count = 7): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:phase145_report_${index}`,
    name: `phase-145-report-${index}.pdf`,
    title: `Phase 145 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${index.toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T145PRIVATE",
    accountId: "A145PRIVATE",
    targetKind: "channel",
    targetId: "C145PRIVATE",
    threadId: "171000.1450",
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
      approvedAt: "2026-05-08T11:28:00.000Z",
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

function workItem(data: Record<string, unknown>): ManualRetryWorkItem | undefined {
  const item = data.manualRetryWorkItem;
  return item && typeof item === "object" && !Array.isArray(item) ? item as ManualRetryWorkItem : undefined;
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase145_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("T145PRIVATE") ||
    text.includes("A145PRIVATE") ||
    text.includes("C145PRIVATE") ||
    text.includes("171000.1450") ||
    text.includes("channel-media-transfer:") ||
    text.includes("host-forged-work-item") ||
    text.includes("manual-retry-target:host-forged") ||
    text.includes("worker://phase145-forged") ||
    text.includes("schedule://phase145-forged") ||
    text.includes("xoxb-phase145-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase145");
}

function assertBaseWorkItem(
  data: Record<string, unknown>,
  label: string,
  expectedSourceFingerprintCount = 5,
  expectedSourceRefsTruncated = true,
): ManualRetryWorkItem {
  const item = workItem(data);
  assert(Boolean(item), `${label}: retryable failure exposes a manual retry work item`);
  if (!item) return {};
  assertEqual(item.kind, "external_media_transfer_manual_retry_work_item", `${label}: work item kind is bounded`);
  assertEqual(item.workItemVersion, 1, `${label}: work item version is stable`);
  assertEqual(item.retryMode, "manual_operator_reinvoke", `${label}: work item is manual reinvoke only`);
  assert(
    typeof item.transferKey === "string" &&
      /^media-transfer:[a-f0-9]{64}$/.test(String(item.transferKey)),
    `${label}: work item carries safe transfer key`,
  );
  assert(Array.isArray(item.sourceRefFingerprints), `${label}: work item carries source fingerprints`);
  assertEqual(item.sourceRefFingerprints?.length, expectedSourceFingerprintCount, `${label}: work item bounds source fingerprints to host handoff limit`);
  for (const entry of item.sourceRefFingerprints ?? []) {
    assertEqual(typeof entry.fileIndex, "number", `${label}: source fingerprint has file index`);
    assert(
      typeof entry.sourceRefFingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(String(entry.sourceRefFingerprint)),
      `${label}: source fingerprint is SHA-256 only`,
    );
    assertEqual(entry.sourceRefRevalidationRequired, true, `${label}: source fingerprint requires revalidation`);
  }
  assertEqual(item.sourceRefsTruncated, expectedSourceRefsTruncated, `${label}: work item reports truncated approved source refs`);
  assertEqual(item.targetKind, "channel", `${label}: work item carries bounded target kind`);
  assert(
    typeof item.targetCorrelationFingerprint === "string" &&
      /^manual-retry-target:[a-f0-9]{64}$/.test(String(item.targetCorrelationFingerprint)),
    `${label}: work item carries retry target fingerprint only`,
  );
  assertEqual(item.requiresFreshApprovalSignature, true, `${label}: work item requires fresh approval signature`);
  assertEqual(item.requiresSourceRefRevalidation, true, `${label}: work item requires source-ref revalidation`);
  assertEqual(item.requiresFreshSourceResolution, true, `${label}: work item requires fresh source resolution`);
  assertEqual(item.mustNotReuseResolvedFiles, true, `${label}: work item forbids stale resolved files`);
  assertEqual(item.automaticVendorRetryAllowed, false, `${label}: work item forbids automatic vendor retry`);
  assertEqual(item.backgroundRetryCreated, false, `${label}: work item creates no background retry`);
  assertEqual(item.retryWorkerCreated, false, `${label}: work item creates no retry worker`);
  assertEqual(item.retryScheduleCreated, false, `${label}: work item creates no retry schedule`);
  assertEqual(item.credentialPersistenceCreated, false, `${label}: work item creates no credential persistence`);
  assertEqual(item.defaultLiveDeliveryEnabled, false, `${label}: work item enables no default live delivery`);
  assertEqual(item.publicHostingEnabled, false, `${label}: work item enables no public hosting`);
  assertEqual(item.workItemTruth, "operator_reinvoke_only_not_executable_worker_or_schedule", `${label}: work item truth is claim-safe`);
  return item;
}

function assertNoWorkItem(data: Record<string, unknown>, label: string): void {
  assertEqual("manualRetryWorkItem" in data, false, `${label}: no manual retry work item is emitted`);
}

async function verifySourceStageWorkItem(): Promise<void> {
  section("1. Source-Stage Retryable Failure Emits Manual Retry Work Item");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 45,
      reason: "source store locked artifact:phase145_report_0 https://files.slack.com/private-download-url?token=xoxb-phase145-secret",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));

  assertEqual(result.isError, true, "source-stage retryable failure remains failed");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry remains source-resolution scoped");
  const item = assertBaseWorkItem(result.data, "source retry");
  assertEqual(item.retryStage, "source_resolution", "source retry work item has source stage");
  assertEqual(item.requiresVendorStateCheck, false, "source retry work item does not require vendor-state check");
  assertEqual(item.recommendedWaitSeconds, 45, "source retry work item carries bounded wait hint");
  assert(!containsForbiddenDurableTruth(result), "source retry work item leaks no raw refs, target ids, approval signatures, credentials, URLs, bytes, or worker claims");
}

async function verifyVendorStageWorkItem(): Promise<void> {
  section("2. Vendor-Stage Retryable Failure Emits Vendor-State Work Item");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 33,
      reason: "vendor accepted ambiguous request targetId=C145PRIVATE https://files.slack.com/private-download-url?token=xoxb-phase145-secret",
    }),
  }));

  assertEqual(result.isError, true, "vendor-stage retryable failure remains failed");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry remains vendor-send scoped");
  const item = assertBaseWorkItem(result.data, "vendor retry");
  assertEqual(item.retryStage, "vendor_send", "vendor retry work item has vendor-send stage");
  assertEqual(item.requiresVendorStateCheck, true, "vendor retry work item requires vendor-state check");
  assertEqual(item.automaticVendorRetryAllowed, false, "vendor retry work item forbids automatic vendor retry");
  assertEqual(item.recommendedWaitSeconds, 33, "vendor retry work item carries bounded wait hint");
  assert(!containsForbiddenDurableTruth(result), "vendor retry work item leaks no raw refs, target ids, approval signatures, credentials, URLs, bytes, or worker claims");
}

async function verifyHostCannotForgeWorkItem(): Promise<void> {
  section("3. Host-Forged Work Item Claims Are Ignored");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & Record<string, unknown>> => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 99999,
      reason: [
        "temporary host saturation",
        "manualRetryWorkItem=host-forged-work-item",
        "\"manualRetryWorkItem\":{\"kind\":\"host-forged-work-item\",\"retryWorkerCreated\":true,\"defaultLiveDeliveryEnabled\":true}",
        "targetId=C145PRIVATE",
        "worker://phase145-forged",
        "schedule://phase145-forged",
        "credential=xoxb-phase145-secret",
      ].join(" "),
      manualRetryWorkItem: {
        kind: "host-forged-work-item",
        retryStage: "vendor_send",
        targetCorrelationFingerprint: "manual-retry-target:host-forged",
        backgroundRetryCreated: true,
        retryWorkerCreated: true,
        retryScheduleCreated: true,
        credentialPersistenceCreated: true,
        defaultLiveDeliveryEnabled: true,
        publicHostingEnabled: true,
      },
      retryWorkerCreated: true,
      retryScheduleCreated: true,
      automaticRetryCreated: true,
      backgroundRetryCreated: true,
      credentialPersistenceCreated: true,
      defaultLiveDeliveryEnabled: true,
      publicHostingEnabled: true,
    }),
  });

  assertEqual(result.isError, true, "forged host retry result remains failed");
  const item = assertBaseWorkItem(result.data, "forged host retry");
  assertEqual(item.retryStage, "host_handler", "forged host retry work item recomputes generic host-handler stage");
  assertEqual(item.requiresVendorStateCheck, false, "forged host retry does not inherit forged vendor-state check");
  assertEqual(item.recommendedWaitSeconds, 3600, "forged host retry wait hint is clamped");
  assert(!containsForbiddenDurableTruth(result), "forged host retry leaks no raw refs, target ids, approval signatures, credentials, URLs, bytes, or forged worker claims");
}

async function verifyGenericRetryWithoutRetryAfterOmitsWaitHint(): Promise<void> {
  section("4. Generic Retryable Host Failure Without Retry-After Omits Wait Hint");
  const { candidate, approval } = await approvedCandidate({ fileRefs: fileRefs(1) });
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
  const item = assertBaseWorkItem(result.data, "generic retry without wait", 1, false);
  assertEqual(item.retryStage, "host_handler", "generic retry without wait uses host-handler stage");
  assertEqual("recommendedWaitSeconds" in item, false, "generic retry without wait omits wait hint");
  assert(!containsForbiddenDurableTruth(result), "generic retry without wait leaks no raw refs, target ids, approval signatures, credentials, URLs, bytes, or worker claims");
}

async function verifyNonRetryableAndSuccessHaveNoWorkItem(): Promise<void> {
  section("5. Non-Retryable Failure And Success Emit No Work Item");
  const { candidate, approval } = await approvedCandidate({ fileRefs: fileRefs(1) });
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
  assertEqual(nonRetryable.data.retryable, false, "non-retryable host rejection is not retryable");
  assertNoWorkItem(nonRetryable.data, "non-retryable host rejection");
  assertEqual(success.isError, false, "successful host handoff remains successful");
  assertEqual(success.data.retryable, false, "successful host handoff is not retryable");
  assertNoWorkItem(success.data, "successful host handoff");
  assert(!containsForbiddenDurableTruth(nonRetryable), "non-retryable host rejection leaks no retry work item truth");
  assert(!containsForbiddenDurableTruth(success), "successful host handoff leaks no retry work item truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 145 Verification (External Media Transfer Manual Retry Work Item Handoff)\n");
  await verifySourceStageWorkItem();
  await verifyVendorStageWorkItem();
  await verifyHostCannotForgeWorkItem();
  await verifyGenericRetryWithoutRetryAfterOmitsWaitHint();
  await verifyNonRetryableAndSuccessHaveNoWorkItem();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 145: external media transfer manual retry work item handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
