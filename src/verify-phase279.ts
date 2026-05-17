/**
 * Phase 279 Verification Script - 12-Caste Method Framework Compatibility
 *
 * Proves the new 12-caste method framework can be used through additive
 * compatibility aliases while legacy runtime caste strings and persisted
 * sessions continue to resolve safely.
 *
 * Run: bun run src/verify-phase279.ts
 */

import {
  Caste,
  MethodCaste,
  casteDisplayName,
  legacyCasteForMethodCaste,
  listMethodCastes,
  methodCasteForLegacyCaste,
  resolveMethodCaste,
} from "./caste/enums";
import { colonyIdentityRegistry, normalizeCasteName } from "./runtime/identity";
import { ToolPermissionChecker } from "./runtime/tool-permissions";
import {
  createApprovalGatedDeliveryWorkflow,
  createStandardMethodWorkflow,
  createSwarmMethodWorkflow,
} from "./workflow/templates";
import { ColonySwarmRuntime } from "./orchestrator/swarm";

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

function verifyMethodCasteResolution(): void {
  section("1. Method Caste Compatibility Resolution");

  assertEqual(listMethodCastes().length, 12, "Method framework exposes exactly 12 canonical castes");

  const displayExpectations: Array<[string, MethodCaste, string]> = [
    ["Queen", MethodCaste.QUEEN, "Queen"],
    ["Eldest", MethodCaste.ELDEST, "Eldest"],
    ["Assist-Ant", MethodCaste.ASSIST_ANT, "Assist-Ant"],
    ["Command-ant", MethodCaste.COMMAND_ANT, "Command-ant"],
    ["Vigil-ant", MethodCaste.VIGIL_ANT, "Vigil-ant"],
    ["Develop-ant", MethodCaste.DEVELOP_ANT, "Develop-ant"],
    ["Logist-ant", MethodCaste.LOGIST_ANT, "Logist-ant"],
    ["Consult-ant", MethodCaste.CONSULT_ANT, "Consult-ant"],
    ["Inform-ant", MethodCaste.INFORM_ANT, "Inform-ant"],
    ["Cogniz-ant", MethodCaste.COGNIZ_ANT, "Cogniz-ant"],
    ["Account-ant", MethodCaste.ACCOUNT_ANT, "Account-ant"],
    ["Oper-ant", MethodCaste.OPER_ANT, "Oper-ant"],
  ];

  for (const [input, method, display] of displayExpectations) {
    assertEqual(resolveMethodCaste(input), method, `${input} resolves to canonical method caste`);
    assertEqual(casteDisplayName(input), display, `${input} displays with method framework label`);
    assert(colonyIdentityRegistry.getDefaultForCaste(input).displayName === display, `${input} resolves a default identity`);
  }

  assertEqual(resolveMethodCaste("command ant"), MethodCaste.COMMAND_ANT, "Spaced Command Ant alias resolves");
  assertEqual(resolveMethodCaste("command_ant"), MethodCaste.COMMAND_ANT, "Snake-case Command Ant alias resolves");
  assertEqual(resolveMethodCaste("Command-ant"), MethodCaste.COMMAND_ANT, "Hyphenated Command-ant alias resolves");
  assertEqual(normalizeCasteName("Command Ant"), MethodCaste.COMMAND_ANT, "Identity normalization uses method caste keys");
}

function verifyLegacyCasteAliases(): void {
  section("2. Legacy Runtime Caste Aliases");

  const legacyExpectations: Array<[Caste, MethodCaste, string]> = [
    [Caste.ROOT_QUEEN, MethodCaste.QUEEN, "Queen"],
    [Caste.ELDEST_ARCHITECT, MethodCaste.ELDEST, "Eldest"],
    [Caste.ASSIST_ANT, MethodCaste.ASSIST_ANT, "Assist-Ant"],
    [Caste.SHIELD_GENERALS, MethodCaste.VIGIL_ANT, "Vigil-ant"],
    [Caste.WATCHER_SWARM, MethodCaste.CONSULT_ANT, "Consult-ant"],
    [Caste.FORGE_CARVERS, MethodCaste.DEVELOP_ANT, "Develop-ant"],
    [Caste.CORE_SHAPERS, MethodCaste.LOGIST_ANT, "Logist-ant"],
    [Caste.LIAISON_ANTS, MethodCaste.INFORM_ANT, "Inform-ant"],
    [Caste.LORE_BURROW, MethodCaste.COGNIZ_ANT, "Cogniz-ant"],
    [Caste.LEDGER_ANTS, MethodCaste.ACCOUNT_ANT, "Account-ant"],
    [Caste.NAMELESS_SWARM, MethodCaste.OPER_ANT, "Oper-ant"],
  ];

  for (const [legacy, method, display] of legacyExpectations) {
    assertEqual(methodCasteForLegacyCaste(legacy), method, `${legacy} maps to method caste`);
    assertEqual(resolveMethodCaste(legacy), method, `${legacy} resolves as legacy persisted caste string`);
    assertEqual(casteDisplayName(legacy), display, `${legacy} displays with method label`);
    assertEqual(colonyIdentityRegistry.getDefaultForCaste(legacy).displayName, display, `${legacy} identity prefers method display`);
  }

  assertEqual(legacyCasteForMethodCaste(MethodCaste.DEVELOP_ANT), Caste.FORGE_CARVERS, "Develop-ant keeps Forge Carvers compatibility value");
  assertEqual(legacyCasteForMethodCaste(MethodCaste.CONSULT_ANT), Caste.WATCHER_SWARM, "Consult-ant keeps Watcher Swarm compatibility value");
  assertEqual(legacyCasteForMethodCaste(MethodCaste.COMMAND_ANT), undefined, "Command-ant has no destructive legacy enum alias");
}

