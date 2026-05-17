/** Phase 155 Verification - External Media Transfer Manual Retry Source Revalidation Result Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
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

function fileRefs(prefix = "phase155_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-155-report-${index}.pdf`,
    title: `Phase 155 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T155PRIVATE",
    accountId: "A155PRIVATE",
    targetKind: "channel",
    targetId: "C155PRIVATE",
    threadId: "171000.1550",
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
      approvedAt: "2026-05-08T14:05:00.000Z",
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
        reason: "source locked artifact:phase155_report_0 https://files.slack.com/private?token=xoxb-phase155-secret",
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
        reason: "vendor ambiguous targetId=C155PRIVATE retry-ledger://phase155-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture acknowledged host action is accepted");
  assert(Boolean(actionResult.acknowledgedHostAction), "fixture includes acknowledged host action");
  return { candidate, approval, item, checklist, template, acknowledgement, acknowledgedHostAction: actionResult.acknowledgedHostAction! };
}

function sourceRevalidationResultFor(
  truth: Awaited<ReturnType<typeof currentTruth>>,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult {
  const acknowledgedHostAction = truth.acknowledgedHostAction;
  return {
    resultKind: "external_media_transfer_manual_retry_source_revalidation_result",
    resultVersion: 1,
    resultId: acknowledgedHostAction.acknowledgedReplayActionId.replace(
      "manual-retry-source-checklist-ack-host-action:",
      "manual-retry-source-revalidation-result:",
    ),
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
  return text.includes("artifact:phase155_report") ||
    text.includes("artifact:phase155_alt") ||
    text.includes("T155PRIVATE") ||
    text.includes("A155PRIVATE") ||
    text.includes("C155PRIVATE") ||
    text.includes("C155PRIVATE_ALT") ||
    text.includes("171000.1550") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase155-forged") ||
    text.includes("durable-audit://phase155-forged") ||
    text.includes("xoxb-phase155-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("file:///tmp/phase155");
}

async function verifySourceResultPreflightAccepted(): Promise<void> {
  section("1. Source Revalidation Result Preflight Accepts Current Truth");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });

  assertEqual(result.accepted, true, "source revalidation result preflight is accepted");
  assertEqual(result.acknowledgedHostActionResult.accepted, true, "source result preflight requires accepted acknowledged host action");
  assert(Boolean(result.sourceRevalidationResult), "source result preflight returns sanitized source result");
  assertEqual(result.sourceRevalidationResult?.resultId, sourceRevalidationResult.resultId, "source result id is preserved");
  assertEqual(result.expectedResultId, sourceRevalidationResult.resultId, "source expected result id matches current acknowledged action");
  assertEqual(result.resultIdMatched, true, "source result id match is explicit");
  assertEqual(result.acknowledgedReplayActionIdMatched, true, "source acknowledged action id match is explicit");
  assertEqual(result.sourceRefFingerprintsMatched, true, "source fingerprints match is explicit");
  assertEqual(result.revalidatedSourcesMatched, true, "source revalidation steps match current truth");
  assertEqual(result.allRequiredSourcesRevalidated, true, "source all-required-sources revalidated truth is explicit");
  assertEqual(result.sourceRevalidationResult?.colonyResolvedSources, false, "source result makes no Colony source-resolution claim");
  assertEqual(result.sourceRevalidationResult?.sourceRevalidationPersisted, false, "source result is not persisted");
  assertEqual(result.sourceRevalidationResult?.retryWorkerCreated, false, "source result creates no retry worker");
  assertEqual(result.sourceRevalidationResult?.retryLedgerCreated, false, "source result creates no retry ledger");
  assertEqual(result.sourceRevalidationResultPreflightTruth, "recomputed_from_acknowledged_host_action_and_supplied_source_revalidation_result_no_execution", "source result preflight truth is explicit");
  assert(!containsForbiddenTruth(result), "source result preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorResultPreflightAccepted(): Promise<void> {
  section("2. Vendor Source Revalidation Result Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor acknowledged host action is accepted");
  assert(Boolean(actionResult.acknowledgedHostAction), "fixture vendor acknowledged host action is present");
  const vendorTruth = { candidate, approval, item, checklist, template, acknowledgement, acknowledgedHostAction: actionResult.acknowledgedHostAction! };
  const sourceRevalidationResult = sourceRevalidationResultFor(vendorTruth);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor source revalidation result preflight is accepted");
  assertEqual(result.requiresVendorStateCheck, true, "vendor source result preflight preserves vendor-state requirement");
  assertEqual(result.sourceRevalidationResult?.requiresVendorStateCheck, true, "vendor source result carries vendor-state requirement");
  assertEqual(result.sourceRevalidationResult?.automaticVendorRetryAllowed, false, "vendor source result allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor source result preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedResultRejected(): Promise<void> {
  section("3. Tampered Source Revalidation Result Rejects Current Truth Mismatch");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: {
      ...sourceRevalidationResult,
      revalidatedSources: sourceRevalidationResult.revalidatedSources.map((source, index) => index === 0
        ? { ...source, staleResolvedFileReused: true }
        : source),
    },
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered source result preflight is rejected");
  assertEqual(result.reasonCode, "valid_source_revalidation_result_required", "tampered source result rejection is bounded");
  assert(result.sourceRevalidationResult === undefined, "tampered source result is not returned");
  assert(!containsForbiddenTruth(result), "tampered source result rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeResultTrust(): Promise<void> {
  section("4. Stale Approval Rejects Source Revalidation Result Before Trust");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T14:03:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval source result preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection reuses bounded preflight reason");
  assertEqual(result.acknowledgedHostActionResult.accepted, false, "stale approval rejects acknowledged host action preflight");
  assert(result.sourceRevalidationResult === undefined, "stale approval trusts no source result");
  assert(!containsForbiddenTruth(result), "stale approval source result rejection leaks no raw truth");
}

async function verifyResultIdStabilityAndDivergence(): Promise<void> {
  section("5. Source Revalidation Result Id Is Stable And Approval-Bound");
  const firstTruth = await currentTruth();
  const firstResult = sourceRevalidationResultFor(firstTruth);
  const first = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate: firstTruth.candidate,
    approval: firstTruth.approval,
    workItem: firstTruth.item,
    sourceRevalidationChecklist: firstTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: firstTruth.acknowledgement,
    sourceRevalidationResult: firstResult,
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });
  const second = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate: firstTruth.candidate,
    approval: firstTruth.approval,
    workItem: firstTruth.item,
    sourceRevalidationChecklist: firstTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: firstTruth.acknowledgement,
    sourceRevalidationResult: firstResult,
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });
  const altTruth = await currentTruth({ targetId: "C155PRIVATE_ALT" });
  const alt = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult({
    candidate: altTruth.candidate,
    approval: altTruth.approval,
    workItem: altTruth.item,
    sourceRevalidationChecklist: altTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: altTruth.acknowledgement,
    sourceRevalidationResult: sourceRevalidationResultFor(altTruth),
    freshApprovalRequiredAfter: "2026-05-08T14:04:59.000Z",
  });

  assertEqual(first.accepted, true, "first result-id fixture is accepted");
  assertEqual(second.accepted, true, "second result-id fixture is accepted");
  assertEqual(alt.accepted, true, "alternate-target result-id fixture is accepted");
  assertEqual(first.sourceRevalidationResult?.resultId, second.sourceRevalidationResult?.resultId, "same truth produces same source revalidation result id");
  assert(first.sourceRevalidationResult?.resultId !== alt.sourceRevalidationResult?.resultId, "different approval-bound target changes source revalidation result id");
  assert(!containsForbiddenTruth([first, second, alt]), "result-id handoffs leak no raw target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 155 Verification (External Media Transfer Manual Retry Source Revalidation Result Preflight)\n");
  await verifySourceResultPreflightAccepted();
  await verifyVendorResultPreflightAccepted();
  await verifyTamperedResultRejected();
  await verifyStaleApprovalRejectedBeforeResultTrust();
  await verifyResultIdStabilityAndDivergence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 155: external media transfer manual retry source revalidation result preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
