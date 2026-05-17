/** Phase 157 Verification - External Media Transfer Manual Retry Credential Readiness */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
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

function arrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fileRefs(prefix = "phase157_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-157-report-${index}.pdf`,
    title: `Phase 157 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T157PRIVATE",
    accountId: "A157PRIVATE",
    targetKind: "channel",
    targetId: "C157PRIVATE",
    threadId: "171000.1570",
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
      approvedAt: "2026-05-08T14:40:00.000Z",
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
        reason: "source locked artifact:phase157_report_0 https://files.slack.com/private?token=xoxb-phase157-secret",
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
        reason: "vendor ambiguous targetId=C157PRIVATE retry-ledger://phase157-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
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
  return text.includes("artifact:phase157_report") ||
    text.includes("artifact:phase157_alt") ||
    text.includes("T157PRIVATE") ||
    text.includes("A157PRIVATE") ||
    text.includes("C157PRIVATE") ||
    text.includes("C157PRIVATE_ALT") ||
    text.includes("171000.1570") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase157-forged") ||
    text.includes("durable-audit://phase157-forged") ||
    text.includes("xoxb-phase157-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("file:///tmp/phase157");
}

async function credentialReadinessForSource(): Promise<ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness> {
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(result.accepted, true, "source credential readiness is accepted");
  assert(Boolean(result.credentialReadiness), "source credential readiness is returned");
  return result.credentialReadiness!;
}

async function verifySourceCredentialReadinessAccepted(): Promise<void> {
  section("1. Source Revalidated Credential Readiness Requires Completed Host Action");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(result.accepted, true, "source credential readiness is accepted");
  assertEqual(result.completedHostActionResult.accepted, true, "source credential readiness requires accepted completed host action");
  assert(Boolean(result.credentialReadiness), "source credential readiness returns descriptor");
  assertEqual(result.credentialReadiness?.readinessKind, "external_media_transfer_manual_retry_source_revalidated_credential_readiness", "source readiness kind is explicit");
  assertEqual(result.credentialReadiness?.sourceRevalidationResultId, sourceRevalidationResult.resultId, "source readiness binds result id");
  assertEqual(result.credentialReadiness?.completedReplayActionId, result.completedHostAction?.completedReplayActionId, "source readiness binds completed action id");
  assertEqual(result.credentialReadiness?.credentialStatus, "host_credentials_required", "source readiness does not claim credentials are present");
  assert(arrayField(result.credentialReadiness?.requiredCredentialRefs).includes("host_source_access_ref"), "source readiness requires host source access label");
  assert(arrayField(result.credentialReadiness?.requiredCredentialRefs).includes("slack_media_send_credential_ref"), "source readiness requires channel send credential label");
  assert(arrayField(result.credentialReadiness?.hostSuppliedRuntimeSecrets).includes("source_store_access_credential"), "source readiness names source credential responsibility");
  assert(arrayField(result.credentialReadiness?.hostSuppliedRuntimeSecrets).includes("slack_media_send_credential"), "source readiness names channel credential responsibility");
  assert(arrayField(result.credentialReadiness?.handoffChecklist).includes("no_colony_credential_persistence_or_default_live_delivery"), "source readiness includes no-persistence handoff");
  assertEqual(result.credentialReadiness?.colonyExecutedHostHandler, false, "source readiness executes no handler");
  assertEqual(result.credentialReadiness?.colonyResolvedSources, false, "source readiness resolves no sources");
  assertEqual(result.credentialReadiness?.credentialValuesPersisted, false, "source readiness persists no credential values");
  assertEqual(result.credentialReadiness?.credentialReadinessTruth, "host_owned_credential_readiness_after_source_revalidated_host_action_no_execution_or_persistence", "source readiness truth is explicit");
  assert(!containsForbiddenTruth(result), "source credential readiness leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorCredentialReadinessAccepted(): Promise<void> {
  section("2. Vendor Credential Readiness Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
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
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential readiness is accepted");
  assertEqual(result.credentialReadiness?.requiresVendorStateCheck, true, "vendor readiness preserves vendor-state requirement");
  assertEqual(result.credentialReadiness?.automaticVendorRetryAllowed, false, "vendor readiness allows no automatic vendor retry");
  assertEqual(result.credentialReadiness?.credentialPersistenceCreated, false, "vendor readiness creates no credential persistence");
  assert(!containsForbiddenTruth(result), "vendor credential readiness leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedResultRejected(): Promise<void> {
  section("3. Tampered Result Blocks Credential Readiness");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const tamperedResultId = sourceRevalidationResult.resultId.endsWith("0")
    ? `${sourceRevalidationResult.resultId.slice(0, -1)}1`
    : `${sourceRevalidationResult.resultId.slice(0, -1)}0`;
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: {
      ...sourceRevalidationResult,
      resultId: tamperedResultId,
    },
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered result credential readiness is rejected");
  assertEqual(result.reasonCode, "source_revalidation_result_current_truth_mismatch", "tampered result rejection is bounded");
  assertEqual(result.completedHostActionResult.accepted, false, "tampered result fails completed host action gate");
  assert(result.credentialReadiness === undefined, "tampered result returns no credential readiness");
  assert(!containsForbiddenTruth(result), "tampered result rejection leaks no raw truth");

  const malformedSourceRevalidationResult = { ...sourceRevalidationResult } as Record<string, unknown>;
  delete malformedSourceRevalidationResult.sourceRefsTruncated;
  const malformedResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: malformedSourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(malformedResult.accepted, false, "malformed result credential readiness is rejected");
  assertEqual(malformedResult.reasonCode, "valid_source_revalidation_result_required", "malformed result rejection is bounded");
  assertEqual(malformedResult.completedHostActionResult.accepted, false, "malformed result fails completed host action gate");
  assert(malformedResult.credentialReadiness === undefined, "malformed result returns no credential readiness");
  assert(!containsForbiddenTruth(malformedResult), "malformed result rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialReadiness(): Promise<void> {
  section("4. Stale Approval Rejects Before Credential Readiness");
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T14:38:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval credential readiness is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.completedHostActionResult.accepted, false, "stale approval rejects completed host action gate");
  assert(result.credentialReadiness === undefined, "stale approval returns no credential readiness");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyCredentialReadinessIdStabilityAndDivergence(): Promise<void> {
  section("5. Credential Readiness Id Is Stable And Action-Bound");
  const first = await credentialReadinessForSource();
  const second = await credentialReadinessForSource();
  const altTruth = await currentTruth({ targetId: "C157PRIVATE_ALT" });
  const alt = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: altTruth.candidate,
    approval: altTruth.approval,
    workItem: altTruth.item,
    sourceRevalidationChecklist: altTruth.checklist,
    sourceRevalidationChecklistAcknowledgement: altTruth.acknowledgement,
    sourceRevalidationResult: sourceRevalidationResultFor(altTruth),
    freshApprovalRequiredAfter: "2026-05-08T14:39:59.000Z",
  });

  assertEqual(alt.accepted, true, "alternate-target credential readiness is accepted");
  assertEqual(first.credentialReadinessId, second.credentialReadinessId, "same truth produces same credential readiness id");
  assert(first.credentialReadinessId !== alt.credentialReadiness?.credentialReadinessId, "different approval-bound target changes credential readiness id");
  assert(!containsForbiddenTruth([first, second, alt]), "credential readiness id handoffs leak no raw target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 157 Verification (External Media Transfer Manual Retry Credential Readiness)\n");
  await verifySourceCredentialReadinessAccepted();
  await verifyVendorCredentialReadinessAccepted();
  await verifyTamperedResultRejected();
  await verifyStaleApprovalRejectedBeforeCredentialReadiness();
  await verifyCredentialReadinessIdStabilityAndDivergence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 157: external media transfer manual retry credential readiness is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
