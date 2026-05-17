/** Phase 154 Verification - External Media Transfer Manual Retry Acknowledged Host Action */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
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

function fileRefs(prefix = "phase154_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-154-report-${index}.pdf`,
    title: `Phase 154 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T154PRIVATE",
    accountId: "A154PRIVATE",
    targetKind: "channel",
    targetId: "C154PRIVATE",
    threadId: "171000.1540",
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
      approvedAt: "2026-05-08T13:50:00.000Z",
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
        reason: "source locked artifact:phase154_report_0 https://files.slack.com/private?token=xoxb-phase154-secret",
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
        reason: "vendor ambiguous targetId=C154PRIVATE retry-ledger://phase154-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

async function checklistTemplateFor(
  candidate: ExternalChannelMediaTransferCandidate,
  approval: ExternalChannelMediaTransferApproval,
  item: ExternalChannelMediaTransferManualRetryWorkItem,
): Promise<{
  checklist: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist;
  template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate;
}> {
  const checklistResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });
  assertEqual(templateResult.accepted, true, "fixture acknowledgement template is accepted");
  assert(Boolean(templateResult.acknowledgementTemplate), "fixture includes acknowledgement template");
  return {
    checklist: checklistResult.sourceRevalidationChecklist as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
    template: templateResult.acknowledgementTemplate as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  };
}

function acknowledgementId(template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate): string {
  return template.acknowledgementTemplateId.replace("manual-retry-source-checklist-ack-template:", "manual-retry-source-checklist-ack:");
}

function acknowledgementFor(
  template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement {
  return {
    acknowledgementKind: "external_media_transfer_manual_retry_source_revalidation_checklist_acknowledgement",
    acknowledgementVersion: 1,
    acknowledgementId: acknowledgementId(template),
    acknowledgementTemplateId: template.acknowledgementTemplateId,
    checklistId: template.checklistId,
    retryStage: template.retryStage,
    workItemCorrelationId: template.workItemCorrelationId,
    transferKey: template.transferKey,
    sourceRefsTruncated: template.sourceRefsTruncated,
    sourceRefFingerprints: template.sourceRefFingerprints,
    acknowledgedStepCount: template.requiredStepCount,
    stepAcknowledgements: template.requiredStepAcknowledgements.map((step) => ({
      stepIndex: step.stepIndex,
      actionCode: step.actionCode,
      ...(step.fileIndex !== undefined ? { fileIndex: step.fileIndex } : {}),
      ...(step.sourceRefFingerprint ? { sourceRefFingerprint: step.sourceRefFingerprint } : {}),
      acknowledged: true,
      hostOwned: true,
      colonyExecuted: false,
      rawSourceRefIncluded: false,
      rawTargetIncluded: false,
      approvalSignatureIncluded: false,
      credentialIncluded: false,
      fileBytesIncluded: false,
      privateUrlIncluded: false,
      persisted: false,
    })),
    allRequiredStepsAcknowledged: true,
    requiresFreshApprovalSignature: true,
    requiresSourceRefRevalidation: true,
    requiresFreshSourceResolution: true,
    mustNotReuseResolvedFiles: true,
    requiresVendorStateCheck: template.requiresVendorStateCheck,
    hostExecutionRequired: true,
    colonyResolvedSources: false,
    colonyFetchedFiles: false,
    colonyDownloadedFiles: false,
    colonyUploadedFiles: false,
    colonyPreviewedFiles: false,
    sourceRevalidationPersisted: false,
    checklistPersisted: false,
    acknowledgementPersisted: false,
    workItemPersisted: false,
    retryLedgerCreated: false,
    durableRetryAuditRecordCreated: false,
    backgroundRetryCreated: false,
    retryWorkerCreated: false,
    retryScheduleCreated: false,
    automaticVendorRetryAllowed: false,
    credentialPersistenceCreated: false,
    defaultLiveDeliveryEnabled: false,
    publicHostingEnabled: false,
    acknowledgementTruth: "host_owned_acknowledgement_only_no_execution_or_persistence",
  };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase154_report") ||
    text.includes("artifact:phase154_alt") ||
    text.includes("T154PRIVATE") ||
    text.includes("A154PRIVATE") ||
    text.includes("C154PRIVATE") ||
    text.includes("C154PRIVATE_ALT") ||
    text.includes("171000.1540") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase154-forged") ||
    text.includes("durable-audit://phase154-forged") ||
    text.includes("xoxb-phase154-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

async function verifySourceAcknowledgedHostActionAccepted(): Promise<void> {
  section("1. Source Acknowledgement Creates Non-Executing Host Action Readiness");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });

  assertEqual(result.accepted, true, "source acknowledged host action is accepted");
  assertEqual(result.acknowledgementPreflight.accepted, true, "source host action requires accepted acknowledgement preflight");
  assert(Boolean(result.acknowledgedHostAction), "source host action returns acknowledgement-bound handoff");
  assertEqual(result.acknowledgedHostAction?.action, "external_media_transfer_manual_retry_reinvoke_acknowledged", "source host action uses acknowledged reinvoke action");
  assertEqual(result.acknowledgedHostAction?.acknowledgementId, acknowledgement.acknowledgementId, "source host action binds acknowledgement id");
  assertEqual(result.acknowledgedHostAction?.acknowledgementTemplateId, template.acknowledgementTemplateId, "source host action binds template id");
  assertEqual(result.acknowledgedHostAction?.checklistId, checklist.checklistId, "source host action binds checklist id");
  assertEqual(result.acknowledgedHostAction?.sourceRevalidationAcknowledgementAccepted, true, "source acknowledgement acceptance is explicit");
  assertEqual(result.acknowledgedHostAction?.colonyExecutedHostHandler, false, "source host action executes no handler");
  assertEqual(result.acknowledgedHostAction?.colonyResolvedSources, false, "source host action resolves no sources");
  assertEqual(result.acknowledgedHostAction?.retryWorkerCreated, false, "source host action creates no retry worker");
  assertEqual(result.acknowledgedHostAction?.retryLedgerCreated, false, "source host action creates no retry ledger");
  assertEqual(result.acknowledgedHostAction?.acknowledgedReplayActionTruth, "credential_free_host_owned_manual_reinvoke_action_after_acknowledgement_preflight_no_execution", "source acknowledged host action truth is explicit");
  assert(!containsForbiddenTruth(result), "source acknowledged host action leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorAcknowledgedHostActionAccepted(): Promise<void> {
  section("2. Vendor Acknowledged Host Action Preserves Vendor-State Gate");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor acknowledged host action is accepted");
  assertEqual(result.acknowledgedHostAction?.requiresVendorStateCheck, true, "vendor acknowledged host action requires vendor-state check");
  assertEqual(result.acknowledgedHostAction?.retryStage, "vendor_send", "vendor acknowledged host action keeps vendor retry stage");
  assertEqual(result.acknowledgedHostAction?.automaticVendorRetryAllowed, false, "vendor acknowledged host action allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor acknowledged host action leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyStaleApprovalBlocksAcknowledgedHostAction(): Promise<void> {
  section("3. Stale Approval Rejects Before Acknowledged Host Action");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T13:48:00.000Z",
    },
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval acknowledged host action is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded preflight reason");
  assertEqual(result.acknowledgementPreflight.accepted, false, "stale approval rejects acknowledgement preflight");
  assert(result.acknowledgedHostAction === undefined, "stale approval returns no acknowledged host action");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyTamperedAcknowledgementBlocksAcknowledgedHostAction(): Promise<void> {
  section("4. Tampered Acknowledgement Rejects Acknowledged Host Action");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: {
      ...acknowledgement,
      acknowledgementId: acknowledgement.acknowledgementId.replace(/.$/, "0"),
    },
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered acknowledgement acknowledged host action is rejected");
  assertEqual(result.reasonCode, "source_revalidation_checklist_acknowledgement_current_truth_mismatch", "tampered acknowledgement rejection is bounded");
  assert(result.acknowledgedHostAction === undefined, "tampered acknowledgement returns no acknowledged host action");
  assert(!containsForbiddenTruth(result), "tampered acknowledgement rejection leaks no raw truth");
}

async function verifyAcknowledgedHostActionIdStabilityAndDivergence(): Promise<void> {
  section("5. Acknowledged Host Action Id Is Stable And Approval-Bound");
  const source = await sourceRetryFixture();
  const sourceTruth = await checklistTemplateFor(source.candidate, source.approval, source.item);
  const sourceAcknowledgement = acknowledgementFor(sourceTruth.template);
  const first = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate: source.candidate,
    approval: source.approval,
    workItem: source.item,
    sourceRevalidationChecklist: sourceTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: sourceAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });
  const second = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate: source.candidate,
    approval: source.approval,
    workItem: source.item,
    sourceRevalidationChecklist: sourceTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: sourceAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });
  const alt = await sourceRetryFixture({ targetId: "C154PRIVATE_ALT" });
  const altTruth = await checklistTemplateFor(alt.candidate, alt.approval, alt.item);
  const altResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate: alt.candidate,
    approval: alt.approval,
    workItem: alt.item,
    sourceRevalidationChecklist: altTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgementFor(altTruth.template),
    freshApprovalRequiredAfter: "2026-05-08T13:49:59.000Z",
  });

  assertEqual(first.accepted, true, "first stable-id fixture is accepted");
  assertEqual(second.accepted, true, "second stable-id fixture is accepted");
  assertEqual(altResult.accepted, true, "alternate-target fixture is accepted");
  assertEqual(first.acknowledgedHostAction?.acknowledgedReplayActionId, second.acknowledgedHostAction?.acknowledgedReplayActionId, "same truth produces same acknowledged host action id");
  assert(first.acknowledgedHostAction?.acknowledgedReplayActionId !== altResult.acknowledgedHostAction?.acknowledgedReplayActionId, "different approval-bound target changes acknowledged host action id");
  assert(!containsForbiddenTruth([first, second, altResult]), "stable-id handoffs leak no raw target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 154 Verification (External Media Transfer Manual Retry Acknowledged Host Action)\n");
  await verifySourceAcknowledgedHostActionAccepted();
  await verifyVendorAcknowledgedHostActionAccepted();
  await verifyStaleApprovalBlocksAcknowledgedHostAction();
  await verifyTamperedAcknowledgementBlocksAcknowledgedHostAction();
  await verifyAcknowledgedHostActionIdStabilityAndDivergence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 154: external media transfer manual retry acknowledged host action is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
