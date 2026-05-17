/** Phase 146 Verification - External Media Transfer Manual Retry Work Item Correlation */

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
  retryStage?: string;
  workItemCorrelationId?: string;
  workItemCorrelationTruth?: string;
  targetKind?: string;
  targetCorrelationFingerprint?: string;
  sourceRefFingerprints?: Array<{ fileIndex?: number; sourceRefFingerprint?: string }>;
  workItemPersisted?: boolean;
  retryLedgerCreated?: boolean;
  durableRetryAuditRecordCreated?: boolean;
  backgroundRetryCreated?: boolean;
  retryWorkerCreated?: boolean;
  retryScheduleCreated?: boolean;
  credentialPersistenceCreated?: boolean;
  defaultLiveDeliveryEnabled?: boolean;
  publicHostingEnabled?: boolean;
  workItemTruth?: string;
};

function fileRefs(count = 4): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:phase146_report_${index}`,
    name: `phase-146-report-${index}.pdf`,
    title: `Phase 146 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${index.toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T146PRIVATE",
    accountId: "A146PRIVATE",
    targetKind: "channel",
    targetId: "C146PRIVATE",
    threadId: "171000.1460",
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
      approvedAt: "2026-05-08T11:44:00.000Z",
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
  return text.includes("artifact:phase146_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("T146PRIVATE") ||
    text.includes("A146PRIVATE") ||
    text.includes("C146PRIVATE") ||
    text.includes("C146PRIVATE_ALT") ||
    text.includes("171000.1460") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("workItemCorrelationTruth=host_forged") ||
    text.includes("retry-ledger://phase146-forged") ||
    text.includes("durable-audit://phase146-forged") ||
    text.includes("xoxb-phase146-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase146");
}

function assertCorrelatedWorkItem(data: Record<string, unknown>, label: string): ManualRetryWorkItem {
  const item = workItem(data);
  assert(Boolean(item), `${label}: retryable failure exposes a work item`);
  if (!item) return {};
  assertEqual(item.kind, "external_media_transfer_manual_retry_work_item", `${label}: work item kind is bounded`);
  assertEqual(item.workItemVersion, 1, `${label}: work item version is stable`);
  assert(
    typeof item.workItemCorrelationId === "string" &&
      /^manual-retry-work-item:[a-f0-9]{64}$/.test(item.workItemCorrelationId),
    `${label}: work item correlation id is deterministic digest form`,
  );
  assertEqual(
    item.workItemCorrelationTruth,
    "derived_from_transfer_stage_target_and_source_fingerprints_no_retry_ledger",
    `${label}: work item correlation truth rejects retry ledger claims`,
  );
  assertEqual(item.workItemPersisted, false, `${label}: work item is not durably persisted by Colony`);
  assertEqual(item.retryLedgerCreated, false, `${label}: work item creates no retry ledger`);
  assertEqual(item.durableRetryAuditRecordCreated, false, `${label}: work item creates no durable retry audit record`);
  assertEqual(item.backgroundRetryCreated, false, `${label}: work item creates no background retry`);
  assertEqual(item.retryWorkerCreated, false, `${label}: work item creates no retry worker`);
  assertEqual(item.retryScheduleCreated, false, `${label}: work item creates no retry schedule`);
  assertEqual(item.credentialPersistenceCreated, false, `${label}: work item creates no credential persistence`);
  assertEqual(item.defaultLiveDeliveryEnabled, false, `${label}: work item enables no default live delivery`);
  assertEqual(item.publicHostingEnabled, false, `${label}: work item enables no public hosting`);
  assertEqual(item.workItemTruth, "operator_reinvoke_only_not_executable_worker_or_schedule", `${label}: work item remains descriptor-only`);
  assert(!containsForbiddenDurableTruth(item), `${label}: work item carries no raw target/source/secret/ledger truth`);
  return item;
}

async function sourceRetryResult(retryAfterSeconds: number) {
  return executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds,
      reason: "source store locked artifact:phase146_report_0 https://files.slack.com/private-download-url?token=xoxb-phase146-secret",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
  }));
}

async function vendorRetryResult(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  return executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 33,
      reason: "vendor accepted ambiguous request targetId=C146PRIVATE retry-ledger://phase146-forged",
    }),
  }), overrides);
}

