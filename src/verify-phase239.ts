/**
 * Phase 239 Verification Script - Plugin Package Code Execution Policy Preflight
 *
 * Proves package-provided code execution remains blocked by default, can only
 * become a host-action preflight after exact approval plus a completed
 * install/update receipt, rejects lifecycle/shell/receipt tampering, and still
 * does not execute plugin code, start sidecars, fetch registries, mutate
 * catalogs, or persist credentials.
 *
 * Run: bun run src/verify-phase239.ts
 */

import {
  createPluginPackageCodeExecutionPreflight,
  executeApprovedPluginPackageInstallUpdate,
  planPluginPackageManifest,
  type PluginPackageCodeExecutionApproval,
  type PluginPackageCodeExecutionCommand,
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
    packageName: "@colony/plugin-phase239",
    packageVersion: "13.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase239.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase239-plugin",
        sidecarId: "phase239-sidecar",
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
    throw new Error("phase239 fixture did not create an import action");
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
    reason: "package code preflight approval SHOULD_NOT_LEAK_TOKEN_DETAIL",
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
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    commands: [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }],
    executor: async () => ({ code: 0, stdout: "installed SHOULD_NOT_LEAK_TOKEN" }),
    timestamp: "2026-05-13T06:20:00.000Z",
  });
}

async function verifyApprovedPreflight(): Promise<void> {
  section("1. Exact Approval Creates Host-Action Preflight Without Execution");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const preflight = createPluginPackageCodeExecutionPreflight({
    action,
    installReceipt,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
    timestamp: "2026-05-13T06:21:00.000Z",
  });

  assertEqual(preflight.status, "ready", "Approved preflight becomes ready");
  assertEqual(preflight.hostActionRequired, true, "Ready preflight requires host action");
  assertEqual(preflight.packageExecuted, false, "Preflight executes no package code");
  assertEqual(preflight.executorCalled, false, "Preflight calls no executor");
  assertEqual(preflight.registryFetched, false, "Preflight performs no registry fetch");
  assertEqual(preflight.activation, false, "Preflight activates no sidecar");
  assertEqual(preflight.sidecarStarted, false, "Preflight starts no sidecar");
  assertEqual(preflight.catalogMutated, false, "Preflight mutates no catalog");
  assertEqual(preflight.credentialsPersisted, false, "Preflight persists no credentials");
  assertEqual(preflight.hostAction.command.executable, "bun", "Preflight records safe executable");
  assertEqual(preflight.hostAction.command.arguments.join(" "), "run test", "Preflight records bounded command args");
  assertEqual(preflight.hostAction.command.cwd, "<redacted>", "Preflight redacts package path");
  assert(!JSON.stringify(preflight).includes("SHOULD_NOT_LEAK"), "Preflight redacts approval and install output secrets");
  assert(!JSON.stringify(preflight).includes("plugins.example.com"), "Preflight redacts package source URL");
}

