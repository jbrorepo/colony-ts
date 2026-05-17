/**
 * Phase 232 Verification Script - Memory Real-Session QA Matrix
 *
 * Proves Alpha 3 memory/MemPalace QA against a real session fixture:
 * exact transcript truth, derived facts, ownership ranking, decisions,
 * file/path and issue references, procedures, and MemPalace route hints.
 *
 * Run: bun run src/verify-phase232.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import {
  buildMemoryRealSessionRecallQaMatrix,
  ColonyMemoryService,
} from "./memory/service";
import { PalaceStore } from "./mempalace/store";
import { createAssistantMessage, createSystemMessage, createUserMessage } from "./runtime/message";
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

async function seedPalace(palaceDir: string): Promise<void> {
  const store = await PalaceStore.open({ palacePath: palaceDir, create: true });
  try {
    store.addBatch([
      {
        id: "phase232_issue_path",
        content: "Issue #482 maps to path src/memory/service.ts for Alpha 3 recall routing.",
        wing: "alpha-memory",
        room: "recall-routing",
        hall: "hall_facts",
        sourceFile: "src/memory/service.ts",
        importance: 5,
        emotionalWeight: 0.4,
        metadata: { fixture: "phase232", kind: "issue-path" },
      },
      {
        id: "phase232_procedure",
        content: "Procedure runbook: Step 1: run bun run verify:phase232. Step 2: inspect Memory routing note. Step 3: update docs only when truth changes.",
        wing: "alpha-memory",
        room: "recall-routing",
        hall: "hall_advice",
        sourceFile: "docs/runbooks/memory-alpha3.md",
        importance: 5,
        emotionalWeight: 0.4,
        metadata: { fixture: "phase232", kind: "procedure" },
      },
    ]);
  } finally {
    store.close();
  }
}

async function verifyRealSessionMatrix(): Promise<void> {
  section("1. Real-Session Recall Matrix");

  const dir = await mkdtemp(join(tmpdir(), "colony-phase232-memory-"));
  const palaceDir = join(dir, "palace");
  const identityPath = join(dir, "identity.txt");

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(identityPath, "## L0 - IDENTITY\nPhase 232 fixture identity.", "utf8");
    await seedPalace(palaceDir);

    const memory = new ColonyMemoryService({
      dataDir: dir,
      mempalacePath: palaceDir,
      mempalaceIdentityPath: identityPath,
    });

    let session = createAgentSession({
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      tenantScope: "alpha-memory",
      metadata: {
        workspaceName: "alpha-memory",
        workspacePrimaryTargets: ["alpha-memory"],
      },
    });
    session = addMessage(session, createSystemMessage(PromptBuilder.buildSystemPrompt({
      caste: Caste.ASSIST_ANT,
      agentId: "assist-ant",
    }), 100));
    session = addMessage(session, createUserMessage(
      "For real-session QA, exact transcript marker ORCHID-TRANSCRIPT-742 exists only in canonical transcript truth.",
    ));
    session = addMessage(session, createAssistantMessage(
      "Decision: keep exact transcript truth separate from derived memory artifacts for Alpha 3.",
    ));
    session = addMessage(session, createUserMessage(
      "Owner: Lore Burrow Team owns recall routing review for issue #482 in src/memory/service.ts.",
    ));
    session = addMessage(session, createAssistantMessage(
      "Procedure: Step 1: run bun run verify:phase232. Step 2: inspect Memory routing note. Step 3: update docs only when truth changes.",
    ));

    const capture = await memory.captureSession(session);
    assert(capture.loggedCount >= 4, "Fixture session logs canonical transcript turns");
    assert(capture.structured.some((entry) => entry.category === "decision"), "Fixture extracts decision memory");
    assert(capture.structured.some((entry) => entry.category === "procedure"), "Fixture extracts procedure memory");
    assert(capture.structured.some((entry) => entry.category === "fact" && entry.content.includes("Lore Burrow Team owns recall routing review")), "Fixture extracts owner fact");

    await memory.extractedMemoryStore.save("ses_phase232_noise", "assist_ant", [{
      content: "Recall routing review for issue #482 appeared in a generic planning note with no owner assigned.",
      scope: "colony",
      agentId: "",
      category: "fact",
      confidence: 1,
      sourceTurn: 1,
      source: "keyword",
      contentHash: "phase232_generic_noise",
      timestamp: Date.now() + 10,
    }]);

    const matrix = await buildMemoryRealSessionRecallQaMatrix(memory, session, [
      {
        id: "exact-transcript-truth",
        query: "exact quote ORCHID TRANSCRIPT 742 canonical transcript truth",
        truthMode: "exact_only",
        requiredText: ["ORCHID-TRANSCRIPT-742 exists only in canonical transcript truth"],
        forbiddenText: ["Derived compact recall", "Reusable facts"],
        expectedTruthMode: "exact_only",
        expectedShownSections: ["exact"],
      },
      {
        id: "derived-fact-provenance",
        query: "remind me who owns recall routing review issue 482",
        requiredText: [
          "Lore Burrow Team owns recall routing review for issue #482",
          "Recall routing review for issue #482 appeared in a generic planning note",
        ],
        expectedTextOrder: [{
          before: "Lore Burrow Team owns recall routing review for issue #482",
          after: "Recall routing review for issue #482 appeared in a generic planning note",
        }],
        expectedIntentTags: ["ownership", "fact"],
        expectedShownSections: ["structured"],
      },
      {
        id: "decision-derived-visibility",
        query: "what decision did we make about exact transcript truth for Alpha 3",
        requiredText: ["keep exact transcript truth separate from derived memory artifacts"],
        expectedIntentTags: ["decision"],
      },
      {
        id: "path-issue-palace-route",
        query: "which file path is tied to issue 482 recall routing alpha-memory src memory service",
        requiredText: ["Issue #482 maps to path src/memory/service.ts"],
        expectedIntentTags: ["entity"],
        expectedPalace: {
          resolvedWing: "alpha-memory",
          resolvedRoom: "recall-routing",
          resolvedHall: "hall_facts",
          resolvedSourceFile: "src/memory/service.ts",
        },
      },
      {
        id: "procedure-palace-route",
        query: "what procedure steps for recall routing phase232 runbook",
        requiredText: ["Step 1: run bun run verify:phase232"],
        expectedIntentTags: ["procedure"],
        expectedPalace: {
          resolvedWing: "alpha-memory",
          resolvedRoom: "recall-routing",
          resolvedHall: "hall_advice",
          resolvedSourceFile: "docs/runbooks/memory-alpha3.md",
        },
      },
    ]);

    assertEqual(matrix.length, 5, "QA matrix returns one result per fixture case");
    for (const result of matrix) {
      assert(result.passed, `${result.id} passes with no matrix failures: ${result.failures.join("; ")}`);
      assert(result.routingNotePresent, `${result.id} exposes memory routing note`);
      assert(result.queryHash.length === 16, `${result.id} uses a bounded query hash instead of raw query echo`);
    }

    const exact = matrix.find((entry) => entry.id === "exact-transcript-truth");
    assertEqual(exact?.truthMode, "exact_only", "Exact case records exact-only truth mode");
    assert((exact?.counts.exact.shown ?? 0) > 0, "Exact case shows transcript-backed truth");
    assertEqual(exact?.counts.compact.shown, 0, "Exact case does not substitute derived compact memory");

    const derived = matrix.find((entry) => entry.id === "derived-fact-provenance");
    assert(derived?.truthProvenance.includes("remind-me") === true || derived?.truthProvenance.includes("ownership") === true, "Derived case records fact provenance");
    assert(derived?.intentTags.includes("ownership") === true, "Derived case records ownership intent");
    assert((derived?.counts.structured.shown ?? 0) >= 2, "Derived case surfaces structured fact evidence");

    const path = matrix.find((entry) => entry.id === "path-issue-palace-route");
    assertEqual(path?.palace.path.resolvedSourceFile, "src/memory/service.ts", "Path case records resolved source-file route");
    assert((path?.counts.palace.total.shown ?? 0) > 0, "Path case surfaces MemPalace drawer evidence");

    const procedure = matrix.find((entry) => entry.id === "procedure-palace-route");
    assertEqual(procedure?.palace.path.resolvedHall, "hall_advice", "Procedure case records advice/procedure hall route");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 232 Verification (Memory Real-Session QA Matrix)\n");

  await verifyRealSessionMatrix();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 232 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 232: Memory real-session QA matrix is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
