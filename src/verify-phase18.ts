/**
 * Phase 18 Verification Script - Structured Reusable Fact Memory
 *
 * Proves Python-style extracted memories are categorized, scoped, deduped,
 * persisted, and surfaced beside verbatim and compact recall.
 *
 * Run: bun run src/verify-phase18.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import { ColonyMemoryService } from "./memory/service";
import { ExtractedMemoryStore, MemoryExtractor } from "./memory/extractor";
import { createAssistantMessage, createSystemMessage, createUserMessage, serializeMessage } from "./runtime/message";
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

async function verifyExtractorCategoriesAndScope(): Promise<void> {
  section("1. Extractor Categories + Scope");

  const extractor = new MemoryExtractor();
  const memories = await extractor.extract([
    { role: "user", content: "We decided to keep raw fetch only for every provider integration." },
    { role: "user", content: "Never install SDK packages anywhere in colony-ts." },
    { role: "assistant", content: "Assist-ant pattern: approval prompts stay scoped to this agent." },
    { role: "user", content: "I prefer caveman compression only for outbound remote prompts." },
    { role: "user", content: "Never install SDK packages anywhere in colony-ts." },
  ], "assist-ant");

  assert(memories.some((memory) => memory.category === "decision"), "Extractor captures decision category");
  assert(memories.some((memory) => memory.category === "constraint"), "Extractor captures constraint category");
  assert(memories.some((memory) => memory.category === "pattern"), "Extractor captures pattern category");
  assert(memories.some((memory) => memory.category === "preference"), "Extractor captures preference category");

  const agentMemory = memories.find((memory) => memory.scope === "agent");
  assert(Boolean(agentMemory), "Extractor infers agent-scoped memory");
  assertEqual(agentMemory?.agentId ?? "", "assist-ant", "Agent-scoped memory keeps agent id");

  const constraintMemories = memories.filter((memory) => memory.content.includes("Never install SDK packages"));
  assertEqual(constraintMemories.length, 1, "Extractor deduplicates repeated content by hash");
}

async function verifyStoreScopeFilteringAndPersistence(): Promise<void> {
  section("2. Store Scope Filtering + Persistence");

  const dir = await mkdtemp(join(tmpdir(), "colony-extracted-store-"));
  const store = new ExtractedMemoryStore(join(dir, "memory-extracts"));
  const extractor = new MemoryExtractor();

  try {
    const extracted = await extractor.extract([
      { role: "user", content: "Decision: raw fetch only for providers." },
      { role: "assistant", content: "Assist-ant pattern: compact summaries stay local to this agent." },
    ], "assist-ant");

    const firstSave = await store.save("ses_store", "assist_ant", extracted);
    const secondSave = await store.save("ses_store_2", "assist_ant", extracted);

    assert(firstSave.length >= 2, "Store persists extracted memories");
    assert(firstSave.every((record) => record.filePath.endsWith(".jsonl")), "Store writes JSONL records");
    assertEqual(secondSave.length, 0, "Store deduplicates identical memories across sessions");

    const sameAgent = await store.surfaceRelevant({
      query: "raw fetch compact summaries",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 5,
    });
    const otherAgent = await store.surfaceRelevant({
      query: "compact summaries",
      agentId: "root-queen",
      caste: "root_queen",
      limit: 5,
    });

    assert(sameAgent.some((record) => record.scope === "agent"), "Matching agent can recall agent-scoped facts");
    assert(!otherAgent.some((record) => record.scope === "agent"), "Different agent cannot recall agent-scoped facts");
    assert(sameAgent.some((record) => record.content.includes("raw fetch only")), "Store ranks relevant colony fact");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyMemoryServiceStructuredContextAndCompactionHandoff(): Promise<void> {
  section("3. Memory Service Structured Recall");

  const dir = await mkdtemp(join(tmpdir(), "colony-structured-memory-"));
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
    session = addMessage(session, createUserMessage("We decided to keep raw fetch only for every provider integration."));
    session = addMessage(session, createAssistantMessage("Assist-ant pattern: approval prompts stay scoped to this agent."));
    session = addMessage(session, createUserMessage("I prefer caveman compression only for outbound remote prompts."));

    const capture = await memory.captureSession(session);
    assert(capture.structured.length >= 3, "Memory service persists structured extracted memories");
    assert(capture.structured.some((record) => record.category === "decision"), "Structured memory keeps category metadata");

    const handoff = await memory.captureCompaction({
      sessionId: session.sessionId,
      agentId: session.agentId,
      caste: String(session.caste),
      compactedMessages: [
        serializeMessage(createUserMessage("Decision: exact transcript stays source truth.")),
        serializeMessage(createAssistantMessage("Assist-ant pattern: derived summary never replaces verbatim memory.")),
      ],
      strategy: "standard",
      triggerSource: "test",
      summary: "Compaction happened in verify",
    });
    assert(handoff.structured.length >= 1, "Compaction handoff also persists structured memories");

    const context = await memory.buildMemoryContext("raw fetch source truth caveman approval prompts", session);
    assert(context.includes("Reusable facts (derived, scoped, durable):"), "Memory context includes reusable facts section");
    assert(context.includes("raw fetch only"), "Memory context surfaces colony decision fact");
    assert(context.includes("agent:assist-ant/pattern"), "Memory context labels agent-scoped facts");
    assert(context.includes("source truth"), "Compaction handoff facts participate in recall");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 18 Verification (Structured Reusable Fact Memory)\n");

  await verifyExtractorCategoriesAndScope();
  await verifyStoreScopeFilteringAndPersistence();
  await verifyMemoryServiceStructuredContextAndCompactionHandoff();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 18 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 18: Structured reusable fact memory is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
