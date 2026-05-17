/**
 * Phase 234 Verification Script - Plugin Package Install/Update Execution Receipts
 *
 * Proves reviewed plugin package import/update actions can advance from
 * metadata-only staging to approval-gated install/update execution receipts
 * through an injected executor, while rejecting unsafe commands, path escapes,
 * missing approval, and sidecar activation by default.
 *
 * Run: bun run src/verify-phase234.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";

import {
  executeApprovedPluginPackageInstallUpdate,
  planPluginPackageManifest,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateCommand,
  type PluginPackageInstallUpdateExecutor,
  type PluginPackageManifest,
  type PluginPackagePlanActionRecord,
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
    packageName: "@colony/plugin-phase234",
    packageVersion: "8.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase234.tgz",
    packageDigest: "sha256:abababababababababababababababababababababababababababababababab",
    reviewed: true,
    sidecars: [
      {
        id: "phase234-plugin",
        sidecarId: "phase234-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase234-plugin-sidecar",
        expectedServerVersion: "8.0.0",
      },
    ],
    ...overrides,
  };
}

function importAction(): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(manifest());
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature) {
    throw new Error("phase234 fixture did not create an import action");
  }
  return action;
}

function updateAction(): PluginPackagePlanActionRecord {
  const initial = importAction();
  const plan = planPluginPackageManifest(manifest({ packageVersion: "8.0.1" }), {
    installedSignatures: { "phase234-plugin": initial.signature! },
  });
  const action = plan.actions[0];
  if (!action || action.action !== "update" || !action.signature) {
    throw new Error("phase234 fixture did not create an update action");
  }
  return action;
}

function approval(action: PluginPackagePlanActionRecord, overrides: Partial<PluginPackageInstallUpdateApproval> = {}): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator",
    reason: "reviewed-local-package-install",
    ...overrides,
  };
}

function executor(results: Array<{ code: number; stdout?: string; stderr?: string }> = [{ code: 0, stdout: "ok" }]): {
  calls: Array<{ executable: string; arguments: string[]; cwd: string }>;
  run: PluginPackageInstallUpdateExecutor;
} {
  const calls: Array<{ executable: string; arguments: string[]; cwd: string }> = [];
  return {
    calls,
    run: async (request) => {
      calls.push({
        executable: request.executable,
        arguments: [...request.arguments],
        cwd: request.cwd,
      });
      const result = results[Math.min(calls.length - 1, results.length - 1)] ?? { code: 0 };
      return {
        code: result.code,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    },
  };
}

async function verifyApprovedImportReceipt(): Promise<void> {
  section("1. Approved Import Produces Redacted Execution Receipt");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-install-root-"));
  try {
    const packagePath = join(root, "phase234-plugin");
    const action = importAction();
    const fake = executor([{ code: 0, stdout: "installed SHOULD_NOT_LEAK_TOKEN_VALUE" }]);
    const receipt = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action, {
        approvedBy: "operator-token-SHOULD_NOT_LEAK",
        reason: "approval SHOULD_NOT_LEAK_TOKEN_DETAIL",
      }),
      packageRoot: root,
      packagePath,
      commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
      executor: fake.run,
      timestamp: "2026-05-13T00:00:00.000Z",
    });

    assertEqual(receipt.status, "completed", "Approved import completes");
    assertEqual(receipt.action, "import", "Receipt preserves import action");
    assertEqual(receipt.activation, false, "Receipt does not activate plugin records");
    assertEqual(receipt.sidecarStarted, false, "Receipt does not start sidecars");
    assertEqual(receipt.registryFetched, false, "Receipt does not fetch registries");
    assertEqual(receipt.steps.length, 1, "One install step is recorded");
    assertEqual(fake.calls.length, 1, "Executor is called exactly once");
    assertEqual(fake.calls[0]?.cwd, resolve(packagePath), "Executor cwd is constrained to package path");
    assertEqual(receipt.steps[0]?.code, 0, "Receipt stores successful step code");
    assertEqual(receipt.steps[0]?.stdoutPreview, "<redacted>", "Receipt redacts secret-like stdout");

    const serialized = JSON.stringify(receipt);
    assert(!serialized.includes("plugins.example.com"), "Receipt redacts package source URL");
    assert(!serialized.includes("SHOULD_NOT_LEAK"), "Receipt redacts approval and executor output secrets");
    assert(!serialized.includes("approvalRequest"), "Receipt omits approval request bodies");
    assert(!serialized.includes("definition"), "Receipt omits trusted sidecar definitions");
    assert(!serialized.includes("startSidecar"), "Receipt has no sidecar start field");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyApprovedUpdateReceipt(): Promise<void> {
  section("2. Approved Update Uses Same Guardrails");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-update-root-"));
  try {
    const action = updateAction();
    const fake = executor([{ code: 0, stdout: "updated" }]);
    const receipt = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      commands: [{ executable: "npm", arguments: ["ci", "--ignore-scripts"] }],
      executor: fake.run,
      timestamp: "2026-05-13T00:01:00.000Z",
    });

    assertEqual(receipt.status, "completed", "Approved update completes");
    assertEqual(receipt.action, "update", "Receipt preserves update action");
    assertEqual(receipt.steps[0]?.executable, "npm", "Receipt supports npm ci with ignored scripts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyApprovalAndPolicyBlocks(): Promise<void> {
  section("3. Approval and Command Policy Blocks");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-block-root-"));
  try {
    const action = importAction();
    const fake = executor();
    const missingApproval = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: { approved: false, signature: action.signature ?? "" },
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      executor: fake.run,
      timestamp: "2026-05-13T00:02:00.000Z",
    });
    assertEqual(missingApproval.status, "blocked", "Missing approval blocks execution");
    assertEqual(missingApproval.blockedReason, "approval_required", "Missing approval reason is explicit");
    assertEqual(fake.calls.length, 0, "Missing approval does not call executor");

    const wrongSignature = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action, { signature: "mcp-plugin:000000000000000000000000" }),
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      executor: fake.run,
      timestamp: "2026-05-13T00:03:00.000Z",
    });
    assertEqual(wrongSignature.status, "blocked", "Wrong approval signature blocks execution");
    assertEqual(wrongSignature.blockedReason, "approval_signature_mismatch", "Wrong signature reason is explicit");
    assertEqual(fake.calls.length, 0, "Wrong signature does not call executor");

    const unsafe = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      commands: [{ executable: "bun", arguments: ["install"] }],
      executor: fake.run,
      timestamp: "2026-05-13T00:04:00.000Z",
    });
    assertEqual(unsafe.status, "blocked", "Missing ignore-scripts blocks execution");
    assertEqual(unsafe.blockedReason, "invalid_install_command", "Unsafe command reason is explicit");
    assertEqual(fake.calls.length, 0, "Unsafe command does not call executor");

    const shellLike = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      commands: [{ executable: "npm", arguments: ["run", "postinstall", "--ignore-scripts"] }],
      executor: fake.run,
      timestamp: "2026-05-13T00:05:00.000Z",
    });
    assertEqual(shellLike.status, "blocked", "Lifecycle script commands block execution");
    assertEqual(shellLike.blockedReason, "invalid_install_command", "Lifecycle command reason is explicit");
    assertEqual(fake.calls.length, 0, "Lifecycle command does not call executor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyPathEscapeAndUnsupportedActionBlocks(): Promise<void> {
  section("4. Path Escape and Unsupported Actions Block");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-path-root-"));
  try {
    const action = importAction();
    const fake = executor();
    const escapeReceipt = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "..", "outside-plugin"),
      executor: fake.run,
      timestamp: "2026-05-13T00:06:00.000Z",
    });
    assertEqual(escapeReceipt.status, "blocked", "Package path escape blocks execution");
    assertEqual(escapeReceipt.blockedReason, "package_path_escape", "Path escape reason is explicit");
    assertEqual(fake.calls.length, 0, "Path escape does not call executor");

    const keepAction: PluginPackagePlanActionRecord = {
      ...action,
      action: "keep",
      reasons: ["signature_current"],
    };
    const keepReceipt = await executeApprovedPluginPackageInstallUpdate({
      action: keepAction,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      executor: fake.run,
      timestamp: "2026-05-13T00:07:00.000Z",
    });
    assertEqual(keepReceipt.status, "blocked", "Keep action cannot execute install/update");
    assertEqual(keepReceipt.blockedReason, "unsupported_action", "Unsupported action reason is explicit");
    assertEqual(fake.calls.length, 0, "Unsupported action does not call executor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyExecutorFailureStopsFurtherCommands(): Promise<void> {
  section("5. Failed Command Stops Before Continuing");

  const root = await mkdtemp(join(tmpdir(), "colony-plugin-fail-root-"));
  try {
    const action = importAction();
    const fake = executor([{ code: 7, stderr: "failed SHOULD_NOT_LEAK_TOKEN_VALUE" }, { code: 0, stdout: "should not run" }]);
    const commands: PluginPackageInstallUpdateCommand[] = [
      { executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] },
      { executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] },
    ];
    const receipt = await executeApprovedPluginPackageInstallUpdate({
      action,
      approval: approval(action),
      packageRoot: root,
      packagePath: join(root, "phase234-plugin"),
      commands,
      executor: fake.run,
      timestamp: "2026-05-13T00:08:00.000Z",
    });

    assertEqual(receipt.status, "failed", "Non-zero executor code returns failed receipt");
    assertEqual(receipt.blockedReason, "executor_failed", "Failure reason is explicit");
    assertEqual(fake.calls.length, 1, "Failed first command stops later commands");
    assertEqual(receipt.steps.length, 1, "Receipt records only attempted step");
    assertEqual(receipt.steps[0]?.stderrPreview, "<redacted>", "Receipt redacts failed stderr");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 234 Verification (Plugin Package Install/Update Execution Receipts)\n");

  await verifyApprovedImportReceipt();
  await verifyApprovedUpdateReceipt();
  await verifyApprovalAndPolicyBlocks();
  await verifyPathEscapeAndUnsupportedActionBlocks();
  await verifyExecutorFailureStopsFurtherCommands();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 234 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 234: plugin package install/update execution receipts are GREEN.");
}

run().catch((error) => {
  console.error("Phase 234 verification crashed:", error);
  process.exit(1);
});
