/**
 * Phase 242 Verification Script - Plugin Marketplace Activation Readiness
 *
 * Proves Colony can render default/live plugin activation readiness for
 * marketplace package descriptors without activating sidecars, installing
 * packages, fetching registries, executing package code, mutating catalogs, or
 * persisting credentials.
 *
 * Run: bun run src/verify-phase242.ts
 */

import {
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
    packageName: "@colony/plugin-phase242",
    packageVersion: "1.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase242.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase242-plugin",
        sidecarId: "phase242-sidecar",
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
    entryId: "phase242-entry",
    displayName: "Phase 242 Echo Tools",
    summary: "Safe activation readiness fixture for bundled marketplace descriptors.",
    tags: ["mcp", "activation", "local-sidecar"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function completedInstallReceipt(signature: string): PluginPackageInstallUpdateReceipt {
  return {
    recordType: "mcp_plugin_package_install_update_receipt",
    timestamp: "2026-05-14T05:16:00.000Z",
    status: "completed",
    action: "import",
    dryRun: false,
    activation: false,
    sidecarStarted: false,
    registryFetched: false,
    package: {
      name: "@colony/plugin-phase242",
      version: "1.0.0",
      source: "<redacted>",
      digest: "sha256:cdcdcdcdcdc...cdcdcdcd",
    },
    sidecar: {
      id: "phase242-plugin",
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
        stdoutPreview: "ok",
        stderrPreview: "",
      },
    ],
    warnings: [],
  };
}

function signatureForFixture(): string {
  const plan = planPluginPackageManifest(manifest());
  return plan.actions[0]?.signature ?? "";
}

function verifyDefaultActivationReadinessIsSafe(): void {
  section("1. Default Activation Readiness Is Read-Only And Claim-Safe");

  const view = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "colony-default",
    entries: [entry()],
    timestamp: "2026-05-14T05:15:00.000Z",
  });

  assertEqual(view.recordType, "mcp_plugin_package_activation_readiness_view", "View uses activation readiness record type");
  assertEqual(view.catalogId, "colony-default", "View preserves safe catalog id");
  assertEqual(view.approvalRequired, true, "View states approval is required");
  assertEqual(view.networkFetched, false, "View performs no registry fetch");
  assertEqual(view.packageInstalled, false, "View installs no packages");
  assertEqual(view.packageExecuted, false, "View executes no package code");
  assertEqual(view.activation, false, "View performs no activation");
  assertEqual(view.sidecarStarted, false, "View starts no sidecars");
  assertEqual(view.catalogMutated, false, "View mutates no catalog");
  assertEqual(view.credentialsPersisted, false, "View persists no credentials");
  assertEqual(view.entries[0]?.sidecars[0]?.state, "needs_install_or_update_receipt", "Fresh import needs install/update receipt before activation");
  assert(view.entries[0]?.sidecars[0]?.nextActions.some((action) => action.includes("install/update receipt")) === true, "Next actions explain missing receipt");
  assert(!JSON.stringify(view).includes("approvalRequest"), "View does not expose approval request bodies");
  assert(!JSON.stringify(view).includes("definition"), "View does not expose sidecar definitions");
}

function verifyReadyHandoffRequiresReceiptAndApproval(): void {
  section("2. Ready Handoff Requires Matching Receipt And Approval");

  const signature = signatureForFixture();
  const view = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-ready",
    entries: [entry()],
    completedInstallReceipts: [completedInstallReceipt(signature)],
    approvedActivationSignatures: [signature],
    timestamp: "2026-05-14T05:16:00.000Z",
  });
  const readiness = view.entries[0]?.sidecars[0];

  assertEqual(readiness?.state, "ready_for_operator_handoff", "Matching receipt and approval produce ready handoff state");
  assertEqual(readiness?.installReceipt.present, true, "Matching receipt is summarized");
  assertEqual(readiness?.approval.present, true, "Matching approval is summarized");
  assertEqual(readiness?.activation, false, "Ready handoff still does not activate");
  assertEqual(readiness?.sidecarStarted, false, "Ready handoff still does not start sidecar");
  assert(readiness?.nextActions.some((action) => action.includes("operator handoff")) === true, "Next action is explicit operator handoff");
  assertEqual(readiness?.signature, signature, "Safe signature is shown for operator correlation");
}

