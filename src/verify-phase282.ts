/**
 * Phase 282 Verification Script - Runtime Method Caste Prompt Frontier
 *
 * Keeps model-facing identity and prompt-template output on canonical method
 * caste names while legacy enum strings remain accepted compatibility input.
 */

import { Caste, MethodCaste, casteDisplayName, listMethodCastes } from "./caste/enums";
import { colonyIdentityRegistry } from "./runtime/identity";
import { getCastePromptTemplate, listCastePromptTemplates } from "./runtime/prompt-templates";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.log(`  FAIL ${message}`);
    failed += 1;
    return;
  }

  console.log(`  PASS ${message}`);
  passed += 1;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function assertNoLegacyDisplay(text: string, context: string): void {
  for (const legacy of [
    "Root Queen",
    "Eldest Architect",
    "Assist Ant",
    "Shield General",
    "Shield Generals",
    "Watcher Swarm",
    "Forge Carver",
    "Forge Carvers",
    "Core Shaper",
    "Core Shapers",
    "Liaison Ant",
    "Liaison Ants",
    "Ledger Ant",
    "Ledger Ants",
    "Lore Burrow",
    "Lore Keeper",
    "Nameless Swarm",
    "Nameless Worker",
    "Nameless Agent",
  ]) {
    assert(!text.includes(legacy), `${context} omits legacy display term ${legacy}`);
  }
}

function verifyDefaultIdentityPromptBlocks(): void {
  console.log("\n============================================================");
  console.log("  1. Default identity prompt blocks");
  console.log("============================================================");

  for (const method of listMethodCastes()) {
    const display = casteDisplayName(method);
    const identity = colonyIdentityRegistry.getDefaultForCaste(method);
    const prompt = colonyIdentityRegistry.toPromptBlock("", method, { includeManifesto: false });

    assertEqual(identity.displayName, display, `${display} default identity uses method display label`);
    assertEqual(identity.caste, method, `${display} default identity uses method caste key`);
    assert(prompt.includes(`## Identity: ${display}`), `${display} prompt block uses method identity heading`);
    assert(prompt.includes(`Caste: ${method}`), `${display} prompt block uses method caste key`);
    assertNoLegacyDisplay(prompt, `${display} prompt block`);
  }
}

function verifyLegacyInputsResolveToMethodPromptBlocks(): void {
  console.log("\n============================================================");
  console.log("  2. Legacy identity inputs resolve to method prompt blocks");
  console.log("============================================================");

  const cases: Array<[string, MethodCaste, string]> = [
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

  for (const [legacy, method, display] of cases) {
    const identity = colonyIdentityRegistry.getDefaultForCaste(legacy);
    const prompt = colonyIdentityRegistry.toPromptBlock("", legacy, { includeManifesto: false });

    assertEqual(identity.displayName, display, `${legacy} resolves to ${display} identity`);
    assertEqual(identity.caste, method, `${legacy} resolves to ${method} caste key`);
    assert(prompt.includes(`## Identity: ${display}`), `${legacy} prompt block uses ${display} heading`);
    assert(prompt.includes(`Caste: ${method}`), `${legacy} prompt block uses ${method} key`);
    assertNoLegacyDisplay(prompt, `${legacy} prompt block`);
  }
}

function verifyPromptTemplates(): void {
  console.log("\n============================================================");
  console.log("  3. Prompt template outputs");
  console.log("============================================================");

  assertEqual(listCastePromptTemplates().length, 12, "Prompt template list exposes exactly 12 method castes");

  for (const method of listMethodCastes()) {
    const display = casteDisplayName(method);
    const template = getCastePromptTemplate(method);
    const rendered = [
      template.title,
      template.role,
      template.personality,
      template.delegationPrompt,
      ...template.guidelines,
    ].join("\n");

    assertEqual(template.caste, method, `${display} template uses method caste key`);
    assertEqual(template.title, display, `${display} template uses method title`);
    assertNoLegacyDisplay(rendered, `${display} prompt template`);
  }

  assertEqual(getCastePromptTemplate(Caste.FORGE_CARVERS).title, "Develop-ant", "Forge compatibility resolves Develop-ant template");
  assertEqual(getCastePromptTemplate("Watcher Swarm").title, "Consult-ant", "Watcher compatibility resolves Consult-ant template");
}

function main(): void {
  console.log("THE COLONY - Phase 282 Verification (Runtime Method Caste Prompt Frontier)\n");
  verifyDefaultIdentityPromptBlocks();
  verifyLegacyInputsResolveToMethodPromptBlocks();
  verifyPromptTemplates();

  console.log("\n============================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 282: Runtime method caste prompt frontier is GREEN.");
}

main();
