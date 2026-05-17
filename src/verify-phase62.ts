/**
 * Phase 62 Verification Script - Memory Query Plan Inspection
 *
 * Covers the next Phase 2 memory polish slice:
 *   1. `/memory plan <query>` previews inferred truth mode and section order without retrieval
 *   2. The plan exposes palace hall/wing/traversal decisions before a run
 *   3. The plan is body-safe and does not echo raw query text
 *
 * Run: bun run src/verify-phase62.ts
 */

import { Caste } from "./caste/enums";
import { SlashCommandParser } from "./gateway";
import { MemoryExtractor } from "./memory/extractor";
import { inferStructuredMemoryCategoryHints } from "./memory/structured-ranking";
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

function verifyQueryPlanPreview(): void {
  section("1. Query Plan Preview");

  const parser = createParser();
  const plan = parser.tryHandle("/memory plan why did project alpha auth token rotation need broader related context copied secret body text");

  assert(plan.handled, "/memory plan resolves");
  assert(!plan.isError, "/memory plan is not an error");
  assert(plan.output.includes("Memory Query Plan:"), "Plan renders header");
  assert(plan.output.includes("Truth mode: prefer-derived"), "Plan previews inferred truth mode");
  assert(plan.output.includes("Truth source:"), "Plan exposes truth provenance");
  assert(plan.output.includes("Section order: derived>exact"), "Plan exposes exact/derived section order");
  assert(plan.output.includes("Derived order: structured>compact"), "Plan exposes derived section order");
  assert(plan.output.includes("Intent tags:"), "Plan exposes intent tags");
  assert(plan.output.includes("reasoning"), "Plan includes reasoning intent");
  assert(plan.output.includes("Palace hint: hall_facts/project-alpha"), "Plan exposes palace hall/wing hint");
  assert(plan.output.includes("Hall source:"), "Plan exposes hall provenance");
  assert(plan.output.includes("Wing source:"), "Plan exposes wing provenance");
  assert(plan.output.includes("Palace order: broader>related>nearby>direct"), "Plan exposes palace traversal order");
  assert(plan.output.includes("Expand: yes"), "Plan previews nearby expansion");
  assert(plan.output.includes("Broaden: yes"), "Plan previews broader traversal");
  assert(plan.output.includes("This view does not read memory stores or emit recalled content."), "Plan states non-retrieving boundary");
  assert(!plan.output.includes("copied secret body text"), "Plan does not echo raw query text");
}

function verifyPlanUsageAndOverride(): void {
  section("2. Usage and Override Behavior");

  const parser = createParser();
  const secretMarker = "sk_live_phase62_unknown_mode_secret_4b2d11";
  const missing = parser.tryHandle("/memory plan");
  assert(missing.handled, "/memory plan without query resolves");
  assert(missing.isError, "/memory plan without query is an error");
  assert(missing.output.includes("Usage: /memory plan <query>"), "Missing query shows usage");

  const unknown = parser.tryHandle(`/memory ${secretMarker} raw hidden body fragment`);
  assert(unknown.handled, "/memory unknown mode resolves");
  assert(unknown.isError, "/memory unknown mode is an error");
  assert(unknown.output.includes("Unknown memory mode."), "Unknown mode reports sanitized error");
  assert(!unknown.output.includes(secretMarker), "Unknown mode does not echo unique secret marker");
  assert(!unknown.output.includes("raw hidden body fragment"), "Unknown mode does not echo raw query fragment");

  const exactParser = new SlashCommandParser({
    session: createAgentSession({
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      tenantScope: "project-alpha",
    }),
    runtime: {
      memoryTruthModeOverride: "exact_only",
      lastMemoryRecall: null,
    },
  });
  const exactPlan = exactParser.tryHandle("/memory plan summarize project alpha rollout context");
  assert(exactPlan.handled, "/memory plan with override resolves");
  assert(!exactPlan.isError, "/memory plan with override is not an error");
  assert(exactPlan.output.includes("Truth mode: exact"), "Plan honors explicit runtime memory override");
  assert(exactPlan.output.includes("Truth source: explicit"), "Plan labels explicit override source");
  assert(exactPlan.output.includes("Section order: exact>derived"), "Plan section order follows override");
}

function verifyStructuredRankingPlan(): void {
  section("3. Structured Ranking Preview");

  const parser = createParser();
  const secretMarker = "sk_live_phase62_unique_secret_marker_7f3c91";
  const ownershipPlan = parser.tryHandle(`/memory plan who owns recall routing review ${secretMarker} raw hidden body fragment`);

  assert(ownershipPlan.handled, "/memory plan ownership query resolves");
  assert(!ownershipPlan.isError, "/memory plan ownership query is not an error");
  assert(ownershipPlan.output.includes("Structured focus: fact via ownership"), "Plan previews ownership structured focus");
  assert(ownershipPlan.output.includes("Structured hints: fact, entity"), "Plan previews ownership structured hints");
  assert(ownershipPlan.output.includes("Structured boosts: category-fact, intent-ownership"), "Plan previews ownership ranking boosts");
  assert(!ownershipPlan.output.includes(secretMarker), "Ownership plan does not echo unique secret marker");
  assert(!ownershipPlan.output.includes("raw hidden body fragment"), "Ownership plan does not echo raw query fragment");
  assert(!ownershipPlan.output.includes("phase62_unique_secret_marker"), "Ownership plan does not echo marker substring");

  const metricPlan = parser.tryHandle(`/memory plan what p95 SLO did rollout use ${secretMarker} raw hidden body fragment`);

  assert(metricPlan.handled, "/memory plan metric query resolves");
  assert(!metricPlan.isError, "/memory plan metric query is not an error");
  assert(metricPlan.output.includes("Structured focus: metric via metric"), "Plan previews metric structured focus");
  assert(metricPlan.output.includes("Structured hints: metric, fact"), "Plan previews metric structured hints");
  assert(metricPlan.output.includes("Structured boosts: category-metric, intent-metric"), "Plan previews metric ranking boosts");
  assert(!metricPlan.output.includes(secretMarker), "Metric plan does not echo unique secret marker");
  assert(!metricPlan.output.includes("raw hidden body fragment"), "Metric plan does not echo raw query fragment");
  assert(!metricPlan.output.includes("phase62_unique_secret_marker"), "Metric plan does not echo marker substring");
}

async function verifyStructuredBoundaryMatching(): Promise<void> {
  section("4. Structured Boundary Matching");

  assert(!inferStructuredMemoryCategoryHints("prevent regression").has("event"), "Structured hints do not match event inside prevent/regression");
  assert(!inferStructuredMemoryCategoryHints("artifact recall").has("fact"), "Structured hints do not match fact inside artifact");

  const extractor = new MemoryExtractor();
  const pathosExtracted = await extractor.extract([
    { role: "assistant", content: "The pathos marker is unrelated durable filler text for boundary matching." },
  ]);
  const artifactExtracted = await extractor.extract([
    { role: "assistant", content: "The artifact recall marker is unrelated durable filler text for boundary matching." },
  ]);

  assert(!pathosExtracted.some((entry) => entry.category === "entity"), "Keyword extractor does not match path inside pathos");
  assert(!artifactExtracted.some((entry) => entry.category === "fact"), "Keyword extractor does not match fact inside artifact");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 62 Verification (Memory Query Plan Inspection)\n");

  verifyQueryPlanPreview();
  verifyPlanUsageAndOverride();
  verifyStructuredRankingPlan();
  await verifyStructuredBoundaryMatching();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 62: Memory query plan inspection is GREEN.");
}

void main();
