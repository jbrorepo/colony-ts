/**
 * Phase 17 Verification Script - Compaction Handoff Memory Bridge
 *
 * Proves verbatim compacted turns are handed off to memory before they leave
 * the live session, and that identity-based sync avoids duplicate transcript
 * rows across repeated captures.
 *
 * Run: bun run src/verify-phase17.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import { ColonyMemoryService } from "./memory/service";
import { createSystemMessage, createUserMessage, createAssistantMessage } from "./runtime/message";
import { PromptBuilder } from "./runtime/prompt-builder";
import { CompactionEngine } from "./runtime/compaction";
import { AgentLoop } from "./runtime/loop";
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

async function verifyCompactionHandoffPreservesVerbatimTruth(): Promise<void> {
  section("1. Compaction Handoff Preserves Verbatim Truth");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-handoff-"));
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

    await memory.syncSession(session);

    session = addMessage(session, createUserMessage("Keep exact sentence alpha for future recall."));
    session = addMessage(session, createAssistantMessage("Caveman compression is derived only, never source truth."));
    session = addMessage(session, createUserMessage("Most recent turn stays live after compaction."));

    let handoffCount = 0;
    const loop = new AgentLoop({
      session,
      compactionEngine: new CompactionEngine({
        caste: Caste.ASSIST_ANT,
        preserveRecent: 1,
        contextWindowTokens: 256,
      }),
      onCompactionHandoff: async (handoff) => {
        handoffCount++;
        await memory.captureCompaction({
          sessionId: handoff.sessionId,
          agentId: handoff.agentId,
          caste: handoff.caste,
          compactedMessages: handoff.compactedMessages,
          strategy: handoff.result.strategyUsed,
          triggerSource: handoff.result.triggerSource,
          summary: handoff.result.summary,
        });
      },
    });

    const result = await loop.compactNow("standard", true);
    await memory.captureSession(loop.session);

    assertEqual(handoffCount, 1, "Compaction handoff fires exactly once");
    assert(result.compacted, "Compaction happened");
    assertEqual(Object.prototype.hasOwnProperty.call(result, "compactedMessages"), false, "Public compaction result stays small");
    assertEqual(result.summarizedMessageCount, 2, "Older unsynced messages were compacted");
    assert(
      !loop.session.history.some(
        (message) => message.type === "user" && String(message.content ?? "").includes("Keep exact sentence alpha"),
      ),
      "Live session no longer holds the original compacted user turn",
    );

    const context = await memory.buildMemoryContext("alpha caveman source truth", loop.session);
    assert(context.includes("Keep exact sentence alpha for future recall"), "Exact compacted user wording still recalls from transcript");
    assert(context.includes("Derived compact recall"), "Compaction handoff also persists derived artifact recall");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyIdentityBasedSyncAvoidsDuplicates(): Promise<void> {
  section("2. Identity-Based Sync Avoids Duplicates");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-dedupe-"));
  const memory = new ColonyMemoryService({ dataDir: dir });

  try {
    let session = createAgentSession({
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
    });
    session = addMessage(session, createSystemMessage("System prompt", 100));
    session = addMessage(session, createUserMessage("Do not log this twice."));
    session = addMessage(session, createAssistantMessage("One transcript row only."));

    const first = await memory.captureSession(session);
    const second = await memory.captureSession(session);
    const history = await memory.conversationLogger.getHistory(session.sessionId, 0);

    assertEqual(first.loggedCount, 3, "First capture logs all session messages once");
    assertEqual(second.loggedCount, 0, "Second capture logs no duplicate messages");
    assertEqual(history.length, 3, "Transcript row count stays stable after repeated capture");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 17 Verification (Compaction Handoff Memory Bridge)\n");

  await verifyCompactionHandoffPreservesVerbatimTruth();
  await verifyIdentityBasedSyncAvoidsDuplicates();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 17 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 17: Compaction memory handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
