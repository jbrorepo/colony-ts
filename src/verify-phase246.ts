/**
 * Phase 246 Verification Script - Marketplace Install/Update Handoff Descriptors
 *
 * Proves bundled marketplace entries can produce a redacted, approval-bound
 * install/update handoff descriptor for the existing injected install/update
 * executor path without installing packages, fetching registries, executing
 * package code, activating sidecars, mutating catalogs, or persisting
 * credentials.
 *
 * Run: bun run src/verify-phase246.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  createPluginPackageMarketplaceInstallUpdateHandoff,
  planPluginPackageManifest,
  type PluginPackageInstallUpdateCommand,
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
    packageName: "@colony/plugin-phase246",
    packageVersion: "16.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase246.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase246-plugin",
        sidecarId: "phase246-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase246-sidecar",
        expectedServerVersion: "16.0.0",
      },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginPackageMarketplaceCatalogEntry> = {}): PluginPackageMarketplaceCatalogEntry {
  return {
    entryId: "phase246-entry",
    displayName: "Phase 246 Echo Tools",
    summary: "Safe local MCP echo tooling for marketplace install handoff planning.",
    tags: ["mcp", "local-sidecar", "echo"],
    manifest: manifest(),
    featured: true,
    ...overrides,
  };
}

function actionSignature(candidate: PluginPackageMarketplaceCatalogEntry): string {
  const plan = planPluginPackageManifest(candidate.manifest);
  const action = plan.actions[0];
  if (!action || !action.signature) {
    throw new Error("phase246 fixture did not produce a signed action");
  }
  return action.signature;
}

async function verifyReadyImportHandoff(): Promise<void> {
  section("1. Ready Import Handoff Is Redacted And Non-Executing");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-handoff-root-"));
  try {
    const candidate = entry();
    const signature = actionSignature(candidate);
    const handoff = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase246",
      entries: [candidate],
      entryId: candidate.entryId,
      approvalSignature: signature,
      packageRoot: root,
      packagePath: join(root, "phase246-plugin"),
      approvedBy: "operator-token-SHOULD_NOT_LEAK",
      timestamp: "2026-05-14T06:30:00.000Z",
    });

    assertEqual(handoff.recordType, "mcp_plugin_package_install_update_handoff", "Handoff uses install/update record type");
    assertEqual(handoff.status, "ready", "Import handoff is ready");
    assertEqual(handoff.action, "import", "Handoff binds import action");
    assertEqual(handoff.entry.entryId, "phase246-entry", "Handoff preserves safe entry id");
    assertEqual(handoff.approval.required, true, "Handoff communicates approval requirement");
    assertEqual(handoff.approval.signature, signature, "Handoff binds exact approval signature");
    assertEqual(handoff.hostAction.kind, "plugin_package_install_update", "Handoff names host install/update action");
    assertEqual(handoff.hostAction.executorPath, "executeApprovedPluginPackageInstallUpdate", "Handoff routes to existing executor helper");
    assertEqual(handoff.hostAction.requiresInjectedExecutor, true, "Handoff requires injected executor");
    assertEqual(handoff.commands[0]?.executable, "bun", "Default handoff command uses Bun");
    assert(handoff.commands[0]?.arguments.includes("--ignore-scripts") === true, "Default handoff disables lifecycle scripts");
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
    assert(!serialized.includes("approvalRequest"), "Handoff omits approval request bodies");
    assert(!serialized.includes("definition"), "Handoff omits sidecar definitions");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyReadyUpdateHandoff(): Promise<void> {
  section("2. Ready Update Handoff Uses Installed Signature State");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-handoff-update-root-"));
  try {
    const initial = entry();
    const installedSignature = actionSignature(initial);
    const updated = entry({
      manifest: manifest({
        packageVersion: "16.0.1",
        sidecars: [
          {
            ...manifest().sidecars[0]!,
            expectedServerVersion: "16.0.1",
          },
        ],
      }),
    });
    const updateSignature = actionSignature(updated);
    const handoff = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase246",
      entries: [updated],
      entryId: updated.entryId,
      installedSignatures: { "phase246-plugin": installedSignature },
      approvalSignature: updateSignature,
      packageRoot: root,
      packagePath: join(root, "phase246-plugin"),
      commands: [{ executable: "npm", arguments: ["ci", "--ignore-scripts"] }],
      timestamp: "2026-05-14T06:31:00.000Z",
    });

    assertEqual(handoff.status, "ready", "Update handoff is ready");
    assertEqual(handoff.action, "update", "Handoff binds update action");
    assertEqual(handoff.commands[0]?.executable, "npm", "Handoff preserves safe custom npm command");
    assertEqual(handoff.commands[0]?.arguments.join(" "), "ci --ignore-scripts", "Handoff preserves safe custom command args");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyBlockedHandoffs(): Promise<void> {
  section("3. Unsafe Or Non-Installable Handoffs Block Before Host Action");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-handoff-block-root-"));
  try {
    const candidate = entry();
    const signature = actionSignature(candidate);
    const keep = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase246",
      entries: [candidate],
      entryId: candidate.entryId,
      installedSignatures: { "phase246-plugin": signature },
      approvalSignature: signature,
      packageRoot: root,
      packagePath: join(root, "phase246-plugin"),
    });
    assertEqual(keep.status, "blocked", "Installed current package does not create install/update handoff");
    assertEqual(keep.blockedReason, "action_not_installable", "Keep action reports non-installable reason");
    assertEqual(keep.hostAction.requiresInjectedExecutor, true, "Blocked handoff still names injected executor boundary");

    const wrongApproval = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase246",
      entries: [candidate],
      entryId: candidate.entryId,
      approvalSignature: "mcp-plugin:000000000000000000000000",
      packageRoot: root,
      packagePath: join(root, "phase246-plugin"),
    });
    assertEqual(wrongApproval.status, "blocked", "Wrong approval signature blocks handoff");
    assertEqual(wrongApproval.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");

    const pathEscape = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase246",
      entries: [candidate],
      entryId: candidate.entryId,
      approvalSignature: signature,
      packageRoot: root,
      packagePath: join(root, "..", "outside-plugin"),
    });
    assertEqual(pathEscape.status, "blocked", "Package path escape blocks handoff");
    assertEqual(pathEscape.blockedReason, "package_path_escape", "Path escape reason is explicit");

    const unsafeCommand: PluginPackageInstallUpdateCommand[] = [
      { executable: "bun", arguments: ["run", "postinstall", "--ignore-scripts"] },
    ];
    const commandBlock = createPluginPackageMarketplaceInstallUpdateHandoff({
      catalogId: "catalog-phase246",
      entries: [candidate],
      entryId: candidate.entryId,
      approvalSignature: signature,
      packageRoot: root,
      packagePath: join(root, "phase246-plugin"),
      commands: unsafeCommand,
    });
    assertEqual(commandBlock.status, "blocked", "Unsafe lifecycle command blocks handoff");
    assertEqual(commandBlock.blockedReason, "invalid_install_command", "Unsafe command reason is explicit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyRuntimeHasNoExecutionPrimitive(): Promise<void> {
  section("4. Handoff Runtime Contains No Execution Primitive");

  const source = await Bun.file("src/mcp/plugin-package-marketplace-install-handoff.ts").text();
  assert(!source.includes("fetch("), "Handoff runtime contains no direct network fetch");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Handoff runtime contains no process spawn");
  assert(!source.includes("writeFile") && !source.includes("appendFile"), "Handoff runtime contains no catalog write path");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 246 Verification (Marketplace Install/Update Handoffs)\n");

  await verifyReadyImportHandoff();
  await verifyReadyUpdateHandoff();
  await verifyBlockedHandoffs();
  await verifyRuntimeHasNoExecutionPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 246 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 246: marketplace install/update handoff descriptors are GREEN.");
}

run().catch((error) => {
  console.error("Phase 246 verification crashed:", error);
  process.exit(1);
});
