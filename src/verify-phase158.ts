/** Phase 158 Verification - External Media Transfer Manual Retry Credential Acknowledgement Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement,
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

function fileRefs(prefix = "phase158_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-158-report-${index}.pdf`,
    title: `Phase 158 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T158PRIVATE",
    accountId: "A158PRIVATE",
    targetKind: "channel",
    targetId: "C158PRIVATE",
    threadId: "171000.1580",
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
      approvedAt: "2026-05-08T15:05:00.000Z",
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
        reason: "source locked artifact:phase158_report_0 https://files.slack.com/private?token=xoxb-phase158-secret",
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
        reason: "vendor ambiguous targetId=C158PRIVATE retry-ledger://phase158-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
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

function credentialAcknowledgementFor(
  readiness: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement {
  return {
    acknowledgementKind: "external_media_transfer_manual_retry_source_revalidated_credential_acknowledgement",
    acknowledgementVersion: 1,
    credentialAcknowledgementId: `manual-retry-source-revalidation-credential-ack:${
      readiness.credentialReadinessId.replace("manual-retry-source-revalidation-credential-readiness:", "").slice(0, 32)
    }${readiness.targetCorrelationFingerprint.replace("manual-retry-target:", "").slice(0, 32)}`,
    credentialReadinessId: readiness.credentialReadinessId,
    completedReplayActionId: readiness.completedReplayActionId,
    sourceRevalidationResultId: readiness.sourceRevalidationResultId,
    acknowledgementId: readiness.acknowledgementId,
    acknowledgementTemplateId: readiness.acknowledgementTemplateId,
    checklistId: readiness.checklistId,
    channelId: readiness.channelId,
    targetKind: readiness.targetKind,
    retryStage: readiness.retryStage,
    workItemCorrelationId: readiness.workItemCorrelationId,
    expectedWorkItemCorrelationId: readiness.expectedWorkItemCorrelationId,
    transferKey: readiness.transferKey,
    sourceRefsTruncated: readiness.sourceRefsTruncated,
    sourceRefFingerprints: readiness.sourceRefFingerprints,
    targetCorrelationFingerprint: readiness.targetCorrelationFingerprint,
    revalidatedSourceCount: readiness.revalidatedSourceCount,
    credentialStatus: "host_credentials_available",
    requiredCredentialRefs: readiness.requiredCredentialRefs,
    presentCredentialRefs: readiness.requiredCredentialRefs,
    missingCredentialRefs: [],
    invalidCredentialRefs: [],
    credentialValuesIncluded: false,
    hostSuppliedRuntimeSecrets: readiness.hostSuppliedRuntimeSecrets,
    hostSuppliedRuntimeConfig: readiness.hostSuppliedRuntimeConfig,
    requiresFreshApprovalSignature: true,
    requiresSourceRefRevalidation: true,
    requiresFreshSourceResolution: true,
    mustNotReuseResolvedFiles: true,
    requiresVendorStateCheck: readiness.requiresVendorStateCheck,
    requiresHostSourceAccessCredential: true,
    requiresHostVendorSendCredential: true,
    hostExecutionRequired: true,
    credentialReadinessAccepted: true,
    completedHostActionAccepted: true,
    colonyExecutedHostHandler: false,
    colonyResolvedSources: false,
    colonyFetchedFiles: false,
    colonyDownloadedFiles: false,
    colonyUploadedFiles: false,
    colonyPreviewedFiles: false,
    sourceRevalidationPersisted: false,
    checklistPersisted: false,
    acknowledgementPersisted: false,
    credentialAcknowledgementPersisted: false,
    workItemPersisted: false,
    retryLedgerCreated: false,
    durableRetryAuditRecordCreated: false,
    backgroundRetryCreated: false,
    retryWorkerCreated: false,
    retryScheduleCreated: false,
    automaticVendorRetryAllowed: false,
    credentialPersistenceCreated: false,
    credentialValuesPersisted: false,
    defaultLiveDeliveryEnabled: false,
    publicHostingEnabled: false,
    credentialAcknowledgementTruth: "host_reported_credential_labels_only_after_readiness_no_values_or_persistence",
  };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase158_report") ||
    text.includes("artifact:phase158_alt") ||
    text.includes("T158PRIVATE") ||
    text.includes("A158PRIVATE") ||
    text.includes("C158PRIVATE") ||
    text.includes("C158PRIVATE_ALT") ||
    text.includes("171000.1580") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase158-forged") ||
    text.includes("durable-audit://phase158-forged") ||
    text.includes("xoxb-phase158-secret") ||
    text.includes("xoxb-real-credential-value") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("file:///tmp/phase158");
}

async function credentialReadinessForSource(): Promise<{
  truth: Awaited<ReturnType<typeof currentTruth>>;
  sourceRevalidationResult: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult;
  readiness: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness;
}> {
  const truth = await currentTruth();
  const sourceRevalidationResult = sourceRevalidationResultFor(truth);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(result.accepted, true, "source credential readiness is accepted");
  assert(Boolean(result.credentialReadiness), "source credential readiness is returned");
  return { truth, sourceRevalidationResult, readiness: result.credentialReadiness! };
}

async function verifySourceCredentialAcknowledgementAccepted(): Promise<void> {
  section("1. Source Credential Acknowledgement Requires Readiness");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(result.accepted, true, "source credential acknowledgement is accepted");
  assertEqual(result.credentialReadinessResult.accepted, true, "source acknowledgement requires accepted credential readiness");
  assert(Boolean(result.credentialAcknowledgement), "source acknowledgement returns descriptor");
  assertEqual(result.credentialAcknowledgement?.credentialStatus, "host_credentials_available", "source acknowledgement reports host labels available");
  assertEqual(result.requiredCredentialRefsMatched, true, "source required refs match readiness");
  assertEqual(result.presentCredentialRefsMatched, true, "source present refs match readiness");
  assertEqual(result.missingCredentialRefsMatched, true, "source missing refs are empty");
  assertEqual(result.invalidCredentialRefsMatched, true, "source invalid refs are empty");
  assertEqual(result.channelIdMatched, true, "source channel id matches readiness");
  assertEqual(result.targetKindMatched, true, "source target kind matches readiness");
  assertEqual(result.revalidatedSourceCountMatched, true, "source revalidated count matches readiness");
  assertEqual(result.credentialAcknowledgement?.credentialValuesIncluded, false, "source acknowledgement includes no credential values");
  assertEqual(result.credentialAcknowledgement?.colonyExecutedHostHandler, false, "source acknowledgement executes no handler");
  assertEqual(result.credentialAcknowledgement?.credentialPersistenceCreated, false, "source acknowledgement creates no credential persistence");
  assertEqual(result.credentialAcknowledgement?.defaultLiveDeliveryEnabled, false, "source acknowledgement enables no default live delivery");
  assertEqual(result.credentialAcknowledgement?.credentialAcknowledgementTruth, "host_reported_credential_labels_only_after_readiness_no_values_or_persistence", "source acknowledgement truth is explicit");
  assert(!containsForbiddenTruth(result), "source credential acknowledgement leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorCredentialAcknowledgementAccepted(): Promise<void> {
  section("2. Vendor Credential Acknowledgement Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
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
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture vendor credential readiness is accepted");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(readinessResult.credentialReadiness!),
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential acknowledgement is accepted");
  assertEqual(result.credentialAcknowledgement?.requiresVendorStateCheck, true, "vendor acknowledgement preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgement?.automaticVendorRetryAllowed, false, "vendor acknowledgement allows no automatic vendor retry");
  assertEqual(result.credentialAcknowledgement?.credentialPersistenceCreated, false, "vendor acknowledgement creates no credential persistence");
  assert(!containsForbiddenTruth(result), "vendor credential acknowledgement leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyCredentialAcknowledgementRejectsMissingAndRawCredentialClaims(): Promise<void> {
  section("3. Missing Or Raw Credential Claims Reject Acknowledgement");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);
  const missingResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: {
      ...credentialAcknowledgement,
      presentCredentialRefs: ["host_source_access_ref"],
      missingCredentialRefs: ["slack_media_send_credential_ref"],
    },
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(missingResult.accepted, false, "missing credential acknowledgement is rejected");
  assertEqual(missingResult.reasonCode, "credential_acknowledgement_current_truth_mismatch", "missing credential rejection is bounded");
  assertEqual(missingResult.presentCredentialRefsMatched, false, "missing credential present-ref mismatch is explicit");
  assert(missingResult.credentialAcknowledgement === undefined, "missing credential acknowledgement is not trusted");
  assert(!containsForbiddenTruth(missingResult), "missing credential rejection leaks no raw truth");

  const rawClaimResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: {
      ...credentialAcknowledgement,
      credentialValuesIncluded: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(rawClaimResult.accepted, false, "raw credential value claim is rejected");
  assertEqual(rawClaimResult.reasonCode, "valid_credential_acknowledgement_required", "raw credential value rejection is bounded");
  assert(rawClaimResult.credentialAcknowledgement === undefined, "raw credential value acknowledgement is not trusted");
  assert(!containsForbiddenTruth(rawClaimResult), "raw credential value rejection leaks no raw truth");
}

async function verifyCredentialAcknowledgementRejectsTamperedCurrentTruth(): Promise<void> {
  section("4. Tampered Credential Acknowledgement Current Truth Rejects");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);

  const channelTamperResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: {
      ...credentialAcknowledgement,
      channelId: "discord",
    },
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(channelTamperResult.accepted, false, "tampered channel acknowledgement is rejected");
  assertEqual(channelTamperResult.reasonCode, "credential_acknowledgement_current_truth_mismatch", "tampered channel rejection is bounded");
  assertEqual(channelTamperResult.channelIdMatched, false, "tampered channel mismatch is explicit");
  assert(channelTamperResult.credentialAcknowledgement === undefined, "tampered channel acknowledgement is not trusted");
  assert(!containsForbiddenTruth(channelTamperResult), "tampered channel rejection leaks no raw truth");

  const targetTamperResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: {
      ...credentialAcknowledgement,
      targetKind: "direct",
    },
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(targetTamperResult.accepted, false, "tampered target kind acknowledgement is rejected");
  assertEqual(targetTamperResult.reasonCode, "credential_acknowledgement_current_truth_mismatch", "tampered target kind rejection is bounded");
  assertEqual(targetTamperResult.targetKindMatched, false, "tampered target kind mismatch is explicit");
  assert(targetTamperResult.credentialAcknowledgement === undefined, "tampered target kind acknowledgement is not trusted");
  assert(!containsForbiddenTruth(targetTamperResult), "tampered target kind rejection leaks no raw truth");

  const countTamperResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: {
      ...credentialAcknowledgement,
      sourceRefFingerprints: credentialAcknowledgement.sourceRefFingerprints.slice(0, 1),
      revalidatedSourceCount: 1,
    },
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(countTamperResult.accepted, false, "tampered source-count acknowledgement is rejected");
  assertEqual(countTamperResult.reasonCode, "credential_acknowledgement_current_truth_mismatch", "tampered source-count rejection is bounded");
  assertEqual(countTamperResult.sourceRefFingerprintsMatched, false, "tampered source fingerprints mismatch is explicit");
  assertEqual(countTamperResult.revalidatedSourceCountMatched, false, "tampered source count mismatch is explicit");
  assert(countTamperResult.credentialAcknowledgement === undefined, "tampered source-count acknowledgement is not trusted");
  assert(!containsForbiddenTruth(countTamperResult), "tampered source-count rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgement(): Promise<void> {
  section("5. Stale Approval Rejects Before Credential Acknowledgement");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T15:03:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(readiness),
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval credential acknowledgement is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialReadinessResult.accepted, false, "stale approval rejects credential readiness");
  assert(result.credentialAcknowledgement === undefined, "stale approval returns no credential acknowledgement");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyCredentialAcknowledgementIdStabilityAndDivergence(): Promise<void> {
  section("6. Credential Acknowledgement Id Is Stable And Readiness-Bound");
  const first = await credentialReadinessForSource();
  const second = await credentialReadinessForSource();
  const firstAck = credentialAcknowledgementFor(first.readiness);
  const secondAck = credentialAcknowledgementFor(second.readiness);
  const vendor = await vendorRetryFixture();
  const vendorTemplate = await checklistTemplateFor(vendor.candidate, vendor.approval, vendor.item);
  const vendorAcknowledgement = acknowledgementFor(vendorTemplate.template);
  const vendorAction = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate: vendor.candidate,
    approval: vendor.approval,
    workItem: vendor.item,
    sourceRevalidationChecklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });
  assertEqual(vendorAction.accepted, true, "vendor divergence fixture is accepted");
  const vendorSourceResult = sourceRevalidationResultFor({
    candidate: vendor.candidate,
    approval: vendor.approval,
    item: vendor.item,
    checklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    acknowledgedHostAction: vendorAction.acknowledgedHostAction!,
  });
  const vendorReadiness = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: vendor.candidate,
    approval: vendor.approval,
    workItem: vendor.item,
    sourceRevalidationChecklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    sourceRevalidationResult: vendorSourceResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:04:59.000Z",
  });
  assertEqual(vendorReadiness.accepted, true, "vendor divergence readiness is accepted");
  const vendorAck = credentialAcknowledgementFor(vendorReadiness.credentialReadiness!);

  assertEqual(firstAck.credentialAcknowledgementId, secondAck.credentialAcknowledgementId, "same truth produces same credential acknowledgement id");
  assert(firstAck.credentialAcknowledgementId !== vendorAck.credentialAcknowledgementId, "different retry-stage readiness changes credential acknowledgement id");
  assert(!containsForbiddenTruth([firstAck, secondAck, vendorAck]), "credential acknowledgement id handoffs leak no raw target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 158 Verification (External Media Transfer Manual Retry Credential Acknowledgement Preflight)\n");
  await verifySourceCredentialAcknowledgementAccepted();
  await verifyVendorCredentialAcknowledgementAccepted();
  await verifyCredentialAcknowledgementRejectsMissingAndRawCredentialClaims();
  await verifyCredentialAcknowledgementRejectsTamperedCurrentTruth();
  await verifyStaleApprovalRejectedBeforeCredentialAcknowledgement();
  await verifyCredentialAcknowledgementIdStabilityAndDivergence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 158: external media transfer manual retry credential acknowledgement preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