function verifyPermissionDefaults(): void {
  section("3. Method Caste Permission Defaults");

  const checker = new ToolPermissionChecker();

  assert(!checker.checkShellCommand("echo plan", "command-agent", MethodCaste.COMMAND_ANT), "Command-ant cannot execute shell by default");
  assert(!checker.checkShellCommand("echo plan", "assist-agent", MethodCaste.ASSIST_ANT), "Assist-Ant remains shell-denied by default");
  assert(checker.checkShellCommand("bun run verify:phase279", "consult-agent", MethodCaste.CONSULT_ANT), "Consult-ant can run bounded verification commands");
  assert(!checker.checkShellCommand("bun run src/index.tsx", "consult-agent", MethodCaste.CONSULT_ANT), "Consult-ant cannot run arbitrary Bun commands");
  assert(!checker.checkShellCommand("echo mutate", "oper-agent", MethodCaste.OPER_ANT), "Oper-ant has no default shell mutation path");
  assert(checker.checkFilePath("src/verify-phase279.ts", "develop-agent", MethodCaste.DEVELOP_ANT), "Develop-ant keeps scoped file compatibility");
  assert(!checker.checkFilePath(".env", "oper-agent", MethodCaste.OPER_ANT), "Oper-ant remains blocked from secret-like paths");
}

function verifyWorkflowMethodRouting(): void {
  section("4. Method Workflow Routing");

  const standard = createStandardMethodWorkflow({
    id: "phase279-standard",
    objective: "Adopt the 12-caste method framework",
  });
  assertEqual(
    standard.steps.map((step) => step.metadata?.methodCaste).join(">"),
    [
      MethodCaste.ASSIST_ANT,
      MethodCaste.ELDEST,
      MethodCaste.COMMAND_ANT,
      MethodCaste.VIGIL_ANT,
      MethodCaste.ACCOUNT_ANT,
      MethodCaste.DEVELOP_ANT,
      MethodCaste.CONSULT_ANT,
      MethodCaste.VIGIL_ANT,
      MethodCaste.COGNIZ_ANT,
      MethodCaste.QUEEN,
      MethodCaste.ASSIST_ANT,
    ].join(">"),
    "Standard workflow follows method caste order",
  );

  const highRisk = createApprovalGatedDeliveryWorkflow({
    id: "phase279-high-risk",
    title: "High Risk Method Workflow",
    objective: "Mutate a guarded runtime path",
    requiredApprover: "human",
  });
  assert(
    highRisk.steps.some((step) => step.kind === "approval" && step.metadata?.methodCaste === MethodCaste.VIGIL_ANT),
    "High-risk delivery includes Vigil-ant approval gate",
  );
  assert(
    highRisk.steps.some((step) => step.kind === "approval" && step.metadata?.methodCaste === MethodCaste.ACCOUNT_ANT),
    "High-risk delivery includes Account-ant cost gate before mutation",
  );

  const swarm = createSwarmMethodWorkflow({
    id: "phase279-swarm",
    objective: "Fan out a bounded review",
  });
  assertEqual(
    swarm.steps.map((step) => step.metadata?.methodCaste).join(">"),
    [
      MethodCaste.COMMAND_ANT,
      MethodCaste.VIGIL_ANT,
      MethodCaste.OPER_ANT,
      MethodCaste.CONSULT_ANT,
      MethodCaste.ELDEST,
      MethodCaste.VIGIL_ANT,
      MethodCaste.QUEEN,
    ].join(">"),
    "Swarm workflow follows Command-ant to Oper-ant fanout and review order",
  );
}

async function verifySwarmWorkerCasteRouting(): Promise<void> {
  section("5. Swarm Worker Caste Routing");

  const runtime = new ColonySwarmRuntime();
  const snapshot = await runtime.startObjective({
    objective: "Validate method framework routing",
    title: "Phase 279 swarm",
  });
  const roles = new Map(snapshot.workers.map((worker) => [worker.role, worker.caste]));

  assertEqual(roles.get("planner"), MethodCaste.COMMAND_ANT, "Swarm planner uses Command-ant");
  assertEqual(roles.get("worker"), MethodCaste.OPER_ANT, "Swarm worker uses restricted Oper-ant");
  assertEqual(roles.get("reviewer"), MethodCaste.CONSULT_ANT, "Swarm reviewer uses Consult-ant");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 279 Verification (12-Caste Method Framework Compatibility)\n");

  verifyMethodCasteResolution();
  verifyLegacyCasteAliases();
  verifyPermissionDefaults();
  verifyWorkflowMethodRouting();
  await verifySwarmWorkerCasteRouting();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 279 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 279: 12-caste method framework compatibility is GREEN.");
}

main().catch((error) => {
  console.error("Phase 279 verification crashed:", error);
  process.exit(1);
});
