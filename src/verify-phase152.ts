/** Phase 152 Verification - External Media Transfer Manual Retry Source Revalidation Checklist Acknowledgement Template */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferWorkerHandler,
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

function fileRefs(prefix = "phase152_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-152-report-${index}.pdf`,
    title: `Phase 152 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T152PRIVATE",
    accountId: "A152PRIVATE",
    targetKind: "channel",
    targetId: "C152PRIVATE",
    threadId: "171000.1520",
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
      approvedAt: "2026-05-08T13:24:00.000Z",
      signature,
    },
  };
}

function workItem(data: Record<string, unknown>): ExternalChannelMediaTransferManualRetryWorkItem {
  const item = data.manualRetryWorkItem;
  assert(Boolean(item) && typeof item === "object" && !Array.isArray(item), "retryable failure exposes manual retry work item");
  return item as ExternalChannelMediaTransferManualRetryWorkItem;
}

async function sourceRetryFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { candidate, approval } = await approvedCandidate(overrides);
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      sourceResolveMaxAttempts: 1,
      resolveSourceRef: async () => ({
        accepted: false,
        retryable: true,
        retryAfterSeconds: 17,
        reason: "source locked artifact:phase152_report_0 https://files.slack.com/private?token=xoxb-phase152-secret",
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
        retryAfterSeconds: 29,
        reason: "vendor ambiguous targetId=C152PRIVATE retry-ledger://phase152-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });
  assertEqual(result.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(result.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  return result.sourceRevalidationChecklist as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist;
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase152_report") ||
    text.includes("artifact:phase152_alt") ||
    text.includes("T152PRIVATE") ||
    text.includes("A152PRIVATE") ||
    text.includes("C152PRIVATE") ||
    text.includes("C152PRIVATE_ALT") ||
    text.includes("171000.1520") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase152-forged") ||
    text.includes("durable-audit://phase152-forged") ||
    text.includes("xoxb-phase152-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

async function verifySourceAcknowledgementTemplateAccepted(): Promise<void> {
  section("1. Source Checklist Acknowledgement Template Accepts Fresh Checklist Truth");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    expectedRetryStage: "source_resolution",
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });

  assertEqual(result.accepted, true, "source acknowledgement template is accepted");
  assertEqual(result.checklistPreflight.accepted, true, "source acknowledgement template includes accepted checklist preflight");
  assert(Boolean(result.acknowledgementTemplate), "source acknowledgement template is returned");
  assertEqual(result.acknowledgementTemplate?.acknowledgementTemplateKind, "external_media_transfer_manual_retry_source_revalidation_checklist_acknowledgement_template", "source acknowledgement template kind is explicit");
  assertEqual(result.acknowledgementTemplate?.retryStage, "source_resolution", "source acknowledgement template preserves retry stage");
  assertEqual(result.acknowledgementTemplate?.requiresVendorStateCheck, false, "source acknowledgement template does not require vendor-state check");
  assertEqual(result.acknowledgementTemplate?.requiredStepCount, checklist.steps.length, "source acknowledgement template has one acknowledgement per checklist step");
  assertEqual(result.acknowledgementTemplate?.requiredStepAcknowledgements.length, checklist.steps.length, "source acknowledgement step list matches checklist length");
  assertEqual(result.acknowledgementTemplate?.requiredStepAcknowledgements[0]?.actionCode, "verify_fresh_approval_signature", "source acknowledgement first step acknowledges approval check");
  assertEqual(result.acknowledgementTemplate?.acknowledgementPersisted, false, "source acknowledgement template persists no acknowledgement");
  assertEqual(result.acknowledgementTemplate?.checklistPersisted, false, "source acknowledgement template persists no checklist");
  assertEqual(result.acknowledgementTemplate?.retryWorkerCreated, false, "source acknowledgement template creates no retry worker");
  assertEqual(result.acknowledgementTemplate?.retryLedgerCreated, false, "source acknowledgement template creates no retry ledger");
  assertEqual(result.acknowledgementTemplate?.automaticVendorRetryAllowed, false, "source acknowledgement template allows no automatic vendor retry");
  assertEqual(result.acknowledgementTemplate?.acknowledgementTemplateTruth, "host_owned_required_acknowledgement_template_no_execution_or_persistence", "source acknowledgement template truth is explicit");
  assert(!containsForbiddenTruth(result), "source acknowledgement template leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorAcknowledgementTemplateAccepted(): Promise<void> {
  section("2. Vendor Checklist Acknowledgement Template Requires Vendor State Acknowledgement");
  const { candidate, approval, item } = await vendorRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });

  const vendorAck = result.acknowledgementTemplate?.requiredStepAcknowledgements.find((step) => step.actionCode === "verify_vendor_state_before_reinvoke");
  assertEqual(result.accepted, true, "vendor acknowledgement template is accepted");
  assertEqual(result.acknowledgementTemplate?.requiresVendorStateCheck, true, "vendor acknowledgement template preserves vendor-state requirement");
  assert(Boolean(vendorAck), "vendor acknowledgement template includes vendor-state acknowledgement step");
  assertEqual(vendorAck?.acknowledgementRequired, true, "vendor-state acknowledgement is required");
  assertEqual(vendorAck?.hostOwned, true, "vendor-state acknowledgement remains host-owned");
  assertEqual(vendorAck?.colonyExecuted, false, "vendor-state acknowledgement executes no Colony host handler");
  assert(!containsForbiddenTruth(result), "vendor acknowledgement template leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyTemplateIdStabilityAndDivergence(): Promise<void> {
  section("3. Acknowledgement Template Id Is Stable And Approval-Bound");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const first = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });
  const second = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });
  const { candidate: altWithTarget, approval: altApproval, item: altItem } = await sourceRetryFixture({
    targetId: "C152PRIVATE_ALT",
  });
  const altSignature = await createExternalChannelMediaTransferApprovalSignature(altWithTarget);
  const altChecklist = await checklistFor(altWithTarget, { ...altApproval, signature: altSignature }, altItem);
  const divergent = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate: altWithTarget,
    approval: { ...altApproval, signature: altSignature },
    workItem: altItem,
    sourceRevalidationChecklist: altChecklist,
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });

  assertEqual(first.accepted, true, "first acknowledgement template is accepted");
  assertEqual(second.accepted, true, "second acknowledgement template is accepted");
  assertEqual(first.acknowledgementTemplate?.acknowledgementTemplateId, second.acknowledgementTemplate?.acknowledgementTemplateId, "same approval-bound truth yields stable acknowledgement template id");
  assert(first.acknowledgementTemplate?.acknowledgementTemplateId !== divergent.acknowledgementTemplate?.acknowledgementTemplateId, "different approval-bound target yields different acknowledgement template id");
  assert(!containsForbiddenTruth(first), "stable template result leaks no raw truth");
  assert(!containsForbiddenTruth(divergent), "divergent template result leaks no raw truth");
}

async function verifyMalformedChecklistRejected(): Promise<void> {
  section("4. Malformed Checklist Claims Reject Acknowledgement Template");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: {
      ...checklist,
      retryWorkerCreated: true,
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });

  assertEqual(result.accepted, false, "malformed checklist acknowledgement template is rejected");
  assertEqual(result.reasonCode, "valid_source_revalidation_checklist_required", "malformed checklist acknowledgement rejection is bounded");
  assertEqual(result.checklistPreflight.accepted, false, "malformed checklist rejects checklist preflight");
  assert(result.acknowledgementTemplate === undefined, "malformed checklist produces no acknowledgement template");
  assert(!containsForbiddenTruth(result), "malformed acknowledgement rejection leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");

  const missingTruncationChecklist = { ...checklist } as Record<string, unknown>;
  delete missingTruncationChecklist.sourceRefsTruncated;
  const missingTruncationResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: missingTruncationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });

  assertEqual(missingTruncationResult.accepted, false, "missing truncation checklist acknowledgement template is rejected");
  assertEqual(missingTruncationResult.reasonCode, "valid_source_revalidation_checklist_required", "missing truncation checklist rejection is bounded");
  assertEqual(missingTruncationResult.checklistPreflight.accepted, false, "missing truncation checklist rejects checklist preflight");
  assert(missingTruncationResult.acknowledgementTemplate === undefined, "missing truncation checklist produces no acknowledgement template");
  assert(!containsForbiddenTruth(missingTruncationResult), "missing truncation checklist rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeTemplate(): Promise<void> {
  section("5. Stale Approval Rejects Acknowledgement Template Before Checklist Trust");
  const { candidate, approval, item } = await sourceRetryFixture();
  const checklist = await checklistFor(candidate, approval, item);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T13:22:00.000Z",
    },
    workItem: item,
    sourceRevalidationChecklist: checklist,
    freshApprovalRequiredAfter: "2026-05-08T13:23:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval acknowledgement template is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval acknowledgement rejection reuses bounded preflight reason");
  assertEqual(result.checklistPreflight.accepted, false, "stale approval rejects checklist preflight");
  assert(result.hostAction === undefined, "stale approval creates no host action");
  assert(result.sourceRevalidationPlan === undefined, "stale approval creates no source revalidation plan");
  assert(result.sourceRevalidationChecklist === undefined, "stale approval returns no checklist");
  assert(result.acknowledgementTemplate === undefined, "stale approval produces no acknowledgement template");
  assert(!containsForbiddenTruth(result), "stale approval acknowledgement rejection leaks no raw signatures or target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 152 Verification (External Media Transfer Manual Retry Source Revalidation Checklist Acknowledgement Template)\n");
  await verifySourceAcknowledgementTemplateAccepted();
  await verifyVendorAcknowledgementTemplateAccepted();
  await verifyTemplateIdStabilityAndDivergence();
  await verifyMalformedChecklistRejected();
  await verifyStaleApprovalRejectedBeforeTemplate();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 152: external media transfer manual retry source revalidation checklist acknowledgement template is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
