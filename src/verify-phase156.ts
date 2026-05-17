/** Phase 156 Verification - External Media Transfer Manual Retry Source-Revalidated Host Action */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult,
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

function fileRefs(prefix = "phase156_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-156-report-${index}.pdf`,
    title: `Phase 156 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T156PRIVATE",
    accountId: "A156PRIVATE",
    targetKind: "channel",
    targetId: "C156PRIVATE",
    threadId: "171000.1560",
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
      approvedAt: "2026-05-08T14:25:00.000Z",
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
        reason: "source locked artifact:phase156_report_0 https://files.slack.com/private?token=xoxb-phase156-secret",
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
        reason: "vendor ambiguous targetId=C156PRIVATE retry-ledger://phase156-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });
  assertEqual(templateResult.accepted, true, "fixture acknowledgement template is accepted");
  assert(Boolean(templateResult.acknowledgementTemplate), "fixture includes acknowledgement template");
  return {
    checklist: checklistResult.sourceRevalidationChecklist as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
    template: templateResult.acknowledgementTemplate as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  };
}

function acknowledgementFor(
  template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement {
  return {
    acknowledgementKind: "external_media_transfer_manual_retry_source_revalidation_checklist_acknowledgement",
    acknowledgementVersion: 1,
    acknowledgementId: template.acknowledgementTemplateId.replace("manual-retry-source-checklist-ack-template:", "manual-retry-source-checklist-ack:"),
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

async function currentTruth(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { candidate, approval, item } = await sourceRetryFixture(overrides);
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture acknowledged host action is accepted");
  assert(Boolean(actionResult.acknowledgedHostAction), "fixture includes acknowledged host action");
  return { candidate, approval, item, checklist, acknowledgement, acknowledgedHostAction: actionResult.acknowledgedHostAction! };
}

function sourceRevalidationResultFor(
  truth: Awaited<ReturnType<typeof currentTruth>>,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult {
  const acknowledgedHostAction = truth.acknowledgedHostAction;
  return {
    resultKind: "external_media_transfer_manual_retry_source_revalidation_result",
    resultVersion: 1,
    resultId: acknowledgedHostAction.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedHostAction.acknowledgedReplayActionId,
    acknowledgementId: acknowledgedHostAction.acknowledgementId,
    acknowledgementTemplateId: acknowledgedHostAction.acknowledgementTemplateId,
    checklistId: acknowledgedHostAction.checklistId,
    retryStage: acknowledgedHostAction.retryStage,
    workItemCorrelationId: acknowledgedHostAction.workItemCorrelationId,
    transferKey: acknowledgedHostAction.transferKey,
    sourceRefsTruncated: acknowledgedHostAction.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedHostAction.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedHostAction.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedHostAction.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true,
      staleResolvedFileReused: false,
      hostOwned: true,
      colonyResolvedSource: false,
      rawSourceRefIncluded: false,
      resolvedFileHandleIncluded: false,
      fileBytesIncluded: false,
      privateUrlIncluded: false,
      credentialIncluded: false,
      persisted: false,
    })),
    allRequiredSourcesRevalidated: true,
    requiresFreshApprovalSignature: true,
    requiresSourceRefRevalidation: true,
    requiresFreshSourceResolution: true,
    mustNotReuseResolvedFiles: true,
    requiresVendorStateCheck: acknowledgedHostAction.requiresVendorStateCheck,
    hostExecutionRequired: true,
    sourceRevalidationAcknowledgementAccepted: true,
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
    sourceRevalidationResultTruth: "host_reported_fingerprint_only_source_revalidation_result_no_resolution_or_persistence",
  };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase156_report") ||
    text.includes("artifact:phase156_alt") ||
    text.includes("T156PRIVATE") ||
    text.includes("A156PRIVATE") ||
    text.includes("C156PRIVATE") ||
    text.includes("C156PRIVATE_ALT") ||
    text.includes("171000.1560") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase156-forged") ||
    text.includes("durable-audit://phase156-forged") ||
    text.includes("xoxb-phase156-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("file:///tmp/phase156");
}

async function completedActionForSource(): Promise<ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction> {
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(result.accepted, true, "source completed host action is accepted");
  assert(Boolean(result.completedHostAction), "source completed host action is returned");
  return result.completedHostAction!;
}

async function verifySourceCompletedHostActionAccepted(): Promise<void> {
  section("1. Source Revalidated Host Action Requires Result Preflight");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(result.accepted, true, "source revalidated host action is accepted");
  assertEqual(result.sourceRevalidationResultPreflight.accepted, true, "source action requires accepted result preflight");
  assert(Boolean(result.completedHostAction), "source action returns result-bound handoff");
  assertEqual(result.completedHostAction?.action, "external_media_transfer_manual_retry_reinvoke_after_source_revalidation", "source action uses source-revalidated reinvoke action");
  assertEqual(result.completedHostAction?.sourceRevalidationResultId, sourceRevalidationResult.resultId, "source action binds result id");
  assertEqual(result.completedHostAction?.sourceRevalidationResultAccepted, true, "source action records accepted result truth");
  assertEqual(result.completedHostAction?.colonyExecutedHostHandler, false, "source action executes no handler");
  assertEqual(result.completedHostAction?.colonyResolvedSources, false, "source action resolves no sources");
  assertEqual(result.completedHostAction?.retryWorkerCreated, false, "source action creates no retry worker");
  assertEqual(result.completedHostAction?.completedReplayActionTruth, "credential_free_host_owned_manual_reinvoke_action_after_source_revalidation_result_preflight_no_execution", "source action truth is explicit");
  assert(!containsForbiddenTruth(result), "source revalidated host action leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorCompletedHostActionAccepted(): Promise<void> {
  section("2. Vendor Revalidated Host Action Preserves Vendor-State Gate");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor acknowledged host action is accepted");
  assert(Boolean(actionResult.acknowledgedHostAction), "fixture vendor acknowledged host action is present");
  const sourceRevalidationResult = sourceRevalidationResultFor({
    candidate,
    approval,
    item,
    checklist,
    acknowledgement,
    acknowledgedHostAction: actionResult.acknowledgedHostAction!,
  });
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor revalidated host action is accepted");
  assertEqual(result.completedHostAction?.requiresVendorStateCheck, true, "vendor action preserves vendor-state requirement");
  assertEqual(result.completedHostAction?.automaticVendorRetryAllowed, false, "vendor action allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor revalidated host action leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedResultRejected(): Promise<void> {
  section("3. Tampered Result Blocks Revalidated Host Action");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const tamperedResultId = sourceRevalidationResult.resultId.endsWith("0")
    ? `${sourceRevalidationResult.resultId.slice(0, -1)}1`
    : `${sourceRevalidationResult.resultId.slice(0, -1)}0`;
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: {
      ...sourceRevalidationResult,
      resultId: tamperedResultId,
    },
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered result revalidated host action is rejected");
  assertEqual(result.reasonCode, "source_revalidation_result_current_truth_mismatch", "tampered result rejection is bounded");
  assertEqual(result.sourceRevalidationResultPreflight.accepted, false, "tampered result fails result preflight");
  assert(result.completedHostAction === undefined, "tampered result returns no completed host action");
  assert(!containsForbiddenTruth(result), "tampered result rejection leaks no raw truth");

  const malformedSourceRevalidationResult = { ...sourceRevalidationResult } as Record<string, unknown>;
  delete malformedSourceRevalidationResult.sourceRefsTruncated;
  const malformedResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: malformedSourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(malformedResult.accepted, false, "malformed result revalidated host action is rejected");
  assertEqual(malformedResult.reasonCode, "valid_source_revalidation_result_required", "malformed result rejection is bounded");
  assertEqual(malformedResult.sourceRevalidationResultPreflight.accepted, false, "malformed result fails result preflight");
  assert(malformedResult.completedHostAction === undefined, "malformed result returns no completed host action");
  assert(!containsForbiddenTruth(malformedResult), "malformed result rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCompletedAction(): Promise<void> {
  section("4. Stale Approval Rejects Before Revalidated Host Action");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T14:23:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval revalidated host action is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.sourceRevalidationResultPreflight.accepted, false, "stale approval rejects result preflight");
  assert(result.completedHostAction === undefined, "stale approval returns no completed host action");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyCompletedActionIdStabilityAndDivergence(): Promise<void> {
  section("5. Revalidated Host Action Id Is Stable And Result-Bound");
  const first = await completedActionForSource();
  const second = await completedActionForSource();
  const altTruth = await currentTruth({ targetId: "C156PRIVATE_ALT" });
  const alt = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCompletedHostAction({
    candidate: altTruth.candidate,
    approval: altTruth.approval,
    workItem: altTruth.item,
    sourceRevalidationChecklist: altTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: altTruth.acknowledgement,
    sourceRevalidationResult: sourceRevalidationResultFor(altTruth),
    freshApprovalRequiredAfter: "2026-05-08T14:24:59.000Z",
  });

  assertEqual(alt.accepted, true, "alternate-target revalidated host action is accepted");
  assertEqual(first.completedReplayActionId, second.completedReplayActionId, "same truth produces same completed action id");
  assert(first.completedReplayActionId !== alt.completedHostAction?.completedReplayActionId, "different approval-bound target changes completed action id");
  assert(!containsForbiddenTruth([first, second, alt]), "completed action id handoffs leak no raw target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 156 Verification (External Media Transfer Manual Retry Source-Revalidated Host Action)\n");
  await verifySourceCompletedHostActionAccepted();
  await verifyVendorCompletedHostActionAccepted();
  await verifyTamperedResultRejected();
  await verifyStaleApprovalRejectedBeforeCompletedAction();
  await verifyCompletedActionIdStabilityAndDivergence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 156: external media transfer manual retry source-revalidated host action is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
