/**
 * Phase 237 Verification Script - Plugin Registry Host/Network Boundary
 *
 * Proves live plugin registry metadata fetch is represented as an explicit
 * approval-gated host handoff before any network execution exists in Colony.
 *
 * Run: bun run src/verify-phase237.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createApprovedPluginPackageRegistryFetchHandoff,
  pluginPackageRegistryFetchSignature,
  type PluginPackageRegistryFetchApproval,
  type PluginPackageRegistryFetchCandidate,
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
    packageName: "@colony/plugin-phase237",
    packageVersion: "11.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase237.tgz",
    packageDigest: "sha256:1212121212121212121212121212121212121212121212121212121212121212",
    registryUrl: "https://registry.example.com/plugins/phase237",
    reason: "operator requested metadata refresh SHOULD_NOT_LEAK_TOKEN_DETAIL",
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
    reason: "registry fetch approved SHOULD_NOT_LEAK_TOKEN_DETAIL",
    ...overrides,
  };
}

function verifyApprovalRequestAndSignature(): void {
  section("1. Registry Fetch Approval Request Is Exact and Redacted");

  const fixture = candidate();
  const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);
  const signature = pluginPackageRegistryFetchSignature(fixture);

  assertEqual(request.valid, true, "Safe candidate produces valid approval request");
  assertEqual(request.signature, signature, "Approval request signature matches canonical helper");
  assertEqual(request.riskLevel, "high", "Registry network handoff is high risk");
  assert(request.warnings.some((warning) => warning.includes("No network request has been executed")), "Request states no network execution");
  assert(request.warnings.some((warning) => warning.includes("host-owned")), "Request states host-owned boundary");
  assertEqual(request.package.source, "<redacted>", "Approval request redacts package source");
  assertEqual(request.package.digest, "sha256:12121212121...12121212", "Approval request bounds digest");

  const serialized = JSON.stringify(request);
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Approval request redacts secret-like reason text");
  assert(!serialized.includes("plugins.example.com"), "Approval request does not echo package source URL");
}

function verifyApprovedHandoff(): void {
  section("2. Approved Handoff Does Not Execute Network");

  const fixture = candidate();
  const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);
  const handoff = createApprovedPluginPackageRegistryFetchHandoff({
    candidate: fixture,
    approval: approval(request),
    timestamp: "2026-05-13T05:45:00.000Z",
  });

  assertEqual(handoff.status, "ready", "Approved handoff is ready for host execution");
  assertEqual(handoff.registryFetched, false, "Handoff performs no registry fetch");
  assertEqual(handoff.networkExecuted, false, "Handoff performs no network execution");
  assertEqual(handoff.credentialsPersisted, false, "Handoff persists no credentials");
  assertEqual(handoff.packageExecuted, false, "Handoff executes no package code");
  assertEqual(handoff.activation, false, "Handoff activates no sidecars");
  assertEqual(handoff.hostActionRequired, true, "Handoff requires host action");
  assertEqual(handoff.hostAction.type, "fetch_plugin_registry_metadata", "Host action type is explicit");
  assertEqual(handoff.hostAction.method, "GET", "Host action is read-only GET metadata fetch");
  assertEqual(handoff.hostAction.registryUrl, "https://registry.example.com/plugins/phase237", "Safe registry URL is retained for host");
  assertEqual(handoff.expectedMetadata.packageName, "@colony/plugin-phase237", "Expected metadata binds package name");
  assertEqual(handoff.expectedMetadata.packageDigest, "sha256:12121212121...12121212", "Expected metadata binds digest summary");

  const serialized = JSON.stringify(handoff);
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Handoff redacts approval reason and actor secrets");
  assert(!serialized.includes("plugins.example.com"), "Handoff redacts package source URL");
  assert(!serialized.includes("fetch("), "Handoff contains no executable fetch code");
}

function verifyApprovalBlocks(): void {
  section("3. Missing and Wrong Approval Block Before Handoff");

  const fixture = candidate();
  const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);

  const missing = createApprovedPluginPackageRegistryFetchHandoff({
    candidate: fixture,
    approval: { approved: false, signature: request.signature },
    timestamp: "2026-05-13T05:46:00.000Z",
  });
  assertEqual(missing.status, "blocked", "Missing approval blocks handoff");
  assertEqual(missing.blockedReason, "approval_required", "Missing approval reason is explicit");
  assertEqual(missing.networkExecuted, false, "Missing approval performs no network execution");

  const wrong = createApprovedPluginPackageRegistryFetchHandoff({
    candidate: fixture,
    approval: approval(request, { signature: "mcp-registry-fetch:000000000000000000000000" }),
    timestamp: "2026-05-13T05:47:00.000Z",
  });
  assertEqual(wrong.status, "blocked", "Wrong approval signature blocks handoff");
  assertEqual(wrong.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(wrong.networkExecuted, false, "Wrong approval performs no network execution");
}

function verifyUnsafeRegistryUrlsBlock(): void {
  section("4. Unsafe Registry URLs Block and Redact");

  const unsafeUrls = [
    "http://registry.example.com/plugins/phase237",
    "https://token:SHOULD_NOT_LEAK@registry.example.com/plugins/phase237",
    "https://localhost/plugins/phase237",
    "https://127.0.0.1/plugins/phase237",
    "https://169.254.169.254/latest/meta-data",
    "https://metadata.google.internal/computeMetadata/v1",
    "https://registry.example.com/plugins/phase237?token=SHOULD_NOT_LEAK",
  ];

  for (const url of unsafeUrls) {
    const fixture = candidate({ registryUrl: url });
    const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);
    const handoff = createApprovedPluginPackageRegistryFetchHandoff({
      candidate: fixture,
      approval: approval({ signature: request.signature }),
      timestamp: "2026-05-13T05:48:00.000Z",
    });

    assertEqual(request.valid, false, `Unsafe URL rejected in approval request: ${url.split("?")[0]}`);
    assertEqual(handoff.status, "blocked", `Unsafe URL blocks handoff: ${url.split("?")[0]}`);
    assertEqual(handoff.blockedReason, "unsafe_registry_url", "Unsafe URL reason is explicit");
    assertEqual(handoff.hostAction.registryUrl, "<redacted>", "Unsafe URL is redacted from host action");
    assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Unsafe handoff redacts URL credentials/query secrets");
  }
}

function verifyCandidateTamperBlocks(): void {
  section("5. Candidate Tamper Changes Signature and Blocks");

  const fixture = candidate();
  const request = buildPluginPackageRegistryFetchApprovalRequest(fixture);
  const tampered = createApprovedPluginPackageRegistryFetchHandoff({
    candidate: candidate({ packageDigest: "sha256:3434343434343434343434343434343434343434343434343434343434343434" }),
    approval: approval(request),
    timestamp: "2026-05-13T05:49:00.000Z",
  });

  assertEqual(tampered.status, "blocked", "Tampered candidate blocks handoff");
  assertEqual(tampered.blockedReason, "approval_signature_mismatch", "Tamper is caught by signature mismatch");
  assertEqual(tampered.networkExecuted, false, "Tamper performs no network execution");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 237 Verification (Plugin Registry Host/Network Boundary)\n");

  verifyApprovalRequestAndSignature();
  verifyApprovedHandoff();
  verifyApprovalBlocks();
  verifyUnsafeRegistryUrlsBlock();
  verifyCandidateTamperBlocks();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 237 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 237: plugin registry host/network boundary is GREEN.");
}

run().catch((error) => {
  console.error("Phase 237 verification crashed:", error);
  process.exit(1);
});
