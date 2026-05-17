/**
 * Phase 243 Verification Script - Plugin Marketplace Activation Handoff
 *
 * Proves Colony can turn read-only marketplace activation readiness into a
 * redacted, approval-bound operator handoff descriptor without starting
 * sidecars, fetching registries, installing packages, executing package code,
 * mutating catalogs, or persisting credentials.
 *
 * Run: bun run src/verify-phase243.ts
 */

import {
  createPluginPackageMarketplaceActivationHandoff,
  createPluginPackageMarketplaceActivationReadiness,
  planPluginPackageManifest,
  type PluginPackageInstallUpdateReceipt,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
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

function manifest(overrides: Partial<PluginPackageManifest> = {}): PluginPackageManifest {
  return {
    packageName: "@colony/plugin-phase243",
    packageVersion: "1.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase243.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase243-plugin",
        sidecarId: "phase243-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase243-entry",
    displayName: "Phase 243 Echo Tools",
    summary: "Safe activation handoff fixture for bundled marketplace descriptors.",
    tags: ["mcp", "activation", "handoff"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function signatureForFixture(): string {
  const plan = planPluginPackageManifest(manifest());
  return plan.actions[0]?.signature ?? "";
}

function completedInstallReceipt(signature: string): PluginPackageInstallUpdateReceipt {
  return {
    recordType: "mcp_plugin_package_install_update_receipt",
    timestamp: "2026-05-14T05:28:00.000Z",
    status: "completed",
    action: "import",
    dryRun: false,
    activation: false,
    sidecarStarted: false,
    registryFetched: false,
    package: {
      name: "@colony/plugin-phase243",
      version: "1.0.0",
      source: "<redacted>",
      digest: "sha256:abababababa...abababab",
    },
    sidecar: {
      id: "phase243-plugin",
      kind: "local-sidecar",
    },
    signature,
    approval: {
      approved: true,
      approvedBy: "operator",
      reason: "<redacted>",
    },
    steps: [
      {
        executable: "bun",
        arguments: ["install", "--ignore-scripts", "--frozen-lockfile"],
        cwd: "<redacted>",
        code: 0,
        stdoutPreview: "installed SHOULD_NOT_LEAK_TOKEN",
        stderrPreview: "",
      },
    ],
    warnings: [],
  };
}

function readyView() {
  const signature = signatureForFixture();
  return createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase243",
    entries: [entry()],
    completedInstallReceipts: [completedInstallReceipt(signature)],
    approvedActivationSignatures: [signature],
    timestamp: "2026-05-14T05:29:00.000Z",
  });
}

function verifyReadyHandoffIsApprovalBoundAndNonExecuting(): void {
  section("1. Ready Handoff Is Approval-Bound And Non-Executing");

  const signature = signatureForFixture();
  const handoff = createPluginPackageMarketplaceActivationHandoff({
    readinessView: readyView(),
    entryId: "phase243-entry",
    sidecarSignature: signature,
    approvalSignature: signature,
    approvedBy: "operator",
    timestamp: "2026-05-14T05:30:00.000Z",
  });

  assertEqual(handoff.recordType, "mcp_plugin_package_activation_handoff", "Handoff uses activation handoff record type");
  assertEqual(handoff.status, "ready", "Matching readiness and approval produce ready handoff");
  assertEqual(handoff.hostActionRequired, true, "Ready handoff requires host action");
  assertEqual(handoff.requiresInjectedSupervisor, true, "Ready handoff requires injected supervisor path");
  assertEqual(handoff.activation, false, "Handoff performs no activation");
  assertEqual(handoff.sidecarStarted, false, "Handoff starts no sidecars");
  assertEqual(handoff.networkFetched, false, "Handoff fetches no registry");
  assertEqual(handoff.packageInstalled, false, "Handoff installs no package");
  assertEqual(handoff.packageExecuted, false, "Handoff executes no package code");
  assertEqual(handoff.catalogMutated, false, "Handoff mutates no catalog");
  assertEqual(handoff.credentialsPersisted, false, "Handoff persists no credentials");
  assertEqual(handoff.hostAction.kind, "start_plugin_package_sidecar", "Host action is sidecar start handoff");
  assertEqual(handoff.hostAction.approvalSignature, signature, "Host action binds exact approval signature");
  assertEqual(handoff.package.source, "<redacted>", "Package source is redacted");
  assert(!JSON.stringify(handoff).includes("SHOULD_NOT_LEAK"), "Handoff does not leak receipt output or secrets");
  assert(!JSON.stringify(handoff).includes("definition"), "Handoff does not leak sidecar definitions");
  assert(!JSON.stringify(handoff).includes("approvalRequest"), "Handoff does not leak approval request bodies");
}

function verifyBlocksUntilReadinessIsReady(): void {
  section("2. Handoff Blocks Until Readiness Is Ready");

  const signature = signatureForFixture();
  const missingReceiptView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase243",
    entries: [entry()],
    approvedActivationSignatures: [signature],
  });
  const missingReceipt = createPluginPackageMarketplaceActivationHandoff({
    readinessView: missingReceiptView,
    entryId: "phase243-entry",
    sidecarSignature: signature,
    approvalSignature: signature,
  });
  assertEqual(missingReceipt.status, "blocked", "Missing install receipt blocks handoff");
  assertEqual(missingReceipt.blockedReason, "readiness_not_ready", "Missing receipt reason is readiness-not-ready");
  assertEqual(missingReceipt.hostActionRequired, false, "Blocked handoff has no host action");

  const wrongApproval = createPluginPackageMarketplaceActivationHandoff({
    readinessView: readyView(),
    entryId: "phase243-entry",
    sidecarSignature: signature,
    approvalSignature: "mcp-plugin:000000000000000000000000",
  });
  assertEqual(wrongApproval.status, "blocked", "Wrong approval blocks handoff");
  assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(wrongApproval.hostActionRequired, false, "Wrong approval has no host action");

  const missingEntry = createPluginPackageMarketplaceActivationHandoff({
    readinessView: readyView(),
    entryId: "missing-entry",
    sidecarSignature: signature,
    approvalSignature: signature,
  });
  assertEqual(missingEntry.status, "blocked", "Missing entry blocks handoff");
  assertEqual(missingEntry.blockedReason, "entry_not_found", "Missing entry reason is explicit");
}

