/**
 * Phase 240 Verification Script - Approved Plugin Package Code Execution Receipts
 *
 * Proves package-code host execution only happens after a ready Phase 239
 * preflight, exact approval, and an injected executor; receipts remain redacted,
 * bounded to one non-destructive attempt, and do not fetch registries, activate
 * sidecars, mutate catalogs, or persist credentials.
 *
 * Run: bun run src/verify-phase240.ts
 */

import {
  createPluginPackageCodeExecutionPreflight,
  executeApprovedPluginPackageCodeAction,
  executeApprovedPluginPackageInstallUpdate,
  planPluginPackageManifest,
  type PluginPackageCodeExecutionApproval,
  type PluginPackageCodeExecutionCommand,
  type PluginPackageCodeExecutionExecutor,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateReceipt,
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
    packageName: "@colony/plugin-phase240",
    packageVersion: "14.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase240.tgz",
    packageDigest: "sha256:edededededededededededededededededededededededededededededededed",
    reviewed: true,
    sidecars: [
      {
        id: "phase240-plugin",
        sidecarId: "phase240-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
      },
    ],
    ...overrides,
  };
}

function importAction(overrides: Partial<PluginPackageManifest> = {}): PluginPackagePlanActionRecord {
  const plan = planPluginPackageManifest(manifest(overrides), { acceptUnknownSidecars: true });
  const action = plan.actions[0];
  if (!action || action.action !== "import" || !action.signature || !action.definition) {
    throw new Error("phase240 fixture did not create an import action");
  }
  return action;
}

function installApproval(
  action: PluginPackagePlanActionRecord,
  overrides: Partial<PluginPackageInstallUpdateApproval> = {},
): PluginPackageInstallUpdateApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "install approval SHOULD_NOT_LEAK_TOKEN_DETAIL",
    ...overrides,
  };
}

function codeApproval(
  action: PluginPackagePlanActionRecord,
  overrides: Partial<PluginPackageCodeExecutionApproval> = {},
): PluginPackageCodeExecutionApproval {
  return {
    approved: true,
    signature: action.signature ?? "",
    approvedBy: "operator-token-SHOULD_NOT_LEAK",
    reason: "package code execution approval SHOULD_NOT_LEAK_TOKEN_DETAIL",
    ...overrides,
  };
}

function safeCommand(overrides: Partial<PluginPackageCodeExecutionCommand> = {}): PluginPackageCodeExecutionCommand {
  return {
    executable: "bun",
    arguments: ["run", "test"],
    kind: "test",
    ...overrides,
  };
}

async function completedInstallReceipt(action: PluginPackagePlanActionRecord): Promise<PluginPackageInstallUpdateReceipt> {
  return await executeApprovedPluginPackageInstallUpdate({
    action,
    approval: installApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase240-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed SHOULD_NOT_LEAK_TOKEN" }),
    timestamp: "2026-05-14T05:00:00.000Z",
  });
}

async function readyPreflight(action: PluginPackagePlanActionRecord, installReceipt: PluginPackageInstallUpdateReceipt) {
  return createPluginPackageCodeExecutionPreflight({
    action,
    installReceipt,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase240-plugin",
    command: safeCommand(),
    timestamp: "2026-05-14T05:01:00.000Z",
  });
}

