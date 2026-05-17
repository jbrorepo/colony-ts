/**
 * Phase 15 Verification Script - Memory Foundation
 *
 * Covers conversation logging, auto-memory extraction, retrieval formatting,
 * and loop prompt memory passthrough.
 *
 * Run: bun run src/verify-phase15.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import { AutoMemoryService, MemoryStore } from "./memory/auto-memory";
import { ConversationLogger } from "./memory/conversation-log";
import { ColonyMemoryService } from "./memory/service";
import { AgentLoop } from "./runtime/loop";
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

async function verifyConversationLogger(): Promise<void> {
  section("1. Conversation Logger");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-log-"));
  const logger = new ConversationLogger(dir);

  try {
    await logger.logTurn("ses_memory", "user", "Need architecture reminder.", {
      provider: "anthropic",
      token: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
    });
    await logger.logTurn("ses_memory", "assistant", "Architecture decision stays conservative.", {
      note: "keep approval per call",
    });

    const history = await logger.getHistory("ses_memory");
    assertEqual(history.length, 2, "Conversation logger stores two turns");
    assertEqual(history[0]?.role, "assistant", "Conversation logger returns newest first");
    assert(!history[1]!.content.includes("sk-ant-api03"), "Conversation logger redacts secrets");

    const search = await logger.searchHistory("ses_memory", "architecture");
    assertEqual(search.length, 2, "Conversation logger search finds both rows");

    const exported = await logger.exportSession("ses_memory");
    assert(exported.includes("# Session: ses_memory"), "Conversation logger exports markdown");
    assert(exported.includes("Architecture decision stays conservative"), "Conversation logger export keeps content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyAutoMemory(): Promise<void> {
  section("2. Auto Memory");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-store-"));
  const store = new MemoryStore(join(dir, "memories"));
  const autoMemory = new AutoMemoryService({ store });

  try {
    const extracted = await autoMemory.extractMemories([
      {
        role: "user",
        content: "We need an architecture decision about provider failover and strict approval policy.",
      },
      {
        role: "assistant",
        content: [
          "Architecture decision: keep conservative per-call approvals and provider failover local -> anthropic.",
          "Implementation note: prompt should include workspace and context window state.",
          "Constraint: do not install SDKs; raw fetch only.",
        ].join("\n\n"),
      },
    ], "assist-ant", "queen", "ses_auto");

    assert(extracted.length > 0, "Auto memory extracts at least one entry");
    assert(extracted[0]!.filePath.endsWith(".md"), "Auto memory persists markdown file");

    const surfaced = await autoMemory.surfaceRelevant({
      query: "What architecture decision did we make for approvals?",
      caste: "queen",
    });

    assert(surfaced.length > 0, "Auto memory surfaces relevant memory");
    assert(
      surfaced.some((entry) => entry.content.toLowerCase().includes("architecture decision")),
      "Relevant memory content preserved",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyMemoryRuntimeAndLoopPrompt(): Promise<void> {
  section("3. Memory Runtime + Loop Prompt");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-runtime-"));
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
    session = addMessage(session, createUserMessage(
      "Implementation detail: approval remains conservative and workspace detection should surface in prompt.",
    ));
    session = addMessage(session, createUserMessage(
      "Architecture decision: keep failover local then anthropic when local model unavailable.",
    ));

    const capture = await memory.captureSession(session);
    assert(capture.loggedCount > 0, "Memory runtime logs session history");

    const context = await memory.buildMemoryContext("approval architecture failover", session);
    assert(context.includes("approval"), "Memory runtime formats retrieved memory context");

    const loop = new AgentLoop({
      session,
      promptContext: {
        memoryContext: context,
      },
    });

    const messages = (loop as any)._buildMessages() as Array<{ role: string; content: string }>;
    assertEqual(messages[0]?.role, "system", "Loop prompt starts with system message");
    assert(messages[0]!.content.includes("Relevant context from past interactions"), "Loop prompt includes memory block");
    assert(messages[0]!.content.includes("failover"), "Loop prompt memory block carries retrieved content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 15 Verification (Memory Foundation)\n");

  await verifyConversationLogger();
  await verifyAutoMemory();
  await verifyMemoryRuntimeAndLoopPrompt();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 15 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 15: Memory foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
