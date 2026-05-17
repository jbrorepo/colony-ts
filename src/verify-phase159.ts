/** Phase 159 Verification - External Media Transfer Credential-Acknowledged Host Action */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
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

function fileRefs(prefix = "phase159_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-159-report-${index}.pdf`,
    title: `Phase 159 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T159PRIVATE",
    accountId: "A159PRIVATE",
    targetKind: "channel",
    targetId: "C159PRIVATE",
    threadId: "171000.1590",
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
      approvedAt: "2026-05-08T15:25:00.000Z",
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
        reason: "source locked artifact:phase159_report_0 https://files.slack.com/private?token=xoxb-phase159-secret",
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
        reason: "vendor ambiguous targetId=C159PRIVATE retry-ledger://phase159-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
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
  return text.includes("artifact:phase159_report") ||
    text.includes("artifact:phase159_alt") ||
    text.includes("T159PRIVATE") ||
    text.includes("A159PRIVATE") ||
    text.includes("C159PRIVATE") ||
    text.includes("C159PRIVATE_ALT") ||
    text.includes("171000.1590") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase159-forged") ||
    text.includes("durable-audit://phase159-forged") ||
    text.includes("xoxb-phase159-secret") ||
    text.includes("xoxb-real-credential-value") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("file:///tmp/phase159");
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });

  assertEqual(result.accepted, true, "source credential readiness is accepted");
  assert(Boolean(result.credentialReadiness), "source credential readiness is returned");
  return { truth, sourceRevalidationResult, readiness: result.credentialReadiness! };
}

async function verifySourceCredentialAcknowledgedHostActionAccepted(): Promise<void> {
  section("1. Source Credential-Acknowledged Host Action Requires Acknowledgement");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });

  const action = result.credentialAcknowledgedHostAction;
  assertEqual(result.accepted, true, "source credential-acknowledged host action is accepted");
  assertEqual(result.credentialAcknowledgementPreflight.accepted, true, "host action requires accepted credential acknowledgement");
  assert(Boolean(action), "source credential-acknowledged host action returns descriptor");
  assertEqual(action?.action, "external_media_transfer_manual_retry_reinvoke_after_credential_acknowledgement", "source action type is explicit");
  assertEqual(action?.credentialAcknowledgedReplayMode, "manual_operator_reinvoke_after_credential_acknowledgement_preflight", "source action mode is explicit");
  assertEqual(action?.credentialStatus, "host_credentials_acknowledged", "source action reports labels acknowledged");
  assertEqual(action?.credentialAcknowledgementId, credentialAcknowledgement.credentialAcknowledgementId, "source action binds credential acknowledgement id");
  assertEqual(action?.credentialReadinessId, readiness.credentialReadinessId, "source action binds credential readiness id");
  assertEqual(action?.completedReplayActionId, readiness.completedReplayActionId, "source action binds completed host action id");
  assertEqual(action?.sourceRevalidationResultId, readiness.sourceRevalidationResultId, "source action binds source revalidation result id");
  assertEqual(action?.channelId, readiness.channelId, "source action binds channel id");
  assertEqual(action?.targetKind, readiness.targetKind, "source action binds target kind");
  assertEqual(action?.revalidatedSourceCount, readiness.revalidatedSourceCount, "source action binds revalidated source count");
  assertEqual(action?.credentialValuesIncluded, false, "source action includes no credential values");
  assertEqual(action?.colonyExecutedHostHandler, false, "source action executes no handler");
  assertEqual(action?.colonyResolvedSources, false, "source action resolves no sources");
  assertEqual(action?.credentialAcknowledgedHostActionPersisted, false, "source action is not persisted");
  assertEqual(action?.backgroundRetryCreated, false, "source action creates no background retry");
  assertEqual(action?.automaticVendorRetryAllowed, false, "source action allows no automatic vendor retry");
  assertEqual(action?.defaultLiveDeliveryEnabled, false, "source action enables no default live delivery");
  assertEqual(action?.credentialAcknowledgedReplayActionTruth, "labels_only_host_owned_manual_reinvoke_action_after_credential_acknowledgement_preflight_no_values_or_execution", "source action truth is explicit");
  assert(!containsForbiddenTruth(result), "source credential-acknowledged host action leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorCredentialAcknowledgedHostActionAccepted(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Host Action Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor acknowledged host action is accepted");
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture vendor credential readiness is accepted");
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(readinessResult.credentialReadiness!),
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential-acknowledged host action is accepted");
  assertEqual(result.credentialAcknowledgedHostAction?.requiresVendorStateCheck, true, "vendor action preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedHostAction?.automaticVendorRetryAllowed, false, "vendor action allows no automatic vendor retry");
  assertEqual(result.credentialAcknowledgedHostAction?.credentialPersistenceCreated, false, "vendor action creates no credential persistence");
  assertEqual(result.credentialAcknowledgedHostAction?.credentialAcknowledgedHostActionPersisted, false, "vendor action is not persisted");
  assert(!containsForbiddenTruth(result), "vendor credential-acknowledged host action leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyCredentialAcknowledgedHostActionRejectsInvalidAcknowledgement(): Promise<void> {
  section("3. Invalid Credential Acknowledgement Rejects Before Host Action");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);
  const tamperedResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });

  assertEqual(tamperedResult.accepted, false, "tampered credential acknowledgement blocks host action");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledgement_current_truth_mismatch", "tampered acknowledgement rejection is bounded");
  assertEqual(tamperedResult.credentialAcknowledgementPreflight.accepted, false, "tampered acknowledgement preflight is rejected");
  assert(tamperedResult.credentialAcknowledgedHostAction === undefined, "tampered acknowledgement returns no host action");
  assert(!containsForbiddenTruth(tamperedResult), "tampered acknowledgement rejection leaks no raw truth");

  const rawClaimResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
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
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });

  assertEqual(rawClaimResult.accepted, false, "raw credential claim blocks host action");
  assertEqual(rawClaimResult.reasonCode, "valid_credential_acknowledgement_required", "raw credential claim rejection is bounded");
  assert(rawClaimResult.credentialAcknowledgedHostAction === undefined, "raw credential claim returns no host action");
  assert(!containsForbiddenTruth(rawClaimResult), "raw credential claim rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgedHostAction(): Promise<void> {
  section("4. Stale Approval Rejects Before Credential-Acknowledged Host Action");
  const { truth, sourceRevalidationResult, readiness } = await credentialReadinessForSource();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T15:23:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(readiness),
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval credential-acknowledged host action is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialAcknowledgementPreflight.accepted, false, "stale approval rejects credential acknowledgement preflight");
  assert(result.credentialAcknowledgedHostAction === undefined, "stale approval returns no credential-acknowledged host action");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyCredentialAcknowledgedHostActionIdStabilityAndDivergence(): Promise<void> {
  section("5. Credential-Acknowledged Host Action Id Is Stable And Acknowledgement-Bound");
  const first = await credentialReadinessForSource();
  const second = await credentialReadinessForSource();
  const firstResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: first.truth.candidate,
    approval: first.truth.approval,
    workItem: first.truth.item,
    sourceRevalidationChecklist: first.truth.checklist,
    sourceRevalidationChecklistAcknowledgement: first.truth.acknowledgement,
    sourceRevalidationResult: first.sourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(first.readiness),
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  const secondResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: second.truth.candidate,
    approval: second.truth.approval,
    workItem: second.truth.item,
    sourceRevalidationChecklist: second.truth.checklist,
    sourceRevalidationChecklistAcknowledgement: second.truth.acknowledgement,
    sourceRevalidationResult: second.sourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(second.readiness),
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(firstResult.accepted, true, "first id fixture is accepted");
  assertEqual(secondResult.accepted, true, "second id fixture is accepted");
  const firstAction = firstResult.credentialAcknowledgedHostAction as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction;
  const secondAction = secondResult.credentialAcknowledgedHostAction as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction;

  const vendor = await vendorRetryFixture();
  const vendorTemplate = await checklistTemplateFor(vendor.candidate, vendor.approval, vendor.item);
  const vendorAcknowledgement = acknowledgementFor(vendorTemplate.template);
  const vendorActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate: vendor.candidate,
    approval: vendor.approval,
    workItem: vendor.item,
    sourceRevalidationChecklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(vendorActionResult.accepted, true, "vendor id fixture action is accepted");
  const vendorSourceRevalidationResult = sourceRevalidationResultFor({
    candidate: vendor.candidate,
    approval: vendor.approval,
    item: vendor.item,
    checklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    acknowledgedHostAction: vendorActionResult.acknowledgedHostAction!,
  });
  const vendorReadiness = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate: vendor.candidate,
    approval: vendor.approval,
    workItem: vendor.item,
    sourceRevalidationChecklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    sourceRevalidationResult: vendorSourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(vendorReadiness.accepted, true, "vendor id fixture readiness is accepted");
  const vendorResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: vendor.candidate,
    approval: vendor.approval,
    workItem: vendor.item,
    sourceRevalidationChecklist: vendorTemplate.checklist,
    acknowledgement: vendorAcknowledgement,
    sourceRevalidationResult: vendorSourceRevalidationResult,
    credentialAcknowledgement: credentialAcknowledgementFor(vendorReadiness.credentialReadiness!),
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:24:59.000Z",
  });
  assertEqual(vendorResult.accepted, true, "vendor id fixture is accepted");
  const vendorAction = vendorResult.credentialAcknowledgedHostAction as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction;

  assertEqual(firstAction.credentialAcknowledgedReplayActionId, secondAction.credentialAcknowledgedReplayActionId, "same truth produces same credential-acknowledged host action id");
  assert(firstAction.credentialAcknowledgedReplayActionId !== vendorAction.credentialAcknowledgedReplayActionId, "different retry-stage truth changes credential-acknowledged host action id");
  assert(!containsForbiddenTruth([firstAction, secondAction, vendorAction]), "credential-acknowledged host action id handoffs leak no raw target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 159 Verification (External Media Transfer Credential-Acknowledged Host Action)\n");
  await verifySourceCredentialAcknowledgedHostActionAccepted();
  await verifyVendorCredentialAcknowledgedHostActionAccepted();
  await verifyCredentialAcknowledgedHostActionRejectsInvalidAcknowledgement();
  await verifyStaleApprovalRejectedBeforeCredentialAcknowledgedHostAction();
  await verifyCredentialAcknowledgedHostActionIdStabilityAndDivergence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 159: external media transfer credential-acknowledged host action is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