function verifyActiveAndTamperedStates(): void {
  section("3. Active And Tampered States Are Bounded");

  const signature = signatureForFixture();
  const active = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-active",
    entries: [entry()],
    completedInstallReceipts: [completedInstallReceipt(signature)],
    approvedActivationSignatures: [signature],
    activeSidecarSignatures: [signature],
  });
  assertEqual(active.entries[0]?.sidecars[0]?.state, "active", "Active signature is rendered as already active");
  assertEqual(active.entries[0]?.sidecars[0]?.activation, false, "Active state is inspection-only");

  const tampered = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "catalog-tampered",
    entries: [entry()],
    completedInstallReceipts: [{ ...completedInstallReceipt(signature), signature: "mcp-plugin:000000000000000000000000" }],
    approvedActivationSignatures: [signature],
  });
  assertEqual(tampered.entries[0]?.sidecars[0]?.state, "needs_install_or_update_receipt", "Tampered receipt does not satisfy readiness");
  assertEqual(tampered.entries[0]?.sidecars[0]?.installReceipt.present, false, "Tampered receipt is ignored");
}

function verifyUnsafeInputRedaction(): void {
  section("4. Unsafe Input Is Redacted");

  const view = createPluginPackageMarketplaceActivationReadiness({
    catalogId: "token-SHOULD_NOT_LEAK",
    entries: [
      entry({
        entryId: "entry-SHOULD_NOT_LEAK",
        displayName: "token SHOULD_NOT_LEAK",
        summary: "secret SHOULD_NOT_LEAK",
        manifest: manifest({
          packageName: "token-SHOULD_NOT_LEAK",
          packageSource: "https://token@example.invalid/pkg.tgz?token=SHOULD_NOT_LEAK",
          sidecars: [{ id: "token-SHOULD_NOT_LEAK", sidecarId: "bad", sidecarKind: "local-sidecar" }],
        }),
      }),
    ],
    approvedActivationSignatures: ["token-SHOULD_NOT_LEAK"],
    activeSidecarSignatures: ["token-SHOULD_NOT_LEAK"],
  });

  assertEqual(view.catalogId, "<redacted>", "Unsafe catalog id is redacted");
  assertEqual(view.entries[0]?.entryId, "<redacted>", "Unsafe entry id is redacted");
  assertEqual(view.entries[0]?.sidecars[0]?.state, "blocked", "Unsafe entry is blocked");
  assert(!JSON.stringify(view).includes("SHOULD_NOT_LEAK"), "Unsafe input is not echoed");
  assert(!JSON.stringify(view).includes("?token="), "Unsafe URL query is not echoed");
}

async function verifyRuntimeHasNoHostExecution(): Promise<void> {
  section("5. Activation Readiness Runtime Contains No Host Execution Primitive");

  const source = await Bun.file("src/mcp/plugin-package-activation-readiness.ts").text();
  assert(!source.includes("fetch("), "Readiness runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Readiness runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Readiness runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 242 Verification (Plugin Marketplace Activation Readiness)\n");

  verifyDefaultActivationReadinessIsSafe();
  verifyReadyHandoffRequiresReceiptAndApproval();
  verifyActiveAndTamperedStates();
  verifyUnsafeInputRedaction();
  await verifyRuntimeHasNoHostExecution();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 242 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 242: plugin marketplace activation readiness is GREEN.");
}

run().catch((error) => {
  console.error("Phase 242 verification crashed:", error);
  process.exit(1);
});