function verifyActiveAndUnsafeInputBlocks(): void {
  section("3. Active And Unsafe Input Blocks Are Bounded");

  const signature = signatureForFixture();
  const activeView = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-phase243",
    entries: [entry()],
    completedInstallReceipts: [completedInstallReceipt(signature)],
    approvedActivationSignatures: [signature],
    activeSidecarSignatures: [signature],
  });
  const active = createPluginPackageMarketplaceActivationHandoff({
    readinessView: activeView,
    entryId: "phase243-entry",
    sidecarSignature: signature,
    approvalSignature: signature,
  });
  assertEqual(active.status, "blocked", "Already-active sidecar blocks duplicate handoff");
  assertEqual(active.blockedReason, "already_active", "Already-active reason is explicit");

  const unsafe = createPluginPackageMarketplaceActivationHandoff({
    readinessView: readyView(),
    entryId: "phase243-entry\nSHOULD_NOT_LEAK",
    sidecarSignature: "secret-SHOULD_NOT_LEAK",
    approvalSignature: "secret-SHOULD_NOT_LEAK",
    approvedBy: "token-SHOULD_NOT_LEAK",
  });
  assertEqual(unsafe.status, "blocked", "Unsafe selector blocks handoff");
  assertEqual(unsafe.blockedReason, "invalid_selector", "Unsafe selector reason is explicit");
  assert(!JSON.stringify(unsafe).includes("SHOULD_NOT_LEAK"), "Unsafe selector input is not echoed");
}

async function verifyRuntimeHasNoExecutionPrimitive(): Promise<void> {
  section("4. Handoff Runtime Contains No Execution Primitive");

  const source = await Bun.file("src/mcp/plugin-package-activation-handoff.ts").text();
  assert(!source.includes("fetch("), "Handoff runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 243 Verification (Plugin Marketplace Activation Handoff)\n");

  verifyReadyHandoffIsApprovalBoundAndNonExecuting();
  verifyBlocksUntilReadinessIsReady();
  verifyActiveAndUnsafeInputBlocks();
  await verifyRuntimeHasNoExecutionPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 243 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 243: plugin marketplace activation handoff is GREEN.");
}

run().catch((error) => {
  console.error("Phase 243 verification crashed:", error);
  process.exit(1);
});
