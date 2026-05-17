/**
 * Phase 81 Verification Script - Memory Recall Controls
 *
 * Covers the P0-Memory-Controls slice:
 *   1. `/memory plan <query>` previews exact/derived recall controls.
 *   2. The plan exposes MemPalace distance, graph-hop, and filter controls.
 *   3. The plan renders precision diagnostics without echoing raw query text.
 *
 * Run: bun run src/verify-phase81.ts
 */

import { Caste } from "./caste/enums";
import { SlashCommandParser } from "./gateway";
import { createAgentSession } from "./runtime/session";

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

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function createParser(): SlashCommandParser {
  const session = createAgentSession({
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
    tenantScope: "project-alpha",
    metadata: {
      workspaceName: "The Colony",
      workspacePrimaryTargets: ["project-alpha"],
    },
  });

  return new SlashCommandParser({
    session,
    runtime: {
      memoryTruthModeOverride: null,
      lastMemoryRecall: null,
    },
  });
}

function verifyExactRecallControls(): void {
  section("1. Exact Recall Controls");

  const parser = createParser();
  const plan = parser.tryHandle("/memory plan exact quote project alpha auth token facts source truth");

  assert(plan.handled, "Exact-control plan resolves");
  assert(!plan.isError, "Exact-control plan is not an error");
  assert(plan.output.includes("Recall controls:"), "Plan renders recall controls header");
  assert(plan.output.includes("Exact recall: enabled"), "Plan enables exact recall");
  assert(plan.output.includes("Derived recall: disabled"), "Plan disables derived recall for exact-only queries");
  assert(plan.output.includes("Distance threshold: strict"), "Plan exposes strict distance threshold label");
  assert(plan.output.includes("Graph hops: nearby=0 broader=0"), "Plan keeps graph traversal bounded for narrow exact recall");
  assert(plan.output.includes("Filter controls: hall=hall_facts wing=project-alpha room=auto source=auto"), "Plan exposes sanitized filter controls");
  assert(plan.output.includes("Precision diagnostics:"), "Plan renders precision diagnostics");
}

function verifyBroadPalaceControls(): void {
  section("2. Broad Palace Controls");

  const parser = createParser();
  const secretMarker = "sk_live_phase81_unique_secret_marker_92ab";
  const plan = parser.tryHandle(`/memory plan broader related project alpha auth rollout facts full context ${secretMarker} copied hidden body`);

  assert(plan.handled, "Broad-control plan resolves");
  assert(!plan.isError, "Broad-control plan is not an error");
  assert(plan.output.includes("Exact recall: enabled"), "Broad plan keeps exact recall enabled");
  assert(plan.output.includes("Derived recall: enabled"), "Broad plan keeps derived recall enabled");
  assert(plan.output.includes("Distance threshold: broad"), "Broad plan exposes broad distance threshold label");
  assert(plan.output.includes("Graph hops: nearby=1 broader=2"), "Broad plan exposes bounded graph hops");
  assert(plan.output.includes("Palace order: broader>related>nearby>direct"), "Broad plan preserves existing palace order preview");
  assert(plan.output.includes("Filter controls: hall=hall_facts wing=project-alpha room=auto source=auto"), "Broad plan exposes filter controls");
  assert(!plan.output.includes(secretMarker), "Broad plan does not echo unique secret marker");
  assert(!plan.output.includes("copied hidden body"), "Broad plan does not echo raw query fragment");
}

function verifyDerivedOnlyControls(): void {
  section("3. Derived-Only Controls");

  const parser = createParser();
  const plan = parser.tryHandle("/memory plan summarize project alpha rollout overview");

  assert(plan.handled, "Derived-control plan resolves");
  assert(!plan.isError, "Derived-control plan is not an error");
  assert(plan.output.includes("Truth mode: derived"), "Plan infers derived truth mode");
  assert(plan.output.includes("Exact recall: disabled"), "Derived-only plan disables exact recall");
  assert(plan.output.includes("Derived recall: enabled"), "Derived-only plan enables derived recall");
  assert(plan.output.includes("Palace search: disabled (derived-only)"), "Derived-only plan exposes palace-search boundary");
  assert(plan.output.includes("Distance threshold: disabled"), "Derived-only plan disables palace distance threshold");
  assert(plan.output.includes("Graph hops: nearby=0 broader=0"), "Derived-only plan disables palace graph traversal");
}

function main(): void {
  console.log("THE COLONY - Phase 81 Verification (Memory Recall Controls)\n");

  verifyExactRecallControls();
  verifyBroadPalaceControls();
  verifyDerivedOnlyControls();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 81: Memory recall controls are GREEN.");
}

main();
