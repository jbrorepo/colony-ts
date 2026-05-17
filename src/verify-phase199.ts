/** Phase 199 Verification - Retry-Control Closeout Record Persistence Preflight */

import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistenceStore,
} from "./channel";
import { containsForbiddenTruth } from "./verify-phase188";
import { invocationExecutionReceiptFixture } from "./verify-phase192";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(
    actual === expected,
    `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}
function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

function fileRefs(prefix = "phase199_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-199-media-${index}.pdf`,
    title: `Phase 199 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 8192 + index,
    checksumSha256: `${(index + 5).toString(16)}`.repeat(64),
  }));
}

async function recordPlanFixture(prefix: string) {
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs(prefix) });
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout(fixture);
  assertEqual(closeoutResult.accepted, true, "fixture retry-control worker invocation execution receipt closeout is accepted");
  assert(Boolean(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout), "fixture receipt closeout descriptor is returned");
  const withCloseout = {
    ...fixture,
    retryControlWorkerInvocationExecutionReceiptCloseout:
      closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout!,
  };
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan(
      withCloseout,
    );
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  assert(Boolean(recordPlanResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan), "fixture closeout record plan descriptor is returned");
  return {
    ...withCloseout,
    retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan:
      recordPlanResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan!,
  };
}

async function createCloseoutRecordStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase199-closeout-record-preflight-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const store = await createCloseoutRecordStore();
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T04:28:18.000Z",
      persistedBy: "operator",
    });
  assertEqual(persisted.accepted, true, "fixture closeout record is persisted");
  assert(Boolean(persisted.retryControlWorkerInvocationExecutionReceiptCloseoutRecord), "fixture persisted closeout record is returned");
  return {
    fixture,
    persistedRecord:
      persisted.retryControlWorkerInvocationExecutionReceiptCloseoutRecord as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  };
}

async function verifyTrustedCloseoutRecordPersistencePreflight(): Promise<void> {
  section("1. Trusted Retry-Control Closeout Record Persistence Preflight Recomputes Current Truth");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase199_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
    });

  assertEqual(preflight.accepted, true, "trusted supplied closeout record persistence preflight is accepted");
  assert(Boolean(preflight.retryControlWorkerInvocationExecutionReceiptCloseoutRecord), "preflight returns recomputed closeout record persistence");
  assertEqual(preflight.closeoutRecordPersistenceIdMatched, true, "persistence id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseoutRecordIdMatched, true, "draft closeout record id matches");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanIdMatched, true, "record-plan id matches");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseoutIdMatched, true, "closeout id matches");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptIdMatched, true, "execution receipt id matches");
  assertEqual(preflight.retryControlWorkerInvocationHandoffIdMatched, true, "worker invocation handoff id matches");
  assertEqual(preflight.retryControlWorkerHandlerReadinessIdMatched, true, "handler readiness id matches");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "worker selection id matches");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, true, "operator handoff id matches");
  assertEqual(preflight.manualRetryControlReadinessPlanIdMatched, true, "readiness plan id matches");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, true, "retry ledger entry id matches");
  assertEqual(preflight.channelIdMatched, true, "channel id matches");
  assertEqual(preflight.targetKindMatched, true, "target kind matches");
  assertEqual(preflight.retryStageMatched, true, "retry stage matches");
  assertEqual(preflight.workItemCorrelationMatched, true, "work-item correlation matches");
  assertEqual(preflight.transferKeyMatched, true, "transfer key matches");
  assertEqual(preflight.sourceRefsTruncatedMatched, true, "source truncation truth matches");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "source fingerprints match");
  assertEqual(preflight.targetCorrelationMatched, true, "target fingerprint matches");
  assertEqual(preflight.revalidatedSourceCountMatched, true, "source count matches");
  assertEqual(preflight.vendorStateVerifiedMatched, true, "vendor-state truth matches");
  assertEqual(preflight.hostReportedDeliveredCountMatched, true, "host delivered count matches");
  assertEqual(preflight.hostReceiptMetadataIncludedMatched, true, "host receipt metadata truth matches");
  assertEqual(preflight.persistedAtMatched, true, "persisted timestamp matches");
  assertEqual(preflight.persistedByMatched, true, "persisted actor matches");
  assertEqual(preflight.closeoutRecordPersistenceStillTrusted, true, "supplied closeout record is trusted");
  assertEqual(preflight.recordPlanPreflightAccepted, true, "record-plan preflight acceptance remains true");
  assertEqual(preflight.durableCloseoutRecordReady, true, "durable closeout record remains ready");
  assertEqual(preflight.closeoutRecordPersisted, true, "closeout record persistence remains true");
  assertEqual(preflight.manualRetryWorkItemClosedByColony, false, "preflight does not close work item");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptPersisted, false, "preflight persists no execution receipt");
  assertEqual(preflight.retryLedgerEntryAlreadyPersisted, true, "preflight preserves existing retry-ledger truth");
  assertEqual(preflight.durableRetryAuditRecordAlreadyPersisted, true, "preflight preserves existing durable-audit truth");
  assertEqual(preflight.retryLedgerCreatedByCloseoutRecord, false, "preflight creates no retry ledger");
  assertEqual(preflight.durableRetryAuditRecordCreatedByCloseoutRecord, false, "preflight creates no durable audit");
  assertEqual(preflight.retryWorkerStillBlocked, true, "preflight keeps retry worker blocked");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "preflight keeps automatic vendor retry blocked");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "preflight keeps default live delivery blocked");
  assertEqual(preflight.publicHostingStillBlocked, true, "preflight keeps public hosting blocked");
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistencePreflightTruth,
    "recomputed_from_trusted_retry_control_closeout_record_persistence_and_supplied_closeout_record_no_work_item_closure",
    "preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(preflight), "trusted closeout record persistence preflight leaks no raw truth");
}

async function verifyTamperedCloseoutRecordPersistencePreflightRejects(): Promise<void> {
  section("2. Tampered Retry-Control Closeout Record Persistence Preflight Rejects Current Truth Mismatch");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase199_tampered");
  const tampered = {
    ...persistedRecord,
    hostReportedDeliveredCount: Math.max(0, persistedRecord.hostReportedDeliveredCount - 1),
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: tampered,
    });

  assertEqual(preflight.accepted, false, "tampered closeout record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_manual_retry_control_closeout_record_persistence_current_truth_mismatch",
    "tampered rejection is bounded",
  );
  assertEqual(preflight.hostReportedDeliveredCountMatched, false, "tampered delivered count mismatch is surfaced");
  assertEqual(preflight.closeoutRecordPersistenceStillTrusted, false, "tampered copied object is not trusted");
  assertEqual(preflight.retryWorkerCreated, false, "tampered preflight creates no retry worker");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "tampered preflight enables no default live delivery");
  assert(!containsForbiddenTruth(preflight), "tampered closeout record persistence preflight leaks no raw truth");
}

async function verifyCopiedCloseoutRecordPersistencePreflightRejects(): Promise<void> {
  section("3. Copied Retry-Control Closeout Record Persistence Preflight Rejects Untrusted Object");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase199_copied");
  const copied = JSON.parse(JSON.stringify(persistedRecord));

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: copied,
    });

  assertEqual(preflight.accepted, false, "copied closeout record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_trusted_retry_control_closeout_record_persistence_required",
    "untrusted copy rejection is bounded",
  );
  assertEqual(preflight.closeoutRecordPersistenceStillTrusted, false, "copied closeout record is not trusted");
  assertEqual(preflight.closeoutRecordPersistenceIdMatched, true, "copied record can match truth but still fail trust");
  assertEqual(preflight.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "copied preflight allows no automatic vendor retry");
  assert(!containsForbiddenTruth(preflight), "copied closeout record persistence preflight leaks no raw truth");
}

async function verifyAppendFailedCloseoutRecordPersistencePreflightRejects(): Promise<void> {
  section("4. Append-Failed Retry-Control Closeout Record Persistence Preflight Rejects Untrusted Pending Object");
  const fixture = await recordPlanFixture("phase199_append_failed");
  let captured:
    | ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence
    | undefined;
  const failingStore: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistenceStore = {
    appendCloseoutRecords: async (records) => {
      captured = records[0];
      throw new Error("append failed after object construction");
    },
    loadCloseoutRecords: async () => [],
  };
  const appendFailure =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: failingStore,
      persistedAt: "2026-05-09T04:28:18.000Z",
      persistedBy: "operator",
    });
  assertEqual(appendFailure.accepted, false, "fixture append failure is rejected");
  assert(Boolean(captured), "append failure captures constructed pending closeout record");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: captured,
    });

  assertEqual(preflight.accepted, false, "append-failed closeout record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_trusted_retry_control_closeout_record_persistence_required",
    "append-failed object rejection is bounded by trust gate",
  );
  assertEqual(preflight.closeoutRecordPersistenceStillTrusted, false, "append-failed pending object is not trusted");
  assertEqual(preflight.closeoutRecordPersistenceIdMatched, true, "append-failed object can match truth but still fail trust");
  assertEqual(preflight.retryWorkerCreated, false, "append-failed preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "append-failed preflight creates no retry schedule");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "append-failed preflight enables no default live delivery");
  assert(!containsForbiddenTruth([appendFailure, preflight]), "append-failed closeout record persistence preflight leaks no raw truth");
}

async function verifyContaminatedCloseoutRecordPersistencePreflightRejects(): Promise<void> {
  section("5. Contaminated Retry-Control Closeout Record Persistence Preflight Rejects Unsafe Flags");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase199_contaminated");
  const contaminations: Array<{
    label: string;
    patch: Partial<Record<keyof ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence, unknown>>;
    assertBlocked: (preflight: Awaited<ReturnType<typeof preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence>>) => void;
  }> = [
    {
      label: "work item closure",
      patch: { manualRetryWorkItemClosedByColony: true },
      assertBlocked: (preflight) => assertEqual(preflight.closeoutRecordPersisted, false, "contaminated closure claim blocks persistence truth"),
    },
    {
      label: "receipt persistence",
      patch: { retryControlWorkerInvocationExecutionReceiptPersisted: true },
      assertBlocked: (preflight) => assertEqual(preflight.credentialPersistenceStillBlocked, true, "receipt-persistence contamination keeps credential persistence blocked"),
    },
    {
      label: "new retry ledger",
      patch: { retryLedgerCreatedByCloseoutRecord: true },
      assertBlocked: (preflight) => assertEqual(preflight.retryLedgerStillBlocked, false, "contaminated retry-ledger claim is surfaced"),
    },
    {
      label: "new durable audit",
      patch: { durableRetryAuditRecordCreatedByCloseoutRecord: true },
      assertBlocked: (preflight) => assertEqual(preflight.durableRetryAuditStillBlocked, false, "contaminated durable-audit claim is surfaced"),
    },
    {
      label: "credential persistence",
      patch: { credentialPersistenceCreated: true },
      assertBlocked: (preflight) => assertEqual(preflight.credentialPersistenceStillBlocked, false, "contaminated credential-persistence claim is surfaced"),
    },
    {
      label: "default live delivery",
      patch: { defaultLiveDeliveryEnabled: true },
      assertBlocked: (preflight) => assertEqual(preflight.defaultLiveDeliveryStillBlocked, false, "contaminated default live delivery claim is surfaced"),
    },
    {
      label: "public hosting",
      patch: { publicHostingEnabled: true },
      assertBlocked: (preflight) => assertEqual(preflight.publicHostingStillBlocked, false, "contaminated public hosting claim is surfaced"),
    },
    {
      label: "background retry",
      patch: { backgroundRetryCreated: true },
      assertBlocked: (preflight) => assertEqual(preflight.retryWorkerStillBlocked, false, "contaminated background retry claim is surfaced"),
    },
    {
      label: "retry worker",
      patch: { retryWorkerCreated: true },
      assertBlocked: (preflight) => assertEqual(preflight.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced"),
    },
    {
      label: "retry schedule",
      patch: { retryScheduleCreated: true },
      assertBlocked: (preflight) => assertEqual(preflight.retryWorkerStillBlocked, false, "contaminated retry-schedule claim is surfaced"),
    },
    {
      label: "automatic vendor retry",
      patch: { automaticVendorRetryAllowed: true },
      assertBlocked: (preflight) => assertEqual(preflight.automaticVendorRetryStillBlocked, false, "contaminated automatic vendor retry claim is surfaced"),
    },
  ];

  for (const contamination of contaminations) {
    const contaminated = {
      ...persistedRecord,
      ...contamination.patch,
    };
    const preflight =
      await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence({
        ...fixture,
        retryControlWorkerInvocationExecutionReceiptCloseoutRecord: contaminated,
      });

    assertEqual(preflight.accepted, false, `${contamination.label} contamination is rejected`);
    assertEqual(
      preflight.reasonCode,
      "valid_external_media_transfer_manual_retry_control_closeout_record_persistence_required",
      `${contamination.label} contamination rejection is bounded`,
    );
    contamination.assertBlocked(preflight);
    assertEqual(preflight.retryWorkerCreated, false, `${contamination.label} contamination creates no retry worker`);
    assertEqual(preflight.automaticVendorRetryAllowed, false, `${contamination.label} contamination allows no automatic vendor retry`);
    assert(!containsForbiddenTruth(preflight), `${contamination.label} contaminated preflight leaks no raw truth`);
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 199 Verification (Retry-Control Closeout Record Persistence Preflight)\n");
  await verifyTrustedCloseoutRecordPersistencePreflight();
  await verifyTamperedCloseoutRecordPersistencePreflightRejects();
  await verifyCopiedCloseoutRecordPersistencePreflightRejects();
  await verifyAppendFailedCloseoutRecordPersistencePreflightRejects();
  await verifyContaminatedCloseoutRecordPersistencePreflightRejects();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 199: retry-control closeout record persistence preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
