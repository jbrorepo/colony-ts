/**
 * Phase 251 Verification Script - Marketplace Registry Fetch Handoff Execution
 *
 * Proves a ready marketplace registry-fetch handoff can be converted into an
 * approved registry-fetch receipt only through the existing injected host
 * executor helper, while blocked/tampered handoffs fail closed before host
 * execution.
 *
 * Run: bun run src/verify-phase251.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceRegistryFetchHandoff,
  executeApprovedPluginPackageMarketplaceRegistryFetchHandoff,
  type PluginPackageManifest,
  type PluginPackageMarketplaceCatalogEntry,
  type PluginPackageMarketplaceRegistryFetchHandoff,
  type PluginPackageRegistryFetchApproval,
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

function manifest(overrides: Partial<PluginPackageManifest> = {}): PluginPackageManifest {
  return {
    packageName: "@colony/plugin-phase251",
    packageVersion: "21.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase251.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase251-plugin",
        sidecarId: "phase251-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase251-sidecar",
        expectedServerVersion: "21.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase251-entry",
    displayName: "Phase 251 Registry Tools",
    summary: "Safe local MCP registry metadata handoff execution fixture for marketplace entries.",
    tags: ["mcp", "registry", "handoff", "execution"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function registrySignature(candidate: PluginPackageMarketplaceCatalogEntry, registryUrl: string): string {
  return buildPluginPackageRegistryFetchApprovalRequest({
    packageName: candidate.manifest.packageName,
    packageVersion: candidate.manifest.packageVersion,
    packageSource: candidate.manifest.packageSource,
    packageDigest: candidate.manifest.packageDigest,
    registryUrl,
  }).signature;
}

function readyHandoff(
  candidate: PluginPackageMarketplaceCatalogEntry = entry(),
  registryUrl = "https://registry.example.com/plugins/phase251",
): PluginPackageMarketplaceRegistryFetchHandoff {
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase251",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: registrySignature(candidate, registryUrl),
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T07:45:00.000Z",
  });
  if (handoff.status !== "ready") {
    throw new Error(`phase251 fixture handoff unexpectedly blocked: ${handoff.blockedReason}`);
  }
  return handoff;
}

function approval(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  overrides: Partial<PluginPackageRegistryFetchApproval> = {},
): PluginPackageRegistryFetchApproval {
  return {
    approved: true,
    signature: handoff.approval.signature,
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "fetch registry metadata SHOULD_NOT_LEAK_TOKEN",
    ...overrides,
  };
}

function executor(options: { status?: number; throwError?: boolean } = {}): {
  calls: Parameters<PluginPackageRegistryFetchExecutor>[0][];
  run: PluginPackageRegistryFetchExecutor;
} {
  const calls: Parameters<PluginPackageRegistryFetchExecutor>[0][] = [];
  return {
    calls,
    run: async (request) => {
      calls.push(request);
      if (options.throwError === true) {
        throw new Error("host registry failed SHOULD_NOT_LEAK_SECRET");
      }
      return {
        status: options.status ?? 200,
        headers: { "content-type": "application/json" },
        bodyText: JSON.stringify({
          packageName: "@colony/plugin-phase251",
          packageVersion: "21.0.0",
          packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
          registryUrl: "https://registry.example.com/plugins/phase251",
          fetchedAt: "2026-05-14T07:46:00.000Z",
          signatures: [
            {
              keyId: "phase251-key",
              algorithm: "ed25519",
              signature: "SHOULD_NOT_LEAK_SIGNATURE_MATERIAL",
            },
          ],
        }),
      };
    },
  };
}

async function verifyReadyHandoffDelegatesToInjectedRegistryFetchHelper(): Promise<void> {
  section("1. Ready Handoff Delegates To Existing Registry Fetch Helper");

  const handoff = readyHandoff();
  const fake = executor();
  const receipt = await executeApprovedPluginPackageMarketplaceRegistryFetchHandoff({
    handoff,
    action: "fetch_registry_metadata",
    approval: approval(handoff),
    executor: fake.run,
    timestamp: "2026-05-14T07:47:00.000Z",
  });

  assertEqual(receipt.recordType, "mcp_plugin_package_marketplace_registry_fetch_handoff_execution_receipt", "Execution receipt uses marketplace registry handoff execution record type");
  assertEqual(receipt.status, "completed", "Ready registry handoff execution completes");
  assertEqual(receipt.hostNetworkExecuted, true, "Receipt records host network execution");
  assertEqual(receipt.registryFetched, true, "Receipt records fetched registry metadata");
  assertEqual(receipt.registryFetchReceipt.present, true, "Underlying registry-fetch receipt is summarized");
  assertEqual(receipt.registryFetchReceipt.status, "completed", "Underlying registry-fetch receipt completed");
  assertEqual(fake.calls.length, 1, "Injected executor is called exactly once");
  assertEqual(fake.calls[0]?.approvalSignature, handoff.approval.signature, "Executor receives exact registry approval signature");
  assertEqual(receipt.colonyNetworkExecuted, false, "Bridge performs no Colony-owned registry fetch");
  assertEqual(receipt.packageInstalled, false, "Bridge installs no package");
  assertEqual(receipt.packageExecuted, false, "Bridge executes no package code");
  assertEqual(receipt.activation, false, "Bridge performs no activation");
  assertEqual(receipt.sidecarStarted, false, "Bridge starts no sidecar");
  assertEqual(receipt.catalogMutated, false, "Bridge mutates no catalog");
  assertEqual(receipt.credentialsPersisted, false, "Bridge persists no credentials");
  assert(!JSON.stringify(receipt).includes("plugins.example.com"), "Execution receipt redacts package source URLs");
  assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Execution receipt redacts approvals, host output, and signatures");
  assert(!JSON.stringify(receipt).includes("bodyText"), "Execution receipt omits registry response body text");
}

async function verifyBlockedAndTamperedHandoffsDoNotExecute(): Promise<void> {
  section("2. Blocked And Tampered Handoffs Do Not Execute");

  const handoff = readyHandoff();
  const fake = executor();
  const blocked = await executeApprovedPluginPackageMarketplaceRegistryFetchHandoff({
    handoff: {
      ...handoff,
      status: "blocked",
      blockedReason: "approval_signature_mismatch",
    },
    action: "fetch_registry_metadata",
    approval: approval(handoff),
    executor: fake.run,
  });
  assertEqual(blocked.status, "blocked", "Blocked handoff returns blocked execution receipt");
  assertEqual(blocked.blockedReason, "handoff_not_ready", "Blocked handoff reason is explicit");
  assertEqual(blocked.hostNetworkExecuted, false, "Blocked handoff executes no host network action");
  assertEqual(fake.calls.length, 0, "Blocked handoff does not call executor");

  const tampered = await executeApprovedPluginPackageMarketplaceRegistryFetchHandoff({
    handoff: {
      ...handoff,
      approval: { ...handoff.approval, signature: "mcp-registry-fetch:000000000000000000000000" },
    },
    action: "fetch_registry_metadata",
    approval: approval(handoff),
    executor: fake.run,
  });
  assertEqual(tampered.status, "blocked", "Tampered approval signature returns blocked execution receipt");
  assertEqual(tampered.blockedReason, "approval_signature_mismatch", "Tamper reason is explicit");
  assertEqual(fake.calls.length, 0, "Tampered handoff does not call executor");
}

async function verifyActionAndApprovalMismatchAreBounded(): Promise<void> {
  section("3. Action And Approval Mismatch Are Bounded");

  const handoff = readyHandoff();
  const fake = executor();
  const wrongAction = await executeApprovedPluginPackageMarketplaceRegistryFetchHandoff({
    handoff,
    action: "install_package" as "fetch_registry_metadata",
    approval: approval(handoff),
    executor: fake.run,
  });
  assertEqual(wrongAction.status, "blocked", "Wrong action blocks execution before executor");
  assertEqual(wrongAction.blockedReason, "action_mismatch", "Wrong action reason is explicit");
  assertEqual(fake.calls.length, 0, "Wrong action does not call executor");

  const wrongApproval = await executeApprovedPluginPackageMarketplaceRegistryFetchHandoff({
    handoff,
    action: "fetch_registry_metadata",
    approval: approval(handoff, { signature: "mcp-registry-fetch:111111111111111111111111" }),
    executor: fake.run,
  });
  assertEqual(wrongApproval.status, "blocked", "Wrong approval blocks execution before executor");
  assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(fake.calls.length, 0, "Wrong approval does not call executor");
}

async function verifyDelegateFailureIsSummarized(): Promise<void> {
  section("4. Delegated Failure Is Summarized");

  const handoff = readyHandoff();
  const fake = executor({ throwError: true });
  const failed = await executeApprovedPluginPackageMarketplaceRegistryFetchHandoff({
    handoff,
    action: "fetch_registry_metadata",
    approval: approval(handoff),
    executor: fake.run,
    timestamp: "2026-05-14T07:48:00.000Z",
  });

  assertEqual(failed.status, "failed", "Executor failure returns failed execution receipt");
  assertEqual(failed.blockedReason, "registry_fetch_failed", "Executor failure reason is explicit");
  assertEqual(failed.hostNetworkExecuted, true, "Failed executor call records attempted host execution");
  assertEqual(failed.registryFetchReceipt.present, true, "Failed underlying registry receipt is summarized");
  assertEqual(failed.registryFetchReceipt.status, "failed", "Underlying receipt failure is visible");
  assertEqual(failed.registryFetchReceipt.blockedReason, "executor_failed", "Underlying failure reason is summarized");
  assertEqual(fake.calls.length, 1, "Executor is called only once");
  assert(!JSON.stringify(failed).includes("SHOULD_NOT_LEAK"), "Failed execution receipt redacts executor output");
}

async function verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive(): Promise<void> {
  section("5. Handoff Execution Runtime Contains No Direct Network, Process, Or Write Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-registry-fetch-handoff-execution.ts").text();
  assert(!source.includes("fetch("), "Handoff execution runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff execution runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff execution runtime contains no catalog write path");
  assert(source.includes("executeApprovedPluginPackageRegistryFetch"), "Handoff execution delegates to existing registry-fetch helper");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 251 Verification (Marketplace Registry Fetch Handoff Execution)\n");

  await verifyReadyHandoffDelegatesToInjectedRegistryFetchHelper();
  await verifyBlockedAndTamperedHandoffsDoNotExecute();
  await verifyActionAndApprovalMismatchAreBounded();
  await verifyDelegateFailureIsSummarized();
  await verifyRuntimeHasNoDirectNetworkProcessOrWritePrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 251 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 251: marketplace registry fetch handoff execution is GREEN.");
}

run().catch((error) => {
  console.error("Phase 251 verification crashed:", error);
  process.exit(1);
});
