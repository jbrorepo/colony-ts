/**
 * Phase 249 Verification Script - Marketplace Registry Fetch Handoff
 *
 * Proves bundled marketplace entries can produce a redacted, approval-bound
 * registry metadata fetch handoff descriptor over the existing registry fetch
 * boundary without performing any built-in network request, package install,
 * package-code execution, sidecar activation, catalog mutation, or credential
 * persistence.
 *
 * Run: bun run src/verify-phase249.ts
 */

import {
  buildPluginPackageRegistryFetchApprovalRequest,
  createPluginPackageMarketplaceRegistryFetchHandoff,
  planPluginPackageManifest,
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
    packageName: "@colony/plugin-phase249",
    packageVersion: "19.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase249.tgz",
    packageDigest: "sha256:efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
    reviewed: true,
    sidecars: [
      {
        id: "phase249-plugin",
        sidecarId: "phase249-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase249-sidecar",
        expectedServerVersion: "19.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase249-entry",
    displayName: "Phase 249 Registry Tools",
    summary: "Safe local MCP registry metadata handoff planning for marketplace entries.",
    tags: ["mcp", "registry", "local-sidecar"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function registryFetchSignature(candidate: PluginPackageMarketplaceCatalogEntry, registryUrl: string): string {
  const plan = planPluginPackageManifest(candidate.manifest);
  const action = plan.actions[0];
  if (!action) throw new Error("phase249 fixture did not produce a marketplace action");
  return buildPluginPackageRegistryFetchApprovalRequest({
    packageName: candidate.manifest.packageName,
    packageVersion: candidate.manifest.packageVersion,
    packageSource: candidate.manifest.packageSource,
    packageDigest: candidate.manifest.packageDigest,
    registryUrl,
  }).signature;
}

function verifyReadyRegistryFetchHandoff(): void {
  section("1. Ready Marketplace Registry Handoff Is Redacted And Non-Executing");

  const candidate = entry();
  const registryUrl = "https://registry.example.com/plugins/phase249";
  const signature = registryFetchSignature(candidate, registryUrl);
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase249",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: signature,
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    timestamp: "2026-05-14T07:20:00.000Z",
  });

  assertEqual(handoff.recordType, "mcp_plugin_package_marketplace_registry_fetch_handoff", "Handoff uses marketplace registry record type");
  assertEqual(handoff.status, "ready", "Registry handoff is ready");
  assertEqual(handoff.entry.entryId, "phase249-entry", "Handoff preserves safe entry id");
  assertEqual(handoff.approval.required, true, "Handoff communicates approval requirement");
  assertEqual(handoff.approval.signature, signature, "Handoff binds exact registry approval signature");
  assertEqual(handoff.hostAction.kind, "plugin_package_registry_metadata_fetch", "Handoff names host registry fetch action");
  assertEqual(handoff.hostAction.executorPath, "executeApprovedPluginPackageRegistryFetch", "Handoff routes to existing registry fetch executor helper");
  assertEqual(handoff.hostAction.requiresInjectedExecutor, true, "Handoff requires injected executor");
  assertEqual(handoff.hostAction.registryUrl, registryUrl, "Handoff preserves safe registry URL for host");
  assertEqual(handoff.registryFetchHandoff.recordType, "mcp_plugin_package_registry_fetch_handoff", "Handoff embeds generic registry boundary truth");
  assertEqual(handoff.registryFetchHandoff.status, "ready", "Generic registry boundary is ready");
  assertEqual(handoff.networkFetched, false, "Handoff performs no registry fetch");
  assertEqual(handoff.packageInstalled, false, "Handoff installs no package");
  assertEqual(handoff.packageExecuted, false, "Handoff executes no package code");
  assertEqual(handoff.activation, false, "Handoff activates no sidecars");
  assertEqual(handoff.sidecarStarted, false, "Handoff starts no sidecars");
  assertEqual(handoff.catalogMutated, false, "Handoff mutates no catalog");
  assertEqual(handoff.credentialsPersisted, false, "Handoff persists no credentials");

  const serialized = JSON.stringify(handoff);
  assert(!serialized.includes("plugins.example.com"), "Handoff redacts package source URL");
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Handoff redacts secret-like operator/source material");
  assert(!serialized.includes("fetch("), "Handoff contains no executable fetch code");
}

function verifyBlockedRegistryFetchHandoffs(): void {
  section("2. Unsafe Or Unapproved Registry Handoffs Block Before Host Action");

  const candidate = entry();
  const registryUrl = "https://registry.example.com/plugins/phase249";
  const signature = registryFetchSignature(candidate, registryUrl);

  const missingEntry = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase249",
    entries: [candidate],
    entryId: "missing-entry",
    registryUrl,
    approvalSignature: signature,
  });
  assertEqual(missingEntry.status, "blocked", "Missing entry blocks handoff");
  assertEqual(missingEntry.blockedReason, "entry_not_found", "Missing entry reason is explicit");
  assertEqual(missingEntry.hostAction.requiresInjectedExecutor, true, "Blocked handoff still names injected boundary");

  const missingUrl = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase249",
    entries: [candidate],
    entryId: candidate.entryId,
    approvalSignature: signature,
  });
  assertEqual(missingUrl.status, "blocked", "Missing registry URL blocks handoff");
  assertEqual(missingUrl.blockedReason, "registry_url_missing", "Missing registry URL reason is explicit");

  const unsafeUrl = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase249",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl: "https://token:SHOULD_NOT_LEAK@localhost/plugins/phase249",
    approvalSignature: signature,
  });
  assertEqual(unsafeUrl.status, "blocked", "Unsafe registry URL blocks handoff");
  assertEqual(unsafeUrl.blockedReason, "registry_url_unsafe", "Unsafe registry URL reason is explicit");
  assertEqual(unsafeUrl.hostAction.registryUrl, "<redacted>", "Unsafe registry URL is redacted");
  assert(!JSON.stringify(unsafeUrl).includes("SHOULD_NOT_LEAK"), "Unsafe registry handoff redacts URL credentials");

  const wrongApproval = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase249",
    entries: [candidate],
    entryId: candidate.entryId,
    registryUrl,
    approvalSignature: "mcp-registry-fetch:000000000000000000000000",
  });
  assertEqual(wrongApproval.status, "blocked", "Wrong approval signature blocks handoff");
  assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
}

