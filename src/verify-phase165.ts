/** Phase 165 Verification - External Media Transfer Credential-Acknowledged Manual Reinvoke Execution */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult,
  type ExternalChannelMediaTransferManualReinvokeWorkerHandler,
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

function fileRefs(prefix = "phase165_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-165-report-${index}.pdf`,
    title: `Phase 165 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T163PRIVATE",
    accountId: "A163PRIVATE",
    targetKind: "channel",
    targetId: "C163PRIVATE",
    threadId: "171000.1630",
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
      approvedAt: "2026-05-08T16:45:00.000Z",
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
        reason: "source locked artifact:phase165_report_0 https://files.slack.com/private?token=xoxb-phase165-secret",
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
        reason: "vendor ambiguous targetId=C163PRIVATE retry-ledger://phase164-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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

async function currentAction(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { candidate, approval, item } = await sourceRetryFixture(overrides);
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture acknowledged host action is accepted");
  const acknowledgedHostAction = acknowledgedActionResult.acknowledgedHostAction!;
  const sourceRevalidationResult: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult = {
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
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture credential readiness is accepted");
  const readiness = readinessResult.credentialReadiness!;
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture credential-acknowledged host action is accepted");
  const manualReinvokeRequestResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
      candidate,
      approval,
      workItem: item,
      sourceRevalidationChecklist: checklist,
      sourceRevalidationChecklistAcknowledgement: acknowledgement,
      sourceRevalidationResult,
      credentialAcknowledgement,
      credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(manualReinvokeRequestResult.accepted, true, "fixture credential-acknowledged manual reinvoke request is accepted");
  const handoffResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
      candidate,
      approval,
      workItem: item,
      sourceRevalidationChecklist: checklist,
      sourceRevalidationChecklistAcknowledgement: acknowledgement,
      sourceRevalidationResult,
      credentialAcknowledgement,
      credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
      credentialAcknowledgedManualReinvokeRequest: manualReinvokeRequestResult.credentialAcknowledgedManualReinvokeRequest!,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(handoffResult.accepted, true, "fixture credential-acknowledged manual reinvoke handoff is accepted");
  return {
    candidate,
    approval,
    item,
    checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
    credentialAcknowledgedManualReinvokeRequest: manualReinvokeRequestResult.credentialAcknowledgedManualReinvokeRequest!,
    credentialAcknowledgedManualReinvokeHandoff: handoffResult.credentialAcknowledgedManualReinvokeHandoff!,
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
  return text.includes("artifact:phase165_report") ||
    text.includes("T163PRIVATE") ||
    text.includes("A163PRIVATE") ||
    text.includes("C163PRIVATE") ||
    text.includes("171000.1630") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase164-forged") ||
    text.includes("xoxb-phase164-secret") ||
    text.includes("xoxb-real-credential-value") ||
    text.includes("https://files.slack.com") ||
    text.includes("file:///tmp/phase164");
}

function assertNoRejectedHandoffDisclosure(
  result: {
    accepted: boolean;
    credentialAcknowledgedManualReinvokeHandoff?: unknown;
    expectedCredentialAcknowledgedManualReinvokeHandoff?: unknown;
    expectedCredentialAcknowledgedManualReinvokeHandoffId?: string;
    credentialAcknowledgedManualReinvokeHandoffResult?: {
      credentialAcknowledgedManualReinvokeHandoff?: unknown;
      credentialAcknowledgedManualReinvokeHandoffId?: string;
    };
  },
  label: string,
): void {
  assertEqual(result.accepted, false, `${label}: rejected`);
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, `${label}: top-level handoff omitted`);
  assert(result.expectedCredentialAcknowledgedManualReinvokeHandoff === undefined, `${label}: expected handoff omitted`);
  assert(result.expectedCredentialAcknowledgedManualReinvokeHandoffId === undefined, `${label}: expected handoff id omitted`);
  assert(
    result.credentialAcknowledgedManualReinvokeHandoffResult?.credentialAcknowledgedManualReinvokeHandoff === undefined,
    `${label}: nested recomputed handoff omitted`,
  );
  assert(
    result.credentialAcknowledgedManualReinvokeHandoffResult?.credentialAcknowledgedManualReinvokeHandoffId === undefined,
    `${label}: nested recomputed handoff id omitted`,
  );
}

async function verifyAcceptedCredentialAcknowledgedManualReinvokeHandoffPreflight(): Promise<void> {
  section("1. Credential-Acknowledged Manual Reinvoke Handoff Preflight Accepts Current Handoff");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  const handoff = result.credentialAcknowledgedManualReinvokeHandoff;

  assertEqual(result.accepted, true, "current credential-acknowledged manual reinvoke handoff preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffResult.accepted, true, "preflight recomputes accepted handoff truth");
  assert(Boolean(handoff), "handoff descriptor truth is returned");
  assertEqual(handoff?.handoffKind, "external_media_transfer_credential_acknowledged_manual_reinvoke_handoff", "handoff kind is explicit");
  assertEqual(handoff?.manualReinvokeHandoffMode, "host_owned_manual_reinvoke_handoff_after_request_preflight", "handoff mode is explicit");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestId, truth.credentialAcknowledgedManualReinvokeRequest.credentialAcknowledgedManualReinvokeRequestId, "preflight binds request id");
  assertEqual(handoff?.credentialAcknowledgedReplayActionId, truth.credentialAcknowledgedHostAction.credentialAcknowledgedReplayActionId, "preflight binds credential-acknowledged action id");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffId, truth.credentialAcknowledgedManualReinvokeHandoff.credentialAcknowledgedManualReinvokeHandoffId, "preflight returns current handoff id");
  assertEqual(handoff?.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "preflight binds transfer key");
  assertEqual(handoff?.requiredCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeHandoff.requiredCredentialRefs.length, "preflight carries required credential labels only");
  assertEqual(handoff?.presentCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeHandoff.presentCredentialRefs.length, "preflight carries present credential labels only");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestPreflightAccepted, true, "preflight confirms request preflight acceptance");
  assertEqual(handoff?.credentialValuesIncluded, false, "preflight includes no credential values");
  assertEqual(handoff?.colonyExecutedHostHandler, false, "preflight executes no host handler");
  assertEqual(handoff?.colonyResolvedSources, false, "preflight resolves no sources");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffPersisted, false, "preflight does not persist handoff");
  assertEqual(handoff?.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(handoff?.automaticVendorRetryAllowed, false, "preflight allows no automatic vendor retry");
  assertEqual(handoff?.credentialValuesPersisted, false, "preflight persists no credential values");
  assertEqual(handoff?.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(handoff?.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffIdMatched, true, "preflight matches handoff id");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestIdMatched, true, "preflight matches request id");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.requiredCredentialRefsMatched, true, "preflight matches required credential labels");
  assertEqual(result.credentialValuesExcluded, true, "preflight proves credential values are excluded");
  assertEqual(result.manualReinvokeHandoffStillNotExecuted, true, "preflight proves handoff is still not executed");
  assertEqual(result.sourceResolutionStillBlocked, true, "preflight proves source resolution is still blocked");
  assertEqual(result.persistenceStillBlocked, true, "preflight proves persistence is still blocked");
  assertEqual(result.retryWorkerStillBlocked, true, "preflight proves retry workers are still blocked");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "preflight proves automatic vendor retry is still blocked");
  assertEqual(result.credentialPersistenceStillBlocked, true, "preflight proves credential persistence is still blocked");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "preflight proves default live delivery is still blocked");
  assertEqual(result.publicHostingStillBlocked, true, "preflight proves public hosting is still blocked");
  assertEqual(
    result.credentialAcknowledgedManualReinvokeHandoffPreflightTruth,
    "recomputed_from_credential_acknowledged_manual_reinvoke_request_preflight_and_supplied_handoff_no_execution",
    "handoff preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted handoff preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeHandoffPreflightPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Manual Reinvoke Handoff Preflight Preserves Vendor-State Gate");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture vendor acknowledged action is accepted");
  const sourceRevalidationResult = {
    ...(await currentAction()).sourceRevalidationResult,
    resultId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId,
    acknowledgementId: acknowledgement.acknowledgementId,
    acknowledgementTemplateId: acknowledgement.acknowledgementTemplateId,
    checklistId: acknowledgement.checklistId,
    retryStage: "vendor_send" as const,
    workItemCorrelationId: acknowledgedActionResult.acknowledgedHostAction!.workItemCorrelationId,
    transferKey: acknowledgedActionResult.acknowledgedHostAction!.transferKey,
    sourceRefsTruncated: acknowledgedActionResult.acknowledgedHostAction!.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true as const,
      staleResolvedFileReused: false as const,
      hostOwned: true as const,
      colonyResolvedSource: false as const,
      rawSourceRefIncluded: false as const,
      resolvedFileHandleIncluded: false as const,
      fileBytesIncluded: false as const,
      privateUrlIncluded: false as const,
      credentialIncluded: false as const,
      persisted: false as const,
    })),
    requiresVendorStateCheck: true as const,
  };
  const credentialAcknowledgement = credentialAcknowledgementFor((await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  })).credentialReadiness!);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const requestResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(requestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const handoffResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(handoffResult.accepted, true, "fixture vendor handoff is accepted");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: handoffResult.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor handoff preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.requiresVendorStateCheck, true, "vendor handoff preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.hostMustVerifyVendorStateBeforeSend, true, "vendor handoff requires vendor-state verification before host send");
  assertEqual(result.requiresVendorStateCheckMatched, true, "vendor preflight matches vendor-state gate");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "vendor preflight still blocks automatic vendor retry");
  assertEqual(result.credentialPersistenceStillBlocked, true, "vendor preflight creates no credential persistence");
  assertEqual(result.publicHostingStillBlocked, true, "vendor preflight enables no public hosting");
  assert(!containsForbiddenTruth(result), "vendor handoff preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedCredentialAcknowledgedManualReinvokeHandoffBlocksPreflight(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Manual Reinvoke Handoff Blocks Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered handoff blocks preflight");
  assertEqual(result.reasonCode, "credential_acknowledged_manual_reinvoke_handoff_current_truth_mismatch", "tampered handoff rejection is bounded");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, "tampered preflight returns no handoff");
  assertNoRejectedHandoffDisclosure(result, "tampered handoff rejection");
  assert(!containsForbiddenTruth(result), "tampered handoff rejection leaks no raw truth");
}

async function verifyManualReinvokeHandoffPreflightUsesRecomputedCanonicalTruth(): Promise<void> {
  section("4. Manual Reinvoke Handoff Preflight Uses Recomputed Canonical Truth");
  const truth = await currentAction();
  const suppliedHandoff = {
    ...truth.credentialAcknowledgedManualReinvokeHandoff,
    requiredCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeHandoff.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeHandoff.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedManualReinvokeHandoff.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedManualReinvokeHandoff.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: suppliedHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive handoff is accepted before later trust");
  assertEqual(result.requiredCredentialRefsMatched, true, "required credential labels match by set truth");
  assertEqual(result.presentCredentialRefsMatched, true, "present credential labels match by set truth");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffIdMatched, true, "handoff id is stable across label order");
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeHandoff.requiredCredentialRefs),
    "handoff preflight returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeHandoff.hostSuppliedRuntimeSecrets),
    "handoff preflight returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs) !==
      JSON.stringify(suppliedHandoff.requiredCredentialRefs),
    "handoff preflight does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized handoff preflight leaks no raw truth");
}

async function verifyExecutionAndCredentialClaimsRejectedByManualReinvokeHandoffPreflight(): Promise<void> {
  section("5. Execution And Credential Claims Reject In Manual Reinvoke Handoff Preflight");
  const truth = await currentAction();
  const executionResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(executionResult.accepted, false, "execution claim is rejected");
  assertEqual(executionResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "execution claim rejection is bounded");
  assert(executionResult.credentialAcknowledgedManualReinvokeHandoff === undefined, "execution claim returns no handoff");
  assertNoRejectedHandoffDisclosure(executionResult, "execution claim rejection");

  const credentialResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(credentialResult.accepted, false, "credential value claim is rejected");
  assertEqual(credentialResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "credential value claim rejection is bounded");
  assert(credentialResult.credentialAcknowledgedManualReinvokeHandoff === undefined, "credential value claim returns no handoff");
  assertNoRejectedHandoffDisclosure(credentialResult, "credential value claim rejection");

  const nestedRawSourceResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      sourceRefFingerprints: truth.credentialAcknowledgedManualReinvokeHandoff.sourceRefFingerprints.map((source, index) => index === 0
        ? {
          ...source,
          rawSourceRef: "artifact:phase165_report_0",
          privateUrl: "https://files.slack.com/private?token=xoxb-phase164-secret",
        }
        : source),
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(nestedRawSourceResult.accepted, false, "nested raw source fields are rejected");
  assertEqual(nestedRawSourceResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "nested raw source rejection is bounded");
  assert(nestedRawSourceResult.credentialAcknowledgedManualReinvokeHandoff === undefined, "nested raw source returns no handoff");
  assertNoRejectedHandoffDisclosure(nestedRawSourceResult, "nested raw source rejection");
  assert(!containsForbiddenTruth([executionResult, credentialResult, nestedRawSourceResult]), "invalid handoff rejections leak no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgedManualReinvokeHandoffPreflight(): Promise<void> {
  section("6. Stale Approval Rejects Before Credential-Acknowledged Manual Reinvoke Handoff Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T16:13:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval handoff preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffResult.accepted, false, "stale approval rejects recomputed handoff");
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, "stale approval returns no handoff");
  assertNoRejectedHandoffDisclosure(result, "stale approval rejection");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyAcceptedCredentialAcknowledgedManualReinvokeHandoff(): Promise<void> {
  section("1. Credential-Acknowledged Manual Reinvoke Handoff Accepts Current Request Preflight");
  const truth = await currentAction();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  const handoff = result.credentialAcknowledgedManualReinvokeHandoff;

  assertEqual(result.accepted, true, "current credential-acknowledged manual reinvoke handoff is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestPreflight.accepted, true, "handoff requires accepted request preflight");
  assert(Boolean(handoff), "handoff descriptor truth is returned");
  assertEqual(handoff?.handoffKind, "external_media_transfer_credential_acknowledged_manual_reinvoke_handoff", "handoff kind is explicit");
  assertEqual(handoff?.manualReinvokeHandoffMode, "host_owned_manual_reinvoke_handoff_after_request_preflight", "handoff mode is explicit");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestId, truth.credentialAcknowledgedManualReinvokeRequest.credentialAcknowledgedManualReinvokeRequestId, "handoff binds request id");
  assertEqual(handoff?.credentialAcknowledgedReplayActionId, truth.credentialAcknowledgedHostAction.credentialAcknowledgedReplayActionId, "handoff binds credential-acknowledged host action id");
  assertEqual(handoff?.transferKey, truth.credentialAcknowledgedManualReinvokeRequest.transferKey, "handoff binds transfer key");
  assertEqual(handoff?.sourceRefFingerprints.length, truth.credentialAcknowledgedManualReinvokeRequest.sourceRefFingerprints.length, "handoff carries fingerprint-only source set");
  assertEqual(handoff?.requiredCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs.length, "handoff carries required credential labels only");
  assertEqual(handoff?.presentCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeRequest.presentCredentialRefs.length, "handoff carries present credential labels only");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestPreflightAccepted, true, "handoff records request preflight acceptance");
  assertEqual(handoff?.hostOwnedManualReinvokeRequired, true, "handoff remains host-owned");
  assertEqual(handoff?.hostMustResolveSourcesFresh, true, "handoff requires fresh source resolution");
  assertEqual(handoff?.hostMustNotReuseResolvedFiles, true, "handoff blocks stale resolved file reuse");
  assertEqual(handoff?.credentialValuesIncluded, false, "handoff includes no credential values");
  assertEqual(handoff?.colonyExecutedHostHandler, false, "handoff executes no host handler");
  assertEqual(handoff?.colonyResolvedSources, false, "handoff resolves no sources");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffPersisted, false, "handoff is not persisted");
  assertEqual(handoff?.retryWorkerCreated, false, "handoff creates no retry worker");
  assertEqual(handoff?.automaticVendorRetryAllowed, false, "handoff allows no automatic vendor retry");
  assertEqual(handoff?.credentialValuesPersisted, false, "handoff persists no credential values");
  assertEqual(handoff?.defaultLiveDeliveryEnabled, false, "handoff enables no default live delivery");
  assertEqual(handoff?.publicHostingEnabled, false, "handoff enables no public hosting");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffTruth, "host_owned_manual_reinvoke_handoff_after_request_preflight_no_execution_or_persistence", "handoff truth is explicit");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffTruth, "credential_acknowledged_manual_reinvoke_request_preflight_required_before_handoff_no_execution", "handoff result truth is explicit");
  assert(!containsForbiddenTruth(result), "accepted handoff leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeHandoffPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Manual Reinvoke Handoff Preserves Vendor-State Gate");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture vendor acknowledged action is accepted");
  const sourceRevalidationResult = {
    ...(await currentAction()).sourceRevalidationResult,
    resultId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId,
    acknowledgementId: acknowledgement.acknowledgementId,
    acknowledgementTemplateId: acknowledgement.acknowledgementTemplateId,
    checklistId: acknowledgement.checklistId,
    retryStage: "vendor_send" as const,
    workItemCorrelationId: acknowledgedActionResult.acknowledgedHostAction!.workItemCorrelationId,
    transferKey: acknowledgedActionResult.acknowledgedHostAction!.transferKey,
    sourceRefsTruncated: acknowledgedActionResult.acknowledgedHostAction!.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true as const,
      staleResolvedFileReused: false as const,
      hostOwned: true as const,
      colonyResolvedSource: false as const,
      rawSourceRefIncluded: false as const,
      resolvedFileHandleIncluded: false as const,
      fileBytesIncluded: false as const,
      privateUrlIncluded: false as const,
      credentialIncluded: false as const,
      persisted: false as const,
    })),
    requiresVendorStateCheck: true as const,
  };
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture vendor readiness is accepted");
  const credentialAcknowledgement = credentialAcknowledgementFor(readinessResult.credentialReadiness!);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const requestResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(requestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential-acknowledged manual reinvoke handoff is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.requiresVendorStateCheck, true, "vendor handoff preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.hostMustVerifyVendorStateBeforeSend, true, "vendor handoff requires vendor-state verification before host send");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.automaticVendorRetryAllowed, false, "vendor handoff still blocks automatic vendor retry");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.credentialPersistenceCreated, false, "vendor handoff creates no credential persistence");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.publicHostingEnabled, false, "vendor handoff enables no public hosting");
  assert(!containsForbiddenTruth(result), "vendor handoff leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedManualReinvokeRequestBlocksHandoff(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Manual Reinvoke Request Blocks Handoff");
  const truth = await currentAction();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered manual reinvoke request blocks handoff");
  assertEqual(result.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "handoff rejection preserves request-preflight reason");
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, "tampered handoff returns no handoff descriptor");
  assert(!containsForbiddenTruth(result), "tampered handoff rejection leaks no raw truth");
}

async function verifyCanonicalRequestTruthFlowsIntoHandoff(): Promise<void> {
  section("4. Manual Reinvoke Handoff Uses Recomputed Canonical Request Truth");
  const truth = await currentAction();
  const canonicalResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(canonicalResult.accepted, true, "canonical request handoff is accepted");
  const suppliedManualReinvokeRequest = {
    ...truth.credentialAcknowledgedManualReinvokeRequest,
    requiredCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: suppliedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive request handoff is accepted");
  assertEqual(
    result.credentialAcknowledgedManualReinvokeHandoff?.credentialAcknowledgedManualReinvokeHandoffId,
    canonicalResult.credentialAcknowledgedManualReinvokeHandoff?.credentialAcknowledgedManualReinvokeHandoffId,
    "handoff id is stable from recomputed request truth, not supplied label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs),
    "handoff returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets),
    "handoff returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs) !==
      JSON.stringify(suppliedManualReinvokeRequest.requiredCredentialRefs),
    "handoff does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized handoff leaks no raw truth");
}

async function verifyAcceptedCredentialAcknowledgedManualReinvokeRequestPreflight(): Promise<void> {
  section("1. Credential-Acknowledged Manual Reinvoke Request Preflight Accepts Current Truth");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  const request = result.credentialAcknowledgedManualReinvokeRequest;

  assertEqual(result.accepted, true, "current credential-acknowledged manual reinvoke request preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestResult.accepted, true, "preflight recomputes accepted request truth");
  assert(Boolean(request), "manual reinvoke request descriptor truth is returned");
  assertEqual(request?.requestKind, "external_media_transfer_credential_acknowledged_manual_reinvoke_request", "request kind is explicit");
  assertEqual(request?.manualReinvokeRequestMode, "host_owned_manual_reinvoke_after_credential_acknowledged_preflight", "request mode is explicit");
  assertEqual(request?.credentialAcknowledgedReplayActionId, truth.credentialAcknowledgedHostAction.credentialAcknowledgedReplayActionId, "request binds credential-acknowledged action id");
  assertEqual(request?.credentialAcknowledgementId, truth.credentialAcknowledgement.credentialAcknowledgementId, "request binds credential acknowledgement id");
  assertEqual(request?.transferKey, truth.credentialAcknowledgedHostAction.transferKey, "request binds transfer key");
  assertEqual(request?.sourceRefFingerprints.length, truth.credentialAcknowledgedHostAction.sourceRefFingerprints.length, "request carries fingerprint-only source set");
  assertEqual(request?.requiredCredentialRefs.length, truth.credentialAcknowledgedHostAction.requiredCredentialRefs.length, "request carries required credential labels only");
  assertEqual(request?.presentCredentialRefs.length, truth.credentialAcknowledgedHostAction.presentCredentialRefs.length, "request carries present credential labels only");
  assertEqual(request?.credentialAcknowledgedHostActionPreflightAccepted, true, "request records preflight acceptance");
  assertEqual(request?.credentialValuesIncluded, false, "request includes no credential values");
  assertEqual(request?.colonyExecutedHostHandler, false, "request executes no host handler");
  assertEqual(request?.colonyResolvedSources, false, "request resolves no sources");
  assertEqual(request?.credentialAcknowledgedManualReinvokeRequestPersisted, false, "request is not persisted");
  assertEqual(request?.retryWorkerCreated, false, "request creates no retry worker");
  assertEqual(request?.automaticVendorRetryAllowed, false, "request allows no automatic vendor retry");
  assertEqual(request?.defaultLiveDeliveryEnabled, false, "request enables no default live delivery");
  assertEqual(request?.credentialAcknowledgedManualReinvokeRequestTruth, "host_owned_manual_reinvoke_request_after_credential_acknowledged_preflight_no_execution_or_persistence", "request truth is explicit");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestIdMatched, true, "preflight matches request id");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.credentialValuesExcluded, true, "preflight proves credential values are excluded");
  assertEqual(result.manualReinvokeRequestStillNotExecuted, true, "preflight proves request is still not executed");
  assertEqual(result.persistenceStillBlocked, true, "preflight proves persistence is still blocked");
  assertEqual(result.retryWorkerStillBlocked, true, "preflight proves retry workers are still blocked");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "preflight proves default live delivery is still blocked");
  assertEqual(
    result.credentialAcknowledgedManualReinvokeRequestPreflightTruth,
    "recomputed_from_credential_acknowledged_host_action_preflight_and_supplied_manual_reinvoke_request_no_execution",
    "preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeRequestPreflightPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Manual Reinvoke Request Preflight Preserves Vendor-State Gate");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture vendor acknowledged action is accepted");
  const sourceRevalidationResult = {
    ...(await currentAction()).sourceRevalidationResult,
    resultId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId,
    acknowledgementId: acknowledgement.acknowledgementId,
    acknowledgementTemplateId: acknowledgement.acknowledgementTemplateId,
    checklistId: acknowledgement.checklistId,
    retryStage: "vendor_send" as const,
    workItemCorrelationId: acknowledgedActionResult.acknowledgedHostAction!.workItemCorrelationId,
    transferKey: acknowledgedActionResult.acknowledgedHostAction!.transferKey,
    sourceRefsTruncated: acknowledgedActionResult.acknowledgedHostAction!.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true as const,
      staleResolvedFileReused: false as const,
      hostOwned: true as const,
      colonyResolvedSource: false as const,
      rawSourceRefIncluded: false as const,
      resolvedFileHandleIncluded: false as const,
      fileBytesIncluded: false as const,
      privateUrlIncluded: false as const,
      credentialIncluded: false as const,
      persisted: false as const,
    })),
    requiresVendorStateCheck: true as const,
  };
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture vendor readiness is accepted");
  const credentialAcknowledgement = credentialAcknowledgementFor(readinessResult.credentialReadiness!);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const manualReinvokeRequestResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
      candidate,
      approval,
      workItem: item,
      sourceRevalidationChecklist: checklist,
      sourceRevalidationChecklistAcknowledgement: acknowledgement,
      sourceRevalidationResult,
      credentialAcknowledgement,
      credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(manualReinvokeRequestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: manualReinvokeRequestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential-acknowledged manual reinvoke request preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.requiresVendorStateCheck, true, "vendor request preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.vendorStateVerificationRequiredBeforeHostSend, true, "vendor request requires vendor-state verification before host send");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.automaticVendorRetryAllowed, false, "vendor request still blocks automatic vendor retry");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.credentialPersistenceCreated, false, "vendor request creates no credential persistence");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.publicHostingEnabled, false, "vendor request enables no public hosting");
  assertEqual(result.requiresVendorStateCheckMatched, true, "vendor preflight matches vendor-state gate");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "vendor preflight still blocks automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedCredentialAcknowledgedManualReinvokeRequestBlocksPreflight(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Manual Reinvoke Request Blocks Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered manual reinvoke request blocks preflight");
  assertEqual(result.reasonCode, "credential_acknowledged_manual_reinvoke_request_current_truth_mismatch", "tampered request rejection is bounded");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assert(result.credentialAcknowledgedManualReinvokeRequest === undefined, "tampered preflight returns no manual reinvoke request");
  assert(!containsForbiddenTruth(result), "tampered request rejection leaks no raw truth");
}

async function verifyManualReinvokeRequestPreflightUsesRecomputedCanonicalTruth(): Promise<void> {
  section("4. Manual Reinvoke Request Preflight Uses Recomputed Canonical Truth");
  const truth = await currentAction();
  const suppliedManualReinvokeRequest = {
    ...truth.credentialAcknowledgedManualReinvokeRequest,
    requiredCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: suppliedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive manual reinvoke request is accepted before later trust");
  assertEqual(result.requiredCredentialRefsMatched, true, "required credential labels match by set truth");
  assertEqual(result.presentCredentialRefsMatched, true, "present credential labels match by set truth");
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeRequest?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs),
    "request returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeRequest?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets),
    "request returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeRequest?.requiredCredentialRefs) !==
      JSON.stringify(suppliedManualReinvokeRequest.requiredCredentialRefs),
    "request does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized preflight leaks no raw truth");
}

async function verifyExecutionAndCredentialClaimsRejectedByManualReinvokeRequestPreflight(): Promise<void> {
  section("5. Execution And Credential Claims Reject In Manual Reinvoke Request Preflight");
  const truth = await currentAction();
  const executionResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(executionResult.accepted, false, "execution claim is rejected");
  assertEqual(executionResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "execution claim rejection is bounded");
  assert(executionResult.credentialAcknowledgedManualReinvokeRequest === undefined, "execution claim returns no manual reinvoke request");

  const credentialResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(credentialResult.accepted, false, "credential value claim is rejected");
  assertEqual(credentialResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "credential value claim rejection is bounded");
  assert(credentialResult.credentialAcknowledgedManualReinvokeRequest === undefined, "credential value claim returns no manual reinvoke request");

  const nestedRawSourceResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      sourceRefFingerprints: truth.credentialAcknowledgedManualReinvokeRequest.sourceRefFingerprints.map((source, index) => index === 0
        ? {
          ...source,
          rawSourceRef: "artifact:phase165_report_0",
          privateUrl: "https://files.slack.com/private?token=xoxb-phase164-secret",
        }
        : source),
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(nestedRawSourceResult.accepted, false, "nested raw source fields are rejected");
  assertEqual(nestedRawSourceResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "nested raw source rejection is bounded");
  assert(nestedRawSourceResult.credentialAcknowledgedManualReinvokeRequest === undefined, "nested raw source returns no manual reinvoke request");
  assert(!containsForbiddenTruth([executionResult, credentialResult, nestedRawSourceResult]), "invalid request rejections leak no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgedManualReinvokeRequestPreflight(): Promise<void> {
  section("6. Stale Approval Rejects Before Credential-Acknowledged Manual Reinvoke Request Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T16:13:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval request is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestResult.accepted, false, "stale approval rejects recomputed request");
  assert(result.credentialAcknowledgedManualReinvokeRequest === undefined, "stale approval returns no manual reinvoke request");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function currentVendorHandoff() {
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture vendor acknowledged action is accepted");
  const sourceRevalidationResult = {
    ...(await currentAction()).sourceRevalidationResult,
    resultId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId,
    acknowledgementId: acknowledgement.acknowledgementId,
    acknowledgementTemplateId: acknowledgement.acknowledgementTemplateId,
    checklistId: acknowledgement.checklistId,
    retryStage: "vendor_send" as const,
    workItemCorrelationId: acknowledgedActionResult.acknowledgedHostAction!.workItemCorrelationId,
    transferKey: acknowledgedActionResult.acknowledgedHostAction!.transferKey,
    sourceRefsTruncated: acknowledgedActionResult.acknowledgedHostAction!.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true as const,
      staleResolvedFileReused: false as const,
      hostOwned: true as const,
      colonyResolvedSource: false as const,
      rawSourceRefIncluded: false as const,
      resolvedFileHandleIncluded: false as const,
      fileBytesIncluded: false as const,
      privateUrlIncluded: false as const,
      credentialIncluded: false as const,
      persisted: false as const,
    })),
    requiresVendorStateCheck: true as const,
  };
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture vendor readiness is accepted");
  const credentialAcknowledgement = credentialAcknowledgementFor(readinessResult.credentialReadiness!);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const requestResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(requestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const handoffResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(handoffResult.accepted, true, "fixture vendor handoff is accepted");
  return {
    candidate,
    approval,
    item,
    checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest!,
    credentialAcknowledgedManualReinvokeHandoff: handoffResult.credentialAcknowledgedManualReinvokeHandoff!,
  };
}

function vendorStateVerificationFor(
  handoff: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
): {
  handoffId: string;
  transferKey: string;
  verifiedAt: string;
  verifiedBy: string;
  vendorStateVerificationTruth: "host_verified_vendor_state_before_manual_reinvoke_no_automatic_vendor_retry";
} {
  return {
    handoffId: handoff.credentialAcknowledgedManualReinvokeHandoffId,
    transferKey: handoff.transferKey,
    verifiedAt: "2026-05-08T17:05:00.000Z",
    verifiedBy: "operator",
    vendorStateVerificationTruth: "host_verified_vendor_state_before_manual_reinvoke_no_automatic_vendor_retry",
  };
}

async function verifyCredentialAcknowledgedManualReinvokeExecutesThroughExistingHostWorker(): Promise<void> {
  section("7. Credential-Acknowledged Manual Reinvoke Executes Through Existing Host Worker");
  const truth = await currentAction();
  let resolvedCount = 0;
  let sendCount = 0;
  const result = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        resolvedCount++;
        assertEqual(request.attemptNumber, 1, "manual reinvoke source resolution starts from a fresh first attempt");
        assertEqual(request.isRetryAttempt, false, "manual reinvoke does not reuse foreground retry context by default");
        return {
          sourceRefFingerprint: request.sourceRefFingerprint,
          sizeBytes: request.sizeBytes,
        };
      },
      sendToVendor: async (action) => {
        sendCount++;
        assertEqual(action.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "manual reinvoke sender receives current transfer key");
        return {
          accepted: true,
          transferKey: action.transferKey,
          deliveredCount: action.files.length,
          vendorMessageId: "phase165-message",
        };
      },
    }),
  });

  assertEqual(result.accepted, true, "manual reinvoke execution is accepted");
  assertEqual(result.hostExecutionAttempted, true, "host execution is attempted only after accepted handoff preflight");
  assertEqual(result.handoffPreflight.accepted, true, "execution recomputes accepted handoff preflight");
  assertEqual(result.hostResult?.isError, false, "existing host request path succeeds");
  assertEqual(result.hostResult?.data.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "host result preserves transfer key");
  assertEqual(result.hostResult?.data.transferKeyEchoMatched, true, "transfer-key echo integrity is preserved");
  assertEqual(result.hostResult?.data.credentialPersistenceCreated, false, "host result creates no credential persistence");
  assertEqual(result.hostResult?.data.defaultPublicHostingEnabled, false, "host result creates no public hosting");
  assertEqual(result.hostResult?.data.liveDeliveryEnabled, false, "host result enables no live delivery");
  assertEqual(resolvedCount, truth.credentialAcknowledgedManualReinvokeHandoff.sourceRefFingerprints.length, "manual reinvoke resolves each source freshly");
  assertEqual(sendCount, 1, "manual reinvoke delegates one vendor send to the injected host sender");
  assert(!containsForbiddenTruth(result), "manual reinvoke execution leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorStateMustBeVerifiedBeforeManualReinvokeExecution(): Promise<void> {
  section("8. Vendor-State Gate Blocks Manual Reinvoke Execution Until Host Verification");
  const truth = await currentVendorHandoff();
  let handlerCalled = false;
  const blocked = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: "unexpected" };
      },
    }),
  });
  assertEqual(blocked.accepted, false, "vendor manual reinvoke is blocked before vendor-state verification");
  assertEqual(blocked.reasonCode, "vendor_state_verification_required_before_manual_reinvoke", "vendor-state rejection is bounded");
  assertEqual(blocked.hostExecutionAttempted, false, "vendor-state rejection does not call host handler");
  assertEqual(handlerCalled, false, "handler is not called before vendor-state verification");

  const forgedVerification = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: {
      ...vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => {
        handlerCalled = true;
        return { accepted: true, transferKey: "unexpected" };
      },
    }),
  });
  assertEqual(forgedVerification.accepted, false, "forged vendor-state verification is blocked");
  assertEqual(forgedVerification.reasonCode, "vendor_state_verification_required_before_manual_reinvoke", "forged vendor-state rejection is bounded");
  assertEqual(forgedVerification.hostExecutionAttempted, false, "forged vendor-state rejection does not call host handler");
  assertEqual(handlerCalled, false, "handler is still not called after forged vendor-state verification");

  const executed = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
      }),
    }),
  });
  assertEqual(executed.accepted, true, "vendor manual reinvoke executes after explicit vendor-state verification");
  assertEqual(executed.vendorStateVerified, true, "execution result records host vendor-state verification");
  assertEqual(executed.hostResult?.isError, false, "verified vendor manual reinvoke succeeds through existing host request path");
  assert(!containsForbiddenTruth([blocked, forgedVerification, executed]), "vendor manual reinvoke results leak no raw truth");
}

async function verifyManualReinvokeExecutionFailsClosedForMissingHandlerAndTampering(): Promise<void> {
  section("9. Manual Reinvoke Execution Fails Closed For Missing Handler And Tampering");
  const truth = await currentAction();
  const missingHandler = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(missingHandler.accepted, false, "missing handler blocks manual reinvoke execution");
  assertEqual(missingHandler.reasonCode, "manual_reinvoke_handler_required", "missing handler rejection is bounded");
  assertEqual(missingHandler.hostExecutionAttempted, false, "missing handler does not attempt execution");

  let rawHandlerCalled = false;
  const rawHandler = (async () => {
    rawHandlerCalled = true;
    return { accepted: true, transferKey: "unexpected" };
  }) as unknown as ExternalChannelMediaTransferManualReinvokeWorkerHandler;
  const unmarkedHandler = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: rawHandler,
  });
  assertEqual(unmarkedHandler.accepted, false, "unmarked handler blocks manual reinvoke execution");
  assertEqual(unmarkedHandler.reasonCode, "manual_reinvoke_worker_handler_required", "unmarked handler rejection is bounded");
  assertEqual(unmarkedHandler.hostExecutionAttempted, false, "unmarked handler does not attempt execution");
  assertEqual(rawHandlerCalled, false, "raw handler is not called before manual reinvoke execution");

  let forgedHandlerCalled = false;
  const forgedHandler = (async () => {
    forgedHandlerCalled = true;
    return { accepted: true, transferKey: "unexpected" };
  }) as unknown as ExternalChannelMediaTransferManualReinvokeWorkerHandler;
  Object.defineProperty(forgedHandler, "manualReinvokeExecutionHandlerTruth", {
    value: "foreground_worker_handler_resolves_sources_freshly_before_vendor_send",
    enumerable: false,
  });
  const forgedHandlerResult = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: forgedHandler,
  });
  assertEqual(forgedHandlerResult.accepted, false, "forged handler marker blocks manual reinvoke execution");
  assertEqual(forgedHandlerResult.reasonCode, "manual_reinvoke_worker_handler_required", "forged handler marker rejection is bounded");
  assertEqual(forgedHandlerResult.hostExecutionAttempted, false, "forged handler marker does not attempt execution");
  assertEqual(forgedHandlerCalled, false, "forged handler is not called before manual reinvoke execution");

  const tamperedHandoff = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({ accepted: true, transferKey: "unexpected" }),
    }),
  });
  assertEqual(tamperedHandoff.accepted, false, "tampered handoff blocks manual reinvoke execution");
  assertEqual(tamperedHandoff.reasonCode, "credential_acknowledged_manual_reinvoke_handoff_current_truth_mismatch", "tampered handoff rejection is bounded");
  assertEqual(tamperedHandoff.hostExecutionAttempted, false, "tampered handoff does not attempt execution");
  assert(!containsForbiddenTruth([missingHandler, unmarkedHandler, forgedHandlerResult, tamperedHandoff]), "manual reinvoke execution rejections leak no raw truth");
}

async function verifyManualReinvokeExecutionRejectsCredentialAndExecutionClaims(): Promise<void> {
  section("10. Manual Reinvoke Execution Rejects Credential And Execution Claims");
  const truth = await currentAction();
  const executionClaim = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({ accepted: true, transferKey: "unexpected" }),
    }),
  });
  assertEqual(executionClaim.accepted, false, "execution claim is rejected before handler execution");
  assertEqual(executionClaim.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "execution claim rejection is bounded");
  assertEqual(executionClaim.hostExecutionAttempted, false, "execution claim does not call handler");

  const credentialClaim = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({ accepted: true, transferKey: "unexpected" }),
    }),
  });
  assertEqual(credentialClaim.accepted, false, "credential claim is rejected before handler execution");
  assertEqual(credentialClaim.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "credential claim rejection is bounded");
  assertEqual(credentialClaim.hostExecutionAttempted, false, "credential claim does not call handler");
  assert(!containsForbiddenTruth([executionClaim, credentialClaim]), "manual reinvoke execution claim rejections leak no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 165 Verification (External Media Transfer Credential-Acknowledged Manual Reinvoke Execution)\n");
  await verifyAcceptedCredentialAcknowledgedManualReinvokeHandoffPreflight();
  await verifyVendorManualReinvokeHandoffPreflightPreservesVendorStateGate();
  await verifyTamperedCredentialAcknowledgedManualReinvokeHandoffBlocksPreflight();
  await verifyManualReinvokeHandoffPreflightUsesRecomputedCanonicalTruth();
  await verifyExecutionAndCredentialClaimsRejectedByManualReinvokeHandoffPreflight();
  await verifyStaleApprovalRejectedBeforeCredentialAcknowledgedManualReinvokeHandoffPreflight();
  await verifyCredentialAcknowledgedManualReinvokeExecutesThroughExistingHostWorker();
  await verifyVendorStateMustBeVerifiedBeforeManualReinvokeExecution();
  await verifyManualReinvokeExecutionFailsClosedForMissingHandlerAndTampering();
  await verifyManualReinvokeExecutionRejectsCredentialAndExecutionClaims();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 165: external media transfer credential-acknowledged manual reinvoke execution is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


