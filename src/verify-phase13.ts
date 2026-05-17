/**
 * Phase 13 Verification Script - Runtime Identity
 *
 * Covers the SOUL-style identity registry, caste defaults, registration
 * semantics, and prompt-block rendering parity.
 *
 * Run: bun run src/verify-phase13.ts
 */

import { Caste, MethodCaste, listMethodCastes } from "./caste/enums";
import {
  AgentIdentity,
  IdentityError,
  IdentityRegistry,
  buildCasteDefaults,
  createAgentIdentity,
  createPersonaConfig,
  normalizeCasteName,
  renderPromptBlock,
} from "./runtime/identity";

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

function assertThrows(fn: () => unknown, expectedMessage: string, label: string): void {
  try {
    fn();
    assert(false, label);
  } catch (error) {
    assert(error instanceof IdentityError, `${label} throws IdentityError`);
    assert(String((error as Error).message).includes(expectedMessage), `${label} message`);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function verifyHelpers(): void {
  section("1. Helpers");

  assertEqual(normalizeCasteName("Shield Generals"), MethodCaste.VIGIL_ANT, "normalizeCasteName maps legacy names to method castes");

  const persona = createPersonaConfig();
  assertEqual(persona.roleDescription, "", "createPersonaConfig defaults roleDescription");
  assertEqual(persona.expertiseAreas.length, 0, "createPersonaConfig defaults empty expertise");

  const identity = createAgentIdentity();
  assertEqual(identity.agentId, "", "createAgentIdentity defaults agentId");
  assertEqual(identity.capabilities.length, 0, "createAgentIdentity defaults capabilities");
}

function verifyDefaults(): void {
  section("2. Caste Defaults");

  const defaults = buildCasteDefaults();
  assertEqual(Object.keys(defaults).length, listMethodCastes().length, "Every method caste has a default identity");

  const assist = defaults[MethodCaste.ASSIST_ANT];
  assertEqual(assist.displayName, "Assist-Ant", "Assist-Ant default display name");
  assertEqual(assist.persona.greetingTemplate, "Hello! I'm your Assist-Ant. How can I help you today?", "Assist-Ant greeting preserved");
  assert(assist.boundaries.includes("Do not execute shell commands"), "Assist-Ant shell boundary preserved");

  const oper = defaults[MethodCaste.OPER_ANT];
  assert(oper.capabilities.includes("Generate security findings"), "Oper-ant compatibility capabilities preserved");
  assert(oper.boundaries.includes("Do not exfiltrate data outside the colony"), "Oper-ant compatibility boundaries preserved");
}

function verifyRegistry(): void {
  section("3. Identity Registry");

  const registry = new IdentityRegistry();
  assertEqual(registry.listAll().length, listMethodCastes().length, "Registry preloads method caste defaults");

  const shieldDefaults = registry.getByCaste("Shield Generals");
  assertEqual(shieldDefaults.length, 1, "getByCaste normalizes space-separated caste");
  assertEqual(shieldDefaults[0]?.agentId, "default_shield_generals", "getByCaste returns default shield identity");
  assertEqual(shieldDefaults[0]?.displayName, "Vigil-ant", "getByCaste returns method display for legacy shield identity");

  const defaultForge = registry.getDefaultForCaste(Caste.FORGE_CARVERS);
  assertEqual(defaultForge.displayName, "Develop-ant", "getDefaultForCaste returns method display for forge compatibility identity");
  assertThrows(
    () => registry.getDefaultForCaste("unknown_caste"),
    "No default identity for caste",
    "Missing default caste",
  );

  const custom: AgentIdentity = createAgentIdentity({
    agentId: "assist_custom_1",
    displayName: "Assist Custom",
    caste: Caste.ASSIST_ANT,
    persona: createPersonaConfig({
      roleDescription: "Custom agent.",
      communicationStyle: "plain",
    }),
    capabilities: ["Handle custom tasks"],
    boundaries: ["Do not improvise"],
    escalationRules: ["Escalate if blocked"],
  });

  registry.register(custom);
  assertEqual(registry.get("assist_custom_1")?.displayName, "Assist Custom", "register stores custom identity");
  assertEqual(registry.getByCaste(Caste.ASSIST_ANT).length, 2, "Custom identity appears alongside caste default");

  assertThrows(
    () => registry.register(custom),
    "Identity already registered",
    "Duplicate custom identity rejected",
  );

  const updated = createAgentIdentity({
    ...custom,
    displayName: "Assist Custom Updated",
  });
  registry.registerOrReplace(updated);
  assertEqual(registry.get("assist_custom_1")?.displayName, "Assist Custom Updated", "registerOrReplace overwrites existing identity");

  const overriddenDefault = createAgentIdentity({
    ...defaultForge,
    displayName: "Forge Carver Override",
  });
  registry.register(overriddenDefault);
  assertEqual(registry.get("default_forge_carvers")?.displayName, "Forge Carver Override", "register allows overriding default identities");

  assert(registry.unregister("assist_custom_1"), "unregister removes custom identity");
  assert(!registry.unregister("missing_agent"), "unregister returns false for missing identity");

  registry.reset();
  assertEqual(registry.listAll().length, listMethodCastes().length, "reset restores only method defaults");
  assertEqual(registry.get("default_forge_carvers")?.displayName, "Develop-ant", "reset restores method default identity");
}

function verifyPromptRendering(): void {
  section("4. Prompt Rendering");

  const identity = createAgentIdentity({
    agentId: "custom_prompt_agent",
    displayName: "Prompt Agent",
    caste: Caste.LIAISON_ANTS,
    persona: createPersonaConfig({
      roleDescription: "Bridge internal and external communication.",
      communicationStyle: "formal and clear",
      expertiseAreas: ["translation", "briefings"],
      behavioralDirectives: ["Adapt to audience", "Keep sensitive details internal"],
      systemPromptPrefix: "PREFIX LINE",
      systemPromptSuffix: "SUFFIX LINE",
    }),
    capabilities: ["Draft briefings"],
    boundaries: ["Do not leak secrets"],
    escalationRules: ["Escalate disclosure concerns"],
  });

  const block = renderPromptBlock(identity);
  assert(block.startsWith("PREFIX LINE"), "renderPromptBlock includes prefix");
  assert(block.includes("## Identity: Prompt Agent"), "renderPromptBlock includes identity header");
  assert(block.includes(`Caste: ${Caste.LIAISON_ANTS}`), "renderPromptBlock includes caste");
  assert(block.includes("Communication style: formal and clear"), "renderPromptBlock includes communication style");
  assert(block.includes("### Expertise"), "renderPromptBlock includes expertise section");
  assert(block.includes("- Draft briefings"), "renderPromptBlock includes capabilities section");
  assert(block.includes("## The Colony Manifesto"), "renderPromptBlock injects manifesto");
  assert(block.includes("### Escalation"), "renderPromptBlock includes escalation section");
  assert(block.endsWith("SUFFIX LINE"), "renderPromptBlock includes suffix");

  const noManifestoBlock = renderPromptBlock(identity, { includeManifesto: false });
  assert(!noManifestoBlock.includes("## The Colony Manifesto"), "renderPromptBlock can omit manifesto");

  const registry = new IdentityRegistry();
  registry.register(identity);
  const resolvedByAgent = registry.toPromptBlock("custom_prompt_agent", Caste.ROOT_QUEEN);
  assert(resolvedByAgent.includes("Prompt Agent"), "toPromptBlock prefers agent_id over caste");

  const resolvedByCaste = registry.toPromptBlock("", Caste.ROOT_QUEEN);
  assert(resolvedByCaste.includes("## Identity: Queen"), "toPromptBlock falls back to method caste default");

  const noManifestoResolved = registry.toPromptBlock("", Caste.ROOT_QUEEN, { includeManifesto: false });
  assert(!noManifestoResolved.includes("## The Colony Manifesto"), "toPromptBlock forwards manifesto option");

  assertThrows(
    () => registry.toPromptBlock("missing_agent", "missing_caste"),
    "Cannot resolve identity",
    "Missing prompt identity",
  );
}

function main(): void {
  console.log("\nTHE COLONY - Phase 13 Verification (Runtime Identity)\n");

  verifyHelpers();
  verifyDefaults();
  verifyRegistry();
  verifyPromptRendering();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 13 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 13: Runtime identity is GREEN.");
}

main();