function verifyRejectActionBlocks(): void {
  section("3. Reject Actions Do Not Produce Fetch Handoffs");

  const rejected = entry({
    manifest: manifest({
      packageSource: "ftp://plugins.example.com/phase249.tgz",
      reviewed: false,
    }),
  });
  const handoff = createPluginPackageMarketplaceRegistryFetchHandoff({
    catalogId: "catalog-phase249",
    entries: [rejected],
    entryId: rejected.entryId,
    registryUrl: "https://registry.example.com/plugins/phase249",
    approvalSignature: "mcp-registry-fetch:000000000000000000000000",
  });

  assertEqual(handoff.status, "blocked", "Rejected package action blocks handoff");
  assertEqual(handoff.blockedReason, "action_not_fetchable", "Rejected package reason is explicit");
  assertEqual(handoff.networkFetched, false, "Rejected package performs no registry fetch");
}

async function verifyRuntimeHasNoExecutionPrimitive(): Promise<void> {
  section("4. Marketplace Registry Handoff Runtime Contains No Execution Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-registry-fetch-handoff.ts").text();
  assert(!source.includes("fetch("), "Handoff runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff runtime contains no catalog write path");
  assert(source.includes("createApprovedPluginPackageRegistryFetchHandoff"), "Handoff delegates to existing registry boundary helper");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 249 Verification (Marketplace Registry Fetch Handoffs)\n");

  verifyReadyRegistryFetchHandoff();
  verifyBlockedRegistryFetchHandoffs();
  verifyRejectActionBlocks();
  await verifyRuntimeHasNoExecutionPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 249 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 249: marketplace registry fetch handoff descriptors are GREEN.");
}

run().catch((error) => {
  console.error("Phase 249 verification crashed:", error);
  process.exit(1);
});