async function verifyApprovalBlocksBeforeReady(): Promise<void> {
  section("2. Missing and Wrong Approval Block Preflight");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);

  const missing = createPluginPackageCodeExecutionPreflight({
    action,
    installReceipt,
    approval: { approved: false, signature: action.signature ?? "" },
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(missing.status, "blocked", "Missing approval blocks package code preflight");
  assertEqual(missing.blockedReason, "approval_required", "Missing approval reason is explicit");
  assertEqual(missing.hostActionRequired, false, "Missing approval creates no host action");

  const wrong = createPluginPackageCodeExecutionPreflight({
    action,
    installReceipt,
    approval: codeApproval(action, { signature: "mcp-plugin:000000000000000000000000" }),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(wrong.status, "blocked", "Wrong approval blocks package code preflight");
  assertEqual(wrong.blockedReason, "approval_signature_mismatch", "Wrong approval reason is explicit");
  assertEqual(wrong.hostActionRequired, false, "Wrong approval creates no host action");
}

async function verifyReceiptAndPathBlocks(): Promise<void> {
  section("3. Install Receipt, Action, Signature, Sidecar, and Path Blocks");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);

  const missingReceipt = createPluginPackageCodeExecutionPreflight({
    action,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(missingReceipt.status, "blocked", "Missing install receipt blocks code preflight");
  assertEqual(missingReceipt.blockedReason, "install_receipt_required", "Missing receipt reason is explicit");

  const mismatchedReceipt = createPluginPackageCodeExecutionPreflight({
    action,
    installReceipt: { ...installReceipt, signature: "mcp-plugin:111111111111111111111111" },
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(mismatchedReceipt.status, "blocked", "Mismatched install receipt blocks preflight");
  assertEqual(mismatchedReceipt.blockedReason, "install_receipt_mismatch", "Mismatched receipt reason is explicit");

  const keepAction: PluginPackagePlanActionRecord = { ...action, action: "keep", reasons: ["current"] };
  const unsupported = createPluginPackageCodeExecutionPreflight({
    action: keepAction,
    installReceipt,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(unsupported.status, "blocked", "Keep action cannot preflight package code execution");
  assertEqual(unsupported.blockedReason, "unsupported_action", "Unsupported action reason is explicit");

  const tamperedAction: PluginPackagePlanActionRecord = {
    ...action,
    definition: action.definition === undefined ? undefined : { ...action.definition, packageVersion: "13.0.1" },
  };
  const tampered = createPluginPackageCodeExecutionPreflight({
    action: tamperedAction,
    installReceipt,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(tampered.status, "blocked", "Tampered action signature blocks preflight");
  assertEqual(tampered.blockedReason, "invalid_plugin_signature", "Tamper reason is explicit");

  const escaped = createPluginPackageCodeExecutionPreflight({
    action,
    installReceipt,
    approval: codeApproval(action),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\outside\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(escaped.status, "blocked", "Package path escape blocks preflight");
  assertEqual(escaped.blockedReason, "package_path_escape", "Path escape reason is explicit");

  const unknownAction = importAction({
    sidecars: [
      {
        id: "phase239-unknown",
        sidecarId: "phase239-unknown-sidecar",
        sidecarKind: "unknown",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
      },
    ],
  });
  const unknownReceipt = await completedInstallReceipt(unknownAction);
  const unknown = createPluginPackageCodeExecutionPreflight({
    action: unknownAction,
    installReceipt: unknownReceipt,
    approval: codeApproval(unknownAction),
    packageRoot: "D:\\safe\\packages",
    packagePath: "D:\\safe\\packages\\phase239-plugin",
    command: safeCommand(),
  });
  assertEqual(unknown.status, "blocked", "Unknown sidecar kind blocks preflight");
  assertEqual(unknown.blockedReason, "invalid_sidecar_kind", "Unknown sidecar reason is explicit");
}

async function verifyUnsafeCommandBlocks(): Promise<void> {
  section("4. Lifecycle and Shell-Like Commands Are Rejected");

  const action = importAction();
  const installReceipt = await completedInstallReceipt(action);
  const cases: Array<{ label: string; command: PluginPackageCodeExecutionCommand; reason: string }> = [
    {
      label: "lifecycle install",
      command: safeCommand({ arguments: ["install"], kind: "custom" }),
      reason: "lifecycle_script_rejected",
    },
    {
      label: "prepare lifecycle",
      command: safeCommand({ arguments: ["run", "prepare"], kind: "custom" }),
      reason: "lifecycle_script_rejected",
    },
    {
      label: "shell metacharacter",
      command: safeCommand({ arguments: ["run", "test;rm"], kind: "test" }),
      reason: "unsafe_package_code_command",
    },
    {
      label: "inline eval",
      command: safeCommand({ executable: "npm", arguments: ["exec", "node", "-e", "SHOULD_NOT_LEAK"], kind: "custom" }),
      reason: "unsafe_package_code_command",
    },
  ];

  for (const item of cases) {
    const preflight = createPluginPackageCodeExecutionPreflight({
      action,
      installReceipt,
      approval: codeApproval(action),
      packageRoot: "D:\\safe\\packages",
      packagePath: "D:\\safe\\packages\\phase239-plugin",
      command: item.command,
      timestamp: "2026-05-13T06:22:00.000Z",
    });
    assertEqual(preflight.status, "blocked", `${item.label} blocks package code preflight`);
    assertEqual(preflight.blockedReason, item.reason as never, `${item.label} reason is explicit`);
    assertEqual(preflight.hostActionRequired, false, `${item.label} creates no host action`);
    assert(!JSON.stringify(preflight).includes("SHOULD_NOT_LEAK"), `${item.label} redacts unsafe command bodies`);
  }
}

async function verifyRuntimeHasNoExecutionPrimitive(): Promise<void> {
  section("5. Runtime Contains No Executor or Network Primitive");

  const source = await Bun.file("src/mcp/plugin-package-code-execution-policy.ts").text();
  assert(!source.includes("executor:"), "Policy runtime exposes no executor parameter");
  assert(!source.includes("fetch("), "Policy runtime contains no direct network call");
  assert(!source.includes("spawn(") && !source.includes("Bun.spawn"), "Policy runtime contains no process spawn");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 239 Verification (Plugin Package Code Execution Policy Preflight)\n");

  await verifyApprovedPreflight();
  await verifyApprovalBlocksBeforeReady();
  await verifyReceiptAndPathBlocks();
  await verifyUnsafeCommandBlocks();
  await verifyRuntimeHasNoExecutionPrimitive();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 239 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 239: plugin package code execution policy preflight is GREEN.");
}

run().catch((error) => {
  console.error("Phase 239 verification crashed:", error);
  process.exit(1);
});
