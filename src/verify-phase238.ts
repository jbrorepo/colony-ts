/**
 * Phase 238 Verification Script - Plugin Registry Fetch Execution Receipt
 *
 * Proves an approved registry metadata handoff can be executed only through an
 * injected host executor, records a redacted receipt, validates package
 * identity, and still performs no Colony-owned network request or credential
 * persistence.
 *
 * Run: bun run src/verify-phase238.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createApprovedPluginPackageRegistryFetchHandoff,
  executeApprovedPluginPackageRegistryFetch,
  type PluginPackageRegistryFetchApproval,
  type PluginPackageRegistryFetchCandidate,
  type PluginPackageRegistryFetchExecutor,
} from "./mcp";

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
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function candidate(overrides: Partial<PluginPackageRegistryFetchCandidate> = {}): PluginPackageRegistryFetchCandidate {
  return {
    packageName: "@colony/plugin-phase238",
    packageVersion: "12.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase238.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    registryUrl: "https://registry.example.com/plugins/phase238",
    reason: "operator requested registry execution SHOULD_NOT_LEAK_TOKEN_DETAIL",
    ...overrides,
  };
}

function approval(
  request: { signature: string },
  overrides: Partial<PluginPackageRegistryFetchApproval> = {},
): PluginPackageRegistryFetchApproval {
  return {
    approved: true,
    signature: request.signature,
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "registry execution approved SHOULD_NOT_LEAK_TOKEN_DETAIL",
    ...overrides,
  };
}

function metadataBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    packageName: "@colony/plugin-phase238",
    packageVersion: "12.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase238.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    registryUrl: "https://registry.example.com/plugins/phase238",
    fetchedAt: "2026-05-13T06:04:00.000Z",
    integrity: "sha256-abababababababababababababababababababababababababababababababab",
    signatures: [
      {
        keyId: "phase238-root",
        algorithm: "sigstore-bundle",
        signature: "SHOULD_NOT_LEAK_SIGNATURE_BODY",
      },
    ],
    ...overrides,
  });
}

function readyHandoff() {
  const fixture = candidate();
  const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);
  const approved = approval(request);
  return {
    handoff: createApprovedPluginPackageRegistryFetchHandoff({
      candidate: fixture,
      approval: approved,
      timestamp: "2026-05-13T06:04:00.000Z",
    }),
    approval: approved,
  };
}

async function verifyApprovedExecutionReceipt(): Promise<void> {
  section("1. Approved Handoff Executes Through Injected Host Executor");

  const { handoff, approval: approved } = readyHandoff();
  const calls: unknown[] = [];
  const executor: PluginPackageRegistryFetchExecutor = async (request) => {
    calls.push(request);
    return {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      bodyText: metadataBody(),
    };
  };
  const receipt = await executeApprovedPluginPackageRegistryFetch({
    handoff,
    approval: approved,
    executor,
    timestamp: "2026-05-13T06:05:00.000Z",
  });

  assertEqual(calls.length, 1, "Executor is called exactly once after approval");
  assertEqual(receipt.status, "completed", "Receipt records completed status");
  assertEqual(receipt.registryFetched, true, "Receipt records host registry fetch completion");
  assertEqual(receipt.hostNetworkExecuted, true, "Receipt records host-owned network execution");
  assertEqual(receipt.colonyNetworkExecuted, false, "Receipt records no Colony-owned network execution");
  assertEqual(receipt.credentialsPersisted, false, "Receipt persists no credentials");
  assertEqual(receipt.packageExecuted, false, "Receipt executes no package code");
  assertEqual(receipt.activation, false, "Receipt activates no sidecars");
  assertEqual(receipt.catalogMutated, false, "Receipt mutates no plugin catalog");
  assertEqual(receipt.metadata?.packageName, "@colony/plugin-phase238", "Receipt binds metadata package name");
  assertEqual(receipt.metadata?.checksum.digest, "sha256:abababababa...abababab", "Receipt bounds metadata digest");
  assertEqual(receipt.metadata?.signatures[0]?.signature, "<redacted>", "Receipt redacts raw signature body");
  assertEqual(receipt.hostAction.registryUrl, "https://registry.example.com/plugins/phase238", "Receipt retains safe registry URL");

  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Receipt redacts secret-like approval and metadata bodies");
  assert(!serialized.includes("plugins.example.com"), "Receipt redacts package source URL");
}

async function verifyApprovalBlocksBeforeExecution(): Promise<void> {
  section("2. Missing and Wrong Approval Block Before Executor");

  const { handoff, approval: approved } = readyHandoff();
  let calls = 0;
  const executor: PluginPackageRegistryFetchExecutor = () => {
    calls++;
    return { status: 200, headers: { "content-type": "application/json" }, bodyText: metadataBody() };
  };

  const missing = await executeApprovedPluginPackageRegistryFetch({
    handoff,
    approval: { approved: false, signature: approved.signature },
    executor,
    timestamp: "2026-05-13T06:06:00.000Z",
  });
  assertEqual(missing.status, "blocked", "Missing approval blocks receipt");
  assertEqual(missing.blockedReason, "approval_required", "Missing approval reason is explicit");
  assertEqual(calls, 0, "Missing approval never calls executor");

  const wrong = await executeApprovedPluginPackageRegistryFetch({
    handoff,
    approval: { approved: true, signature: "mcp-registry-fetch:000000000000000000000000" },
    executor,
    timestamp: "2026-05-13T06:07:00.000Z",
  });
  assertEqual(wrong.status, "blocked", "Wrong approval blocks receipt");
  assertEqual(wrong.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(calls, 0, "Wrong approval never calls executor");
}

async function verifyBlockedHandoffDoesNotExecute(): Promise<void> {
  section("3. Blocked Handoff Does Not Execute");

  const fixture = candidate({ registryUrl: "https://localhost/plugins/phase238" });
  const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);
  const handoff = createApprovedPluginPackageRegistryFetchHandoff({
    candidate: fixture,
    approval: approval(request),
    timestamp: "2026-05-13T06:08:00.000Z",
  });
  let calls = 0;
  const receipt = await executeApprovedPluginPackageRegistryFetch({
    handoff,
    approval: approval(request),
    executor: () => {
      calls++;
      return { status: 200, headers: { "content-type": "application/json" }, bodyText: metadataBody() };
    },
  });

  assertEqual(handoff.status, "blocked", "Fixture handoff starts blocked");
  assertEqual(receipt.status, "blocked", "Blocked handoff yields blocked receipt");
  assertEqual(receipt.blockedReason, "handoff_not_ready", "Blocked handoff reason is explicit");
  assertEqual(calls, 0, "Blocked handoff never calls executor");
}

async function verifyExecutorFailureAndMetadataValidation(): Promise<void> {
  section("4. Executor and Metadata Failures Are Redacted and Non-Mutating");

  const { handoff, approval: approved } = readyHandoff();
  const cases: Array<{
    label: string;
    executor: PluginPackageRegistryFetchExecutor;
    reason: string;
  }> = [
    {
      label: "HTTP status",
      executor: () => ({ status: 500, headers: { "content-type": "application/json" }, bodyText: metadataBody() }),
      reason: "http_status_rejected",
    },
    {
      label: "content type",
      executor: () => ({ status: 200, headers: { "content-type": "text/plain" }, bodyText: metadataBody() }),
      reason: "content_type_rejected",
    },
    {
      label: "oversized response",
      executor: () => ({ status: 200, headers: { "content-type": "application/json" }, bodyText: "x".repeat(handoff.hostAction.maxResponseBytes + 1) }),
      reason: "oversized_response",
    },
    {
      label: "invalid JSON",
      executor: () => ({ status: 200, headers: { "content-type": "application/json" }, bodyText: "{not json SHOULD_NOT_LEAK}" }),
      reason: "invalid_metadata_json",
    },
    {
      label: "metadata mismatch",
      executor: () => ({ status: 200, headers: { "content-type": "application/json" }, bodyText: metadataBody({ packageName: "@colony/other" }) }),
      reason: "metadata_identity_mismatch",
    },
  ];

  for (const item of cases) {
    const receipt = await executeApprovedPluginPackageRegistryFetch({
      handoff,
      approval: approved,
      executor: item.executor,
      timestamp: "2026-05-13T06:09:00.000Z",
    });
    assertEqual(receipt.status, "failed", `${item.label} failure records failed status`);
    assertEqual(receipt.blockedReason, item.reason as never, `${item.label} reason is explicit`);
    assertEqual(receipt.catalogMutated, false, `${item.label} mutates no catalog`);
    assertEqual(receipt.packageExecuted, false, `${item.label} executes no package code`);
    assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), `${item.label} failure redacts unsafe body`);
  }
}

async function verifyNoBuiltInNetworkPrimitive(): Promise<void> {
  section("5. Runtime Uses No Built-In Network Primitive");

  const source = await Bun.file("src/mcp/plugin-package-registry-fetch-execution.ts").text();
  assert(!source.includes("fetch("), "Registry execution receipt runtime contains no direct network call");
  assert(source.includes("PluginPackageRegistryFetchExecutor"), "Runtime depends on injected executor type");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 238 Verification (Plugin Registry Fetch Execution Receipt)\n");

  await verifyApprovedExecutionReceipt();
  await verifyApprovalBlocksBeforeExecution();
  await verifyBlockedHandoffDoesNotExecute();
  await verifyExecutorFailureAndMetadataValidation();
  await verifyNoBuiltInNetworkPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 238 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 238: plugin registry fetch execution receipt is GREEN.");
}

run().catch((error) => {
  console.error("Phase 238 verification crashed:", error);
  process.exit(1);
});
