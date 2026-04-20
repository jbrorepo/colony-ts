/**
 * Phase 16 Verification Script - Hybrid Memory Truth + Compression
 *
 * Proves canonical verbatim transcript stays separate from derived compact
 * artifacts, while HybridMemory can surface both with provenance.
 *
 * Run: bun run src/verify-phase16.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import { createMemoryArtifact, MemoryArtifactStore } from "./memory/artifact-store";
import { ConversationLogger } from "./memory/conversation-log";
import { HybridMemory } from "./memory/hybrid-memory";
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

async function verifyArtifactStoreAndHybridRecall(): Promise<void> {
  section("1. Artifact Provenance + Hybrid Recall");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-hybrid-"));
  const conversationLogger = new ConversationLogger(join(dir, "conversations"));
  const artifactStore = new MemoryArtifactStore(join(dir, "memory-artifacts"));
  const hybrid = new HybridMemory({ conversationLogger, artifactStore });

  try {
    const turn1 = await conversationLogger.logTurn("ses_a", "user", "We must preserve exact user wording for recall.", { topic: "memory" });
    const turn2 = await conversationLogger.logTurn("ses_a", "assistant", "Use caveman only for compact derived summaries, not source truth.", { topic: "memory" });

    const artifact = createMemoryArtifact({
      sessionId: "ses_a",
      transcriptPath: join(dir, "conversations", "ses_a.jsonl"),
      turns: [turn1, turn2],
      metadata: { caste: "assist_ant" },
    });

    assert(artifact !== null, "Memory artifact created from transcript turns");
    assertEqual(artifact!.sourceTurnIds.length, 2, "Artifact keeps both source turn IDs");
    assert(artifact!.cavemanSummary.length > 0, "Artifact stores caveman summary");
    assert(artifact!.aaakSummary.length > 0, "Artifact stores AAAK summary");
    assert(artifact!.verbatimExcerpt.includes("exact user wording"), "Artifact keeps verbatim excerpt");

    await artifactStore.appendArtifact(artifact!);

    const hybridResults = await hybrid.recall("exact wording caveman truth", {
      sessionId: "ses_a",
      topK: 5,
    });

    assert(hybridResults.some((result) => result.exact), "Hybrid recall returns exact transcript hit");
    assert(hybridResults.some((result) => !result.exact), "Hybrid recall returns derived artifact hit");
    assert(hybridResults.some((result) => result.content.includes("Derived compact recall. Not verbatim.")), "Derived hit is explicitly labeled non-verbatim");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyMemoryServiceContextFormatting(): Promise<void> {
  section("2. Memory Service Truth Formatting");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-service-"));
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
    session = addMessage(session, createUserMessage("Keep this exact phrase: ship it exactly as written."));
    session = addMessage(session, createUserMessage("Internal compaction may use caveman style, but stored transcript stays exact."));

    const capture = await memory.captureSession(session);
    assert(capture.loggedCount >= 2, "Memory service logs non-system transcript turns");
    assert(capture.artifact !== null, "Memory service writes derived artifact");
    assertEqual(capture.artifact!.sourceTurnIds.length, 2, "Derived artifact keeps turn provenance");

    const context = await memory.buildMemoryContext("ship it exactly caveman compaction", session);
    assert(context.includes("Verbatim recall (exact transcript excerpts):"), "Memory context has exact section");
    assert(context.includes("Derived compact recall (not verbatim; use to find truth, not replace it):"), "Memory context has derived section");
    assert(context.includes("ship it exactly as written"), "Memory context includes exact user wording");
    assert(context.includes("Caveman:"), "Memory context includes caveman-derived summary");
    assert(context.includes("AAAK:"), "Memory context includes MemPalace AAAK summary");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 16 Verification (Hybrid Memory Truth + Compression)\n");

  await verifyArtifactStoreAndHybridRecall();
  await verifyMemoryServiceContextFormatting();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 16 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 16: Hybrid memory truth layer is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
