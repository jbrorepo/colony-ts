/**
 * Phase 63 Verification Script - Ownership Memory Extraction
 *
 * Proves ownership/responsibility facts are extracted, ranked ahead of topical
 * noise, and surfaced through the memory context for operator recall.
 *
 * Run: bun run src/verify-phase63.ts
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import { MemoryStore } from "./memory/auto-memory";
import { ColonyMemoryService } from "./memory/service";
import { ExtractedMemoryStore, MemoryExtractor, inferStructuredMemoryCategoryHints } from "./memory/extractor";
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

async function verifyOwnershipExtraction(): Promise<void> {
  section("1. Ownership + Responsibility Extraction");

  const extractor = new MemoryExtractor();
  const memories = await extractor.extract([
    { role: "user", content: "Owner: Platform Memory Team owns recall routing review for colony-ts." },
    { role: "assistant", content: "Responsibility: Runtime Operators are responsible for queue drain follow-up in src/runtime/message-queue.ts." },
  ], "assist-ant");

  assert(memories.some((memory) => memory.category === "fact" && memory.content.includes("Platform Memory Team owns recall routing review")), "Extractor captures owner facts");
  assert(memories.some((memory) => memory.category === "fact" && memory.content.includes("Runtime Operators are responsible for queue drain follow-up")), "Extractor captures responsibility facts");
  assert(inferStructuredMemoryCategoryHints("who owns recall routing review").has("fact"), "Structured hints treat ownership asks as fact intent");
  assert(inferStructuredMemoryCategoryHints("who is responsible for queue drain follow-up").has("fact"), "Structured hints treat responsibility asks as fact intent");
}

async function verifyOwnershipRanking(): Promise<void> {
  section("2. Ownership Ranking");

  const dir = await mkdtemp(join(tmpdir(), "colony-ownership-memory-"));
  const store = new ExtractedMemoryStore(join(dir, "memory-extracts"));
  const extractor = new MemoryExtractor();

  try {
    const ownership = await extractor.extract([
      { role: "user", content: "Owner: Platform Memory Team owns recall routing review for colony-ts." },
    ], "assist-ant");
    await store.save("ses_owner", "assist_ant", ownership);
    await store.save("ses_noise", "assist_ant", [{
      content: "Recall routing review status changed during dashboard cleanup.",
      scope: "colony",
      agentId: "",
      category: "fact",
      confidence: 1,
      sourceTurn: 1,
      source: "keyword",
      contentHash: "ownership_noise",
      timestamp: Date.now() + 1,
    }]);

    const ranked = await store.surfaceRelevant({
      query: "who owns recall routing review",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 2,
    });

    assertEqual(ranked[0]?.sessionId, "ses_owner", "Store ranks owner memory over newer topical noise");
    assert(ranked[0]?.matchReasons?.includes("intent-ownership") === true, "Store preserves ownership match reason");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyLoadedMemorySanitizationAndAdmission(): Promise<void> {
  section("3. Memory Sanitization + Admission");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-load-hardening-"));
  const baseDir = join(dir, "memory-extracts");
  const store = new ExtractedMemoryStore(baseDir);

  try {
    await mkdir(baseDir, { recursive: true });
    await writeFile(join(baseDir, "ses_secret.jsonl"), `${JSON.stringify({
      content: "Provider key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 belongs to rollout diagnostics.",
      scope: "colony",
      agentId: "assist-ant-sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      category: "fact",
      confidence: 1,
      sourceTurn: 0,
      source: "keyword",
      contentHash: "loaded_secret_record_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      timestamp: Date.now(),
      sessionId: "ses_secret_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      caste: "assist_ant_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      filePath: "memory-extracts/sk-proj-abcdefghijklmnopqrstuvwxyz1234567890.jsonl",
    })}\n`, "utf8");

    const loaded = await store.surfaceRelevant({
      query: "provider rollout diagnostics",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 1,
    });

    assert(loaded[0]?.content.includes("sk-proj-****") === true, "Loaded persisted memories are sanitized before surfacing");
    assert(loaded[0]?.content.includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded persisted memories do not surface raw secret bodies");
    assert(JSON.stringify(loaded[0] ?? {}).includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded persisted memory metadata does not surface raw secret fragments");

    const saved = await store.save("ses_save_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890", "assist_ant_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890", [{
      content: "Saved provider key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 belongs to rollout diagnostics.",
      scope: "agent",
      agentId: "assist-ant-sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      category: "fact",
      confidence: 1,
      sourceTurn: 1,
      source: "keyword",
      contentHash: "saved_secret_record_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      timestamp: Date.now() + 1,
    }]);

    assert(JSON.stringify(saved[0] ?? {}).includes("abcdefghijklmnopqrstuvwxyz") === false, "Saved persisted memory metadata is sanitized before cache/write");
    const savedFiles = await readdir(baseDir);
    assert(!savedFiles.some((fileName) => fileName.includes("abcdefghijklmnopqrstuvwxyz")), "Saved persisted memory filenames do not preserve raw secret fragments");

    await store.save("ses_unrelated_metric", "assist_ant", [{
      content: "Token quota for kitchen inventory stayed 99k.",
      scope: "colony",
      agentId: "",
      category: "metric",
      confidence: 1,
      sourceTurn: 1,
      source: "keyword",
      contentHash: "unrelated_metric_record",
      timestamp: Date.now() + 1,
    }]);

    const unrelatedMetric = await store.surfaceRelevant({
      query: "what metric did rollout use",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });

    assert(!unrelatedMetric.some((record) => record.sessionId === "ses_unrelated_metric"), "Structured metric boosts do not admit unrelated records without content overlap");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyLoadedMarkdownMemorySanitization(): Promise<void> {
  section("4. Loaded Markdown Memory Sanitization");

  const dir = await mkdtemp(join(tmpdir(), "colony-markdown-memory-load-hardening-"));
  const baseDir = join(dir, "memory");
  const secretCaste = "assist_ant_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890";
  const casteDir = join(baseDir, secretCaste);
  const store = new MemoryStore(baseDir);

  try {
    await mkdir(casteDir, { recursive: true });
    await writeFile(join(casteDir, "runtime.md"), [
      "# sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 runtime",
      "",
      "<!-- agent:assist-ant-sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 session:ses_markdown_secret_sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 ts:123 turn:1 source:heuristic-sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 -->",
      "",
      "Provider key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890 belongs to rollout diagnostics.",
      "",
      "---",
      "",
    ].join("\n"), "utf8");

    const loaded = await store.surfaceRelevant({
      query: "provider rollout diagnostics",
      caste: secretCaste,
      maxFiles: 1,
    });

    assert(loaded[0]?.content.includes("sk-proj-****") === true, "Loaded markdown memories are sanitized before surfacing");
    assert(loaded[0]?.content.includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded markdown memories do not surface raw secret bodies");
    assert(loaded[0]?.topic.includes("sk-proj-****") === true, "Loaded markdown topics are sanitized before surfacing");
    assert(loaded[0]?.topic.includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded markdown topics do not surface raw secret fragments");
    assert(loaded[0]?.caste.includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded markdown caste metadata does not surface raw secret fragments");
    assert(!loaded[0]?.relevanceKeywords.some((keyword) => keyword.includes("abcdefghijklmnopqrstuvwxyz")), "Loaded markdown relevance keywords do not preserve raw secret fragments");
    assert(JSON.stringify(loaded[0] ?? {}).includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded markdown metadata does not surface raw secret fragments");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyMemoryServiceOwnershipContext(): Promise<void> {
  section("5. Memory Service Ownership Recall");

  const dir = await mkdtemp(join(tmpdir(), "colony-ownership-service-"));
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
    session = addMessage(session, createUserMessage("Owner: Platform Memory Team owns recall routing review for colony-ts."));

    const capture = await memory.captureSession(session);
    assert(capture.structured.some((record) => record.content.includes("Platform Memory Team owns recall routing review")), "Memory service persists ownership fact");

    const context = await memory.buildMemoryContext("who owns recall routing review", session, {
      truthMode: "balanced",
    });
    assert(context.includes("Reusable facts (derived, scoped, durable):"), "Memory context includes reusable facts section");
    assert(context.includes("Platform Memory Team owns recall routing review"), "Memory context surfaces ownership fact");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 63 Verification (Ownership Memory Extraction)\n");

  await verifyOwnershipExtraction();
  await verifyOwnershipRanking();
  await verifyLoadedMemorySanitizationAndAdmission();
  await verifyLoadedMarkdownMemorySanitization();
  await verifyMemoryServiceOwnershipContext();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 63 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 63: Ownership memory extraction is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
