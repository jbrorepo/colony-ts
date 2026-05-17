/**
 * Phase 64 Verification Script - Resolution Memory Recall
 *
 * Proves "what fixed it" statements are extracted as structured diagnostic
 * memory, ranked ahead of failure noise, and visible through query planning.
 *
 * Run: bun run src/verify-phase64.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import {
  ExtractedMemoryStore,
  MemoryExtractor,
  inferStructuredMemoryCategoryHints,
  inferStructuredRankingPlan,
} from "./memory/extractor";
import { hasDiagnosticIntent } from "./memory/query-intent";
import { ColonyMemoryService } from "./memory/service";
import { createSystemMessage, createUserMessage } from "./runtime/message";
import { PromptBuilder } from "./runtime/prompt-builder";
import { addMessage, createAgentSession } from "./runtime/session";

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

async function verifyResolutionExtractionAndPlanning(): Promise<void> {
  section("1. Resolution Extraction + Query Planning");

  const extractor = new MemoryExtractor();
  const memories = await extractor.extract([
    { role: "user", content: "The fix was to drop stale palace source hints before direct recall." },
    { role: "assistant", content: "Workaround: disable stale source hints when exact file routing is requested." },
  ], "assist-ant");

  assert(memories.some((memory) => memory.category === "diagnostic" && memory.content.includes("drop stale palace source hints")), "Extractor captures fix statements as diagnostics");
  assert(memories.some((memory) => memory.category === "diagnostic" && memory.content.includes("disable stale source hints")), "Extractor captures workaround statements as diagnostics");
  assert(inferStructuredMemoryCategoryHints("what fixed stale palace source hints").has("diagnostic"), "Structured hints treat what-fixed questions as diagnostic intent");
  assert(inferStructuredMemoryCategoryHints("what was the solution to stale palace source hints").has("diagnostic"), "Structured hints treat solution-to questions as diagnostic intent");
  assert(inferStructuredMemoryCategoryHints("what was the workaround for exact file routing").has("diagnostic"), "Structured hints treat workaround questions as diagnostic intent");
  assert(hasDiagnosticIntent("explain the solution architecture for layout") === false, "Generic solution architecture questions are not diagnostic intent");
  assert(hasDiagnosticIntent("what was the solution architecture for layout") === false, "Solution architecture questions are not diagnostic intent");

  const plan = inferStructuredRankingPlan("what fixed stale palace source hints");
  assertEqual(plan.focus, "diagnostic", "Structured query plan focuses fix questions on diagnostic memory");
  assert(plan.boosts.includes("intent-resolution"), "Structured query plan previews resolution boost");

  const solutionPlan = inferStructuredRankingPlan("what was the solution to stale palace source hints");
  assertEqual(solutionPlan.focus, "diagnostic", "Structured query plan focuses solution-to questions on diagnostic memory");
  assert(solutionPlan.boosts.includes("intent-resolution"), "Structured query plan previews solution-to resolution boost");
}

async function verifyResolutionRanking(): Promise<void> {
  section("2. Resolution Ranking");

  const dir = await mkdtemp(join(tmpdir(), "colony-resolution-memory-"));
  const store = new ExtractedMemoryStore(join(dir, "memory-extracts"));
  const extractor = new MemoryExtractor();

  try {
    const resolution = await extractor.extract([
      { role: "user", content: "The fix was to drop stale palace source hints before direct recall." },
    ], "assist-ant");
    await store.save("ses_resolution", "assist_ant", resolution);
    await store.save("ses_failure_noise", "assist_ant", [{
      content: "Stale palace source hints caused direct recall failures during routing cleanup.",
      scope: "colony",
      agentId: "",
      category: "diagnostic",
      confidence: 1,
      sourceTurn: 1,
      source: "keyword",
      contentHash: "resolution_noise",
      timestamp: Date.now() + 1,
    }]);
    await store.save("ses_unrelated_resolution", "assist_ant", [{
      content: "Resolution: cache was fixed by clearing logs.",
      scope: "colony",
      agentId: "",
      category: "diagnostic",
      confidence: 1,
      sourceTurn: 2,
      source: "keyword",
      contentHash: "unrelated_resolution",
      timestamp: Date.now() + 2,
    }]);

    const ranked = await store.surfaceRelevant({
      query: "what fixed stale palace source hints",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 5,
    });

    assertEqual(ranked[0]?.sessionId, "ses_resolution", "Store ranks fix memory over newer failure noise");
    assert(ranked[0]?.matchReasons?.includes("intent-resolution") === true, "Store preserves resolution match reason");
    assert(!ranked.some((record) => record.sessionId === "ses_unrelated_resolution"), "Resolution intent terms do not admit unrelated resolution records");

    const solutionRanked = await store.surfaceRelevant({
      query: "what was the solution to stale palace source hints",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 5,
    });

    assertEqual(solutionRanked[0]?.sessionId, "ses_resolution", "Store ranks fix memory for solution-to questions");
    assert(solutionRanked[0]?.matchReasons?.includes("intent-resolution") === true, "Store preserves solution-to resolution match reason");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyMemoryServiceResolutionContext(): Promise<void> {
  section("3. Memory Service Resolution Recall");

  const dir = await mkdtemp(join(tmpdir(), "colony-resolution-service-"));
  const memory = new ColonyMemoryService({ dataDir: dir });

  try {
    let session = createAgentSession({
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
    });
    session = addMessage(session, createSystemMessage(PromptBuilder.buildSystemPrompt({
      caste: Caste.ASSIST_ANT,
      agentId: "assist-ant",
    }), 100));
    session = addMessage(session, createUserMessage("The fix was to drop stale palace source hints before direct recall."));

    const capture = await memory.captureSession(session);
    assert(capture.structured.some((record) => record.category === "diagnostic" && record.content.includes("drop stale palace source hints")), "Memory service persists resolution diagnostic");

    const context = await memory.buildMemoryContext("what fixed stale palace source hints", session, {
      truthMode: "balanced",
    });
    assert(context.includes("Reusable diagnostics (derived, scoped, durable):"), "Memory context uses diagnostics section for resolution recall");
    assert(context.includes("drop stale palace source hints before direct recall"), "Memory context surfaces resolution diagnostic");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 64 Verification (Resolution Memory Recall)\n");

  await verifyResolutionExtractionAndPlanning();
  await verifyResolutionRanking();
  await verifyMemoryServiceResolutionContext();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 64 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 64: Resolution memory recall is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