async function verifyApprovedExecutionReceipt(): Promise<void> {
  section("1. Ready Preflight Executes Once Through Injected Executor");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const preflight = await readyPreflight(action, installReceipt);
  const calls: Array<{ executable: string; cwd: string; signature: string }> = [];
  const executor: PluginPackageCodeExecutionExecutor = async (request) => {
    calls.push({ executable: request.executable, cwd: request.cwd, signature: request.signature });
    return {
      code: 0,
      stdout: "tests passed token=SHOULD_NOT_LEAK_SECRET",
      stderr: "warning bearer SHOULD_NOT_LEAK",
    };
  };

  const receipt = await executeApprovedPluginPackageCodeAction({
    action,
    installReceipt,
    preflight,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase240-plugin",
    executor,
    timestamp: "2026-05-14T05:02:00.000Z",
  });

  assertEqual(receipt.status, "completed", "Approved ready preflight completes package-code execution");
  assertEqual(receipt.packageExecuted, true, "Receipt marks package code as executed");
  assertEqual(receipt.executorCalled, true, "Receipt marks executor as called");
  assertEqual(calls.length, 1, "Executor is called exactly once");
  assertEqual(calls[0]?.executable, "bun", "Executor receives approved executable");
  assertEqual(calls[0]?.cwd, "D:\\safe\\packages\\phase240-plugin", "Executor receives confined package cwd");
  assertEqual(calls[0]?.signature, action.signature ?? "", "Executor receives trusted signature");
  assertEqual(receipt.step.code, 0, "Receipt captures executor exit code");
  assertEqual(receipt.step.cwd, "<redacted>", "Receipt redacts cwd");
  assertEqual(receipt.registryFetched, false, "Execution performs no registry fetch");
  assertEqual(receipt.activation, false, "Execution activates no sidecar");
  assertEqual(receipt.sidecarStarted, false, "Execution starts no sidecar");
  assertEqual(receipt.catalogMutated, false, "Execution mutates no catalog");
  assertEqual(receipt.credentialsPersisted, false, "Execution persists no credentials");
  assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Receipt redacts executor and approval secrets");
  assert(!JSON.stringify(receipt).includes("plugins.example.com"), "Receipt redacts package source URL");
}

async function verifyBlocksDoNotCallExecutor(): Promise<void> {
  section("2. Blocked or Tampered Preconditions Never Call Executor");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const preflight = await readyPreflight(action, installReceipt);
  let calls = 0;
  const executor: PluginPackageCodeExecutionExecutor = async () => {
    calls++;
    return { code: 0 };
  };

  const missingApproval = await executeApprovedPluginPackageCodeAction({
    action,
    installReceipt,
    preflight,
    approval: { approved: false, signature: action.signature ?? "" },
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase240-plugin",
    executor,
  });
  assertEqual(missingApproval.status, "blocked", "Missing approval blocks execution");
  assertEqual(missingApproval.blockedReason, "approval_required", "Missing approval reason is explicit");

  const tamperedPreflight = await executeApprovedPluginPackageCodeAction({
    action,
    installReceipt,
    preflight: { ...preflight, signature: "mcp-plugin:000000000000000000000000" },
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase240-plugin",
    executor,
  });
  assertEqual(tamperedPreflight.status, "blocked", "Tampered preflight blocks execution");
  assertEqual(tamperedPreflight.blockedReason, "preflight_mismatch", "Tampered preflight reason is explicit");

  const escaped = await executeApprovedPluginPackageCodeAction({
    action,
    installReceipt,
    preflight,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\outside\\phase240-plugin",
    executor,
  });
  assertEqual(escaped.status, "blocked", "Package path escape blocks execution");
  assertEqual(escaped.blockedReason, "package_path_escape", "Path escape reason is explicit");

  assertEqual(calls, 0, "Executor is never called for blocked execution");
}

async function verifyFailureReceipt(): Promise<void> {
  section("3. Executor Failure Produces Redacted Failed Receipt");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const preflight = await readyPreflight(action, installReceipt);
  const receipt = await executeApprovedPluginPackageCodeAction({
    action,
    installReceipt,
    preflight,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase240-plugin",
    executor: async () => ({ code: 2, stdout: "failed api_key=SHOULD_NOT_LEAK", stderr: "secret SHOULD_NOT_LEAK" }),
    timestamp: "2026-05-14T05:03:00.000Z",
  });

  assertEqual(receipt.status, "failed", "Non-zero executor code fails receipt");
  assertEqual(receipt.blockedReason, "executor_failed", "Executor failure reason is explicit");
  assertEqual(receipt.packageExecuted, true, "Failed receipt still records attempted package execution");
  assertEqual(receipt.executorCalled, true, "Failed receipt records executor call");
  assertEqual(receipt.step.code, 2, "Failed receipt captures bounded exit code");
  assert(!JSON.stringify(receipt).includes("SHOULD_NOT_LEAK"), "Failed receipt redacts executor secrets");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 240 Verification (Approved Plugin Package Code Execution Receipts)\n");

  await verifyApprovedExecutionReceipt();
  await verifyBlocksDoNotCallExecutor();
  await verifyFailureReceipt();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 240 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 240: approved plugin package code execution receipts are GREEN.");
}

run().catch((error) => {
  console.error("Phase 240 verification crashed:", error);
  process.exit(1);
});