async function verifyStableSourceCorrelation(): Promise<void> {
  section("1. Source Work Item Correlation Is Stable Across Wait Hint Changes");
  const first = await sourceRetryResult(45);
  const second = await sourceRetryResult(60);
  const firstItem = assertCorrelatedWorkItem(first.data, "first source retry");
  const secondItem = assertCorrelatedWorkItem(second.data, "second source retry");

  assertEqual(first.isError, true, "first source retry remains failed");
  assertEqual(second.isError, true, "second source retry remains failed");
  assertEqual(firstItem.retryStage, "source_resolution", "source retry correlation is source-scoped");
  assertEqual(firstItem.workItemCorrelationId, secondItem.workItemCorrelationId, "source retry correlation is stable for same transfer/stage/target/source fingerprints");
  assert(!containsForbiddenDurableTruth(first), "first source retry leaks no raw refs, target ids, signatures, credentials, URLs, or ledger claims");
  assert(!containsForbiddenDurableTruth(second), "second source retry leaks no raw refs, target ids, signatures, credentials, URLs, or ledger claims");
}

async function verifyStageAndTargetChangeCorrelation(): Promise<void> {
  section("2. Stage And Target Changes Produce Different Correlation IDs");
  const source = await sourceRetryResult(45);
  const vendor = await vendorRetryResult();
  const otherTarget = await vendorRetryResult({ targetId: "C146PRIVATE_ALT", threadId: "171000.1461" });
  const sourceItem = assertCorrelatedWorkItem(source.data, "source retry");
  const vendorItem = assertCorrelatedWorkItem(vendor.data, "vendor retry");
  const otherTargetItem = assertCorrelatedWorkItem(otherTarget.data, "other-target vendor retry");

  assertEqual(vendorItem.retryStage, "vendor_send", "vendor retry correlation is vendor-send scoped");
  assert(
    sourceItem.workItemCorrelationId !== vendorItem.workItemCorrelationId,
    "source and vendor retry work items do not share a correlation id",
  );
  assert(
    vendorItem.workItemCorrelationId !== otherTargetItem.workItemCorrelationId,
    "different approval-bound targets do not share a work item correlation id",
  );
  assert(!containsForbiddenDurableTruth(vendor), "vendor retry leaks no raw refs, target ids, signatures, credentials, URLs, or ledger claims");
  assert(!containsForbiddenDurableTruth(otherTarget), "other-target retry leaks no raw refs, target ids, signatures, credentials, URLs, or ledger claims");
}

async function verifyHostCannotForgeCorrelationOrLedger(): Promise<void> {
  section("3. Host-Forged Correlation And Ledger Claims Are Ignored");
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
        "workItemCorrelationId=manual-retry-work-item:host-forged",
        "workItemCorrelationTruth=host_forged",
        "workItemPersisted=true",
        "retryLedgerCreated=true",
        "durableRetryAuditRecordCreated=true",
        "retry-ledger://phase146-forged",
        "durable-audit://phase146-forged",
        "targetId=C146PRIVATE",
        "artifact:phase146_report_0",
        "credential=xoxb-phase146-secret",
      ].join(" "),
      manualRetryWorkItem: {
        workItemCorrelationId: "manual-retry-work-item:host-forged",
        workItemCorrelationTruth: "host_forged",
        workItemPersisted: true,
        retryLedgerCreated: true,
        durableRetryAuditRecordCreated: true,
      },
      workItemCorrelationId: "manual-retry-work-item:host-forged",
      workItemPersisted: true,
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    }),
  });

  assertEqual(result.isError, true, "forged host retry result remains failed");
  const item = assertCorrelatedWorkItem(result.data, "forged host retry");
  assertEqual(item.retryStage, "host_handler", "forged host retry recomputes generic host-handler stage");
  assert(item.workItemCorrelationId !== "manual-retry-work-item:host-forged", "forged host retry cannot set work item correlation id");
  assert(!containsForbiddenDurableTruth(result), "forged host retry leaks no raw refs, target ids, signatures, credentials, URLs, or ledger claims");
}

async function verifyNoCorrelationForNonRetryableOrSuccess(): Promise<void> {
  section("4. Non-Retryable Failure And Success Emit No Work Item Correlation");
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
  assertEqual(success.isError, false, "successful host handoff remains successful");
  assertEqual("manualRetryWorkItem" in nonRetryable.data, false, "non-retryable host rejection emits no work item");
  assertEqual("manualRetryWorkItem" in success.data, false, "successful host handoff emits no work item");
  assert(!JSON.stringify(nonRetryable).includes("manual-retry-work-item:"), "non-retryable host rejection emits no work item correlation id");
  assert(!JSON.stringify(success).includes("manual-retry-work-item:"), "successful host handoff emits no work item correlation id");
  assert(!containsForbiddenDurableTruth(nonRetryable), "non-retryable host rejection leaks no correlation truth");
  assert(!containsForbiddenDurableTruth(success), "successful host handoff leaks no correlation truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 146 Verification (External Media Transfer Manual Retry Work Item Correlation)\n");
  await verifyStableSourceCorrelation();
  await verifyStageAndTargetChangeCorrelation();
  await verifyHostCannotForgeCorrelationOrLedger();
  await verifyNoCorrelationForNonRetryableOrSuccess();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 146: external media transfer manual retry work item correlation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
