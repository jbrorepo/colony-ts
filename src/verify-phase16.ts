/**
 * Phase 16 Verification Script - Hybrid Memory Truth + Compression
 *
 * Proves canonical verbatim transcript stays separate from derived compact
 * artifacts, while HybridMemory can surface both with provenance.
 *
 * Run: bun run src/verify-phase16.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { Caste } from "./caste/enums";
import { createMemoryArtifact, MemoryArtifactStore } from "./memory/artifact-store";
import { AutoMemoryService, MemoryStore } from "./memory/auto-memory";
import { ConversationLogger } from "./memory/conversation-log";
import { ExtractedMemoryStore, MemoryExtractor, inferStructuredMemoryCategoryHints } from "./memory/extractor";
import { extractKeywords, HybridMemory, inferConversationRolePreference, inferMemorySessionScopePreference, inferMemoryTimePreference, scoreLiteralPhraseMatch } from "./memory/hybrid-memory";
import { hasAdviceIntent, hasComparisonIntent, hasConstraintIntent, hasDecisionIntent, hasDiagnosticIntent, hasDiscoveryIntent, hasEntityIntent, hasEventIntent, hasFactIntent, hasMetricIntent, hasPatternIntent, hasPreferenceIntent, hasProcedureIntent, hasReasoningIntent, hasRiskIntent } from "./memory/query-intent";
import { ColonyMemoryService, inferCompactDerivedFocus, inferCompactDerivedFocusProvenance, inferDerivedSectionPriority, inferDerivedSectionPriorityProvenance, inferMemoryIntentTags, inferMemorySectionPriority, inferMemoryTruthMode, inferMemoryTruthProvenance, inferMempalaceBroadenProvenance, inferMempalaceExpandProvenance, inferMempalaceHall, inferMempalaceHallProvenance, inferMempalaceRoom, inferMempalaceWing, inferMempalaceWingProvenance, inferPalaceRecallPriority, inferPalaceRecallPriorityProvenance, inferStructuredFocusProvenance, rankTunnelRooms, shouldBroadenMempalaceTraversal, shouldExpandMempalaceContext } from "./memory/service";
import { createSystemMessage, createUserMessage } from "./runtime/message";
import { PromptBuilder } from "./runtime/prompt-builder";
import { addMessage, createAgentSession } from "./runtime/session";
import { PalaceStore } from "./mempalace/store";

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

function sumTaggedCountMix(fragment: string | undefined): number {
  if (!fragment || fragment === "none") return 0;
  return fragment
    .split(",")
    .map((part) => Number(part.split("=")[1] ?? 0))
    .reduce((sum, count) => sum + count, 0);
}

function taggedCount(fragment: string | undefined, label: string): number {
  if (!fragment || fragment === "none") return 0;
  const entry = fragment
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${label}=`));
  return Number(entry?.split("=")[1] ?? 0);
}

function taggedValue(fragment: string | undefined, label: string): string | undefined {
  if (!fragment || fragment === "none") return undefined;
  const entry = fragment
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${label}=`));
  return entry?.split("=")[1];
}

function classifySectionState(total: number, shown: number): "empty" | "truncated" | "full" {
  if (total === 0) return "empty";
  return shown < total ? "truncated" : "full";
}

function formatSectionStateMix(entries: Array<[string, string | undefined]>): string {
  const parts = entries
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([label, state]) => `${label}=${state}`);
  return parts.join(",") || "none";
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function removeWithRetry(path: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === "EBUSY" || code === "EPERM") && attempt < 9) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
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

    const archiveTurn = await conversationLogger.logTurn("ses_archive", "assistant", "Exact wording caveman truth should survive in archived memory too.", { topic: "memory" });
    const archiveArtifact = createMemoryArtifact({
      sessionId: "ses_archive",
      transcriptPath: join(dir, "conversations", "ses_archive.jsonl"),
      turns: [archiveTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(archiveArtifact !== null, "Archived memory artifact created for cross-session ranking");
    await artifactStore.appendArtifact(archiveArtifact!);

    const techTurn = await conversationLogger.logTurn("ses_tech", "assistant", "TTY check failed under WSL for gpt-4o fallback via shell_exec.", { topic: "runtime" });
    const techArtifact = createMemoryArtifact({
      sessionId: "ses_tech",
      transcriptPath: join(dir, "conversations", "ses_tech.jsonl"),
      turns: [techTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(techArtifact !== null, "Technical memory artifact created for punctuation-heavy recall");
    await artifactStore.appendArtifact(techArtifact!);

    const hybridResults = await hybrid.recall("exact wording caveman truth", {
      sessionId: "ses_a",
      topK: 5,
    });

    assert(hybridResults.some((result) => result.exact), "Hybrid recall returns exact transcript hit");
    assert(hybridResults.some((result) => !result.exact), "Hybrid recall returns derived artifact hit");
    assert(hybridResults.some((result) => result.content.includes("Derived compact recall. Not verbatim.")), "Derived hit is explicitly labeled non-verbatim");

    const exactOnly = await hybrid.recall("exact wording caveman truth", {
      sessionId: "ses_a",
      topK: 5,
      truthMode: "exact_only",
    });
    assert(exactOnly.length > 0, "Hybrid recall exact_only still returns transcript hits");
    assert(exactOnly.every((result) => result.exact), "Hybrid recall exact_only filters derived hits");

    const derivedOnly = await hybrid.recall("exact wording caveman truth", {
      sessionId: "ses_a",
      topK: 5,
      truthMode: "derived_only",
    });
    assert(derivedOnly.length > 0, "Hybrid recall derived_only still returns artifact hits");
    assert(derivedOnly.every((result) => !result.exact), "Hybrid recall derived_only filters exact hits");
    assertEqual(derivedOnly[0]?.sessionId, "ses_a", "Derived artifact recall prefers current session artifact over archived tie");

    const technicalArtifact = await hybrid.recall("tty wsl gpt-4o shell_exec", {
      sessionId: "ses_tech",
      topK: 5,
      truthMode: "derived_only",
    });
    assert(technicalArtifact.some((result) => result.content.includes("Derived compact recall. Not verbatim.")), "Derived artifact recall matches technical identifiers with punctuation");

    await mkdir(artifactStore.baseDir, { recursive: true });
    await writeFile(artifactStore.artifactPath("ses_artifact_secret"), `${JSON.stringify({
      artifactId: "artifact_secret_probe",
      sessionId: "ses_artifact_secret",
      createdAt: new Date().toISOString(),
      strategy: "hybrid",
      sourceTurnIds: ["secret_turn"],
      sourceRoles: ["assistant"],
      transcriptPath: join(dir, "conversations", "ses_artifact_secret.jsonl"),
      verbatimExcerpt: "Artifact secret probe rollout diagnostics used sk-proj-abcdefghijklmnopqrstuvwxyz1234567890.",
      verbatimChars: 94,
      cavemanSummary: "artifact secret probe rollout diagnostics sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      aaakSummary: "artifact secret probe rollout diagnostics sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      metadata: { note: "artifact metadata sk-proj-abcdefghijklmnopqrstuvwxyz1234567890" },
    })}\n`, "utf8");
    const secretArtifact = await hybrid.recall("artifact secret probe rollout diagnostics", {
      topK: 3,
      truthMode: "derived_only",
    });
    const secretArtifactHit = secretArtifact.find((result) => result.sessionId === "ses_artifact_secret");
    assert(secretArtifactHit?.content.includes("sk-proj-****") === true, "Loaded memory artifacts sanitize secret content before derived recall");
    assert(secretArtifactHit?.content.includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded memory artifacts do not surface raw secret bodies");
    assert(JSON.stringify(secretArtifactHit?.metadata ?? {}).includes("abcdefghijklmnopqrstuvwxyz") === false, "Loaded memory artifact metadata does not surface raw secret fragments");

    const crossSessionDerived = await hybrid.recall("archived memory should survive", {
      sessionId: "ses_a",
      topK: 5,
      truthMode: "derived_only",
    });
    assert(crossSessionDerived.some((result) => result.sessionId === "ses_archive"), "Derived artifact recall falls back across sessions when current session lacks hit");

    const compareTurn = await conversationLogger.logTurn("ses_compare_art", "assistant", "We changed provider routing from local-only mode to mixed-provider defaults after fallback issues.", { topic: "runtime" });
    const compareArtifact = createMemoryArtifact({
      sessionId: "ses_compare_art",
      transcriptPath: join(dir, "conversations", "ses_compare_art.jsonl"),
      turns: [compareTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyCompareTurn = await conversationLogger.logTurn("ses_compare_noise", "assistant", "Provider routing status stayed healthy and provider routing remained visible in status output.", { topic: "runtime" });
    const noisyCompareArtifact = createMemoryArtifact({
      sessionId: "ses_compare_noise",
      transcriptPath: join(dir, "conversations", "ses_compare_noise.jsonl"),
      turns: [noisyCompareTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(compareArtifact !== null && noisyCompareArtifact !== null, "Comparison artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(compareArtifact!);
    await artifactStore.appendArtifact(noisyCompareArtifact!);

    const compareDerived = await hybrid.recall("what changed about provider routing", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(compareDerived[0]?.sessionId, "ses_compare_art", "Derived artifact recall prefers change summary for comparison query");

    const decisionTurn = await conversationLogger.logTurn("ses_decision_art", "assistant", "We decided to keep mixed-provider fallback as the default provider routing plan.", { topic: "runtime" });
    const decisionArtifact = createMemoryArtifact({
      sessionId: "ses_decision_art",
      transcriptPath: join(dir, "conversations", "ses_decision_art.jsonl"),
      turns: [decisionTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyDecisionTurn = await conversationLogger.logTurn("ses_decision_noise", "assistant", "Provider routing runtime status stayed visible in the environment panel all day.", { topic: "runtime" });
    const noisyDecisionArtifact = createMemoryArtifact({
      sessionId: "ses_decision_noise",
      transcriptPath: join(dir, "conversations", "ses_decision_noise.jsonl"),
      turns: [noisyDecisionTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(decisionArtifact !== null && noisyDecisionArtifact !== null, "Decision artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(decisionArtifact!);
    await artifactStore.appendArtifact(noisyDecisionArtifact!);

    const decisionDerived = await hybrid.recall("what did we decide about provider routing", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(decisionDerived[0]?.sessionId, "ses_decision_art", "Derived artifact recall prefers decision summary for decision query");

    const eventTurn = await conversationLogger.logTurn("ses_event_art", "assistant", "During the debug session the provider probe failed first, then fallback recovered.", { topic: "runtime" });
    const eventArtifact = createMemoryArtifact({
      sessionId: "ses_event_art",
      transcriptPath: join(dir, "conversations", "ses_event_art.jsonl"),
      turns: [eventTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyEventTurn = await conversationLogger.logTurn("ses_event_noise", "assistant", "Debug session provider settings and runtime details remained visible in the environment panel.", { topic: "runtime" });
    const noisyEventArtifact = createMemoryArtifact({
      sessionId: "ses_event_noise",
      transcriptPath: join(dir, "conversations", "ses_event_noise.jsonl"),
      turns: [noisyEventTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(eventArtifact !== null && noisyEventArtifact !== null, "Event artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(eventArtifact!);
    await artifactStore.appendArtifact(noisyEventArtifact!);

    const eventDerived = await hybrid.recall("what happened during the debug session", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(eventDerived[0]?.sessionId, "ses_event_art", "Derived artifact recall prefers timeline summary for event query");

    const entityTurn = await conversationLogger.logTurn("ses_entity_art", "assistant", "Entity note: fallback provider was gpt-4o, env var was OPENAI_API_KEY, endpoint stayed https://api.openai.com/v1, and tool path stayed /tmp/colony.log.", { topic: "runtime" });
    const entityArtifact = createMemoryArtifact({
      sessionId: "ses_entity_art",
      transcriptPath: join(dir, "conversations", "ses_entity_art.jsonl"),
      turns: [entityTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyEntityTurn = await conversationLogger.logTurn("ses_entity_noise", "assistant", "Runtime status remained healthy and rollout details stayed visible in the environment panel.", { topic: "runtime" });
    const noisyEntityArtifact = createMemoryArtifact({
      sessionId: "ses_entity_noise",
      transcriptPath: join(dir, "conversations", "ses_entity_noise.jsonl"),
      turns: [noisyEntityTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(entityArtifact !== null && noisyEntityArtifact !== null, "Entity artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(entityArtifact!);
    await artifactStore.appendArtifact(noisyEntityArtifact!);

    const entityDerived = await hybrid.recall("which provider handled fallback", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(entityDerived[0]?.sessionId, "ses_entity_art", "Derived artifact recall prefers entity summary for provider/file-style query");
    const entityEnvDerived = await hybrid.recall("which env var enabled fallback", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(entityEnvDerived[0]?.sessionId, "ses_entity_art", "Derived artifact recall prefers entity summary for env-var query");

    const metricTurn = await conversationLogger.logTurn("ses_metric_art", "assistant", "Metric note: rollout latency budget stayed 120ms and token budget stayed 8k during fallback drills.", { topic: "runtime" });
    const metricArtifact = createMemoryArtifact({
      sessionId: "ses_metric_art",
      transcriptPath: join(dir, "conversations", "ses_metric_art.jsonl"),
      turns: [metricTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyMetricTurn = await conversationLogger.logTurn("ses_metric_noise", "assistant", "Rollout status stayed healthy and runtime details remained visible in the environment panel.", { topic: "runtime" });
    const noisyMetricArtifact = createMemoryArtifact({
      sessionId: "ses_metric_noise",
      transcriptPath: join(dir, "conversations", "ses_metric_noise.jsonl"),
      turns: [noisyMetricTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(metricArtifact !== null && noisyMetricArtifact !== null, "Metric artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(metricArtifact!);
    await artifactStore.appendArtifact(noisyMetricArtifact!);

    const metricDerived = await hybrid.recall("what latency budget did rollout use", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(metricDerived[0]?.sessionId, "ses_metric_art", "Derived artifact recall prefers metric summary for budget/perf query");

    const procedureTurn = await conversationLogger.logTurn("ses_procedure_art", "assistant", "Procedure note: rollout review runbook is first check doctor status, then inspect fallback logs, then rerun the guarded command.", { topic: "runtime" });
    const procedureArtifact = createMemoryArtifact({
      sessionId: "ses_procedure_art",
      transcriptPath: join(dir, "conversations", "ses_procedure_art.jsonl"),
      turns: [procedureTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyProcedureTurn = await conversationLogger.logTurn("ses_procedure_noise", "assistant", "Rollout review status stayed healthy and provider details remained visible in the environment panel.", { topic: "runtime" });
    const noisyProcedureArtifact = createMemoryArtifact({
      sessionId: "ses_procedure_noise",
      transcriptPath: join(dir, "conversations", "ses_procedure_noise.jsonl"),
      turns: [noisyProcedureTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(procedureArtifact !== null && noisyProcedureArtifact !== null, "Procedure artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(procedureArtifact!);
    await artifactStore.appendArtifact(noisyProcedureArtifact!);

    const procedureDerived = await hybrid.recall("what playbook steps should we follow for rollout review", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(procedureDerived[0]?.sessionId, "ses_procedure_art", "Derived artifact recall prefers procedure summary for runbook/playbook query");

    const diagnosticTurn = await conversationLogger.logTurn("ses_diag_art", "assistant", "Diagnostic note: shell_exec failure came from missing allowlist entry, not provider outage.", { topic: "runtime" });
    const diagnosticArtifact = createMemoryArtifact({
      sessionId: "ses_diag_art",
      transcriptPath: join(dir, "conversations", "ses_diag_art.jsonl"),
      turns: [diagnosticTurn],
      metadata: { caste: "assist_ant" },
    });
    const noisyDiagnosticTurn = await conversationLogger.logTurn("ses_diag_noise", "assistant", "Provider routing stayed healthy while rollout status remained visible in the environment panel.", { topic: "runtime" });
    const noisyDiagnosticArtifact = createMemoryArtifact({
      sessionId: "ses_diag_noise",
      transcriptPath: join(dir, "conversations", "ses_diag_noise.jsonl"),
      turns: [noisyDiagnosticTurn],
      metadata: { caste: "assist_ant" },
    });
    assert(diagnosticArtifact !== null && noisyDiagnosticArtifact !== null, "Diagnostic artifacts created for intent-aware derived recall");
    await artifactStore.appendArtifact(diagnosticArtifact!);
    await artifactStore.appendArtifact(noisyDiagnosticArtifact!);

    const diagnosticDerived = await hybrid.recall("what error caused shell_exec failure", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(diagnosticDerived[0]?.sessionId, "ses_diag_art", "Derived artifact recall prefers diagnostic summary for failure/root-cause query");

    const preferExact = await hybrid.recall("exact wording caveman truth", {
      sessionId: "ses_a",
      topK: 5,
      truthMode: "prefer_exact",
    });
    assert(preferExact[0]?.exact === true, "Hybrid recall prefer_exact ranks transcript truth first");

    await conversationLogger.logTurn("ses_b", "user", "Decision: operator approvals stay conservative by default.", { topic: "security" });
    await conversationLogger.logTurn("ses_b", "tool", "tool stdout: operator approvals stay conservative by default [exit code: 0]", { toolName: "shell_exec" });

    const humanFirst = await hybrid.recall("exact operator approvals decision", {
      sessionId: "ses_b",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(humanFirst[0]?.role, "user", "Exact recall prefers human turns over tool sludge for non-tool query");

    const toolFirst = await hybrid.recall("exact tool output for operator approvals exit code", {
      sessionId: "ses_b",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(toolFirst[0]?.role, "tool", "Exact recall prefers tool turns when query explicitly asks for tool output");

    await conversationLogger.logTurn("ses_d", "assistant", "TTY check failed under WSL for gpt-4o fallback via shell_exec.", { topic: "runtime" });
    const technicalRecall = await hybrid.recall("tty wsl gpt-4o shell_exec", {
      sessionId: "ses_d",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(technicalRecall[0]?.role, "assistant", "Exact recall matches technical identifiers with punctuation and short tokens");

    await conversationLogger.logTurn("ses_c", "user", "I said: keep operator approvals conservative.", { topic: "security" });
    await conversationLogger.logTurn("ses_c", "assistant", "I said: keep operator approvals conservative.", { topic: "security" });

    const userFirst = await hybrid.recall("what did i say about operator approvals", {
      sessionId: "ses_c",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(userFirst[0]?.role, "user", "Exact recall prefers user turns when query asks what I said");

    const assistantFirst = await hybrid.recall("what did you say about operator approvals", {
      sessionId: "ses_c",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(assistantFirst[0]?.role, "assistant", "Exact recall prefers assistant turns when query asks what you said");

    await conversationLogger.logTurn("ses_reason", "user", "Why did we keep operator approvals conservative by default?", { topic: "security" });
    await conversationLogger.logTurn("ses_reason", "assistant", "Because dangerous tools need conservative approvals to avoid unsafe execution.", { topic: "security" });
    const rationaleFirst = await hybrid.recall("why did we keep operator approvals conservative", {
      sessionId: "ses_reason",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(rationaleFirst[0]?.role, "assistant", "Exact recall prefers assistant explanation turns for why queries");
    assert(
      Array.isArray(rationaleFirst[0]?.metadata?.recallReasons)
        && rationaleFirst[0]!.metadata.recallReasons.includes("role-assistant")
        && rationaleFirst[0]!.metadata.recallReasons.includes("intent-reasoning"),
      "Exact recall metadata surfaces assistant explanation boost reasons",
    );

    await conversationLogger.logTurn("ses_reason_short", "user", "Why did we keep operator approvals conservative by default?", { topic: "security" });
    await conversationLogger.logTurn("ses_reason_short", "assistant", "Because it was unsafe.", { topic: "security" });
    const rationaleCarry = await hybrid.recall("why did we keep operator approvals conservative", {
      sessionId: "ses_reason_short",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(rationaleCarry[0]?.role, "assistant", "Exact recall carries why-query context from adjacent user question into assistant answer ranking");
    assert(
      Array.isArray(rationaleCarry[0]?.metadata?.recallReasons)
        && rationaleCarry[0]!.metadata.recallReasons.includes("context-carry"),
      "Exact recall metadata surfaces adjacent context-carry reason",
    );

    await conversationLogger.logTurn("ses_decision", "user", "What did we decide about provider routing?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_decision", "assistant", "We decided to keep mixed-provider fallback by default.", { topic: "runtime" });
    const decisionFirst = await hybrid.recall("what did we decide about provider routing", {
      sessionId: "ses_decision",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(decisionFirst[0]?.role, "assistant", "Exact recall prefers assistant decision answers for decision queries");

    await conversationLogger.logTurn("ses_advice", "user", "What should we do about operator approvals?", { topic: "security" });
    await conversationLogger.logTurn("ses_advice", "assistant", "We should keep them conservative by default.", { topic: "security" });
    const adviceFirst = await hybrid.recall("what should we do about operator approvals", {
      sessionId: "ses_advice",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(adviceFirst[0]?.role, "assistant", "Exact recall prefers assistant advice turns for advice queries");

    await conversationLogger.logTurn("ses_metric", "user", "What latency budget did rollout use?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_metric", "assistant", "Rollout used 120ms latency budget and 8k token budget during fallback drills.", { topic: "runtime" });
    const metricFirst = await hybrid.recall("what latency budget did rollout use", {
      sessionId: "ses_metric",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(metricFirst[0]?.role, "assistant", "Exact recall prefers assistant metric answers for budget/perf queries");
    assert(
      Array.isArray(metricFirst[0]?.metadata?.recallReasons)
        && metricFirst[0]!.metadata.recallReasons.includes("intent-metric"),
      "Exact recall metadata surfaces metric-answer boost reasons",
    );

    await conversationLogger.logTurn("ses_procedure", "user", "What playbook steps should we follow for rollout review?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_procedure", "assistant", "First run the doctor, then inspect fallback logs, then rerun the guarded command from the rollout review playbook.", { topic: "runtime" });
    const procedureFirst = await hybrid.recall("what playbook steps should we follow for rollout review", {
      sessionId: "ses_procedure",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(procedureFirst[0]?.role, "assistant", "Exact recall prefers assistant procedure answers for runbook/playbook queries");
    assert(
      Array.isArray(procedureFirst[0]?.metadata?.recallReasons)
        && procedureFirst[0]!.metadata.recallReasons.includes("intent-procedure"),
      "Exact recall metadata surfaces procedure-answer boost reasons",
    );

    await conversationLogger.logTurn("ses_risk", "user", "What should we avoid with shell_exec approvals?", { topic: "security" });
    await conversationLogger.logTurn("ses_risk", "assistant", "Avoid broad shell_exec approvals because they are risky.", { topic: "security" });
    const riskFirst = await hybrid.recall("what should we avoid with shell_exec approvals", {
      sessionId: "ses_risk",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(riskFirst[0]?.role, "assistant", "Exact recall prefers assistant caution answers for risk queries");

    await conversationLogger.logTurn("ses_compare", "user", "What changed about provider routing?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_compare", "assistant", "We changed from local-only provider routing to mixed-provider defaults.", { topic: "runtime" });
    const comparisonFirst = await hybrid.recall("what changed about provider routing", {
      sessionId: "ses_compare",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(comparisonFirst[0]?.role, "assistant", "Exact recall prefers assistant comparison answers for change queries");

    await conversationLogger.logTurn("ses_preference", "user", "What do we prefer for output style?", { topic: "formatting" });
    await conversationLogger.logTurn("ses_preference", "assistant", "We prefer compact summaries before deep logs.", { topic: "formatting" });
    const preferenceFirst = await hybrid.recall("what do we prefer for output style", {
      sessionId: "ses_preference",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(preferenceFirst[0]?.role, "assistant", "Exact recall prefers assistant preference answers for preference queries");

    await conversationLogger.logTurn("ses_event", "user", "What happened during the debug session?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_event", "assistant", "During the debug session, provider routing failed first, then fallback recovered.", { topic: "runtime" });
    const eventFirst = await hybrid.recall("what happened during the debug session", {
      sessionId: "ses_event",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(eventFirst[0]?.role, "assistant", "Exact recall prefers assistant event answers for history queries");

    await conversationLogger.logTurn("ses_pattern", "user", "What architecture pattern should we keep for compaction?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_pattern", "assistant", "We should keep the pattern where exact transcript truth stays separate from derived compaction artifacts.", { topic: "runtime" });
    const patternFirst = await hybrid.recall("what architecture pattern should we keep for compaction", {
      sessionId: "ses_pattern",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(patternFirst[0]?.role, "assistant", "Exact recall prefers assistant pattern answers for architecture-pattern queries");

    await conversationLogger.logTurn("ses_constraint", "user", "What rule must we keep for operator approvals?", { topic: "security" });
    await conversationLogger.logTurn("ses_constraint", "assistant", "We must keep operator approvals conservative by default.", { topic: "security" });
    const constraintFirst = await hybrid.recall("what rule must we keep for operator approvals", {
      sessionId: "ses_constraint",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(constraintFirst[0]?.role, "assistant", "Exact recall prefers assistant constraint answers for rule queries");

    await conversationLogger.logTurn("ses_discovery", "user", "What did we learn about provider routing?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_discovery", "assistant", "We learned that mixed-provider fallback is more stable than local-only routing.", { topic: "runtime" });
    const discoveryFirst = await hybrid.recall("what did we learn about provider routing", {
      sessionId: "ses_discovery",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(discoveryFirst[0]?.role, "assistant", "Exact recall prefers assistant discovery answers for learn-pattern queries");

    await conversationLogger.logTurn("ses_fact", "user", "What runtime fact should we remember?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_fact", "assistant", "Remember this runtime fact: mixed-provider fallback stays enabled by default.", { topic: "runtime" });
    const factFirst = await hybrid.recall("what runtime fact should we remember", {
      sessionId: "ses_fact",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(factFirst[0]?.role, "assistant", "Exact recall prefers assistant fact answers for fact-status queries");

    await conversationLogger.logTurn("ses_entity", "user", "Which provider handled fallback?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_entity", "assistant", "Fallback provider was gpt-4o, env var was OPENAI_API_KEY, endpoint stayed https://api.openai.com/v1, and the tool path stayed /tmp/colony.log.", { topic: "runtime" });
    const entityFirst = await hybrid.recall("which provider handled fallback", {
      sessionId: "ses_entity",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(entityFirst[0]?.role, "assistant", "Exact recall prefers assistant entity answers for provider/file-style queries");
    assert(
      Array.isArray(entityFirst[0]?.metadata?.recallReasons)
        && entityFirst[0]!.metadata.recallReasons.includes("intent-entity"),
      "Exact recall metadata surfaces entity-answer boost reasons",
    );
    const entityEnvFirst = await hybrid.recall("which env var enabled fallback", {
      sessionId: "ses_entity",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(entityEnvFirst[0]?.role, "assistant", "Exact recall prefers assistant entity answers for env-var queries");

    await conversationLogger.logTurn("ses_diagnostic", "user", "What error caused shell_exec failure?", { topic: "runtime" });
    await conversationLogger.logTurn("ses_diagnostic", "assistant", "Shell_exec failure came from a missing allowlist entry, not provider outage.", { topic: "runtime" });
    const diagnosticFirst = await hybrid.recall("what error caused shell_exec failure", {
      sessionId: "ses_diagnostic",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(diagnosticFirst[0]?.role, "assistant", "Exact recall prefers assistant diagnostic answers for failure/root-cause queries");
    assert(
      Array.isArray(diagnosticFirst[0]?.metadata?.recallReasons)
        && diagnosticFirst[0]!.metadata.recallReasons.includes("intent-diagnostic"),
      "Exact recall metadata surfaces diagnostic-answer boost reasons",
    );

    await conversationLogger.logTurn("ses_e", "user", "Ship it exactly as written for release notes.", { topic: "release" });
    await conversationLogger.logTurn("ses_e", "user", "Ship it, but keep release notes written exactly for review.", { topic: "release" });
    const phraseFirst = await hybrid.recall('quote "ship it exactly as written"', {
      sessionId: "ses_e",
      topK: 3,
      truthMode: "exact_only",
    });
    assert(
      phraseFirst[0]?.content.includes("Ship it exactly as written for release notes.") === true,
      "Exact recall prefers contiguous phrase match over looser bag-of-words cousin",
    );

    const phraseDerived = await hybrid.recall('quote "keep this exact phrase"', {
      sessionId: "ses_a",
      topK: 3,
      truthMode: "derived_only",
    });
    assert(phraseDerived[0]?.exact === false, "Derived-only phrase recall still resolves through artifact search");

    await conversationLogger.logTurn("ses_scope_current", "assistant", "Approval note lives in current run cave.", { topic: "scope" });
    await conversationLogger.logTurn("ses_scope_archive", "assistant", "Approval note lives in archived run cave.", { topic: "scope" });
    const currentScopeArtifact = createMemoryArtifact({
      sessionId: "ses_scope_current",
      transcriptPath: join(dir, "conversations", "ses_scope_current.jsonl"),
      turns: [
        await conversationLogger.logTurn("ses_scope_current", "assistant", "Approval note artifact for current run scope.", { topic: "scope" }),
      ],
      metadata: { caste: "assist_ant" },
    });
    const archivedScopeArtifact = createMemoryArtifact({
      sessionId: "ses_scope_archive",
      transcriptPath: join(dir, "conversations", "ses_scope_archive.jsonl"),
      turns: [
        await conversationLogger.logTurn("ses_scope_archive", "assistant", "Approval note artifact for archived run scope.", { topic: "scope" }),
      ],
      metadata: { caste: "assist_ant" },
    });
    assert(currentScopeArtifact !== null && archivedScopeArtifact !== null, "Session-scope artifacts created for query-guided ranking");
    await artifactStore.appendArtifact(currentScopeArtifact!);
    await artifactStore.appendArtifact(archivedScopeArtifact!);

    const archivedExact = await hybrid.recall("approval note from previous session", {
      sessionId: "ses_scope_current",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(archivedExact[0]?.sessionId, "ses_scope_archive", "Exact recall prefers archived session when query asks for previous session");

    const currentExact = await hybrid.recall("approval note from current session", {
      sessionId: "ses_scope_current",
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(currentExact[0]?.sessionId, "ses_scope_current", "Exact recall prefers current session when query asks for current session");

    const archivedDerived = await hybrid.recall("approval note artifact from previous session", {
      sessionId: "ses_scope_current",
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(archivedDerived[0]?.sessionId, "ses_scope_archive", "Derived recall prefers archived session when query asks for previous session");

    const currentDerived = await hybrid.recall("approval note artifact from current session", {
      sessionId: "ses_scope_current",
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(currentDerived[0]?.sessionId, "ses_scope_current", "Derived recall prefers current session when query asks for current session");

    const noisyCurrentArtifact1 = createMemoryArtifact({
      sessionId: "ses_scope_current",
      transcriptPath: join(dir, "conversations", "ses_scope_current.jsonl"),
      turns: [
        await conversationLogger.logTurn("ses_scope_current", "assistant", "Approval note artifact for current session noisy tie one.", { topic: "scope" }),
      ],
      metadata: { caste: "assist_ant" },
    });
    const noisyCurrentArtifact2 = createMemoryArtifact({
      sessionId: "ses_scope_current",
      transcriptPath: join(dir, "conversations", "ses_scope_current.jsonl"),
      turns: [
        await conversationLogger.logTurn("ses_scope_current", "assistant", "Approval note artifact for current session noisy tie two.", { topic: "scope" }),
      ],
      metadata: { caste: "assist_ant" },
    });
    assert(noisyCurrentArtifact1 !== null && noisyCurrentArtifact2 !== null, "Current-session noise artifacts created for archived-query search bias test");
    await artifactStore.appendArtifact(noisyCurrentArtifact1!);
    await artifactStore.appendArtifact(noisyCurrentArtifact2!);

    const archivedDerivedNoisy = await hybrid.recall("approval note artifact from previous session", {
      sessionId: "ses_scope_current",
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(archivedDerivedNoisy[0]?.sessionId, "ses_scope_archive", "Derived recall keeps archived artifact first even with noisy current-session ties");

    await conversationLogger.logTurn("ses_time_old", "assistant", "Approval timeline note shared across runs.", { topic: "timeline" });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await conversationLogger.logTurn("ses_time_new", "assistant", "Approval timeline note shared across runs.", { topic: "timeline" });

    const earliestExact = await hybrid.recall("earliest approval timeline note", {
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(earliestExact[0]?.sessionId, "ses_time_old", "Exact recall prefers oldest matching session when query asks earliest");
    assert(Array.isArray(earliestExact[0]?.metadata?.recallReasons) && earliestExact[0]!.metadata.recallReasons.includes("time-oldest"), "Exact recall metadata surfaces oldest-time reason");

    const latestExact = await hybrid.recall("latest approval timeline note", {
      topK: 3,
      truthMode: "exact_only",
    });
    assertEqual(latestExact[0]?.sessionId, "ses_time_new", "Exact recall prefers newest matching session when query asks latest");
    assert(Array.isArray(latestExact[0]?.metadata?.recallReasons) && latestExact[0]!.metadata.recallReasons.includes("time-recent"), "Exact recall metadata surfaces recent-time reason");

    const oldArtifact = createMemoryArtifact({
      sessionId: "ses_art_time_old",
      transcriptPath: join(dir, "conversations", "ses_art_time_old.jsonl"),
      turns: [
        await conversationLogger.logTurn("ses_art_time_old", "assistant", "Approval timeline artifact shared across runs.", { topic: "timeline" }),
      ],
      metadata: { caste: "assist_ant" },
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const newArtifact = createMemoryArtifact({
      sessionId: "ses_art_time_new",
      transcriptPath: join(dir, "conversations", "ses_art_time_new.jsonl"),
      turns: [
        await conversationLogger.logTurn("ses_art_time_new", "assistant", "Approval timeline artifact shared across runs.", { topic: "timeline" }),
      ],
      metadata: { caste: "assist_ant" },
    });
    assert(oldArtifact !== null && newArtifact !== null, "Time-ranked artifacts created for latest/earliest recall");
    await artifactStore.appendArtifact(oldArtifact!);
    await artifactStore.appendArtifact(newArtifact!);

    const earliestDerived = await hybrid.recall("earliest approval timeline artifact", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(earliestDerived[0]?.sessionId, "ses_art_time_old", "Derived recall prefers oldest artifact when query asks earliest");

    const latestDerived = await hybrid.recall("latest approval timeline artifact", {
      topK: 3,
      truthMode: "derived_only",
    });
    assertEqual(latestDerived[0]?.sessionId, "ses_art_time_new", "Derived recall prefers newest artifact when query asks latest");
  } finally {
    await removeWithRetry(dir);
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
      metadata: {
        workspaceName: "colony-ts",
        workspacePrimaryTargets: ["colony", "colony-ts"],
      },
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
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Decision: stored transcript stays exact while compaction artifacts stay derived.",
      scope: "agent",
      agentId: session.agentId,
      category: "decision",
      confidence: 0.98,
      sourceTurn: 1,
      source: "keyword",
      contentHash: "ctxdecision",
      timestamp: 500,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Advice: keep compaction safety guidance short and actionable for later runs.",
      scope: "agent",
      agentId: session.agentId,
      category: "advice",
      confidence: 0.97,
      sourceTurn: 2,
      source: "keyword",
      contentHash: "ctxadvice",
      timestamp: 505,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Reasoning: transcript truth stays exact because derived compaction summaries can drift under compression.",
      scope: "agent",
      agentId: session.agentId,
      category: "reasoning",
      confidence: 0.97,
      sourceTurn: 2,
      source: "keyword",
      contentHash: "ctxreasoning",
      timestamp: 507,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Discovery: compaction safety improved when transcript truth and derived summaries stayed separate.",
      scope: "agent",
      agentId: session.agentId,
      category: "discovery",
      confidence: 0.96,
      sourceTurn: 2,
      source: "keyword",
      contentHash: "ctxdiscovery",
      timestamp: 510,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Event: startup doctor failed first, then provider fallback recovered the session.",
      scope: "agent",
      agentId: session.agentId,
      category: "event",
      confidence: 0.95,
      sourceTurn: 3,
      source: "keyword",
      contentHash: "ctxevent",
      timestamp: 520,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Preference: keep compact status summaries before deep logs.",
      scope: "agent",
      agentId: session.agentId,
      category: "preference",
      confidence: 0.94,
      sourceTurn: 4,
      source: "keyword",
      contentHash: "ctxpreference",
      timestamp: 530,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Constraint: never let caveman summaries replace canonical human transcript truth.",
      scope: "agent",
      agentId: session.agentId,
      category: "constraint",
      confidence: 0.97,
      sourceTurn: 5,
      source: "keyword",
      contentHash: "ctxconstraint",
      timestamp: 540,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Fact: compaction runtime stores exact transcript and derived artifact as separate layers.",
      scope: "agent",
      agentId: session.agentId,
      category: "fact",
      confidence: 0.93,
      sourceTurn: 6,
      source: "keyword",
      contentHash: "ctxfact",
      timestamp: 550,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Fact: colony-wide memory law keeps exact transcript truth separate from derived compaction artifacts.",
      scope: "colony",
      agentId: "",
      category: "fact",
      confidence: 0.91,
      sourceTurn: 6,
      source: "llm",
      contentHash: "ctxfactcolony",
      timestamp: 551,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Diagnostic: shell_exec failure came from missing allowlist entry rather than provider outage during compaction doctor checks.",
      scope: "agent",
      agentId: session.agentId,
      category: "diagnostic",
      confidence: 0.95,
      sourceTurn: 7,
      source: "keyword",
      contentHash: "ctxdiag",
      timestamp: 553,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Entity: fallback provider stays gpt-4o and log path stays /tmp/colony.log for compaction doctor checks.",
      scope: "agent",
      agentId: session.agentId,
      category: "entity",
      confidence: 0.94,
      sourceTurn: 7,
      source: "keyword",
      contentHash: "ctxentity",
      timestamp: 552,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Metric: compaction latency budget stays 120ms and token budget stays 8k during fallback drills.",
      scope: "agent",
      agentId: session.agentId,
      category: "metric",
      confidence: 0.95,
      sourceTurn: 7,
      source: "keyword",
      contentHash: "ctxmetric",
      timestamp: 553,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Procedure: rollout review playbook is first run the doctor, then inspect fallback logs, then rerun the guarded command.",
      scope: "agent",
      agentId: session.agentId,
      category: "procedure",
      confidence: 0.95,
      sourceTurn: 8,
      source: "keyword",
      contentHash: "ctxprocedure",
      timestamp: 554,
    }]);
    await memory.extractedMemoryStore.save(session.sessionId, String(session.caste), [{
      content: "Pattern: keep exact transcript truth separate from derived compaction artifacts.",
      scope: "agent",
      agentId: session.agentId,
      category: "pattern",
      confidence: 0.92,
      sourceTurn: 8,
      source: "keyword",
      contentHash: "ctxpattern",
      timestamp: 545,
    }]);
    await memory.autoMemory.store.save({
      topic: "compaction note",
      content: "Compaction note: old markdown memory still carries useful recap context for later sessions.",
      caste: String(session.caste),
      agentId: session.agentId,
      sessionId: session.sessionId,
      timestamp: 560,
      sourceTurn: 7,
      source: "heuristic",
      relevanceKeywords: ["compaction", "recap", "context"],
      filePath: "",
    });
    await memory.autoMemory.store.save({
      topic: "compaction llm note",
      content: "Compaction recap note: LLM-derived summary still helps locate later compaction context.",
      caste: String(session.caste),
      agentId: session.agentId,
      sessionId: session.sessionId,
      timestamp: 561,
      sourceTurn: 8,
      source: "llm",
      relevanceKeywords: ["compaction", "recap", "context", "summary"],
      filePath: "",
    });
    await memory.autoMemory.store.save({
      topic: "compaction overflow note 1",
      content: "Compaction recap note: overflow sample one keeps recap context searchable after exact transcript trim.",
      caste: String(session.caste),
      agentId: session.agentId,
      sessionId: session.sessionId,
      timestamp: 562,
      sourceTurn: 8,
      source: "heuristic",
      relevanceKeywords: ["compaction", "recap", "context", "overflow"],
      filePath: "",
    });
    await memory.autoMemory.store.save({
      topic: "compaction overflow note 2",
      content: "Compaction recap note: overflow sample two preserves derived context for recap queries.",
      caste: String(session.caste),
      agentId: session.agentId,
      sessionId: session.sessionId,
      timestamp: 563,
      sourceTurn: 8,
      source: "heuristic",
      relevanceKeywords: ["compaction", "recap", "context", "overflow"],
      filePath: "",
    });
    await memory.autoMemory.store.save({
      topic: "compaction overflow note 3",
      content: "Compaction recap note: overflow sample three keeps markdown memory above visible cap.",
      caste: String(session.caste),
      agentId: session.agentId,
      sessionId: session.sessionId,
      timestamp: 564,
      sourceTurn: 8,
      source: "llm",
      relevanceKeywords: ["compaction", "recap", "context", "overflow"],
      filePath: "",
    });
    for (const suffix of ["archive-a", "archive-b", "archive-c"]) {
      let artifactOverflowSession = createAgentSession({
        agentId: "assist-ant",
        caste: Caste.ASSIST_ANT,
        metadata: {
          workspaceName: "colony-ts",
          workspacePrimaryTargets: ["colony", "colony-ts"],
        },
      });
      artifactOverflowSession = addMessage(artifactOverflowSession, createSystemMessage(PromptBuilder.buildSystemPrompt({
        caste: Caste.ASSIST_ANT,
        agentId: "assist-ant",
      }), 100));
      artifactOverflowSession = addMessage(artifactOverflowSession, createUserMessage(`Compaction overflow recap ${suffix} keeps exact transcript truth.`));
      artifactOverflowSession = addMessage(artifactOverflowSession, createUserMessage(`Compaction overflow recap ${suffix} still derives compact artifact context.`));
      await memory.captureSession(artifactOverflowSession);
    }

    const context = await memory.buildMemoryContext("ship it caveman compaction truth", session);
    assert(context.includes("Verbatim recall (exact transcript excerpts):"), "Memory context has exact section");
    assert(context.includes("Derived compact recall (not verbatim; use to find truth, not replace it):"), "Memory context has derived section");
    assert(context.includes("Verbatim recall (exact transcript excerpts): showing "), "Exact transcript header surfaces shown-vs-total truth");
    assert(context.includes("Derived compact recall (not verbatim; use to find truth, not replace it): showing "), "Compact derived header surfaces shown-vs-total truth");
    assert(context.includes(`session:${session.sessionId}/rank:1/score:`) && context.includes(`/role:user/ts:`), "Verbatim transcript recall surfaces session, rank, role, and timestamp provenance");
    assert(context.includes("/why:role-user"), "Verbatim transcript recall surfaces row-level boost reasons");
    assert(context.includes("/score:"), "Verbatim transcript recall surfaces retrieval-score provenance");
    assert(context.includes("/path:conversations/"), "Verbatim transcript recall surfaces transcript-path provenance");
    assert(context.includes("/turn:"), "Verbatim transcript recall surfaces source-turn provenance");
    assert(context.includes("ship it exactly as written"), "Memory context includes exact user wording");
    assert(!context.includes("## Identity: Assist-Ant"), "Memory context exact recall excludes system prompt noise");
    assert(context.includes("Caveman:"), "Memory context includes caveman-derived summary");
    assert(context.includes("AAAK:"), "Memory context includes MemPalace AAAK summary");
    let exactOverflowSession = createAgentSession({
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      metadata: {
        workspaceName: "colony-ts",
        workspacePrimaryTargets: ["colony", "colony-ts"],
      },
    });
    exactOverflowSession = addMessage(exactOverflowSession, createSystemMessage(PromptBuilder.buildSystemPrompt({
      caste: Caste.ASSIST_ANT,
      agentId: "assist-ant",
    }), 100));
    exactOverflowSession = addMessage(exactOverflowSession, createUserMessage("Compaction overflow truth one stays exact."));
    exactOverflowSession = addMessage(exactOverflowSession, createUserMessage("Compaction overflow truth two stays exact."));
    exactOverflowSession = addMessage(exactOverflowSession, createUserMessage("Compaction overflow truth three stays exact."));
    exactOverflowSession = addMessage(exactOverflowSession, createUserMessage("Compaction overflow truth four stays exact."));
    exactOverflowSession = addMessage(exactOverflowSession, createUserMessage("Compaction overflow truth five stays exact."));
    await memory.captureSession(exactOverflowSession);
    const exactOverflowContext = await memory.buildMemoryContext("what did i say about compaction overflow truth", exactOverflowSession);
    const exactOverflowCounts = exactOverflowContext.match(/hits:exact=(\d+)/);
    const exactOverflowShownCounts = exactOverflowContext.match(/shown:exact=(\d+)/);
    assert(Boolean(exactOverflowCounts && exactOverflowShownCounts), "Broad exact-overflow context exposes exact total and shown counts");
    assert(Number(exactOverflowCounts?.[1]) > Number(exactOverflowShownCounts?.[1]), "Broad exact-overflow context keeps truncated exact transcript counts honest");
    assert(exactOverflowContext.includes("more exact transcript matches hidden."), "Exact transcript section surfaces hidden-row note when exact recall is truncated");

    const exactContext = await memory.buildMemoryContext("exact wording as written", session);
    assert(exactContext.includes("Verbatim recall (exact transcript excerpts):"), "Memory context exact mode keeps exact section");
    assert(!exactContext.includes("Derived compact recall (not verbatim; use to find truth, not replace it):"), "Memory context exact mode suppresses derived section");
    assert(exactContext.includes("truth-via:exact+as-written"), "Memory routing note surfaces inferred exact-mode provenance");

    const derivedContext = await memory.buildMemoryContext("summary recap of compaction context", session);
    assert(!derivedContext.includes("Verbatim recall (exact transcript excerpts):"), "Memory context derived mode suppresses exact section");
    assert(derivedContext.includes("Derived compact recall (not verbatim; use to find truth, not replace it):"), "Memory context derived mode keeps derived section");
    assert(derivedContext.includes("truth-via:summary+recap"), "Memory routing note surfaces inferred derived-mode provenance");
    const artifactContext = await memory.buildMemoryContext("summary recap of ship it exactly as written", session, {
      truthMode: "derived_only",
    });
    assert(
      artifactContext.includes("artifact:")
        && artifactContext.includes("/score:")
        && artifactContext.includes("/src:")
        && artifactContext.includes("/roles:")
        && artifactContext.includes("/path:conversations/"),
      "Compact artifact recall surfaces artifact rank, id, timestamp, source-turn, role, and transcript-path provenance",
    );
    assert(artifactContext.includes("/why:"), "Compact artifact recall surfaces row-level boost reasons");

    const decisionContext = await memory.buildMemoryContext("what decision did we make about compaction", session, {
      truthMode: "derived_only",
    });
    assert(
      decisionContext.indexOf("Reusable decisions (derived, scoped, durable):")
        < decisionContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):"),
      "Decision-focused derived context ranks durable facts before compact summaries",
    );
    assert(decisionContext.includes(`session:${session.sessionId}`), "Derived structured memory entries surface session provenance");
    assert(decisionContext.includes("conf:0.98"), "Derived structured memory entries surface confidence provenance");
    assert(decisionContext.includes("/rank:1/conf:"), "Derived structured memory entries surface row-rank provenance");
    assert(decisionContext.includes("ts:500"), "Derived structured memory entries surface timestamp provenance");
    assert(decisionContext.includes("turn:1"), "Derived structured memory entries surface source-turn provenance");
    assert(decisionContext.includes("src:keyword"), "Derived structured memory entries surface extraction-source provenance");
    assert(decisionContext.includes("score:"), "Derived structured memory entries surface retrieval-score provenance");
    assert(decisionContext.includes("/path:memory-extracts/"), "Derived structured memory entries surface storage-path provenance");
    assert(decisionContext.includes("why:keyword-overlap") && decisionContext.includes("category-decision"), "Derived structured memory entries surface row-level boost reasons");
    assert(/structured-cat:[^\n]*decision=\d+/.test(decisionContext), "Memory routing note surfaces structured category mix with decision counts for decision query");
    assert(/shown-structured-cat:[^\n]*decision=\d+/.test(decisionContext), "Memory routing note surfaces visible structured category mix with decision counts for decision query");
    assert(decisionContext.includes("shown-structured-scope:"), "Memory routing note surfaces visible structured scope mix for decision query");
    assert(decisionContext.includes("shown-structured-session:"), "Memory routing note surfaces visible structured current-vs-archived mix for decision query");
    assert(decisionContext.includes("shown-structured-src:"), "Memory routing note surfaces visible structured extraction-source mix for decision query");
    assert(decisionContext.includes("shown-structured-why:"), "Memory routing note surfaces visible structured reason mix for decision query");
    assert(decisionContext.includes("shown-derived-why:"), "Memory routing note surfaces visible derived reason mix for decision query");
    assert(decisionContext.includes("shown-derived-session:"), "Memory routing note surfaces visible derived current-vs-archived mix for decision query");
    assert(decisionContext.includes("shown-derived-src:"), "Memory routing note surfaces visible derived source mix for decision query");
    assert(decisionContext.includes("shown-why-mix:"), "Memory routing note surfaces visible aggregate non-palace reason mix for decision query");
    assert(decisionContext.includes("shown-non-palace-mix:"), "Memory routing note surfaces visible non-palace layer mix for decision query");
    assert(decisionContext.includes("shown-session-mix:"), "Memory routing note surfaces visible current-vs-archived contribution mix for decision query");
    assert(decisionContext.includes("shown-exact-role:"), "Memory routing note surfaces visible exact-role contribution mix for decision query");
    assert(decisionContext.includes("shown-exact-session:"), "Memory routing note surfaces visible exact current-vs-archived mix for decision query");
    assert(decisionContext.includes("shown-exact-why:"), "Memory routing note surfaces visible exact reason mix for decision query");
    assert(decisionContext.includes("shown-artifact-why:"), "Memory routing note surfaces visible artifact reason mix for decision query");
    assert(decisionContext.includes("shown-palace-hall:"), "Memory routing note surfaces visible palace hall mix for decision query");
    assert(decisionContext.includes("shown-palace-room:"), "Memory routing note surfaces visible palace room mix for decision query");
    assert(decisionContext.includes("shown-palace-wing:"), "Memory routing note surfaces visible palace wing mix for decision query");
    assert(decisionContext.includes("shown-palace-source:"), "Memory routing note surfaces visible palace source-file mix for decision query");
    assert(decisionContext.includes("shown-palace-why:"), "Memory routing note surfaces visible palace reason mix for decision query");

    const patternContext = await memory.buildMemoryContext("what architecture pattern should we keep for compaction", session, {
      truthMode: "derived_only",
    });
    assert(patternContext.includes("Reusable patterns (derived, scoped, durable):"), "Pattern-style derived context uses pattern-aware structured header");
    assert(patternContext.includes("structured-focus:pattern"), "Memory routing note surfaces pattern-focused structured target");
    assert(patternContext.includes("structured-focus-via:pattern"), "Memory routing note surfaces pattern-focused structured source");

    const recapContext = await memory.buildMemoryContext("summary recap of compaction context", session, {
      truthMode: "derived_only",
    });
    assert(
      recapContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):")
        < recapContext.indexOf("Reusable facts (derived, scoped, durable):"),
      "Recap-focused derived context keeps compact summaries before durable facts",
    );
    assert(
      recapContext.includes(`memory:${String(session.caste)}/rank:`)
        && recapContext.includes("/ts:")
        && recapContext.includes("/turn:")
        && recapContext.includes("/src:")
        && recapContext.includes("/path:")
        && recapContext.includes(`/session:${session.sessionId}/why:`),
      "Compact markdown memory entries surface session, rank, timestamp, source-turn, and storage-path provenance",
    );
    assert(recapContext.includes(`memory:${String(session.caste)}/rank:`) && recapContext.includes("/score:"), "Compact markdown memory entries surface row-rank and retrieval-score provenance");
    assert(recapContext.includes("why:keyword-overlap"), "Compact markdown memory entries surface row-level boost reasons");
    assert(recapContext.includes("compact-focus:recap"), "Memory routing note surfaces recap-focused compact target");
    assert(recapContext.includes("compact-focus-via:summary+recap"), "Memory routing note surfaces recap-focused compact source");
    assert(recapContext.includes("derived-via:default"), "Memory routing note surfaces default derived-order source for recap query");
    assert(recapContext.includes("compact-mix:artifact=") && recapContext.includes("markdown="), "Memory routing note surfaces aggregate compact artifact-vs-markdown mix");
    assert(recapContext.includes("derived-mix:compact=") && recapContext.includes("structured="), "Memory routing note surfaces aggregate compact-vs-structured derived mix");
    assert(recapContext.includes("shown-compact-mix:artifact=") && recapContext.includes("markdown="), "Memory routing note surfaces visible compact artifact-vs-markdown mix");
    assert(recapContext.includes("shown-derived-mix:compact=") && recapContext.includes("structured="), "Memory routing note surfaces visible compact-vs-structured derived mix");
    assert(recapContext.includes("shown-compact="), "Memory routing note surfaces visible compact row count");
    assert(recapContext.includes("shown-derived="), "Memory routing note surfaces visible derived row count");
    assert(recapContext.includes("hidden-compact-mix:artifact=") && recapContext.includes("markdown="), "Memory routing note surfaces hidden compact artifact-vs-markdown mix");
    assert(recapContext.includes("hidden-derived-mix:compact=") && recapContext.includes("structured="), "Memory routing note surfaces hidden compact-vs-structured derived mix");
    assert(recapContext.includes("shown-compact-src:"), "Memory routing note surfaces visible compact source mix");
    assert(recapContext.includes("shown-derived-src:"), "Memory routing note surfaces visible derived source mix");
    assert(recapContext.includes("hidden-derived-src:"), "Memory routing note surfaces hidden derived source mix");
    assert(recapContext.includes("shown-compact-why:"), "Memory routing note surfaces visible compact reason mix");
    assert(recapContext.includes("hidden-compact-why:"), "Memory routing note surfaces hidden compact reason mix");
    assert(recapContext.includes("shown-derived-why:"), "Memory routing note surfaces visible derived reason mix");
    assert(recapContext.includes("hidden-derived-why:"), "Memory routing note surfaces hidden derived reason mix");
    assert(recapContext.includes("shown-compact-session:"), "Memory routing note surfaces visible compact current-vs-archived mix");
    assert(recapContext.includes("shown-derived-session:"), "Memory routing note surfaces visible derived current-vs-archived mix");
    assert(recapContext.includes("shown-why-mix:"), "Memory routing note surfaces visible aggregate non-palace reason mix");
    assert(recapContext.includes("hidden-why-mix:"), "Memory routing note surfaces hidden aggregate non-palace reason mix");
    assert(recapContext.includes("shown-memory-why:"), "Memory routing note surfaces visible whole-memory reason mix");
    assert(recapContext.includes("hidden-memory-why:"), "Memory routing note surfaces hidden whole-memory reason mix");
    assert(recapContext.includes("memory-shown="), "Memory routing note surfaces visible whole-memory row count");
    assert(recapContext.includes("shown-truth-mix:"), "Memory routing note surfaces visible exact-vs-derived-vs-palace truth mix");
    assert(recapContext.includes("hidden-truth-mix:"), "Memory routing note surfaces hidden exact-vs-derived-vs-palace truth mix");
    assert(recapContext.includes("hidden-memory-mix:"), "Memory routing note surfaces hidden whole-memory layer mix");
    assert(recapContext.includes("hidden-memory-origin:"), "Memory routing note surfaces hidden whole-memory origin mix");
    assert(recapContext.includes("shown-memory-mix:"), "Memory routing note surfaces visible whole-memory layer mix");
    assert(recapContext.includes("shown-memory-origin:"), "Memory routing note surfaces visible whole-memory origin mix");
    assert(recapContext.includes("shown-sections:compact>structured"), "Memory routing note surfaces actual shown section order for derived-only recap query");
    assert(recapContext.includes("section-state:"), "Memory routing note surfaces one-glance section state map");
    assert(recapContext.includes("empty-sections:"), "Memory routing note surfaces which planned sections had zero hits");
    assert(recapContext.includes("hidden-sections:"), "Memory routing note surfaces which sections actually truncated");
    assert(recapContext.includes("shown-non-palace-mix:"), "Memory routing note surfaces visible non-palace layer mix");
    assert(recapContext.includes("hidden-non-palace-mix:"), "Memory routing note surfaces hidden non-palace layer mix");
    assert(recapContext.includes("shown-non-palace="), "Memory routing note surfaces visible non-palace row count");
    assert(recapContext.includes("shown-artifact-session:"), "Memory routing note surfaces visible artifact current-vs-archived mix");
    assert(recapContext.includes("shown-markdown-session:"), "Memory routing note surfaces visible markdown current-vs-archived mix");
    assert(recapContext.includes("hidden-artifact-session:"), "Memory routing note surfaces hidden artifact current-vs-archived mix");
    assert(recapContext.includes("hidden-markdown-session:"), "Memory routing note surfaces hidden markdown current-vs-archived mix");
    assert(recapContext.includes("shown-markdown-src:"), "Memory routing note surfaces visible markdown extraction-source mix");
    assert(recapContext.includes("hidden-markdown-src:"), "Memory routing note surfaces hidden markdown extraction-source mix");
    assert(recapContext.includes("hidden-compact-src:"), "Memory routing note surfaces hidden compact source mix");
    assert(recapContext.includes("hidden-compact-session:"), "Memory routing note surfaces hidden compact current-vs-archived mix");
    assert(recapContext.includes("hidden-derived-session:"), "Memory routing note surfaces hidden derived current-vs-archived mix");
    assert(recapContext.includes("hidden-structured-src:"), "Memory routing note surfaces hidden structured extraction-source mix");
    assert(recapContext.includes("hidden-structured-session:"), "Memory routing note surfaces hidden structured current-vs-archived mix");
    assert(recapContext.includes("hidden-structured-scope:"), "Memory routing note surfaces hidden structured scope mix");
    assert(recapContext.includes("hidden-structured-cat:"), "Memory routing note surfaces hidden structured category mix");
    assert(recapContext.includes("hidden-session-mix:"), "Memory routing note surfaces hidden current-vs-archived contribution mix");
    assert(recapContext.includes("shown-artifact-why:"), "Memory routing note surfaces visible artifact reason mix");
    assert(recapContext.includes("hidden-artifact-why:"), "Memory routing note surfaces hidden artifact reason mix");
    assert(recapContext.includes("shown-markdown-why:"), "Memory routing note surfaces visible markdown reason mix");
    assert(recapContext.includes("hidden-markdown-why:"), "Memory routing note surfaces hidden markdown reason mix");
    const recapShownNonPalaceMix = recapContext.match(/shown-non-palace-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+)/);
    const recapHiddenNonPalaceMix = recapContext.match(/hidden-non-palace-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+)/);
    const recapShownMemoryCounts = recapContext.match(/memory-shown=(\d+)/);
    const recapShownTruthMix = recapContext.match(/shown-truth-mix:exact=(\d+),derived=(\d+),palace=(\d+)/);
    const recapHiddenTruthMix = recapContext.match(/hidden-truth-mix:exact=(\d+),derived=(\d+),palace=(\d+)/);
    const recapHiddenMemoryMix = recapContext.match(/hidden-memory-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+),palace=(\d+)/);
    const recapHiddenMemoryOrigin = recapContext.match(/hidden-memory-origin:current=(\d+),archived=(\d+),palace=(\d+)/);
    const recapSectionState = recapContext.match(/section-state:([^ ]+)/);
    const recapEmptySections = recapContext.match(/empty-sections:([^ ]+)/);
    const recapHiddenSections = recapContext.match(/hidden-sections:([^ ]+)/);
    const recapHiddenArtifactCounts = recapContext.match(/hidden-artifact=(\d+)/);
    const recapHiddenMarkdownCounts = recapContext.match(/hidden-markdown=(\d+)/);
    const recapHiddenCompactCounts = recapContext.match(/hidden-compact=(\d+)/);
    const recapHiddenStructuredCounts = recapContext.match(/hidden-structured=(\d+)/);
    const recapShownMemoryMix = recapContext.match(/shown-memory-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+),palace=(\d+)/);
    const recapShownMemoryOrigin = recapContext.match(/shown-memory-origin:current=(\d+),archived=(\d+),palace=(\d+)/);
    const recapShownNonPalaceCounts = recapContext.match(/shown-non-palace=(\d+)/);
    const recapHiddenNonPalaceCounts = recapContext.match(/hidden-non-palace=(\d+)/);
    const recapShownExactCounts = recapContext.match(/shown:exact=(\d+)/);
    const recapArtifactCount = recapContext.match(/(?:^| )artifact=(\d+)/);
    const recapMarkdownCount = recapContext.match(/(?:^| )markdown=(\d+)/);
    const recapCompactMix = recapContext.match(/compact-mix:artifact=(\d+),markdown=(\d+)/);
    const recapDerivedMix = recapContext.match(/derived-mix:compact=(\d+),structured=(\d+)/);
    const recapDerivedCounts = recapContext.match(/derived=(\d+)/);
    const recapShownCompactCounts = recapContext.match(/shown-artifact=(\d+).*shown-markdown=(\d+)/);
    const recapShownCompactMix = recapContext.match(/shown-compact-mix:artifact=(\d+),markdown=(\d+)/);
    const recapShownDerivedMix = recapContext.match(/shown-derived-mix:compact=(\d+),structured=(\d+)/);
    const recapHiddenCompactMix = recapContext.match(/hidden-compact-mix:artifact=(\d+),markdown=(\d+)/);
    const recapHiddenDerivedMix = recapContext.match(/hidden-derived-mix:compact=(\d+),structured=(\d+)/);
    const recapShownDerivedCounts = recapContext.match(/shown-derived=(\d+)/);
    const recapShownCompactSourceMix = recapContext.match(/shown-compact-src:artifact=(\d+),markdown-heuristic=(\d+),markdown-llm=(\d+),markdown-unknown=(\d+)/);
    const recapHiddenCompactSourceMix = recapContext.match(/hidden-compact-src:([^ ]+)/);
    const recapShownDerivedSourceMix = recapContext.match(/shown-derived-src:artifact=(\d+),markdown-heuristic=(\d+),markdown-llm=(\d+),markdown-unknown=(\d+),structured-keyword=(\d+),structured-llm=(\d+),structured-unknown=(\d+)/);
    const recapHiddenDerivedSourceMix = recapContext.match(/hidden-derived-src:([^ ]+)/);
    const recapShownCompactReasonMix = recapContext.match(/shown-compact-why:([^ ]+)/);
    const recapHiddenCompactReasonMix = recapContext.match(/hidden-compact-why:([^ ]+)/);
    const recapShownDerivedReasonMix = recapContext.match(/shown-derived-why:([^ ]+)/);
    const recapHiddenDerivedReasonMix = recapContext.match(/hidden-derived-why:([^ ]+)/);
    const recapShownCompactSessionMix = recapContext.match(/shown-compact-session:current=(\d+),archived=(\d+)/);
    const recapShownDerivedSessionMix = recapContext.match(/shown-derived-session:current=(\d+),archived=(\d+)/);
    const recapShownOverallReasonMix = recapContext.match(/shown-why-mix:([^ ]+)/);
    const recapHiddenOverallReasonMix = recapContext.match(/hidden-why-mix:([^ ]+)/);
    const recapShownMemoryReasonMix = recapContext.match(/shown-memory-why:([^ ]+)/);
    const recapHiddenMemoryReasonMix = recapContext.match(/hidden-memory-why:([^ ]+)/);
    const recapShownArtifactSessionMix = recapContext.match(/shown-artifact-session:current=(\d+),archived=(\d+)/);
    const recapHiddenArtifactSessionMix = recapContext.match(/hidden-artifact-session:([^ ]+)/);
    const recapShownMarkdownSessionMix = recapContext.match(/shown-markdown-session:current=(\d+),archived=(\d+)/);
    const recapHiddenMarkdownSessionMix = recapContext.match(/hidden-markdown-session:([^ ]+)/);
    const recapShownMarkdownSourceMix = recapContext.match(/shown-markdown-src:heuristic=(\d+),llm=(\d+),unknown=(\d+)/);
    const recapHiddenMarkdownSourceMix = recapContext.match(/hidden-markdown-src:([^ ]+)/);
    const recapShownArtifactReasonMix = recapContext.match(/shown-artifact-why:([^ ]+)/);
    const recapHiddenArtifactReasonMix = recapContext.match(/hidden-artifact-why:([^ ]+)/);
    const recapShownMarkdownReasonMix = recapContext.match(/shown-markdown-why:([^ ]+)/);
    const recapHiddenMarkdownReasonMix = recapContext.match(/hidden-markdown-why:([^ ]+)/);
    const recapStructuredCounts = recapContext.match(/structured=(\d+)/);
    const recapShownStructuredCounts = recapContext.match(/shown-structured=(\d+)/);
    const recapHiddenStructuredScopeMix = recapContext.match(/hidden-structured-scope:([^ ]+)/);
    const recapHiddenStructuredSourceMix = recapContext.match(/hidden-structured-src:([^ ]+)/);
    const recapHiddenStructuredCategoryMix = recapContext.match(/hidden-structured-cat:([^ ]+)/);
    const recapHiddenCompactSessionMix = recapContext.match(/hidden-compact-session:([^ ]+)/);
    const recapHiddenDerivedSessionMix = recapContext.match(/hidden-derived-session:([^ ]+)/);
    const recapHiddenStructuredSessionMix = recapContext.match(/hidden-structured-session:([^ ]+)/);
    const recapHiddenSessionMix = recapContext.match(/hidden-session-mix:([^ ]+)/);
    assert(Boolean(recapArtifactCount && recapMarkdownCount && recapShownCompactCounts), "Recap context exposes compact-derived total and shown counts");
    assert(
      Number(recapCompactMix?.[1]) === Number(recapArtifactCount?.[1])
        && Number(recapCompactMix?.[2]) === Number(recapMarkdownCount?.[1]),
      "Aggregate compact mix matches artifact and markdown totals",
    );
    assert(
      Number(recapArtifactCount?.[1]) + Number(recapMarkdownCount?.[1])
        > Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2]),
      "Recap context keeps truncated compact-derived counts honest",
    );
    assert(
      Number(recapShownCompactMix?.[1]) === Number(recapShownCompactCounts?.[1])
        && Number(recapShownCompactMix?.[2]) === Number(recapShownCompactCounts?.[2]),
      "Visible compact mix matches shown artifact and markdown counts",
    );
    assert(
      Number(recapDerivedMix?.[1]) === Number(recapArtifactCount?.[1]) + Number(recapMarkdownCount?.[1])
        && Number(recapDerivedMix?.[2]) === Number(recapStructuredCounts?.[1]),
      "Aggregate derived mix matches compact and structured totals",
    );
    assert(
      Number(recapShownDerivedMix?.[1]) === Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2])
        && Number(recapShownDerivedMix?.[2]) === Number(recapShownStructuredCounts?.[1]),
      "Visible derived mix matches shown compact and structured rows",
    );
    assert(
      Number(recapDerivedCounts?.[1]) === Number(recapDerivedMix?.[1]) + Number(recapDerivedMix?.[2]),
      "Aggregate derived count matches compact and structured totals",
    );
    assert(
      Number(recapShownDerivedCounts?.[1]) === Number(recapShownDerivedMix?.[1]) + Number(recapShownDerivedMix?.[2]),
      "Visible derived count matches shown compact and structured rows",
    );
    assert(
      Number(recapHiddenCompactMix?.[1]) === Number(recapHiddenArtifactCounts?.[1])
        && Number(recapHiddenCompactMix?.[2]) === Number(recapHiddenMarkdownCounts?.[1]),
      "Hidden compact mix matches hidden artifact and markdown rows",
    );
    assert(
      Number(recapHiddenDerivedMix?.[1]) === Number(recapHiddenCompactCounts?.[1])
        && Number(recapHiddenDerivedMix?.[2]) === Number(recapHiddenStructuredCounts?.[1]),
      "Hidden derived mix matches hidden compact and structured rows",
    );
    assert(
      Number(recapShownCompactSourceMix?.[1]) === Number(recapShownCompactCounts?.[1])
        && Number(recapShownCompactSourceMix?.[2]) + Number(recapShownCompactSourceMix?.[3]) + Number(recapShownCompactSourceMix?.[4]) === Number(recapShownCompactCounts?.[2]),
      "Visible compact source mix matches shown artifact and markdown rows",
    );
    assert(
      taggedCount(recapHiddenCompactSourceMix?.[1], "artifact") === Number(recapHiddenArtifactCounts?.[1])
        && taggedCount(recapHiddenCompactSourceMix?.[1], "markdown-heuristic")
          + taggedCount(recapHiddenCompactSourceMix?.[1], "markdown-llm")
          + taggedCount(recapHiddenCompactSourceMix?.[1], "markdown-unknown") === Number(recapHiddenMarkdownCounts?.[1]),
      "Hidden compact source mix matches hidden artifact and markdown rows",
    );
    assert(
      Number(recapShownDerivedSourceMix?.[1]) === Number(recapShownCompactCounts?.[1])
        && Number(recapShownDerivedSourceMix?.[2]) + Number(recapShownDerivedSourceMix?.[3]) + Number(recapShownDerivedSourceMix?.[4]) === Number(recapShownCompactCounts?.[2])
        && Number(recapShownDerivedSourceMix?.[5]) + Number(recapShownDerivedSourceMix?.[6]) + Number(recapShownDerivedSourceMix?.[7]) === Number(recapShownStructuredCounts?.[1]),
      "Visible derived source mix matches shown artifact, markdown, and structured rows",
    );
    assert(
      taggedCount(recapHiddenDerivedSourceMix?.[1], "artifact") === Number(recapHiddenArtifactCounts?.[1])
        && taggedCount(recapHiddenDerivedSourceMix?.[1], "markdown-heuristic")
          + taggedCount(recapHiddenDerivedSourceMix?.[1], "markdown-llm")
          + taggedCount(recapHiddenDerivedSourceMix?.[1], "markdown-unknown") === Number(recapHiddenMarkdownCounts?.[1])
        && taggedCount(recapHiddenDerivedSourceMix?.[1], "structured-keyword")
          + taggedCount(recapHiddenDerivedSourceMix?.[1], "structured-llm")
          + taggedCount(recapHiddenDerivedSourceMix?.[1], "structured-unknown") === Number(recapHiddenStructuredCounts?.[1]),
      "Hidden derived source mix matches hidden artifact, markdown, and structured rows",
    );
    assert(
      sumTaggedCountMix(recapShownCompactReasonMix?.[1]) >= Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2]),
      "Visible compact reason mix covers shown compact rows",
    );
    assert(
      sumTaggedCountMix(recapShownDerivedReasonMix?.[1]) >= Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2]) + Number(recapShownStructuredCounts?.[1]),
      "Visible derived reason mix covers shown compact and structured rows",
    );
    assert(
      Number(recapShownCompactSessionMix?.[1]) + Number(recapShownCompactSessionMix?.[2]) === Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2]),
      "Visible compact session mix matches shown compact rows",
    );
    assert(
      Number(recapShownDerivedSessionMix?.[1]) + Number(recapShownDerivedSessionMix?.[2])
        === Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2]) + Number(recapShownStructuredCounts?.[1]),
      "Visible derived session mix matches shown compact and structured rows",
    );
    assert(
      Number(recapShownArtifactSessionMix?.[1]) + Number(recapShownArtifactSessionMix?.[2]) === Number(recapShownCompactCounts?.[1]),
      "Visible artifact session mix matches shown artifact rows",
    );
    assert(
      taggedCount(recapHiddenArtifactSessionMix?.[1], "current")
        + taggedCount(recapHiddenArtifactSessionMix?.[1], "archived") === Number(recapHiddenArtifactCounts?.[1]),
      "Hidden artifact session mix matches hidden artifact rows",
    );
    assert(
      Number(recapShownMarkdownSessionMix?.[1]) + Number(recapShownMarkdownSessionMix?.[2]) === Number(recapShownCompactCounts?.[2]),
      "Visible markdown session mix matches shown markdown rows",
    );
    assert(
      taggedCount(recapHiddenMarkdownSessionMix?.[1], "current")
        + taggedCount(recapHiddenMarkdownSessionMix?.[1], "archived") === Number(recapHiddenMarkdownCounts?.[1]),
      "Hidden markdown session mix matches hidden markdown rows",
    );
    assert(
      Number(recapShownMarkdownSourceMix?.[1]) + Number(recapShownMarkdownSourceMix?.[2]) + Number(recapShownMarkdownSourceMix?.[3]) === Number(recapShownCompactCounts?.[2]),
      "Visible markdown source mix matches shown markdown rows",
    );
    assert(
      taggedCount(recapHiddenMarkdownSourceMix?.[1], "heuristic")
        + taggedCount(recapHiddenMarkdownSourceMix?.[1], "llm")
        + taggedCount(recapHiddenMarkdownSourceMix?.[1], "unknown") === Number(recapHiddenMarkdownCounts?.[1]),
      "Hidden markdown source mix matches hidden markdown rows",
    );
    assert(
      sumTaggedCountMix(recapShownArtifactReasonMix?.[1]) >= Number(recapShownCompactCounts?.[1]),
      "Visible artifact reason mix covers shown artifact rows",
    );
    assert(
      sumTaggedCountMix(recapHiddenArtifactReasonMix?.[1]) >= Number(recapHiddenArtifactCounts?.[1]),
      "Hidden artifact reason mix covers hidden artifact rows",
    );
    assert(
      sumTaggedCountMix(recapShownMarkdownReasonMix?.[1]) >= Number(recapShownCompactCounts?.[2]),
      "Visible markdown reason mix covers shown markdown rows",
    );
    assert(
      sumTaggedCountMix(recapHiddenMarkdownReasonMix?.[1]) >= Number(recapHiddenMarkdownCounts?.[1]),
      "Hidden markdown reason mix covers hidden markdown rows",
    );
    assert(
      taggedCount(recapHiddenStructuredSourceMix?.[1], "keyword")
        + taggedCount(recapHiddenStructuredSourceMix?.[1], "llm")
        + taggedCount(recapHiddenStructuredSourceMix?.[1], "unknown") === Number(recapHiddenStructuredCounts?.[1]),
      "Hidden structured source mix matches hidden structured rows",
    );
    assert(
      taggedCount(recapHiddenCompactSessionMix?.[1], "current")
        + taggedCount(recapHiddenCompactSessionMix?.[1], "archived") === Number(recapHiddenCompactCounts?.[1]),
      "Hidden compact session mix matches hidden compact rows",
    );
    assert(
      taggedCount(recapHiddenDerivedSessionMix?.[1], "current")
        + taggedCount(recapHiddenDerivedSessionMix?.[1], "archived") === Number(recapHiddenCompactCounts?.[1]) + Number(recapHiddenStructuredCounts?.[1]),
      "Hidden derived session mix matches hidden compact and structured rows",
    );
    assert(
      taggedCount(recapHiddenStructuredSessionMix?.[1], "current")
        + taggedCount(recapHiddenStructuredSessionMix?.[1], "archived") === Number(recapHiddenStructuredCounts?.[1]),
      "Hidden structured session mix matches hidden structured rows",
    );
    assert(
      taggedCount(recapHiddenStructuredScopeMix?.[1], "agent")
        + taggedCount(recapHiddenStructuredScopeMix?.[1], "colony") === Number(recapHiddenStructuredCounts?.[1]),
      "Hidden structured scope mix matches hidden structured rows",
    );
    assert(
      sumTaggedCountMix(recapHiddenStructuredCategoryMix?.[1]) >= Number(recapHiddenStructuredCounts?.[1]),
      "Hidden structured category mix covers hidden structured rows",
    );
    assert(
      taggedCount(recapHiddenSessionMix?.[1], "current")
        + taggedCount(recapHiddenSessionMix?.[1], "archived") === Number(recapHiddenNonPalaceCounts?.[1]),
      "Hidden session mix matches hidden non-palace rows",
    );
    assert(
      sumTaggedCountMix(recapHiddenCompactReasonMix?.[1]) >= Number(recapHiddenCompactCounts?.[1]),
      "Hidden compact reason mix covers hidden compact rows",
    );
    assert(
      sumTaggedCountMix(recapHiddenDerivedReasonMix?.[1]) >= Number(recapHiddenCompactCounts?.[1]) + Number(recapHiddenStructuredCounts?.[1]),
      "Hidden derived reason mix covers hidden compact and structured rows",
    );
    assert(
      sumTaggedCountMix(recapShownOverallReasonMix?.[1])
        >= Number(recapShownExactCounts?.[1])
          + Number(recapShownCompactCounts?.[1])
          + Number(recapShownCompactCounts?.[2])
          + Number(recapShownStructuredCounts?.[1]),
      "Visible aggregate non-palace reason mix covers shown non-palace rows",
    );
    assert(
      sumTaggedCountMix(recapHiddenOverallReasonMix?.[1]) >= Number(recapHiddenNonPalaceCounts?.[1]),
      "Hidden aggregate non-palace reason mix covers hidden non-palace rows",
    );
    assert(
      sumTaggedCountMix(recapShownMemoryReasonMix?.[1]) >= Number(recapShownMemoryCounts?.[1]),
      "Visible whole-memory reason mix covers shown rows when palace recall is absent",
    );
    assert(
      sumTaggedCountMix(recapHiddenMemoryReasonMix?.[1]) >= Number(recapHiddenNonPalaceCounts?.[1]),
      "Hidden whole-memory reason mix covers hidden rows when palace recall is absent",
    );
    assert(
      Number(recapShownNonPalaceMix?.[1]) === Number(recapShownExactCounts?.[1])
        && Number(recapShownNonPalaceMix?.[2]) === Number(recapShownCompactCounts?.[1])
        && Number(recapShownNonPalaceMix?.[3]) === Number(recapShownCompactCounts?.[2])
        && Number(recapShownNonPalaceMix?.[4]) === Number(recapShownStructuredCounts?.[1]),
      "Visible non-palace layer mix matches shown exact, artifact, markdown, and structured rows",
    );
    assert(
      Number(recapHiddenTruthMix?.[1]) === 0
        && Number(recapHiddenTruthMix?.[2]) === Number(recapDerivedCounts?.[1]) - Number(recapShownDerivedCounts?.[1])
        && Number(recapHiddenTruthMix?.[3]) === 0,
      "Hidden truth mix matches hidden derived rows when exact and palace recall are absent",
    );
    assert(
      Number(recapHiddenMemoryMix?.[1]) === 0
        && Number(recapHiddenMemoryMix?.[2]) === Number(recapHiddenArtifactCounts?.[1])
        && Number(recapHiddenMemoryMix?.[3]) === Number(recapHiddenMarkdownCounts?.[1])
        && Number(recapHiddenMemoryMix?.[4]) === Number(recapHiddenStructuredCounts?.[1])
        && Number(recapHiddenMemoryMix?.[5]) === 0,
      "Hidden whole-memory layer mix matches hidden exact, compact sublayers, and structured rows when palace recall is absent",
    );
    assert(
      Number(recapHiddenMemoryOrigin?.[1]) + Number(recapHiddenMemoryOrigin?.[2]) + Number(recapHiddenMemoryOrigin?.[3])
        === Number(recapHiddenArtifactCounts?.[1]) + Number(recapHiddenMarkdownCounts?.[1]) + Number(recapHiddenStructuredCounts?.[1]),
      "Hidden whole-memory origin mix matches hidden rows when palace recall is absent",
    );
    assert(
      (recapSectionState?.[1] ?? "")
        === formatSectionStateMix([
          ["compact", classifySectionState(Number(recapDerivedMix?.[1]), Number(recapShownDerivedMix?.[1]))],
          ["structured", classifySectionState(Number(recapDerivedMix?.[2]), Number(recapShownDerivedMix?.[2]))],
        ]),
      "Derived-only recap section-state map matches compact and structured outcomes",
    );
    assert(
      (recapEmptySections?.[1] ?? "")
        === ([
          Number(recapDerivedMix?.[1]) === 0 ? "compact" : undefined,
          Number(recapDerivedMix?.[2]) === 0 ? "structured" : undefined,
        ].filter(Boolean).join(">") || "none"),
      "Derived-only recap empty section list matches planned compact and structured sections that had zero hits",
    );
    assert(
      Number(recapHiddenNonPalaceMix?.[1]) === 0
        && Number(recapHiddenNonPalaceMix?.[2]) === Number(recapHiddenArtifactCounts?.[1])
        && Number(recapHiddenNonPalaceMix?.[3]) === Number(recapHiddenMarkdownCounts?.[1])
        && Number(recapHiddenNonPalaceMix?.[4]) === Number(recapHiddenStructuredCounts?.[1]),
      "Hidden non-palace layer mix matches hidden exact, artifact, markdown, and structured rows when palace recall is absent",
    );
    assert(
      (recapHiddenSections?.[1] ?? "")
        === ([
          Number(recapHiddenCompactCounts?.[1]) > 0 ? "compact" : undefined,
          Number(recapHiddenStructuredCounts?.[1]) > 0 ? "structured" : undefined,
        ].filter(Boolean).join(">") || "none"),
      "Hidden section list matches derived recap sections that actually overflowed",
    );
    assert(
      Number(recapShownTruthMix?.[1]) === Number(recapShownExactCounts?.[1])
        && Number(recapShownTruthMix?.[2]) === Number(recapShownDerivedCounts?.[1])
        && Number(recapShownTruthMix?.[3]) === 0,
      "Visible truth mix matches shown exact, derived, and palace totals when palace recall is absent",
    );
    assert(
      Number(recapShownMemoryMix?.[1]) === Number(recapShownExactCounts?.[1])
        && Number(recapShownMemoryMix?.[2]) === Number(recapShownCompactCounts?.[1])
        && Number(recapShownMemoryMix?.[3]) === Number(recapShownCompactCounts?.[2])
        && Number(recapShownMemoryMix?.[4]) === Number(recapShownStructuredCounts?.[1])
        && Number(recapShownMemoryMix?.[5]) === 0,
      "Visible whole-memory mix matches shown exact, artifact, markdown, structured, and palace rows when palace recall is absent",
    );
    assert(
      Number(recapShownMemoryOrigin?.[1]) + Number(recapShownMemoryOrigin?.[2]) + Number(recapShownMemoryOrigin?.[3])
        === Number(recapShownMemoryCounts?.[1]),
      "Visible whole-memory origin mix matches shown rows when palace recall is absent",
    );
    assert(
      Number(recapShownMemoryCounts?.[1]) === Number(recapShownNonPalaceCounts?.[1]),
      "Visible whole-memory count matches visible non-palace count when palace recall is absent",
    );
    assert(
      Number(recapShownNonPalaceCounts?.[1])
        === Number(recapShownExactCounts?.[1]) + Number(recapShownCompactCounts?.[1]) + Number(recapShownCompactCounts?.[2]) + Number(recapShownStructuredCounts?.[1]),
      "Visible non-palace count matches shown exact, artifact, markdown, and structured rows",
    );
    assert(recapContext.includes("more compact derived matches hidden."), "Compact derived section surfaces hidden-row note when compact recall is truncated");

    const archivedRoutingContext = await memory.buildMemoryContext("what did you say in the previous session about compaction", session);
    assert(archivedRoutingContext.includes("truth-via:default"), "Memory routing note surfaces default truth-mode provenance when no stronger signal fired");
    assert(archivedRoutingContext.includes("role:assistant"), "Memory routing note surfaces assistant-role preference for you-said queries");
    assert(archivedRoutingContext.includes("role-via:assistant-said"), "Memory routing note surfaces transcript role-preference source");
    assert(archivedRoutingContext.includes("session:archived"), "Memory routing note surfaces archived-session preference");
    assert(archivedRoutingContext.includes("session-via:previous-session"), "Memory routing note surfaces session-preference source");
    assert(archivedRoutingContext.includes("hits:exact="), "Memory routing note surfaces exact-hit counts");
    assert(archivedRoutingContext.includes("memory-total="), "Memory routing note surfaces aggregate whole-memory row count");
    assert(archivedRoutingContext.includes("truth-mix:exact="), "Memory routing note surfaces aggregate exact-vs-derived-vs-palace truth mix");
    assert(archivedRoutingContext.includes("memory-mix:exact="), "Memory routing note surfaces aggregate whole-memory layer mix");
    assert(archivedRoutingContext.includes("memory-origin:current="), "Memory routing note surfaces aggregate whole-memory origin mix");
    assert(archivedRoutingContext.includes("non-palace="), "Memory routing note surfaces aggregate non-palace row count");
    assert(archivedRoutingContext.includes("non-palace-mix:exact="), "Memory routing note surfaces aggregate non-palace layer mix");
    assert(archivedRoutingContext.includes("exact-role:user=") && archivedRoutingContext.includes("assistant=") && archivedRoutingContext.includes("tool="), "Memory routing note surfaces exact-role contribution counts");
    assert(archivedRoutingContext.includes("shown-exact-role:user=") && archivedRoutingContext.includes("assistant=") && archivedRoutingContext.includes("tool="), "Memory routing note surfaces visible exact-role contribution counts");
    assert(archivedRoutingContext.includes("hidden-exact-role:"), "Memory routing note surfaces hidden exact-role contribution counts");
    assert(archivedRoutingContext.includes("exact-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate exact current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("shown-exact-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible exact current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("hidden-exact-session:"), "Memory routing note surfaces hidden exact current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("exact-why:"), "Memory routing note surfaces aggregate exact reason mix");
    assert(archivedRoutingContext.includes("shown-exact-why:"), "Memory routing note surfaces visible exact reason mix");
    assert(archivedRoutingContext.includes("hidden-exact-why:"), "Memory routing note surfaces hidden exact reason mix");
    assert(archivedRoutingContext.includes("shown:exact=") && archivedRoutingContext.includes("shown-artifact=") && archivedRoutingContext.includes("shown-markdown=") && archivedRoutingContext.includes("shown-structured="), "Memory routing note surfaces shown non-palace row counts after truncation");
    assert(archivedRoutingContext.includes("memory-shown="), "Memory routing note surfaces visible whole-memory row count");
    assert(archivedRoutingContext.includes("shown-truth-mix:exact="), "Memory routing note surfaces visible exact-vs-derived-vs-palace truth mix");
    assert(archivedRoutingContext.includes("hidden-truth-mix:exact="), "Memory routing note surfaces hidden exact-vs-derived-vs-palace truth mix");
    assert(archivedRoutingContext.includes("hidden-memory-mix:exact="), "Memory routing note surfaces hidden whole-memory layer mix");
    assert(archivedRoutingContext.includes("hidden-memory-origin:current="), "Memory routing note surfaces hidden whole-memory origin mix");
    assert(archivedRoutingContext.includes("shown-memory-mix:exact="), "Memory routing note surfaces visible whole-memory layer mix");
    assert(archivedRoutingContext.includes("shown-memory-origin:current="), "Memory routing note surfaces visible whole-memory origin mix");
    assert(archivedRoutingContext.includes("shown-sections:"), "Memory routing note surfaces actual shown section order");
    assert(archivedRoutingContext.includes("section-state:"), "Memory routing note surfaces one-glance section state map");
    assert(archivedRoutingContext.includes("empty-sections:"), "Memory routing note surfaces which planned sections had zero hits");
    assert(archivedRoutingContext.includes("hidden-sections:"), "Memory routing note surfaces which sections actually truncated");
    assert(archivedRoutingContext.includes("shown-non-palace="), "Memory routing note surfaces visible non-palace row count");
    assert(archivedRoutingContext.includes("shown-non-palace-mix:exact="), "Memory routing note surfaces visible non-palace layer mix");
    assert(archivedRoutingContext.includes("hidden-non-palace-mix:exact="), "Memory routing note surfaces hidden non-palace layer mix");
    assert(archivedRoutingContext.includes("hidden:exact=") && archivedRoutingContext.includes("hidden-artifact=") && archivedRoutingContext.includes("hidden-markdown=") && archivedRoutingContext.includes("hidden-structured="), "Memory routing note surfaces hidden non-palace row counts after truncation");
    assert(archivedRoutingContext.includes("memory-hidden="), "Memory routing note surfaces hidden whole-memory row count");
    assert(archivedRoutingContext.includes("hidden-non-palace="), "Memory routing note surfaces hidden non-palace row count");
    assert(archivedRoutingContext.includes("artifact=") && archivedRoutingContext.includes("markdown=") && archivedRoutingContext.includes("structured="), "Memory routing note surfaces derived-layer hit counts");
    assert(archivedRoutingContext.includes("compact-mix:artifact=") && archivedRoutingContext.includes("markdown="), "Memory routing note surfaces aggregate compact artifact-vs-markdown mix");
    assert(archivedRoutingContext.includes("derived-mix:compact=") && archivedRoutingContext.includes("structured="), "Memory routing note surfaces aggregate compact-vs-structured derived mix");
    assert(archivedRoutingContext.includes("compact=") && archivedRoutingContext.includes("shown-compact=") && archivedRoutingContext.includes("hidden-compact="), "Memory routing note surfaces aggregate compact total, shown, and hidden counts");
    assert(archivedRoutingContext.includes("hidden-compact-mix:artifact=") && archivedRoutingContext.includes("markdown="), "Memory routing note surfaces hidden compact artifact-vs-markdown mix");
    assert(archivedRoutingContext.includes("compact-src:artifact="), "Memory routing note surfaces aggregate compact source mix");
    assert(archivedRoutingContext.includes("shown-compact-src:artifact="), "Memory routing note surfaces visible compact source mix");
    assert(archivedRoutingContext.includes("hidden-compact-src:artifact="), "Memory routing note surfaces hidden compact source mix");
    assert(archivedRoutingContext.includes("derived=") && archivedRoutingContext.includes("shown-derived=") && archivedRoutingContext.includes("hidden-derived="), "Memory routing note surfaces aggregate derived total, shown, and hidden counts");
    assert(archivedRoutingContext.includes("hidden-derived-mix:compact=") && archivedRoutingContext.includes("structured="), "Memory routing note surfaces hidden compact-vs-structured derived mix");
    assert(archivedRoutingContext.includes("derived-src:artifact="), "Memory routing note surfaces aggregate derived source mix");
    assert(archivedRoutingContext.includes("shown-derived-src:artifact="), "Memory routing note surfaces visible derived source mix");
    assert(archivedRoutingContext.includes("hidden-derived-src:"), "Memory routing note surfaces hidden derived source mix");
    assert(archivedRoutingContext.includes("shown-derived-mix:compact=") && archivedRoutingContext.includes("structured="), "Memory routing note surfaces visible compact-vs-structured derived mix");
    assert(archivedRoutingContext.includes("artifact-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate artifact current-vs-archived mix");
    assert(archivedRoutingContext.includes("shown-artifact-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible artifact current-vs-archived mix");
    assert(archivedRoutingContext.includes("hidden-artifact-session:"), "Memory routing note surfaces hidden artifact current-vs-archived mix");
    assert(archivedRoutingContext.includes("artifact-why:"), "Memory routing note surfaces aggregate artifact reason mix");
    assert(archivedRoutingContext.includes("shown-artifact-why:"), "Memory routing note surfaces visible artifact reason mix");
    assert(archivedRoutingContext.includes("hidden-artifact-why:"), "Memory routing note surfaces hidden artifact reason mix");
    assert(archivedRoutingContext.includes("markdown-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate markdown current-vs-archived mix");
    assert(archivedRoutingContext.includes("shown-markdown-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible markdown current-vs-archived mix");
    assert(archivedRoutingContext.includes("hidden-markdown-session:"), "Memory routing note surfaces hidden markdown current-vs-archived mix");
    assert(archivedRoutingContext.includes("shown-compact-mix:artifact=") && archivedRoutingContext.includes("markdown="), "Memory routing note surfaces visible compact artifact-vs-markdown mix after truncation");
    assert(archivedRoutingContext.includes("compact-why:"), "Memory routing note surfaces aggregate compact reason mix");
    assert(archivedRoutingContext.includes("shown-compact-why:"), "Memory routing note surfaces visible compact reason mix");
    assert(archivedRoutingContext.includes("hidden-compact-why:"), "Memory routing note surfaces hidden compact reason mix");
    assert(archivedRoutingContext.includes("derived-why:"), "Memory routing note surfaces aggregate derived reason mix");
    assert(archivedRoutingContext.includes("shown-derived-why:"), "Memory routing note surfaces visible derived reason mix");
    assert(archivedRoutingContext.includes("hidden-derived-why:"), "Memory routing note surfaces hidden derived reason mix");
    assert(archivedRoutingContext.includes("compact-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate compact current-vs-archived mix");
    assert(archivedRoutingContext.includes("shown-compact-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible compact current-vs-archived mix");
    assert(archivedRoutingContext.includes("hidden-compact-session:"), "Memory routing note surfaces hidden compact current-vs-archived mix");
    assert(archivedRoutingContext.includes("derived-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate derived current-vs-archived mix");
    assert(archivedRoutingContext.includes("shown-derived-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible derived current-vs-archived mix");
    assert(archivedRoutingContext.includes("hidden-derived-session:"), "Memory routing note surfaces hidden derived current-vs-archived mix");
    assert(archivedRoutingContext.includes("why-mix:"), "Memory routing note surfaces aggregate non-palace reason mix");
    assert(archivedRoutingContext.includes("shown-why-mix:"), "Memory routing note surfaces visible aggregate non-palace reason mix");
    assert(archivedRoutingContext.includes("hidden-why-mix:"), "Memory routing note surfaces hidden aggregate non-palace reason mix");
    assert(archivedRoutingContext.includes("memory-why:"), "Memory routing note surfaces aggregate whole-memory reason mix");
    assert(archivedRoutingContext.includes("shown-memory-why:"), "Memory routing note surfaces visible whole-memory reason mix");
    assert(archivedRoutingContext.includes("hidden-memory-why:"), "Memory routing note surfaces hidden whole-memory reason mix");
    assert(archivedRoutingContext.includes("markdown-why:"), "Memory routing note surfaces aggregate markdown reason mix");
    assert(archivedRoutingContext.includes("shown-markdown-why:"), "Memory routing note surfaces visible markdown reason mix");
    assert(archivedRoutingContext.includes("hidden-markdown-why:"), "Memory routing note surfaces hidden markdown reason mix");
    assert(archivedRoutingContext.includes("structured-scope:agent=") && archivedRoutingContext.includes("colony="), "Memory routing note surfaces aggregate durable scope counts");
    assert(archivedRoutingContext.includes("shown-structured-scope:"), "Memory routing note surfaces visible durable scope counts");
    assert(archivedRoutingContext.includes("hidden-structured-scope:"), "Memory routing note surfaces hidden durable scope counts");
    assert(archivedRoutingContext.includes("structured-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate structured current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("shown-structured-session:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible structured current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("hidden-structured-session:"), "Memory routing note surfaces hidden structured current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("structured-cat:"), "Memory routing note surfaces aggregate structured category mix");
    assert(archivedRoutingContext.includes("shown-structured-cat:"), "Memory routing note surfaces visible structured category mix");
    assert(archivedRoutingContext.includes("hidden-structured-cat:"), "Memory routing note surfaces hidden structured category mix");
    assert(archivedRoutingContext.includes("shown-structured-src:"), "Memory routing note surfaces visible structured extraction-source mix");
    assert(archivedRoutingContext.includes("structured-why:"), "Memory routing note surfaces aggregate structured reason mix");
    assert(archivedRoutingContext.includes("shown-structured-why:"), "Memory routing note surfaces visible structured reason mix");
    assert(archivedRoutingContext.includes("hidden-structured-why:"), "Memory routing note surfaces hidden structured reason mix");
    assert(archivedRoutingContext.includes("structured-src:keyword=") && archivedRoutingContext.includes("llm="), "Memory routing note surfaces structured extraction-source mix");
    assert(archivedRoutingContext.includes("markdown-src:heuristic=") && archivedRoutingContext.includes("llm="), "Memory routing note surfaces markdown extraction-source mix");
    assert(archivedRoutingContext.includes("shown-markdown-src:heuristic=") && archivedRoutingContext.includes("llm="), "Memory routing note surfaces visible markdown extraction-source mix");
    assert(archivedRoutingContext.includes("hidden-markdown-src:"), "Memory routing note surfaces hidden markdown extraction-source mix");
    assert(archivedRoutingContext.includes("hidden-structured-src:"), "Memory routing note surfaces hidden structured extraction-source mix");
    assert(archivedRoutingContext.includes("session-mix:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces aggregate current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("shown-session-mix:current=") && archivedRoutingContext.includes("archived="), "Memory routing note surfaces visible current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("hidden-session-mix:"), "Memory routing note surfaces hidden current-vs-archived contribution counts");
    assert(archivedRoutingContext.includes("palace="), "Memory routing note surfaces palace hit counts");
    assert(archivedRoutingContext.includes("shown-palace="), "Memory routing note surfaces shown palace row counts after truncation");
    assert(archivedRoutingContext.includes("hidden-palace="), "Memory routing note surfaces hidden palace row counts after truncation");
    assert(archivedRoutingContext.includes("palace-hall:"), "Memory routing note surfaces aggregate palace hall mix");
    assert(archivedRoutingContext.includes("shown-palace-hall:"), "Memory routing note surfaces visible palace hall mix");
    assert(archivedRoutingContext.includes("hidden-palace-hall:"), "Memory routing note surfaces hidden palace hall mix");
    assert(archivedRoutingContext.includes("palace-room:"), "Memory routing note surfaces aggregate palace room mix");
    assert(archivedRoutingContext.includes("shown-palace-room:"), "Memory routing note surfaces visible palace room mix");
    assert(archivedRoutingContext.includes("hidden-palace-room:"), "Memory routing note surfaces hidden palace room mix");
    assert(archivedRoutingContext.includes("palace-wing:"), "Memory routing note surfaces aggregate palace wing mix");
    assert(archivedRoutingContext.includes("shown-palace-wing:"), "Memory routing note surfaces visible palace wing mix");
    assert(archivedRoutingContext.includes("hidden-palace-wing:"), "Memory routing note surfaces hidden palace wing mix");
    assert(archivedRoutingContext.includes("palace-source:"), "Memory routing note surfaces aggregate palace source-file mix");
    assert(archivedRoutingContext.includes("shown-palace-source:"), "Memory routing note surfaces visible palace source-file mix");
    assert(archivedRoutingContext.includes("hidden-palace-source:"), "Memory routing note surfaces hidden palace source-file mix");
    assert(archivedRoutingContext.includes("palace-why:"), "Memory routing note surfaces aggregate palace reason mix");
    assert(archivedRoutingContext.includes("shown-palace-why:"), "Memory routing note surfaces visible palace reason mix");
    assert(archivedRoutingContext.includes("hidden-palace-why:"), "Memory routing note surfaces hidden palace reason mix");
    const archivedExactCounts = archivedRoutingContext.match(/hits:exact=(\d+)/);
    const archivedMemoryCounts = archivedRoutingContext.match(/memory-total=(\d+)/);
    const archivedTruthMix = archivedRoutingContext.match(/truth-mix:exact=(\d+),derived=(\d+),palace=(\d+)/);
    const archivedMemoryMix = archivedRoutingContext.match(/memory-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+),palace=(\d+)/);
    const archivedMemoryOrigin = archivedRoutingContext.match(/memory-origin:current=(\d+),archived=(\d+),palace=(\d+)/);
    const archivedNonPalaceCounts = archivedRoutingContext.match(/non-palace=(\d+)/);
    const archivedShownExactCounts = archivedRoutingContext.match(/shown:exact=(\d+)/);
    const archivedShownMemoryCounts = archivedRoutingContext.match(/memory-shown=(\d+)/);
    const archivedShownTruthMix = archivedRoutingContext.match(/shown-truth-mix:exact=(\d+),derived=(\d+),palace=(\d+)/);
    const archivedHiddenTruthMix = archivedRoutingContext.match(/hidden-truth-mix:exact=(\d+),derived=(\d+),palace=(\d+)/);
    const archivedHiddenMemoryMix = archivedRoutingContext.match(/hidden-memory-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+),palace=(\d+)/);
    const archivedHiddenMemoryOrigin = archivedRoutingContext.match(/hidden-memory-origin:current=(\d+),archived=(\d+),palace=(\d+)/);
    const archivedShownMemoryMix = archivedRoutingContext.match(/shown-memory-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+),palace=(\d+)/);
    const archivedShownMemoryOrigin = archivedRoutingContext.match(/shown-memory-origin:current=(\d+),archived=(\d+),palace=(\d+)/);
    const archivedShownSections = archivedRoutingContext.match(/shown-sections:([^ ]+)/);
    const archivedSectionState = archivedRoutingContext.match(/section-state:([^ ]+)/);
    const archivedEmptySections = archivedRoutingContext.match(/empty-sections:([^ ]+)/);
    const archivedHiddenSections = archivedRoutingContext.match(/hidden-sections:([^ ]+)/);
    const archivedHiddenExactCounts = archivedRoutingContext.match(/hidden:exact=(\d+)/);
    const archivedHiddenArtifactCounts = archivedRoutingContext.match(/hidden-artifact=(\d+)/);
    const archivedHiddenMarkdownCounts = archivedRoutingContext.match(/hidden-markdown=(\d+)/);
    const archivedShownNonPalaceCounts = archivedRoutingContext.match(/shown-non-palace=(\d+)/);
    const archivedNonPalaceMix = archivedRoutingContext.match(/non-palace-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+)/);
    const archivedShownNonPalaceMix = archivedRoutingContext.match(/shown-non-palace-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+)/);
    const archivedHiddenNonPalaceMix = archivedRoutingContext.match(/hidden-non-palace-mix:exact=(\d+),artifact=(\d+),markdown=(\d+),structured=(\d+)/);
    const archivedShownExactRole = archivedRoutingContext.match(/shown-exact-role:user=(\d+),assistant=(\d+),tool=(\d+)/);
    const archivedHiddenExactRole = archivedRoutingContext.match(/hidden-exact-role:([^ ]+)/);
    const archivedShownExactSession = archivedRoutingContext.match(/shown-exact-session:current=(\d+),archived=(\d+)/);
    const archivedHiddenExactSession = archivedRoutingContext.match(/hidden-exact-session:([^ ]+)/);
    const archivedShownExactReasonMix = archivedRoutingContext.match(/shown-exact-why:([^ ]+)/);
    const archivedHiddenExactReasonMix = archivedRoutingContext.match(/hidden-exact-why:([^ ]+)/);
    const archivedArtifactCount = archivedRoutingContext.match(/(?:^| )artifact=(\d+)/);
    const archivedMarkdownCount = archivedRoutingContext.match(/(?:^| )markdown=(\d+)/);
    const archivedShownArtifactCounts = archivedRoutingContext.match(/shown-artifact=(\d+)/);
    const archivedShownArtifactSession = archivedRoutingContext.match(/shown-artifact-session:current=(\d+),archived=(\d+)/);
    const archivedHiddenArtifactSession = archivedRoutingContext.match(/hidden-artifact-session:([^ ]+)/);
    const archivedShownArtifactReasonMix = archivedRoutingContext.match(/shown-artifact-why:([^ ]+)/);
    const archivedHiddenArtifactReasonMix = archivedRoutingContext.match(/hidden-artifact-why:([^ ]+)/);
    const archivedShownMarkdownCounts = archivedRoutingContext.match(/shown-markdown=(\d+)/);
    const archivedShownMarkdownSession = archivedRoutingContext.match(/shown-markdown-session:current=(\d+),archived=(\d+)/);
    const archivedHiddenMarkdownSession = archivedRoutingContext.match(/hidden-markdown-session:([^ ]+)/);
    const archivedShownMarkdownSource = archivedRoutingContext.match(/shown-markdown-src:heuristic=(\d+),llm=(\d+),unknown=(\d+)/);
    const archivedHiddenMarkdownSource = archivedRoutingContext.match(/hidden-markdown-src:([^ ]+)/);
    const archivedCompactMix = archivedRoutingContext.match(/compact-mix:artifact=(\d+),markdown=(\d+)/);
    const archivedDerivedMix = archivedRoutingContext.match(/derived-mix:compact=(\d+),structured=(\d+)/);
    const archivedCompactCounts = archivedRoutingContext.match(/compact=(\d+)/);
    const archivedCompactSourceMix = archivedRoutingContext.match(/compact-src:artifact=(\d+),markdown-heuristic=(\d+),markdown-llm=(\d+),markdown-unknown=(\d+)/);
    const archivedDerivedCounts = archivedRoutingContext.match(/derived=(\d+)/);
    const archivedShownCompactCounts = archivedRoutingContext.match(/shown-compact=(\d+)/);
    const archivedShownCompactSourceMix = archivedRoutingContext.match(/shown-compact-src:artifact=(\d+),markdown-heuristic=(\d+),markdown-llm=(\d+),markdown-unknown=(\d+)/);
    const archivedHiddenCompactSourceMix = archivedRoutingContext.match(/hidden-compact-src:([^ ]+)/);
    const archivedShownDerivedCounts = archivedRoutingContext.match(/shown-derived=(\d+)/);
    const archivedHiddenCompactCounts = archivedRoutingContext.match(/hidden-compact=(\d+)/);
    const archivedHiddenCompactMix = archivedRoutingContext.match(/hidden-compact-mix:artifact=(\d+),markdown=(\d+)/);
    const archivedHiddenMemoryCounts = archivedRoutingContext.match(/memory-hidden=(\d+)/);
    const archivedHiddenNonPalaceCounts = archivedRoutingContext.match(/hidden-non-palace=(\d+)/);
    const archivedHiddenDerivedCounts = archivedRoutingContext.match(/hidden-derived=(\d+)/);
    const archivedHiddenDerivedMix = archivedRoutingContext.match(/hidden-derived-mix:compact=(\d+),structured=(\d+)/);
    const archivedDerivedSourceMix = archivedRoutingContext.match(/derived-src:artifact=(\d+),markdown-heuristic=(\d+),markdown-llm=(\d+),markdown-unknown=(\d+),structured-keyword=(\d+),structured-llm=(\d+),structured-unknown=(\d+)/);
    const archivedShownCompactMix = archivedRoutingContext.match(/shown-compact-mix:artifact=(\d+),markdown=(\d+)/);
    const archivedShownDerivedMix = archivedRoutingContext.match(/shown-derived-mix:compact=(\d+),structured=(\d+)/);
    const archivedShownDerivedSourceMix = archivedRoutingContext.match(/shown-derived-src:artifact=(\d+),markdown-heuristic=(\d+),markdown-llm=(\d+),markdown-unknown=(\d+),structured-keyword=(\d+),structured-llm=(\d+),structured-unknown=(\d+)/);
    const archivedHiddenDerivedSourceMix = archivedRoutingContext.match(/hidden-derived-src:([^ ]+)/);
    const archivedShownCompactReasonMix = archivedRoutingContext.match(/shown-compact-why:([^ ]+)/);
    const archivedHiddenCompactReasonMix = archivedRoutingContext.match(/hidden-compact-why:([^ ]+)/);
    const archivedDerivedReasonMix = archivedRoutingContext.match(/derived-why:([^ ]+)/);
    const archivedShownDerivedReasonMix = archivedRoutingContext.match(/shown-derived-why:([^ ]+)/);
    const archivedHiddenDerivedReasonMix = archivedRoutingContext.match(/hidden-derived-why:([^ ]+)/);
    const archivedShownCompactSessionMix = archivedRoutingContext.match(/shown-compact-session:current=(\d+),archived=(\d+)/);
    const archivedHiddenCompactSessionMix = archivedRoutingContext.match(/hidden-compact-session:([^ ]+)/);
    const archivedDerivedSessionMix = archivedRoutingContext.match(/derived-session:current=(\d+),archived=(\d+)/);
    const archivedShownDerivedSessionMix = archivedRoutingContext.match(/shown-derived-session:current=(\d+),archived=(\d+)/);
    const archivedHiddenDerivedSessionMix = archivedRoutingContext.match(/hidden-derived-session:([^ ]+)/);
    const archivedShownOverallReasonMix = archivedRoutingContext.match(/shown-why-mix:([^ ]+)/);
    const archivedHiddenOverallReasonMix = archivedRoutingContext.match(/hidden-why-mix:([^ ]+)/);
    const archivedMemoryReasonMix = archivedRoutingContext.match(/memory-why:([^ ]+)/);
    const archivedShownMemoryReasonMix = archivedRoutingContext.match(/shown-memory-why:([^ ]+)/);
    const archivedHiddenMemoryReasonMix = archivedRoutingContext.match(/hidden-memory-why:([^ ]+)/);
    const archivedShownMarkdownReasonMix = archivedRoutingContext.match(/shown-markdown-why:([^ ]+)/);
    const archivedHiddenMarkdownReasonMix = archivedRoutingContext.match(/hidden-markdown-why:([^ ]+)/);
    const archivedStructuredCounts = archivedRoutingContext.match(/structured=(\d+)/);
    const archivedShownStructuredCounts = archivedRoutingContext.match(/shown-structured=(\d+)/);
    const archivedHiddenStructuredCounts = archivedRoutingContext.match(/hidden-structured=(\d+)/);
    const archivedShownStructuredScope = archivedRoutingContext.match(/shown-structured-scope:agent=(\d+),colony=(\d+)/);
    const archivedHiddenStructuredScope = archivedRoutingContext.match(/hidden-structured-scope:([^ ]+)/);
    const archivedShownStructuredSession = archivedRoutingContext.match(/shown-structured-session:current=(\d+),archived=(\d+)/);
    const archivedHiddenStructuredSession = archivedRoutingContext.match(/hidden-structured-session:([^ ]+)/);
    const archivedHiddenStructuredCategoryMix = archivedRoutingContext.match(/hidden-structured-cat:([^ ]+)/);
    const archivedShownStructuredSource = archivedRoutingContext.match(/shown-structured-src:keyword=(\d+),llm=(\d+),unknown=(\d+)/);
    const archivedHiddenStructuredSource = archivedRoutingContext.match(/hidden-structured-src:([^ ]+)/);
    const archivedShownStructuredReasonMix = archivedRoutingContext.match(/shown-structured-why:([^ ]+)/);
    const archivedHiddenStructuredReasonMix = archivedRoutingContext.match(/hidden-structured-why:([^ ]+)/);
    const archivedShownSessionMix = archivedRoutingContext.match(/shown-session-mix:current=(\d+),archived=(\d+)/);
    const archivedHiddenSessionMix = archivedRoutingContext.match(/hidden-session-mix:([^ ]+)/);
    const archivedPalaceCounts = archivedRoutingContext.match(/palace=(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    const archivedShownPalaceCounts = archivedRoutingContext.match(/shown-palace=(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    const archivedHiddenPalaceCounts = archivedRoutingContext.match(/hidden-palace=(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    const archivedShownPalaceHallMix = archivedRoutingContext.match(/shown-palace-hall:([^ ]+)/);
    const archivedHiddenPalaceHallMix = archivedRoutingContext.match(/hidden-palace-hall:([^ ]+)/);
    const archivedShownPalaceRoomMix = archivedRoutingContext.match(/shown-palace-room:([^ ]+)/);
    const archivedHiddenPalaceRoomMix = archivedRoutingContext.match(/hidden-palace-room:([^ ]+)/);
    const archivedShownPalaceWingMix = archivedRoutingContext.match(/shown-palace-wing:([^ ]+)/);
    const archivedHiddenPalaceWingMix = archivedRoutingContext.match(/hidden-palace-wing:([^ ]+)/);
    const archivedShownPalaceSourceMix = archivedRoutingContext.match(/shown-palace-source:([^ ]+)/);
    const archivedHiddenPalaceSourceMix = archivedRoutingContext.match(/hidden-palace-source:([^ ]+)/);
    const archivedShownPalaceReasonMix = archivedRoutingContext.match(/shown-palace-why:([^ ]+)/);
    const archivedHiddenPalaceReasonMix = archivedRoutingContext.match(/hidden-palace-why:([^ ]+)/);
    assert(Boolean(archivedStructuredCounts && archivedShownStructuredCounts), "Archived routing context exposes structured total and shown counts");
    assert(Number(archivedStructuredCounts?.[1]) > Number(archivedShownStructuredCounts?.[1]), "Archived routing context keeps truncated structured counts honest");
    assert(
      Number(archivedShownExactRole?.[1]) + Number(archivedShownExactRole?.[2]) + Number(archivedShownExactRole?.[3]) === Number(archivedShownExactCounts?.[1]),
      "Visible exact-role mix matches shown exact row count",
    );
    assert(
      taggedCount(archivedHiddenExactRole?.[1], "user")
        + taggedCount(archivedHiddenExactRole?.[1], "assistant")
        + taggedCount(archivedHiddenExactRole?.[1], "tool") === Number(archivedHiddenExactCounts?.[1]),
      "Hidden exact-role mix matches hidden exact row count",
    );
    assert(
      Number(archivedShownExactSession?.[1]) + Number(archivedShownExactSession?.[2]) === Number(archivedShownExactCounts?.[1]),
      "Visible exact session mix matches shown exact row count",
    );
    assert(
      taggedCount(archivedHiddenExactSession?.[1], "current")
        + taggedCount(archivedHiddenExactSession?.[1], "archived") === Number(archivedHiddenExactCounts?.[1]),
      "Hidden exact session mix matches hidden exact rows",
    );
    assert(
      sumTaggedCountMix(archivedShownExactReasonMix?.[1]) >= Number(archivedShownExactCounts?.[1]),
      "Visible exact reason mix covers shown exact rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenExactReasonMix?.[1]) >= Number(archivedHiddenExactCounts?.[1]),
      "Hidden exact reason mix covers hidden exact rows",
    );
    assert(
      Number(archivedShownCompactMix?.[1]) === Number(archivedShownArtifactCounts?.[1])
        && Number(archivedShownCompactMix?.[2]) === Number(archivedShownMarkdownCounts?.[1]),
      "Visible compact mix matches shown artifact and markdown counts",
    );
    assert(
      Number(archivedCompactMix?.[1]) === Number(archivedArtifactCount?.[1])
        && Number(archivedCompactMix?.[2]) === Number(archivedMarkdownCount?.[1]),
      "Aggregate compact mix matches artifact and markdown totals",
    );
    assert(
      Number(archivedCompactSourceMix?.[1]) === Number(archivedArtifactCount?.[1])
        && Number(archivedCompactSourceMix?.[2]) + Number(archivedCompactSourceMix?.[3]) + Number(archivedCompactSourceMix?.[4]) === Number(archivedMarkdownCount?.[1]),
      "Aggregate compact source mix matches artifact and markdown totals",
    );
    assert(
      Number(archivedShownCompactCounts?.[1]) === Number(archivedShownArtifactCounts?.[1]) + Number(archivedShownMarkdownCounts?.[1]),
      "Visible compact count matches shown artifact and markdown rows",
    );
    assert(
      Number(archivedShownCompactSourceMix?.[1]) === Number(archivedShownArtifactCounts?.[1])
        && Number(archivedShownCompactSourceMix?.[2]) + Number(archivedShownCompactSourceMix?.[3]) + Number(archivedShownCompactSourceMix?.[4]) === Number(archivedShownMarkdownCounts?.[1]),
      "Visible compact source mix matches shown artifact and markdown rows",
    );
    assert(
      Number(archivedDerivedSessionMix?.[1]) + Number(archivedDerivedSessionMix?.[2])
        === Number(archivedCompactCounts?.[1]) + Number(archivedStructuredCounts?.[1]),
      "Aggregate derived session mix matches compact and structured totals",
    );
    assert(
      sumTaggedCountMix(archivedDerivedReasonMix?.[1]) >= Number(archivedCompactCounts?.[1]) + Number(archivedStructuredCounts?.[1]),
      "Aggregate derived reason mix covers compact and structured totals",
    );
    assert(
      Number(archivedDerivedMix?.[1]) === Number(archivedCompactCounts?.[1])
        && Number(archivedDerivedMix?.[2]) === Number(archivedStructuredCounts?.[1]),
      "Aggregate derived mix matches compact and structured totals",
    );
    assert(
      Number(archivedDerivedCounts?.[1]) === Number(archivedCompactCounts?.[1]) + Number(archivedStructuredCounts?.[1]),
      "Aggregate derived count matches compact and structured totals",
    );
    assert(
      Number(archivedDerivedSourceMix?.[1]) === Number(archivedArtifactCount?.[1])
        && Number(archivedDerivedSourceMix?.[2]) + Number(archivedDerivedSourceMix?.[3]) + Number(archivedDerivedSourceMix?.[4]) === Number(archivedMarkdownCount?.[1])
        && Number(archivedDerivedSourceMix?.[5]) + Number(archivedDerivedSourceMix?.[6]) + Number(archivedDerivedSourceMix?.[7]) === Number(archivedStructuredCounts?.[1]),
      "Aggregate derived source mix matches artifact, markdown, and structured totals",
    );
    assert(
      Number(archivedShownDerivedMix?.[1]) === Number(archivedShownCompactCounts?.[1])
        && Number(archivedShownDerivedMix?.[2]) === Number(archivedShownStructuredCounts?.[1]),
      "Visible derived mix matches shown compact and structured rows",
    );
    assert(
      Number(archivedShownDerivedCounts?.[1]) === Number(archivedShownCompactCounts?.[1]) + Number(archivedShownStructuredCounts?.[1]),
      "Visible derived count matches shown compact and structured rows",
    );
    assert(
      Number(archivedShownDerivedSourceMix?.[1]) === Number(archivedShownArtifactCounts?.[1])
        && Number(archivedShownDerivedSourceMix?.[2]) + Number(archivedShownDerivedSourceMix?.[3]) + Number(archivedShownDerivedSourceMix?.[4]) === Number(archivedShownMarkdownCounts?.[1])
        && Number(archivedShownDerivedSourceMix?.[5]) + Number(archivedShownDerivedSourceMix?.[6]) + Number(archivedShownDerivedSourceMix?.[7]) === Number(archivedShownStructuredCounts?.[1]),
      "Visible derived source mix matches shown artifact, markdown, and structured rows",
    );
    assert(
      taggedCount(archivedHiddenDerivedSourceMix?.[1], "artifact") === Number(archivedHiddenArtifactCounts?.[1])
        && taggedCount(archivedHiddenDerivedSourceMix?.[1], "markdown-heuristic")
          + taggedCount(archivedHiddenDerivedSourceMix?.[1], "markdown-llm")
          + taggedCount(archivedHiddenDerivedSourceMix?.[1], "markdown-unknown") === Number(archivedHiddenMarkdownCounts?.[1])
        && taggedCount(archivedHiddenDerivedSourceMix?.[1], "structured-keyword")
          + taggedCount(archivedHiddenDerivedSourceMix?.[1], "structured-llm")
          + taggedCount(archivedHiddenDerivedSourceMix?.[1], "structured-unknown") === Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden derived source mix matches hidden artifact, markdown, and structured rows",
    );
    assert(
      sumTaggedCountMix(archivedShownDerivedReasonMix?.[1]) >= Number(archivedShownCompactCounts?.[1]) + Number(archivedShownStructuredCounts?.[1]),
      "Visible derived reason mix covers shown compact and structured rows",
    );
    assert(
      Number(archivedHiddenDerivedCounts?.[1]) === Number(archivedDerivedCounts?.[1]) - Number(archivedShownDerivedCounts?.[1]),
      "Hidden derived count matches derived total minus shown rows",
    );
    assert(
      Number(archivedHiddenDerivedMix?.[1]) === Number(archivedHiddenCompactCounts?.[1])
        && Number(archivedHiddenDerivedMix?.[2]) === Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden derived mix matches hidden compact and structured rows",
    );
    assert(
      Number(archivedShownDerivedSessionMix?.[1]) + Number(archivedShownDerivedSessionMix?.[2])
        === Number(archivedShownCompactCounts?.[1]) + Number(archivedShownStructuredCounts?.[1]),
      "Visible derived session mix matches shown compact and structured rows",
    );
    assert(
      Number(archivedShownArtifactSession?.[1]) + Number(archivedShownArtifactSession?.[2]) === Number(archivedShownArtifactCounts?.[1]),
      "Visible artifact session mix matches shown artifact rows",
    );
    assert(
      Number(archivedShownMarkdownSession?.[1]) + Number(archivedShownMarkdownSession?.[2]) === Number(archivedShownMarkdownCounts?.[1]),
      "Visible markdown session mix matches shown markdown rows",
    );
    assert(
      Number(archivedShownMarkdownSource?.[1]) + Number(archivedShownMarkdownSource?.[2]) + Number(archivedShownMarkdownSource?.[3]) === Number(archivedShownMarkdownCounts?.[1]),
      "Visible markdown source mix matches shown markdown rows",
    );
    assert(
      taggedCount(archivedHiddenMarkdownSource?.[1], "heuristic")
        + taggedCount(archivedHiddenMarkdownSource?.[1], "llm")
        + taggedCount(archivedHiddenMarkdownSource?.[1], "unknown") === Number(archivedHiddenMarkdownCounts?.[1]),
      "Hidden markdown source mix matches hidden markdown rows",
    );
    assert(
      Number(archivedHiddenCompactCounts?.[1]) === Number(archivedCompactCounts?.[1]) - Number(archivedShownCompactCounts?.[1]),
      "Hidden compact count matches compact total minus shown rows",
    );
    assert(
      Number(archivedHiddenCompactMix?.[1]) === Number(archivedHiddenArtifactCounts?.[1])
        && Number(archivedHiddenCompactMix?.[2]) === Number(archivedHiddenMarkdownCounts?.[1]),
      "Hidden compact mix matches hidden artifact and markdown rows",
    );
    assert(
      taggedCount(archivedHiddenCompactSourceMix?.[1], "artifact") === Number(archivedHiddenArtifactCounts?.[1])
        && taggedCount(archivedHiddenCompactSourceMix?.[1], "markdown-heuristic")
          + taggedCount(archivedHiddenCompactSourceMix?.[1], "markdown-llm")
          + taggedCount(archivedHiddenCompactSourceMix?.[1], "markdown-unknown") === Number(archivedHiddenMarkdownCounts?.[1]),
      "Hidden compact source mix matches hidden artifact and markdown rows",
    );
    assert(
      sumTaggedCountMix(archivedShownCompactReasonMix?.[1]) >= Number(archivedShownArtifactCounts?.[1]) + Number(archivedShownMarkdownCounts?.[1]),
      "Visible compact reason mix covers shown compact rows",
    );
    assert(
      Number(archivedShownCompactSessionMix?.[1]) + Number(archivedShownCompactSessionMix?.[2]) === Number(archivedShownArtifactCounts?.[1]) + Number(archivedShownMarkdownCounts?.[1]),
      "Visible compact session mix matches shown compact rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenCompactReasonMix?.[1]) >= Number(archivedHiddenCompactCounts?.[1]),
      "Hidden compact reason mix covers hidden compact rows",
    );
    assert(
      taggedCount(archivedHiddenCompactSessionMix?.[1], "current")
        + taggedCount(archivedHiddenCompactSessionMix?.[1], "archived") === Number(archivedHiddenCompactCounts?.[1]),
      "Hidden compact session mix matches hidden compact rows",
    );
    assert(
      sumTaggedCountMix(archivedShownArtifactReasonMix?.[1]) >= Number(archivedShownArtifactCounts?.[1]),
      "Visible artifact reason mix covers shown artifact rows",
    );
    assert(
      taggedCount(archivedHiddenArtifactSession?.[1], "current")
        + taggedCount(archivedHiddenArtifactSession?.[1], "archived") === Number(archivedHiddenArtifactCounts?.[1]),
      "Hidden artifact session mix matches hidden artifact rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenArtifactReasonMix?.[1]) >= Number(archivedHiddenArtifactCounts?.[1]),
      "Hidden artifact reason mix covers hidden artifact rows",
    );
    assert(
      sumTaggedCountMix(archivedShownMarkdownReasonMix?.[1]) >= Number(archivedShownMarkdownCounts?.[1]),
      "Visible markdown reason mix covers shown markdown rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenMarkdownReasonMix?.[1]) >= Number(archivedHiddenMarkdownCounts?.[1]),
      "Hidden markdown reason mix covers hidden markdown rows",
    );
    assert(
      taggedCount(archivedHiddenMarkdownSession?.[1], "current")
        + taggedCount(archivedHiddenMarkdownSession?.[1], "archived") === Number(archivedHiddenMarkdownCounts?.[1]),
      "Hidden markdown session mix matches hidden markdown rows",
    );
    assert(
      sumTaggedCountMix(archivedShownOverallReasonMix?.[1])
        >= Number(archivedShownExactCounts?.[1])
          + Number(archivedShownArtifactCounts?.[1])
          + Number(archivedShownMarkdownCounts?.[1])
          + Number(archivedShownStructuredCounts?.[1]),
      "Visible aggregate non-palace reason mix covers shown non-palace rows",
    );
    assert(
      sumTaggedCountMix(archivedMemoryReasonMix?.[1])
        >= Number(archivedMemoryCounts?.[1]),
      "Aggregate whole-memory reason mix covers non-palace and palace totals",
    );
    assert(
      Number(archivedNonPalaceMix?.[1]) === Number(archivedExactCounts?.[1])
        && Number(archivedNonPalaceMix?.[2]) === Number(archivedArtifactCount?.[1])
        && Number(archivedNonPalaceMix?.[3]) === Number(archivedMarkdownCount?.[1])
        && Number(archivedNonPalaceMix?.[4]) === Number(archivedStructuredCounts?.[1]),
      "Aggregate non-palace layer mix matches exact, artifact, markdown, and structured totals",
    );
    assert(
      Number(archivedTruthMix?.[1]) === Number(archivedExactCounts?.[1])
        && Number(archivedTruthMix?.[2]) === Number(archivedDerivedCounts?.[1])
        && Number(archivedTruthMix?.[3])
          === Number(archivedPalaceCounts?.[1])
            + Number(archivedPalaceCounts?.[2])
            + Number(archivedPalaceCounts?.[3])
            + Number(archivedPalaceCounts?.[4]),
      "Aggregate truth mix matches exact, derived, and palace totals",
    );
    assert(
      Number(archivedMemoryMix?.[1]) === Number(archivedExactCounts?.[1])
        && Number(archivedMemoryMix?.[2]) === Number(archivedArtifactCount?.[1])
        && Number(archivedMemoryMix?.[3]) === Number(archivedMarkdownCount?.[1])
        && Number(archivedMemoryMix?.[4]) === Number(archivedStructuredCounts?.[1])
        && Number(archivedMemoryMix?.[5])
          === Number(archivedPalaceCounts?.[1])
            + Number(archivedPalaceCounts?.[2])
            + Number(archivedPalaceCounts?.[3])
            + Number(archivedPalaceCounts?.[4]),
      "Aggregate whole-memory mix matches exact, artifact, markdown, structured, and palace totals",
    );
    assert(
      Number(archivedMemoryOrigin?.[1]) + Number(archivedMemoryOrigin?.[2]) + Number(archivedMemoryOrigin?.[3])
        === Number(archivedMemoryCounts?.[1]),
      "Aggregate whole-memory origin mix matches current, archived, and palace totals",
    );
    assert(
      Number(archivedMemoryCounts?.[1])
        === Number(archivedNonPalaceCounts?.[1])
          + Number(archivedPalaceCounts?.[1])
          + Number(archivedPalaceCounts?.[2])
          + Number(archivedPalaceCounts?.[3])
          + Number(archivedPalaceCounts?.[4]),
      "Aggregate whole-memory count matches non-palace and palace totals",
    );
    assert(
      Number(archivedNonPalaceCounts?.[1])
        === Number(archivedExactCounts?.[1]) + Number(archivedArtifactCount?.[1]) + Number(archivedMarkdownCount?.[1]) + Number(archivedStructuredCounts?.[1]),
      "Aggregate non-palace count matches exact, artifact, markdown, and structured totals",
    );
    assert(
      Number(archivedShownNonPalaceMix?.[1]) === Number(archivedShownExactCounts?.[1])
        && Number(archivedShownNonPalaceMix?.[2]) === Number(archivedShownArtifactCounts?.[1])
        && Number(archivedShownNonPalaceMix?.[3]) === Number(archivedShownMarkdownCounts?.[1])
        && Number(archivedShownNonPalaceMix?.[4]) === Number(archivedShownStructuredCounts?.[1]),
      "Visible non-palace layer mix matches shown exact, artifact, markdown, and structured rows",
    );
    assert(
      Number(archivedHiddenTruthMix?.[1]) === Number(archivedExactCounts?.[1]) - Number(archivedShownExactCounts?.[1])
        && Number(archivedHiddenTruthMix?.[2]) === Number(archivedDerivedCounts?.[1]) - Number(archivedShownDerivedCounts?.[1])
        && Number(archivedHiddenTruthMix?.[3])
          === Number(archivedPalaceCounts?.[1])
            + Number(archivedPalaceCounts?.[2])
            + Number(archivedPalaceCounts?.[3])
            + Number(archivedPalaceCounts?.[4])
            - (
              Number(archivedShownPalaceCounts?.[1])
              + Number(archivedShownPalaceCounts?.[2])
              + Number(archivedShownPalaceCounts?.[3])
              + Number(archivedShownPalaceCounts?.[4])
            ),
      "Hidden truth mix matches hidden exact, derived, and palace rows",
    );
    assert(
      Number(archivedHiddenMemoryMix?.[1]) === Number(archivedHiddenExactCounts?.[1])
        && Number(archivedHiddenMemoryMix?.[2]) === Number(archivedHiddenArtifactCounts?.[1])
        && Number(archivedHiddenMemoryMix?.[3]) === Number(archivedHiddenMarkdownCounts?.[1])
        && Number(archivedHiddenMemoryMix?.[4]) === Number(archivedHiddenStructuredCounts?.[1])
        && Number(archivedHiddenMemoryMix?.[5])
          === Number(archivedHiddenPalaceCounts?.[1])
            + Number(archivedHiddenPalaceCounts?.[2])
            + Number(archivedHiddenPalaceCounts?.[3])
            + Number(archivedHiddenPalaceCounts?.[4]),
      "Hidden whole-memory layer mix matches hidden exact, artifact, markdown, structured, and palace rows",
    );
    assert(
      Number(archivedHiddenMemoryOrigin?.[1]) + Number(archivedHiddenMemoryOrigin?.[2]) + Number(archivedHiddenMemoryOrigin?.[3])
        === Number(archivedHiddenMemoryCounts?.[1]),
      "Hidden whole-memory origin mix matches hidden rows across current, archived, and palace sources",
    );
    assert(
      Number(archivedHiddenNonPalaceMix?.[1]) === Number(archivedHiddenExactCounts?.[1])
        && Number(archivedHiddenNonPalaceMix?.[2]) === Number(archivedHiddenArtifactCounts?.[1])
        && Number(archivedHiddenNonPalaceMix?.[3]) === Number(archivedHiddenMarkdownCounts?.[1])
        && Number(archivedHiddenNonPalaceMix?.[4]) === Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden non-palace layer mix matches hidden exact, artifact, markdown, and structured rows",
    );
    assert(
      (archivedHiddenSections?.[1] ?? "")
        === ([
          Number(archivedHiddenExactCounts?.[1]) > 0 ? "exact" : undefined,
          Number(archivedHiddenCompactCounts?.[1]) > 0 ? "compact" : undefined,
          Number(archivedHiddenStructuredCounts?.[1]) > 0 ? "structured" : undefined,
          Number(archivedHiddenPalaceCounts?.[1]) > 0 ? "palace-direct" : undefined,
          Number(archivedHiddenPalaceCounts?.[2]) > 0 ? "palace-nearby" : undefined,
          Number(archivedHiddenPalaceCounts?.[3]) > 0 ? "palace-broader" : undefined,
          Number(archivedHiddenPalaceCounts?.[4]) > 0 ? "palace-related" : undefined,
        ].filter(Boolean).join(">") || "none"),
      "Hidden section list matches exact, derived, and palace sections that actually overflowed",
    );
    assert(
      (archivedEmptySections?.[1] ?? "")
        === ([
          Number(archivedExactCounts?.[1]) === 0 ? "exact" : undefined,
          Number(archivedDerivedMix?.[1]) === 0 ? "compact" : undefined,
          Number(archivedDerivedMix?.[2]) === 0 ? "structured" : undefined,
          Number(archivedPalaceCounts?.[1]) === 0 ? "palace-direct" : undefined,
          Number(archivedPalaceCounts?.[2]) === 0 ? "palace-nearby" : undefined,
          Number(archivedPalaceCounts?.[3]) === 0 ? "palace-broader" : undefined,
          Number(archivedPalaceCounts?.[4]) === 0 ? "palace-related" : undefined,
        ].filter(Boolean).join(">") || "none"),
      "Empty section list matches planned exact, derived, and palace sections that had zero hits",
    );
    assert(
      ["exact", "compact", "structured", "palace-direct", "palace-nearby", "palace-broader", "palace-related"]
        .every((label) => {
          const state = taggedValue(archivedSectionState?.[1], label);
          return state === "empty" || state === "truncated" || state === "full";
        }),
      "Section-state map covers exact, derived, and palace sections with valid outcome labels",
    );
    assert(
      Number(archivedShownTruthMix?.[1]) === Number(archivedShownExactCounts?.[1])
        && Number(archivedShownTruthMix?.[2]) === Number(archivedShownDerivedCounts?.[1])
        && Number(archivedShownTruthMix?.[3])
          === Number(archivedShownPalaceCounts?.[1])
            + Number(archivedShownPalaceCounts?.[2])
            + Number(archivedShownPalaceCounts?.[3])
            + Number(archivedShownPalaceCounts?.[4]),
      "Visible truth mix matches shown exact, derived, and palace rows",
    );
    assert(
      Number(archivedShownMemoryMix?.[1]) === Number(archivedShownExactCounts?.[1])
        && Number(archivedShownMemoryMix?.[2]) === Number(archivedShownArtifactCounts?.[1])
        && Number(archivedShownMemoryMix?.[3]) === Number(archivedShownMarkdownCounts?.[1])
        && Number(archivedShownMemoryMix?.[4]) === Number(archivedShownStructuredCounts?.[1])
        && Number(archivedShownMemoryMix?.[5])
          === Number(archivedShownPalaceCounts?.[1])
            + Number(archivedShownPalaceCounts?.[2])
            + Number(archivedShownPalaceCounts?.[3])
            + Number(archivedShownPalaceCounts?.[4]),
      "Visible whole-memory mix matches shown exact, artifact, markdown, structured, and palace rows",
    );
    assert(
      Number(archivedShownMemoryOrigin?.[1]) + Number(archivedShownMemoryOrigin?.[2]) + Number(archivedShownMemoryOrigin?.[3])
        === Number(archivedShownMemoryCounts?.[1]),
      "Visible whole-memory origin mix matches shown current, archived, and palace rows",
    );
    assert(
      (archivedShownSections?.[1] ?? "").startsWith("exact")
        && (archivedShownSections?.[1] ?? "").includes("compact")
        && (archivedShownSections?.[1] ?? "").includes("structured")
        && (archivedShownSections?.[1] ?? "").indexOf("exact") < (archivedShownSections?.[1] ?? "").indexOf("compact")
        && (archivedShownSections?.[1] ?? "").indexOf("compact") < (archivedShownSections?.[1] ?? "").indexOf("structured"),
      "Shown section order matches actual exact-before-derived page order",
    );
    const emptyDir = await mkdtemp(join(tmpdir(), "colony-memory-service-empty-"));
    try {
      const emptyMemory = new ColonyMemoryService({ dataDir: emptyDir });
      const emptySession = createAgentSession({
        agentId: "empty-ant",
        caste: Caste.ASSIST_ANT,
        metadata: {
          workspaceName: "colony-ts",
          workspacePrimaryTargets: ["colony", "colony-ts"],
        },
      });
      const noDerivedContext = await emptyMemory.buildMemoryContext("zzqxjv_unmatched_31415926_memprobe", emptySession, {
        truthMode: "derived_only",
      });
      assert(noDerivedContext.includes("shown-sections:none"), "No-match derived fallback still surfaces explicit shown-section outcome");
      assert(noDerivedContext.includes("section-state:compact=empty,structured=empty"), "No-match derived fallback still surfaces one-glance section state map");
      assert(noDerivedContext.includes("empty-sections:compact>structured"), "No-match derived fallback still surfaces zero-hit derived section list");
      assert(noDerivedContext.includes("No derived recall matched this query."), "No-match derived fallback stays honest");
    const noExactContext = await emptyMemory.buildMemoryContext("zzqxjv_unmatched_31415926_memprobe", emptySession, {
      truthMode: "exact_only",
    });
    assert(noExactContext.includes("shown-sections:none"), "No-match exact fallback still surfaces explicit shown-section outcome");
    assert(noExactContext.includes("section-state:exact=empty,palace-direct=empty,palace-nearby=empty,palace-broader=empty,palace-related=empty"), "No-match exact fallback still surfaces one-glance exact and palace section state map");
    assert(noExactContext.includes("empty-sections:exact>palace-direct>palace-nearby>palace-broader>palace-related"), "No-match exact fallback still surfaces zero-hit exact and palace section list");
    assert(noExactContext.includes("palace-miss-after:strict"), "No-match exact fallback surfaces strict palace miss truth when no deeper filters were active");
    assert(noExactContext.includes("palace-nearby-none:no-room"), "No-match exact fallback surfaces why nearby palace recall never started");
    assert(noExactContext.includes("palace-broader-none:no-room"), "No-match exact fallback surfaces why broader palace recall never started");
    assert(noExactContext.includes("palace-related-none:no-wing"), "No-match exact fallback surfaces why related palace recall never started");
    assert(noExactContext.includes("No exact transcript or palace recall matched this query."), "No-match exact fallback stays honest");
      const noExactHallContext = await emptyMemory.buildMemoryContext("exact what should we do in colony", emptySession, {
        truthMode: "exact_only",
      });
      assert(noExactHallContext.includes("palace-miss-after:drop-hall"), "No-match exact fallback surfaces deepest exhausted palace ladder rung when hall-scoped recall fully misses");
    } finally {
      await removeWithRetry(emptyDir);
    }
    assert(
      Number(archivedShownMemoryCounts?.[1])
        === Number(archivedShownNonPalaceCounts?.[1])
          + Number(archivedShownPalaceCounts?.[1])
          + Number(archivedShownPalaceCounts?.[2])
          + Number(archivedShownPalaceCounts?.[3])
          + Number(archivedShownPalaceCounts?.[4]),
      "Visible whole-memory count matches shown non-palace and palace rows",
    );
    assert(
      sumTaggedCountMix(archivedShownMemoryReasonMix?.[1]) >= Number(archivedShownMemoryCounts?.[1]),
      "Visible whole-memory reason mix covers shown non-palace and palace rows",
    );
    assert(
      Number(archivedShownNonPalaceCounts?.[1])
        === Number(archivedShownExactCounts?.[1]) + Number(archivedShownArtifactCounts?.[1]) + Number(archivedShownMarkdownCounts?.[1]) + Number(archivedShownStructuredCounts?.[1]),
      "Visible non-palace count matches shown exact, artifact, markdown, and structured rows",
    );
    assert(
      Number(archivedHiddenMemoryCounts?.[1])
        === Number(archivedHiddenNonPalaceCounts?.[1])
          + Number(archivedHiddenPalaceCounts?.[1])
          + Number(archivedHiddenPalaceCounts?.[2])
          + Number(archivedHiddenPalaceCounts?.[3])
          + Number(archivedHiddenPalaceCounts?.[4]),
      "Hidden whole-memory count matches hidden non-palace and palace rows",
    );
    assert(
      Number(archivedHiddenNonPalaceCounts?.[1]) === Number(archivedNonPalaceCounts?.[1]) - Number(archivedShownNonPalaceCounts?.[1]),
      "Hidden non-palace count matches non-palace total minus shown rows",
    );
    assert(Number(archivedShownStructuredCounts?.[1]) === 4, "Structured routing note caps shown rows at visible durable section limit");
    assert(
      Number(archivedShownStructuredScope?.[1]) + Number(archivedShownStructuredScope?.[2]) === Number(archivedShownStructuredCounts?.[1]),
      "Visible structured scope mix matches shown structured row count",
    );
    assert(
      Number(archivedShownStructuredSession?.[1]) + Number(archivedShownStructuredSession?.[2]) === Number(archivedShownStructuredCounts?.[1]),
      "Visible structured session mix matches shown structured row count",
    );
    assert(
      taggedCount(archivedHiddenStructuredSession?.[1], "current")
        + taggedCount(archivedHiddenStructuredSession?.[1], "archived") === Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden structured session mix matches hidden structured rows",
    );
    assert(
      taggedCount(archivedHiddenStructuredScope?.[1], "agent")
        + taggedCount(archivedHiddenStructuredScope?.[1], "colony") === Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden structured scope mix matches hidden structured rows",
    );
    assert(
      Number(archivedShownStructuredSource?.[1]) + Number(archivedShownStructuredSource?.[2]) + Number(archivedShownStructuredSource?.[3]) === Number(archivedShownStructuredCounts?.[1]),
      "Visible structured extraction-source mix matches shown structured row count",
    );
    assert(
      taggedCount(archivedHiddenStructuredSource?.[1], "keyword")
        + taggedCount(archivedHiddenStructuredSource?.[1], "llm")
        + taggedCount(archivedHiddenStructuredSource?.[1], "unknown") === Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden structured source mix matches hidden structured rows",
    );
    assert(
      sumTaggedCountMix(archivedShownStructuredReasonMix?.[1]) >= Number(archivedShownStructuredCounts?.[1]),
      "Visible structured reason mix covers shown structured rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenStructuredReasonMix?.[1]) >= Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden structured reason mix covers hidden structured rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenStructuredCategoryMix?.[1]) >= Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden structured category mix covers hidden structured rows",
    );
    assert(
      Number(archivedShownSessionMix?.[1]) + Number(archivedShownSessionMix?.[2])
        === Number(archivedShownExactCounts?.[1])
          + Number(archivedShownArtifactCounts?.[1])
          + Number(archivedShownMarkdownCounts?.[1])
          + Number(archivedShownStructuredCounts?.[1]),
      "Visible session mix matches shown non-palace row count",
    );
    assert(
      taggedCount(archivedHiddenDerivedSessionMix?.[1], "current")
        + taggedCount(archivedHiddenDerivedSessionMix?.[1], "archived") === Number(archivedHiddenCompactCounts?.[1]) + Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden derived session mix matches hidden compact and structured rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenDerivedReasonMix?.[1]) >= Number(archivedHiddenCompactCounts?.[1]) + Number(archivedHiddenStructuredCounts?.[1]),
      "Hidden derived reason mix covers hidden compact and structured rows",
    );
    assert(
      taggedCount(archivedHiddenSessionMix?.[1], "current")
        + taggedCount(archivedHiddenSessionMix?.[1], "archived") === Number(archivedHiddenNonPalaceCounts?.[1]),
      "Hidden session mix matches hidden non-palace rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenOverallReasonMix?.[1]) >= Number(archivedHiddenNonPalaceCounts?.[1]),
      "Hidden aggregate non-palace reason mix covers hidden non-palace rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenMemoryReasonMix?.[1]) >= Number(archivedHiddenMemoryCounts?.[1]),
      "Hidden whole-memory reason mix covers hidden rows",
    );
    assert(
      sumTaggedCountMix(archivedShownPalaceHallMix?.[1])
        === Number(archivedShownPalaceCounts?.[1])
          + Number(archivedShownPalaceCounts?.[2])
          + Number(archivedShownPalaceCounts?.[3])
          + Number(archivedShownPalaceCounts?.[4]),
      "Visible palace hall mix matches shown palace row count",
    );
    assert(
      sumTaggedCountMix(archivedHiddenPalaceHallMix?.[1])
        === Number(archivedHiddenPalaceCounts?.[1])
          + Number(archivedHiddenPalaceCounts?.[2])
          + Number(archivedHiddenPalaceCounts?.[3])
          + Number(archivedHiddenPalaceCounts?.[4]),
      "Hidden palace hall mix matches hidden palace row count",
    );
    assert(
      sumTaggedCountMix(archivedShownPalaceRoomMix?.[1])
        === Number(archivedShownPalaceCounts?.[1])
          + Number(archivedShownPalaceCounts?.[2])
          + Number(archivedShownPalaceCounts?.[3])
          + Number(archivedShownPalaceCounts?.[4]),
      "Visible palace room mix matches shown palace row count",
    );
    assert(
      sumTaggedCountMix(archivedHiddenPalaceRoomMix?.[1])
        === Number(archivedHiddenPalaceCounts?.[1])
          + Number(archivedHiddenPalaceCounts?.[2])
          + Number(archivedHiddenPalaceCounts?.[3])
          + Number(archivedHiddenPalaceCounts?.[4]),
      "Hidden palace room mix matches hidden palace row count",
    );
    assert(
      sumTaggedCountMix(archivedShownPalaceWingMix?.[1])
        === Number(archivedShownPalaceCounts?.[1])
          + Number(archivedShownPalaceCounts?.[2])
          + Number(archivedShownPalaceCounts?.[3])
          + Number(archivedShownPalaceCounts?.[4]),
      "Visible palace wing mix matches shown palace row count",
    );
    assert(
      sumTaggedCountMix(archivedHiddenPalaceWingMix?.[1])
        === Number(archivedHiddenPalaceCounts?.[1])
          + Number(archivedHiddenPalaceCounts?.[2])
          + Number(archivedHiddenPalaceCounts?.[3])
          + Number(archivedHiddenPalaceCounts?.[4]),
      "Hidden palace wing mix matches hidden palace row count",
    );
    assert(
      sumTaggedCountMix(archivedShownPalaceSourceMix?.[1])
        === Number(archivedShownPalaceCounts?.[1])
          + Number(archivedShownPalaceCounts?.[2])
          + Number(archivedShownPalaceCounts?.[3])
          + Number(archivedShownPalaceCounts?.[4]),
      "Visible palace source-file mix matches shown palace row count",
    );
    assert(
      sumTaggedCountMix(archivedHiddenPalaceSourceMix?.[1])
        === Number(archivedHiddenPalaceCounts?.[1])
          + Number(archivedHiddenPalaceCounts?.[2])
          + Number(archivedHiddenPalaceCounts?.[3])
          + Number(archivedHiddenPalaceCounts?.[4]),
      "Hidden palace source-file mix matches hidden palace row count",
    );
    assert(
      sumTaggedCountMix(archivedShownPalaceReasonMix?.[1])
        >= Number(archivedShownPalaceCounts?.[1]),
      "Visible palace reason mix covers shown palace rows",
    );
    assert(
      sumTaggedCountMix(archivedHiddenPalaceReasonMix?.[1])
        >= Number(archivedHiddenPalaceCounts?.[1]),
      "Hidden palace reason mix covers hidden palace rows",
    );
    assert(Number(archivedHiddenStructuredCounts?.[1]) === Number(archivedStructuredCounts?.[1]) - Number(archivedShownStructuredCounts?.[1]), "Structured hidden-count tag matches structured total minus shown rows");
    assert(archivedRoutingContext.includes("more durable memory matches hidden."), "Structured durable section surfaces hidden-row note when generic durable recall is truncated");

    const oldestRoutingContext = await memory.buildMemoryContext("what happened earliest in compaction history", session);
    assert(oldestRoutingContext.includes("time:oldest"), "Memory routing note surfaces oldest-time preference");
    assert(oldestRoutingContext.includes("time-via:earliest"), "Memory routing note surfaces time-preference source");

    const whyContext = await memory.buildMemoryContext("why did we decide to keep compaction transcript separate", session);
    assert(whyContext.includes("Memory routing note: truth:prefer_derived"), "Memory context surfaces routing note with truth mode provenance");
    assert(whyContext.includes("sections:derived>exact"), "Memory context routing note surfaces section-priority provenance");
    assert(whyContext.includes("derived:structured>compact"), "Memory context routing note surfaces derived-order provenance");
    assert(whyContext.includes("derived-via:decision+reasoning"), "Memory routing note surfaces derived-order source for why query");
    assert(whyContext.includes("intent:decision+reasoning"), "Memory routing note surfaces why-query intent tags");
    assert(whyContext.includes("role:assistant"), "Memory context routing note surfaces transcript role preference provenance");
    assert(whyContext.includes("role-via:reasoning"), "Memory context routing note surfaces transcript role-preference source");
    assert(
      whyContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):")
        < whyContext.indexOf("Verbatim recall (exact transcript excerpts):"),
      "Why-style auto mode prefers derived reasoning before exact transcript sections",
    );

    const whyDerivedContext = await memory.buildMemoryContext("why did we decide to keep compaction transcript exact", session, {
      truthMode: "derived_only",
    });
    assert(
      whyDerivedContext.indexOf("Reusable reasoning (derived, scoped, durable):")
        < whyDerivedContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):"),
      "Why-style derived context ranks durable facts before compact summaries",
    );
    assert(whyDerivedContext.includes("Reusable reasoning (derived, scoped, durable): showing "), "Structured durable header surfaces shown-vs-total truth");
    assert(whyDerivedContext.includes("structured-focus:reasoning"), "Memory routing note surfaces reasoning-focused structured target");
    assert(whyDerivedContext.includes("structured-focus-via:reasoning"), "Memory routing note surfaces reasoning-focused structured source");

    const adviceDerivedContext = await memory.buildMemoryContext("what should we do about compaction safety", session, {
      truthMode: "derived_only",
    });
    assert(
      adviceDerivedContext.indexOf("Reusable advice (derived, scoped, durable):")
        < adviceDerivedContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):"),
      "Advice-style derived context ranks durable facts before compact summaries",
    );
    assert(adviceDerivedContext.includes("structured-focus:advice"), "Memory routing note surfaces advice-focused structured target");
    assert(adviceDerivedContext.includes("structured-focus-via:advice"), "Memory routing note surfaces advice-focused structured source");

    const preferenceDerivedContext = await memory.buildMemoryContext("what do we prefer for compaction output", session, {
      truthMode: "derived_only",
    });
    assert(preferenceDerivedContext.includes("Reusable preferences (derived, scoped, durable):"), "Preference-style derived context uses preference-aware structured header");

    const constraintDerivedContext = await memory.buildMemoryContext("what rule must we keep for compaction truth", session, {
      truthMode: "derived_only",
    });
    assert(constraintDerivedContext.includes("Reusable constraints (derived, scoped, durable):"), "Constraint-style derived context uses constraint-aware structured header");

    const riskDerivedContext = await memory.buildMemoryContext("what should we avoid with compaction truth", session, {
      truthMode: "derived_only",
    });
    assert(riskDerivedContext.includes("Reusable cautions (derived, scoped, durable):"), "Risk-style derived context uses caution-aware structured header");
    assert(riskDerivedContext.includes("structured-focus:risk"), "Memory routing note surfaces risk-focused structured target");
    assert(riskDerivedContext.includes("structured-focus-via:risk"), "Memory routing note surfaces risk-focused structured source");

    const factDerivedContext = await memory.buildMemoryContext("what runtime fact should we remember about compaction", session, {
      truthMode: "derived_only",
    });
    assert(factDerivedContext.includes("Reusable facts (derived, scoped, durable):"), "Fact-style derived context keeps fact-aware structured header");
    assert(factDerivedContext.includes("structured-focus:fact"), "Memory routing note surfaces fact-focused structured target");
    assert(factDerivedContext.includes("structured-focus-via:fact"), "Memory routing note surfaces fact-focused structured source");

    const entityDerivedContext = await memory.buildMemoryContext("which provider handled compaction fallback", session, {
      truthMode: "derived_only",
    });
    assert(entityDerivedContext.includes("Reusable entities (derived, scoped, durable):"), "Entity-style derived context uses entity-aware structured header");
    assert(entityDerivedContext.includes("structured-focus:entity"), "Memory routing note surfaces entity-focused structured target");
    assert(entityDerivedContext.includes("structured-focus-via:entity"), "Memory routing note surfaces entity-focused structured source");
    assert(entityDerivedContext.includes("intent:entity"), "Memory routing note surfaces entity intent tag");

    const metricDerivedContext = await memory.buildMemoryContext("what latency budget should we remember for compaction", session, {
      truthMode: "derived_only",
    });
    assert(metricDerivedContext.includes("Reusable metrics (derived, scoped, durable):"), "Metric-style derived context uses metric-aware structured header");
    assert(metricDerivedContext.includes("structured-focus:metric"), "Memory routing note surfaces metric-focused structured target");
    assert(metricDerivedContext.includes("structured-focus-via:metric"), "Memory routing note surfaces metric-focused structured source");
    assert(metricDerivedContext.includes("intent:metric"), "Memory routing note surfaces metric intent tag");

    const procedureDerivedContext = await memory.buildMemoryContext("what playbook steps should we follow for compaction review", session, {
      truthMode: "derived_only",
    });
    assert(procedureDerivedContext.includes("Reusable procedures (derived, scoped, durable):"), "Procedure-style derived context uses procedure-aware structured header");
    assert(procedureDerivedContext.includes("structured-focus:procedure"), "Memory routing note surfaces procedure-focused structured target");
    assert(procedureDerivedContext.includes("structured-focus-via:procedure"), "Memory routing note surfaces procedure-focused structured source");
    assert(procedureDerivedContext.includes("intent:advice+procedure"), "Memory routing note surfaces procedure intent tag without losing advice wording");

    const diagnosticDerivedContext = await memory.buildMemoryContext("what error caused compaction shell_exec failure", session, {
      truthMode: "derived_only",
    });
    assert(diagnosticDerivedContext.includes("Reusable diagnostics (derived, scoped, durable):"), "Diagnostic-style derived context uses diagnostic-aware structured header");
    assert(diagnosticDerivedContext.includes("structured-focus:diagnostic"), "Memory routing note surfaces diagnostic-focused structured target");
    assert(diagnosticDerivedContext.includes("structured-focus-via:diagnostic"), "Memory routing note surfaces diagnostic-focused structured source");
    assert(diagnosticDerivedContext.includes("intent:diagnostic"), "Memory routing note surfaces diagnostic intent tag");

    const discoveryDerivedContext = await memory.buildMemoryContext("what did we learn about compaction safety", session, {
      truthMode: "derived_only",
    });
    assert(discoveryDerivedContext.includes("Reusable discoveries (derived, scoped, durable):"), "Discovery-style derived context uses discovery-aware structured header");
    assert(discoveryDerivedContext.includes("structured-focus:discovery"), "Memory routing note surfaces discovery-focused structured target");
    assert(discoveryDerivedContext.includes("structured-focus-via:discovery"), "Memory routing note surfaces discovery-focused structured source");
    assert(!discoveryDerivedContext.includes("Supporting durable facts (derived, scoped, durable):"), "Discovery-style derived context no longer collapses support into flat durable-facts header");
    assert(discoveryDerivedContext.includes("Supporting "), "Discovery-style derived context keeps grouped supporting durable sections");

    const eventDerivedContext = await memory.buildMemoryContext("what happened during compaction startup", session, {
      truthMode: "derived_only",
    });
    assert(eventDerivedContext.includes("Structured timeline memory (derived, scoped, durable):"), "Event-style derived context uses timeline-aware structured header");
    assert(eventDerivedContext.includes("intent:event"), "Memory routing note surfaces event intent tag");
    assert(eventDerivedContext.includes("compact-focus:timeline"), "Memory routing note surfaces timeline-focused compact target");
    assert(eventDerivedContext.includes("compact-focus-via:event"), "Memory routing note surfaces timeline-focused compact source");
    assert(eventDerivedContext.includes("structured-focus:event"), "Memory routing note surfaces event-focused structured target");
    assert(eventDerivedContext.includes("structured-focus-via:event"), "Memory routing note surfaces event-focused structured source");
    assert(!eventDerivedContext.includes("Supporting durable facts (derived, scoped, durable):"), "Event-style derived context no longer collapses support into flat durable-facts header");
    assert(eventDerivedContext.includes("Supporting "), "Event-style derived context keeps grouped supporting durable sections");

    const changeDerivedContext = await memory.buildMemoryContext("what changed about compaction startup", session, {
      truthMode: "derived_only",
    });
    assert(changeDerivedContext.includes("Reusable deltas (derived, scoped, durable):"), "Comparison-style derived context uses delta-aware structured header");
    assert(changeDerivedContext.includes("structured-focus:change"), "Memory routing note surfaces change-focused structured target");
    assert(changeDerivedContext.includes("compact-focus-via:comparison"), "Memory routing note surfaces delta-focused compact source");
    assert(changeDerivedContext.includes("structured-focus-via:comparison"), "Memory routing note surfaces change-focused structured source");
  } finally {
    await removeWithRetry(dir);
  }
}

async function verifyStructuredExtractedMemoryRanking(): Promise<void> {
  section("3. Structured Durable Memory Ranking");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-structured-"));
  const store = new ExtractedMemoryStore(join(dir, "memory-extracts"));

  try {
    await store.save("sess_old", "assist_ant", [{
      content: "TTY fallback under WSL needs gpt-4o shell_exec guard.",
      scope: "agent",
      agentId: "assist-ant",
      category: "fact",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "oldtech",
      timestamp: 100,
    }]);
    await store.save("sess_new", "assist_ant", [{
      content: "TTY fallback under WSL needs gpt-4o shell_exec guard.",
      scope: "agent",
      agentId: "assist-ant",
      category: "fact",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "newtech",
      timestamp: 200,
    }]);
    await store.save("sess_phrase", "assist_ant", [{
      content: "Keep this exact phrase for rollout: ship it exactly as written.",
      scope: "agent",
      agentId: "assist-ant",
      category: "decision",
      confidence: 0.7,
      sourceTurn: 1,
      contentHash: "phrase",
      timestamp: 150,
    }]);
    await store.save("sess_noise", "assist_ant", [{
      content: "Lunch celebration checklist and catering notes.",
      scope: "agent",
      agentId: "assist-ant",
      category: "fact",
      confidence: 1,
      sourceTurn: 1,
      contentHash: "noise",
      timestamp: 250,
    }]);
    await store.save("sess_decide", "assist_ant", [{
      content: "Rollout decision: keep approvals conservative by default.",
      scope: "agent",
      agentId: "assist-ant",
      category: "decision",
      confidence: 0.92,
      sourceTurn: 1,
      contentHash: "decide",
      timestamp: 210,
    }]);
    await store.save("sess_advice", "assist_ant", [{
      content: "Rollout advice: keep approvals conservative by default and review exceptions case by case.",
      scope: "agent",
      agentId: "assist-ant",
      category: "advice",
      confidence: 0.93,
      sourceTurn: 1,
      contentHash: "advice_struct",
      timestamp: 215,
    }]);
    await store.save("sess_reasoning", "assist_ant", [{
      content: "Rollout reasoning: we kept approvals conservative because dangerous tools need stronger guardrails by default.",
      scope: "agent",
      agentId: "assist-ant",
      category: "reasoning",
      confidence: 0.94,
      sourceTurn: 1,
      contentHash: "reasoning_struct",
      timestamp: 216,
    }]);
    await store.save("sess_entity", "assist_ant", [{
      content: "Entity: fallback provider was gpt-4o, env var was OPENAI_API_KEY, endpoint stayed https://api.openai.com/v1, and log path stayed /tmp/colony.log during rollout checks.",
      scope: "agent",
      agentId: "assist-ant",
      category: "entity",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "entity_struct",
      timestamp: 217,
    }]);
    await store.save("sess_entity_infra", "assist_ant", [{
      content: "Entity: rollout cluster was prod-east, deployment was colony-api, image was colony/api:1.2.3, and container was api-main.",
      scope: "agent",
      agentId: "assist-ant",
      category: "entity",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "entity_infra_struct",
      timestamp: 217.1,
    }]);
    await store.save("sess_entity_ops", "assist_ant", [{
      content: "Entity: rollout branch was feat/memory-palace, commit was abc1234, pull request was #42, ticket was COL-321, bug was BUG-77, exit code was 137, errno was EPERM, and Bun version was 1.2.4.",
      scope: "agent",
      agentId: "assist-ant",
      category: "entity",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "entity_ops_struct",
      timestamp: 217.15,
    }]);
    await store.save("sess_metric", "assist_ant", [{
      content: "Metric: rollout latency budget stayed 120ms and token budget stayed 8k during fallback checks.",
      scope: "agent",
      agentId: "assist-ant",
      category: "metric",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "metric_struct",
      timestamp: 217.25,
    }]);
    await store.save("sess_procedure", "assist_ant", [{
      content: "Procedure: rollout review runbook is first run the doctor, then inspect fallback logs, then rerun the guarded command.",
      scope: "agent",
      agentId: "assist-ant",
      category: "procedure",
      confidence: 0.95,
      sourceTurn: 1,
      contentHash: "procedure_struct",
      timestamp: 217.5,
    }]);
    await store.save("sess_diagnostic", "assist_ant", [{
      content: "Diagnostic: shell_exec failure came from a missing allowlist entry rather than provider outage during rollout checks.",
      scope: "agent",
      agentId: "assist-ant",
      category: "diagnostic",
      confidence: 0.96,
      sourceTurn: 1,
      contentHash: "diagnostic_struct",
      timestamp: 218,
    }]);
      await store.save("sess_prefer", "assist_ant", [{
        content: "Rollout preference: show compact summary before deep logs.",
        scope: "agent",
        agentId: "assist-ant",
        category: "preference",
        confidence: 0.92,
        sourceTurn: 1,
        contentHash: "prefer",
        timestamp: 220,
      }]);
      await store.save("sess_risk", "assist_ant", [{
        content: "Risk: avoid broad shell_exec grants because they are unsafe.",
        scope: "agent",
        agentId: "assist-ant",
        category: "risk",
        confidence: 0.94,
        sourceTurn: 1,
        contentHash: "risk",
        timestamp: 230,
      }]);
      await store.save("sess_change", "assist_ant", [{
        content: "Change: provider routing moved from local-only behavior to mixed-provider defaults.",
        scope: "agent",
        agentId: "assist-ant",
        category: "change",
        confidence: 0.95,
        sourceTurn: 1,
        contentHash: "change",
        timestamp: 240,
      }]);
      await store.save("sess_discovery_struct", "assist_ant", [{
        content: "Discovery: mixed-provider fallback taught us to probe terminal health before model health.",
        scope: "agent",
        agentId: "assist-ant",
        category: "discovery",
        confidence: 0.96,
        sourceTurn: 1,
        contentHash: "discovery_struct",
        timestamp: 245,
      }]);
      await store.save("sess_event_struct", "assist_ant", [{
        content: "Incident timeline: provider probe failed first, then terminal fallback recovered the session.",
        scope: "agent",
        agentId: "assist-ant",
        category: "event",
        confidence: 0.95,
        sourceTurn: 1,
        contentHash: "event_struct",
        timestamp: 246,
      }]);

    const technical = await store.surfaceRelevant({
      query: "tty wsl gpt-4o shell_exec",
      agentId: "assist-ant",
      caste: "assist_ant",
      sessionId: "sess_new",
      limit: 3,
    });
    assertEqual(technical[0]?.sessionId, "sess_new", "Structured memory ranking matches technical identifiers and prefers current session tie");

    const quoted = await store.surfaceRelevant({
      query: 'quote "ship it exactly as written"',
      agentId: "assist-ant",
      caste: "assist_ant",
      sessionId: "sess_new",
      limit: 3,
    });
    assertEqual(quoted[0]?.sessionId, "sess_phrase", "Structured memory ranking rewards literal phrase match");

    const archived = await store.surfaceRelevant({
      query: "previous session tty fallback",
      agentId: "assist-ant",
      caste: "assist_ant",
      sessionId: "sess_new",
      limit: 3,
    });
    assertEqual(archived[0]?.sessionId, "sess_old", "Structured memory ranking respects archived session scope");

    const earliest = await store.surfaceRelevant({
      query: "earliest tty fallback",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(earliest[0]?.sessionId, "sess_old", "Structured memory ranking respects earliest time preference");

    const latest = await store.surfaceRelevant({
      query: "latest tty fallback",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(latest[0]?.sessionId, "sess_new", "Structured memory ranking respects latest time preference");

    const decide = await store.surfaceRelevant({
      query: "what did we decide about rollout",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(decide[0]?.sessionId, "sess_decide", "Structured memory ranking maps decide wording to decision category");
    assert(decide[0]?.matchReasons?.includes("category-decision") === true, "Structured memory ranking preserves category-match reasons");

    const prefer = await store.surfaceRelevant({
      query: "what do we prefer for rollout",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(prefer[0]?.sessionId, "sess_prefer", "Structured memory ranking maps prefer wording to preference category");

    const rationale = await store.surfaceRelevant({
      query: "why did we choose conservative approvals for rollout",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(rationale[0]?.sessionId, "sess_reasoning", "Structured memory ranking maps why/rationale wording to reasoning memory");
    assert(rationale[0]?.matchReasons?.includes("category-reasoning") === true, "Structured memory ranking preserves reasoning-category match reasons");

    const entity = await store.surfaceRelevant({
      query: "which provider handled rollout fallback",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(entity[0]?.sessionId, "sess_entity", "Structured memory ranking maps provider/file-style wording to entity memory");
    assert(entity[0]?.matchReasons?.includes("category-entity") === true, "Structured memory ranking preserves entity-category match reasons");
    const entityEnv = await store.surfaceRelevant({
      query: "which env var enabled fallback",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(entityEnv[0]?.sessionId, "sess_entity", "Structured memory ranking maps env-var wording to entity memory");
    const entityInfra = await store.surfaceRelevant({
      query: "which cluster handled rollout",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(entityInfra[0]?.sessionId, "sess_entity_infra", "Structured memory ranking maps infra entity wording to entity memory");
    assert(entityInfra[0]?.matchReasons?.includes("category-entity") === true, "Structured memory ranking preserves entity-category reason for infra entity wording");
    const entityOps = await store.surfaceRelevant({
      query: "which branch shipped rollout",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(entityOps[0]?.sessionId, "sess_entity_ops", "Structured memory ranking maps git/version/error entity wording to entity memory");
    assert(entityOps[0]?.matchReasons?.includes("category-entity") === true, "Structured memory ranking preserves entity-category reason for git/version/error entity wording");
    const entityBug = await store.surfaceRelevant({
      query: "which bug blocked rollout",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(entityBug[0]?.sessionId, "sess_entity_ops", "Structured memory ranking maps bug-style work-item wording to entity memory");
    assert(entityBug[0]?.matchReasons?.includes("category-entity") === true, "Structured memory ranking preserves entity-category reason for bug-style work-item wording");

    const metric = await store.surfaceRelevant({
      query: "what latency budget did rollout use",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(metric[0]?.sessionId, "sess_metric", "Structured memory ranking maps budget/perf wording to metric memory");
    assert(metric[0]?.matchReasons?.includes("category-metric") === true, "Structured memory ranking preserves metric-category match reasons");

    const procedure = await store.surfaceRelevant({
      query: "what playbook steps should we follow for rollout review",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(procedure[0]?.sessionId, "sess_procedure", "Structured memory ranking maps runbook/playbook wording to procedure memory");
    assert(procedure[0]?.matchReasons?.includes("category-procedure") === true, "Structured memory ranking preserves procedure-category match reasons");

    const diagnostic = await store.surfaceRelevant({
      query: "what error caused shell_exec failure",
      agentId: "assist-ant",
      caste: "assist_ant",
      limit: 3,
    });
    assertEqual(diagnostic[0]?.sessionId, "sess_diagnostic", "Structured memory ranking maps failure/root-cause wording to diagnostic memory");
    assert(diagnostic[0]?.matchReasons?.includes("category-diagnostic") === true, "Structured memory ranking preserves diagnostic-category match reasons");

      const advice = await store.surfaceRelevant({
        query: "what should we do about approvals",
        agentId: "assist-ant",
        caste: "assist_ant",
        limit: 3,
      });
      assertEqual(advice[0]?.sessionId, "sess_advice", "Structured memory ranking maps advice wording to advice memory");

      const risk = await store.surfaceRelevant({
        query: "what should we avoid with shell_exec approvals",
        agentId: "assist-ant",
        caste: "assist_ant",
        limit: 3,
      });
      assertEqual(risk[0]?.sessionId, "sess_risk", "Structured memory ranking maps risk wording to risk memory");

      const comparison = await store.surfaceRelevant({
        query: "what changed about provider routing",
        agentId: "assist-ant",
        caste: "assist_ant",
        limit: 3,
      });
      assertEqual(comparison[0]?.sessionId, "sess_change", "Structured memory ranking maps comparison wording to change memory");

      const discovery = await store.surfaceRelevant({
        query: "what did we learn about provider routing",
        agentId: "assist-ant",
        caste: "assist_ant",
        limit: 3,
      });
      assertEqual(discovery[0]?.sessionId, "sess_discovery_struct", "Structured memory ranking maps learn wording to discovery memory");

      const event = await store.surfaceRelevant({
        query: "what happened during the debug session",
        agentId: "assist-ant",
        caste: "assist_ant",
        limit: 3,
      });
      assertEqual(event[0]?.sessionId, "sess_event_struct", "Structured memory ranking maps history wording to event memory");

      const heuristicExtractor = new MemoryExtractor();
      const heuristicExtracted = await heuristicExtractor.extract([
        { role: "assistant", content: "Remember this runtime fact: exact transcript truth stays separate from derived compaction artifacts." },
        { role: "assistant", content: "Fallback provider was gpt-4o, env var was OPENAI_API_KEY, endpoint stayed https://api.openai.com/v1, tool was shell_exec, port stayed 11434, log path stayed /tmp/colony.log, and command `bun run verify:all` stayed green." },
      ], "assist-ant");
      assertEqual(
        heuristicExtracted.find((entry) => entry.category === "fact")?.content,
        "exact transcript truth stays separate from derived compaction artifacts",
        "Structured keyword extractor trims explicit fact prefix into reusable fact memory",
      );
      assert(heuristicExtracted.some((entry) => entry.content.includes("provider gpt-4o")), "Structured keyword extractor splits provider entities from coarse sentence recall");
      assert(heuristicExtracted.some((entry) => entry.content.includes("env var OPENAI_API_KEY")), "Structured keyword extractor splits env-var entities from coarse sentence recall");
      assert(heuristicExtracted.some((entry) => entry.content.includes("endpoint https://api.openai.com/v1")), "Structured keyword extractor splits endpoint entities from coarse sentence recall");
      assert(heuristicExtracted.some((entry) => entry.content.includes("tool shell_exec")), "Structured keyword extractor splits tool entities from coarse sentence recall");
      assert(heuristicExtracted.some((entry) => entry.content.includes("port 11434")), "Structured keyword extractor splits port entities from coarse sentence recall");
      assert(heuristicExtracted.some((entry) => entry.content.includes("path /tmp/colony.log")), "Structured keyword extractor splits path entities from coarse sentence recall");
      assert(heuristicExtracted.some((entry) => entry.content.includes("command bun run verify:all")), "Structured keyword extractor splits command entities from coarse sentence recall");
      assertEqual(
        heuristicExtracted.filter((entry) => entry.category === "entity" && entry.sourceTurn === 1).length >= 6,
        true,
        "Structured keyword extractor preserves source-turn provenance across split entity memories",
      );
      assert(heuristicExtracted.every((entry) => entry.source === "keyword"), "Structured keyword extractor preserves extraction-source provenance");

      const heuristicLabeledEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Model was gpt-4o, file was src/runtime/prompt-builder.ts, flag was --allow-net, module was prompt-builder, function was buildMemoryContext, class was ColonyMemoryService, repo was colony-ts, and project was The Colony.",
        },
      ], "assist-ant");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("model gpt-4o")), "Structured keyword extractor splits labeled model entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("file src/runtime/prompt-builder.ts")), "Structured keyword extractor splits labeled file entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("flag --allow-net")), "Structured keyword extractor splits labeled flag entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("module prompt-builder")), "Structured keyword extractor splits labeled module entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("function buildMemoryContext")), "Structured keyword extractor splits labeled function entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("class ColonyMemoryService")), "Structured keyword extractor splits labeled class entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("repo colony-ts")), "Structured keyword extractor splits labeled repo entities");
      assert(heuristicLabeledEntities.some((entry) => entry.content.includes("project The Colony")), "Structured keyword extractor splits labeled project entities");

      const heuristicPackageEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Package was @types/node and library was zod.",
        },
      ], "assist-ant");
      assert(heuristicPackageEntities.some((entry) => entry.content.includes("package @types/node")), "Structured keyword extractor splits labeled package entities");
      assert(heuristicPackageEntities.some((entry) => entry.content.includes("package zod")), "Structured keyword extractor splits labeled library entities");

      const heuristicInfraEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Service was colony-api, database was colony_prod, and queue was job-retries.",
        },
      ], "assist-ant");
      assert(heuristicInfraEntities.some((entry) => entry.content.includes("service colony-api")), "Structured keyword extractor splits labeled service entities");
      assert(heuristicInfraEntities.some((entry) => entry.content.includes("database colony_prod")), "Structured keyword extractor splits labeled database entities");
      assert(heuristicInfraEntities.some((entry) => entry.content.includes("queue job-retries")), "Structured keyword extractor splits labeled queue entities");

      const heuristicStorageEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Bucket was colony-artifacts, table was session_events, and topic was rollout-updates.",
        },
      ], "assist-ant");
      assert(heuristicStorageEntities.some((entry) => entry.content.includes("bucket colony-artifacts")), "Structured keyword extractor splits labeled bucket entities");
      assert(heuristicStorageEntities.some((entry) => entry.content.includes("table session_events")), "Structured keyword extractor splits labeled table entities");
      assert(heuristicStorageEntities.some((entry) => entry.content.includes("topic rollout-updates")), "Structured keyword extractor splits labeled topic entities");

      const heuristicLocationEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Host was api-1.internal, domain was colony.local, and region was us-central1.",
        },
      ], "assist-ant");
      assert(heuristicLocationEntities.some((entry) => entry.content.includes("host api-1.internal")), "Structured keyword extractor splits labeled host entities");
      assert(heuristicLocationEntities.some((entry) => entry.content.includes("domain colony.local")), "Structured keyword extractor splits labeled domain entities");
      assert(heuristicLocationEntities.some((entry) => entry.content.includes("region us-central1")), "Structured keyword extractor splits labeled region entities");

      const heuristicTopologyEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Cluster was prod-east, namespace was colony-runtime, and schema was audit_v2.",
        },
      ], "assist-ant");
      assert(heuristicTopologyEntities.some((entry) => entry.content.includes("cluster prod-east")), "Structured keyword extractor splits labeled cluster entities");
      assert(heuristicTopologyEntities.some((entry) => entry.content.includes("namespace colony-runtime")), "Structured keyword extractor splits labeled namespace entities");
      assert(heuristicTopologyEntities.some((entry) => entry.content.includes("schema audit_v2")), "Structured keyword extractor splits labeled schema entities");

      const heuristicDeployEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Pod was api-7f9d, deployment was colony-api, and image was colony/api:1.2.3.",
        },
      ], "assist-ant");
      assert(heuristicDeployEntities.some((entry) => entry.content.includes("pod api-7f9d")), "Structured keyword extractor splits labeled pod entities");
      assert(heuristicDeployEntities.some((entry) => entry.content.includes("deployment colony-api")), "Structured keyword extractor splits labeled deployment entities");
      assert(heuristicDeployEntities.some((entry) => entry.content.includes("image colony/api:1.2.3")), "Structured keyword extractor splits labeled image entities");

      const heuristicRuntimeEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Container was api-main, job was nightly-backup, and volume was cache-data.",
        },
      ], "assist-ant");
      assert(heuristicRuntimeEntities.some((entry) => entry.content.includes("container api-main")), "Structured keyword extractor splits labeled container entities");
      assert(heuristicRuntimeEntities.some((entry) => entry.content.includes("job nightly-backup")), "Structured keyword extractor splits labeled job entities");
      assert(heuristicRuntimeEntities.some((entry) => entry.content.includes("volume cache-data")), "Structured keyword extractor splits labeled volume entities");

      const heuristicVersionEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Bun version was 1.2.4, Node version stayed 22.10.0, Python 3.12.7 stayed installed, and TypeScript 5.7.3 stayed pinned.",
        },
      ], "assist-ant");
      assert(heuristicVersionEntities.some((entry) => entry.content.includes("version bun 1.2.4")), "Structured keyword extractor splits Bun runtime version entities");
      assert(heuristicVersionEntities.some((entry) => entry.content.includes("version node 22.10.0")), "Structured keyword extractor splits Node runtime version entities");
      assert(heuristicVersionEntities.some((entry) => entry.content.includes("version python 3.12.7")), "Structured keyword extractor splits Python runtime version entities");
      assert(heuristicVersionEntities.some((entry) => entry.content.includes("version typescript 5.7.3")), "Structured keyword extractor splits TypeScript runtime version entities");

      const heuristicGitEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Branch was feature/memory-hardening, commit was a1b2c3d4, PR was #321, and issue was #654.",
        },
      ], "assist-ant");
      assert(heuristicGitEntities.some((entry) => entry.content.includes("branch feature/memory-hardening")), "Structured keyword extractor splits branch entities");
      assert(heuristicGitEntities.some((entry) => entry.content.includes("commit a1b2c3d4")), "Structured keyword extractor splits commit entities");
      assert(heuristicGitEntities.some((entry) => entry.content.includes("pr #321")), "Structured keyword extractor splits PR entities");
      assert(heuristicGitEntities.some((entry) => entry.content.includes("issue #654")), "Structured keyword extractor splits issue entities");

      const heuristicTicketEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Ticket was COL-321, issue was OPS-77, and bug was BUG-77 during rollout recovery.",
        },
      ], "assist-ant");
      assert(heuristicTicketEntities.some((entry) => entry.content.includes("ticket COL-321")), "Structured keyword extractor keeps labeled ticket IDs with project-key form");
      assert(heuristicTicketEntities.some((entry) => entry.content.includes("issue OPS-77")), "Structured keyword extractor keeps labeled issue IDs with project-key form");
      assert(heuristicTicketEntities.some((entry) => entry.content.includes("bug BUG-77")), "Structured keyword extractor keeps labeled bug IDs with project-key form");

      const heuristicImplicitGitEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "We shipped rollout on feat/memory-palace at commit abc1234 under pull request #42, and Bun 1.2.4 returned exit code 137 with EPERM.",
        },
      ], "assist-ant");
      assert(heuristicImplicitGitEntities.some((entry) => entry.content.includes("branch feat/memory-palace")), "Structured keyword extractor keeps implicit shipped-on branch names as branch entities");
      assert(!heuristicImplicitGitEntities.some((entry) => entry.content.includes("path feat/memory-palace")), "Structured keyword extractor avoids misfiling implicit branch names as generic paths");

      const heuristicStatusEntities = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Exit code was 137, HTTP status stayed 429, and errno was EPERM during the guarded fallback run.",
        },
      ], "assist-ant");
      assert(heuristicStatusEntities.some((entry) => entry.content.includes("status exit 137")), "Structured keyword extractor splits exit-code entities");
      assert(heuristicStatusEntities.some((entry) => entry.content.includes("status http 429")), "Structured keyword extractor splits HTTP-status entities");
      assert(heuristicStatusEntities.some((entry) => entry.content.includes("status error EPERM")), "Structured keyword extractor splits errno entities");

      const heuristicMetricShards = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: "Latency budget stayed 120ms, timeout was 30s, retry window stayed 5m, token budget stayed 8k, memory limit stayed 512MB, and cost budget stayed $25.",
        },
      ], "assist-ant");
      assert(heuristicMetricShards.some((entry) => entry.category === "metric" && entry.content.includes("latency 120ms")), "Structured keyword extractor splits latency metric shards");
      assert(heuristicMetricShards.some((entry) => entry.category === "metric" && entry.content.includes("timeout 30s")), "Structured keyword extractor splits timeout metric shards");
      assert(heuristicMetricShards.some((entry) => entry.category === "metric" && entry.content.includes("retry window 5m")), "Structured keyword extractor splits retry-window metric shards");
      assert(heuristicMetricShards.some((entry) => entry.category === "metric" && entry.content.includes("token budget 8k")), "Structured keyword extractor splits token-budget metric shards");
      assert(heuristicMetricShards.some((entry) => entry.category === "metric" && entry.content.includes("memory limit 512mb")), "Structured keyword extractor splits memory-limit metric shards");
      assert(heuristicMetricShards.some((entry) => entry.category === "metric" && entry.content.includes("cost budget $25")), "Structured keyword extractor splits cost-budget metric shards");

      const heuristicCategoryBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "Decision: keep operator approvals conservative by default." },
        { role: "assistant", content: "Advice: inspect incident context before broadening dangerous-tool permissions." },
        { role: "assistant", content: "Reasoning: exact transcript truth stays separate because derived summaries can drift." },
        { role: "assistant", content: "Diagnostic: shell_exec failed because allowlist entry was missing." },
        { role: "assistant", content: "Procedure: first run doctor, then inspect logs, then rerun guarded command." },
      ], "assist-ant");
      assertEqual(heuristicCategoryBodies.find((entry) => entry.category === "decision")?.content, "keep operator approvals conservative by default", "Structured keyword extractor trims explicit decision prefix into reusable decision memory");
      assertEqual(heuristicCategoryBodies.find((entry) => entry.category === "advice")?.content, "inspect incident context before broadening dangerous-tool permissions", "Structured keyword extractor trims explicit advice prefix into reusable advice memory");
      assertEqual(heuristicCategoryBodies.find((entry) => entry.category === "reasoning")?.content, "exact transcript truth stays separate because derived summaries can drift", "Structured keyword extractor trims explicit reasoning prefix into reusable reasoning memory");
      assertEqual(heuristicCategoryBodies.find((entry) => entry.category === "diagnostic")?.content, "shell_exec failed because allowlist entry was missing", "Structured keyword extractor trims explicit diagnostic prefix into reusable diagnostic memory");
      assertEqual(heuristicCategoryBodies.find((entry) => entry.category === "procedure")?.content, "first run doctor, then inspect logs, then rerun guarded command", "Structured keyword extractor trims explicit procedure prefix into reusable procedure memory");

      const heuristicMoreCategoryBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "Metric: latency budget stayed 120ms and token budget stayed 8k." },
        { role: "assistant", content: "Preference: show compact summary before deep logs." },
        { role: "assistant", content: "Pattern: keep exact transcript truth separate from derived compaction artifacts." },
        { role: "assistant", content: "Constraint: never let caveman summaries replace canonical human transcript truth." },
        { role: "assistant", content: "Risk: avoid broad shell_exec grants because they are unsafe." },
        { role: "assistant", content: "Change: provider routing moved from local-only behavior to mixed-provider defaults." },
        { role: "assistant", content: "Discovery: mixed-provider fallback taught us to probe terminal health before model health." },
        { role: "assistant", content: "Event: startup doctor failed first, then provider fallback recovered the session." },
      ], "assist-ant");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "metric")?.content, "latency budget stayed 120ms and token budget stayed 8k", "Structured keyword extractor trims explicit metric prefix into reusable metric memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "preference")?.content, "show compact summary before deep logs", "Structured keyword extractor trims explicit preference prefix into reusable preference memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "pattern")?.content, "keep exact transcript truth separate from derived compaction artifacts", "Structured keyword extractor trims explicit pattern prefix into reusable pattern memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "constraint")?.content, "never let caveman summaries replace canonical human transcript truth", "Structured keyword extractor trims explicit constraint prefix into reusable constraint memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "risk")?.content, "avoid broad shell_exec grants because they are unsafe", "Structured keyword extractor trims explicit risk prefix into reusable risk memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "change")?.content, "provider routing moved from local-only behavior to mixed-provider defaults", "Structured keyword extractor trims explicit change prefix into reusable change memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "discovery")?.content, "mixed-provider fallback taught us to probe terminal health before model health", "Structured keyword extractor trims explicit discovery prefix into reusable discovery memory");
      assertEqual(heuristicMoreCategoryBodies.find((entry) => entry.category === "event")?.content, "startup doctor failed first, then provider fallback recovered the session", "Structured keyword extractor trims explicit event prefix into reusable event memory");

      const heuristicAliasCategoryBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "Recommendation: keep dangerous-tool defaults conservative." },
        { role: "assistant", content: "Rationale: derived summaries can drift under compression." },
        { role: "assistant", content: "Root cause: shell_exec failed because allowlist entry was missing." },
        { role: "assistant", content: "Runbook: first run doctor, then inspect logs." },
        { role: "assistant", content: "Budget: latency stayed 120ms and token budget stayed 8k." },
        { role: "assistant", content: "Caution: avoid broad shell_exec grants." },
        { role: "assistant", content: "Delta: provider routing moved to mixed-provider defaults." },
        { role: "assistant", content: "Insight: terminal health checks should run before model health checks." },
        { role: "assistant", content: "Timeline: startup doctor failed first, then provider fallback recovered the session." },
      ], "assist-ant");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "advice")?.content, "keep dangerous-tool defaults conservative", "Structured keyword extractor trims recommendation alias into advice memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "reasoning")?.content, "derived summaries can drift under compression", "Structured keyword extractor trims rationale alias into reasoning memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "diagnostic")?.content, "shell_exec failed because allowlist entry was missing", "Structured keyword extractor trims root-cause alias into diagnostic memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "procedure")?.content, "first run doctor, then inspect logs", "Structured keyword extractor trims runbook alias into procedure memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "metric")?.content, "latency stayed 120ms and token budget stayed 8k", "Structured keyword extractor trims budget alias into metric memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "risk")?.content, "avoid broad shell_exec grants", "Structured keyword extractor trims caution alias into risk memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "change")?.content, "provider routing moved to mixed-provider defaults", "Structured keyword extractor trims delta alias into change memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "discovery")?.content, "terminal health checks should run before model health checks", "Structured keyword extractor trims insight alias into discovery memory");
      assertEqual(heuristicAliasCategoryBodies.find((entry) => entry.category === "event")?.content, "startup doctor failed first, then provider fallback recovered the session", "Structured keyword extractor trims timeline alias into event memory");

      const heuristicImplicitCategoryBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "We decided to keep operator approvals conservative by default." },
        { role: "assistant", content: "We should inspect incident context before broadening dangerous-tool permissions." },
        { role: "assistant", content: "Because derived summaries can drift under compression." },
        { role: "assistant", content: "Prefer compact summary before deep logs." },
        { role: "assistant", content: "Must keep exact transcript truth separate from derived compaction artifacts." },
        { role: "assistant", content: "Avoid broad shell_exec grants in production." },
        { role: "assistant", content: "We changed provider routing from local-only behavior to mixed-provider defaults." },
        { role: "assistant", content: "We learned terminal health checks should run before model health checks." },
      ], "assist-ant");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "decision")?.content, "keep operator approvals conservative by default", "Structured keyword extractor trims natural-language decision lead-ins into reusable decision memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "advice")?.content, "inspect incident context before broadening dangerous-tool permissions", "Structured keyword extractor trims natural-language advice lead-ins into reusable advice memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "reasoning")?.content, "derived summaries can drift under compression", "Structured keyword extractor trims natural-language reasoning lead-ins into reusable reasoning memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "preference")?.content, "compact summary before deep logs", "Structured keyword extractor trims natural-language preference lead-ins into reusable preference memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "constraint")?.content, "keep exact transcript truth separate from derived compaction artifacts", "Structured keyword extractor trims natural-language constraint lead-ins into reusable constraint memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "risk")?.content, "broad shell_exec grants in production", "Structured keyword extractor trims natural-language risk lead-ins into reusable risk memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "change")?.content, "provider routing from local-only behavior to mixed-provider defaults", "Structured keyword extractor trims natural-language change lead-ins into reusable change memory");
      assertEqual(heuristicImplicitCategoryBodies.find((entry) => entry.category === "discovery")?.content, "terminal health checks should run before model health checks", "Structured keyword extractor trims natural-language discovery lead-ins into reusable discovery memory");

      const heuristicImplicitFactPatternDiagnosticBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "Root cause was missing allowlist entry." },
        { role: "assistant", content: "The runtime detail is mixed-provider fallback stays enabled by default." },
        { role: "assistant", content: "The pattern is exact transcript truth stays separate from derived compaction artifacts." },
      ], "assist-ant");
      assertEqual(heuristicImplicitFactPatternDiagnosticBodies.find((entry) => entry.category === "diagnostic")?.content, "missing allowlist entry", "Structured keyword extractor trims natural-language diagnostic lead-ins into reusable diagnostic memory");
      assertEqual(heuristicImplicitFactPatternDiagnosticBodies.find((entry) => entry.category === "fact")?.content, "mixed-provider fallback stays enabled by default", "Structured keyword extractor trims natural-language fact lead-ins into reusable fact memory");
      assertEqual(heuristicImplicitFactPatternDiagnosticBodies.find((entry) => entry.category === "pattern")?.content, "exact transcript truth stays separate from derived compaction artifacts", "Structured keyword extractor trims natural-language pattern lead-ins into reusable pattern memory");

      const heuristicImplicitEventBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "The incident was startup doctor failed first, then provider fallback recovered the session." },
        { role: "assistant", content: "What happened was shell_exec approval blocked the first run, then guarded retry passed." },
      ], "assist-ant");
      assertEqual(heuristicImplicitEventBodies.find((entry) => entry.content.includes("startup doctor failed first"))?.category, "event", "Structured keyword extractor trims natural-language incident lead-ins into reusable event memory");
      assertEqual(heuristicImplicitEventBodies.find((entry) => entry.content.includes("shell_exec approval blocked"))?.category, "event", "Structured keyword extractor trims what-happened lead-ins into reusable event memory");

      const heuristicImplicitProcedureBodies = await heuristicExtractor.extract([
        { role: "assistant", content: "First run the doctor, then inspect fallback logs, then rerun the guarded command." },
      ], "assist-ant");
      assertEqual(
        heuristicImplicitProcedureBodies.find((entry) => entry.category === "procedure")?.content,
        "First run the doctor, then inspect fallback logs, then rerun the guarded command",
        "Structured keyword extractor infers unlabeled ordered-step procedure bodies from first-then guidance",
      );

      const heuristicNumberedProcedureBodies = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: [
            "1. Run the doctor",
            "2. Inspect fallback logs",
            "3. Rerun the guarded command",
          ].join("\n"),
        },
      ], "assist-ant");
      assertEqual(
        heuristicNumberedProcedureBodies.find((entry) => entry.category === "procedure")?.content,
        "Step 1: Run the doctor; Step 2: Inspect fallback logs; Step 3: Rerun the guarded command",
        "Structured keyword extractor consolidates numbered step blocks into one reusable procedure memory",
      );

      const heuristicBulletProcedureBodies = await heuristicExtractor.extract([
        {
          role: "assistant",
          content: [
            "- Run the doctor",
            "- Inspect fallback logs",
            "- Rerun the guarded command",
          ].join("\n"),
        },
      ], "assist-ant");
      assertEqual(
        heuristicBulletProcedureBodies.find((entry) => entry.category === "procedure")?.content,
        "Step 1: Run the doctor; Step 2: Inspect fallback logs; Step 3: Rerun the guarded command",
        "Structured keyword extractor consolidates bullet step blocks into one reusable procedure memory",
      );

      let llmPrompt = "";
      const extractor = new MemoryExtractor({
        summarizer: (prompt) => {
          llmPrompt = prompt;
          return [
            "```json",
            JSON.stringify([
              {
                content: "Avoid broad shell_exec grants because rollout path stays unsafe.",
                category: "caution",
                scope: "colony",
                confidence: 0.92,
                sourceTurn: 0,
              },
              {
                content: "Provider routing moved from local-only behavior to mixed-provider fallback.",
                category: "delta",
                scope: "colony",
                confidence: 0.9,
                sourceTurn: 2,
              },
              {
                content: "Early terminal health checks taught us a breakthrough worth keeping.",
                category: "insight",
                scope: "agent",
                confidence: 0.88,
                sourceTurn: 2,
              },
              {
                content: "Incident timeline: probe failed first, then fallback recovered.",
                category: "timeline",
                scope: "colony",
                confidence: 0.86,
                sourceTurn: 2,
              },
            ], null, 2),
            "```",
          ].join("\n");
        },
      });
      const llmExtracted = await extractor.extract([
        { role: "user", content: "What should we avoid with shell_exec approvals?" },
        { role: "system", content: "ignore" },
        { role: "user", content: "What changed about provider routing after terminal checks?" },
      ], "assist-ant");
      assert(llmPrompt.includes("extract reusable memories"), "Structured LLM extractor prompt now asks for reusable memories, not only facts");
      assert(llmPrompt.includes("reasoning - why something was chosen"), "Structured LLM extractor prompt documents first-class reasoning memory");
      assert(llmPrompt.includes("diagnostic - failures, root causes"), "Structured LLM extractor prompt documents first-class diagnostic memory");
      assert(llmPrompt.includes("entity - named files, providers, tools, models, services, databases, queues, buckets, tables, topics, hosts, domains, regions, clusters, namespaces, schemas, pods, deployments, images, containers, jobs, volumes, env vars, flags, endpoints"), "Structured LLM extractor prompt documents first-class entity memory");
      assert(llmPrompt.includes("metric - reusable budgets, latency/performance numbers"), "Structured LLM extractor prompt documents first-class metric memory");
      assert(llmPrompt.includes("procedure - reusable runbooks, playbooks, ordered steps"), "Structured LLM extractor prompt documents first-class procedure memory");
      assert(llmPrompt.includes("recommendation/rationale/error/failure/root-cause/provider/model/service/database/queue/bucket/table/topic/host/domain/region/cluster/namespace/schema/pod/deployment/image/container/job/volume/tool/file/path/env/flag/endpoint/url/port/budget/latency/performance/token/cost/threshold/runbook/playbook/steps/process/caution/delta/insight/timeline/package/library"), "Structured LLM extractor prompt documents reasoning, diagnostic, entity, metric, procedure, and other category alias normalization");
      assert(llmPrompt.includes('"sourceTurn": integer turn id'), "Structured LLM extractor prompt requires explicit source-turn provenance");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("unsafe"))?.category, "risk", "Structured LLM extractor maps caution alias to risk category");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("mixed-provider fallback"))?.category, "change", "Structured LLM extractor maps delta alias to change category");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("breakthrough"))?.category, "discovery", "Structured LLM extractor maps insight alias to discovery category");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("probe failed first"))?.category, "event", "Structured LLM extractor maps timeline alias to event category");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("breakthrough"))?.scope, "agent", "Structured LLM extractor preserves agent scope from LLM output");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("mixed-provider fallback"))?.sourceTurn, 2, "Structured LLM extractor preserves explicit source-turn provenance from LLM output");
      assertEqual(llmExtracted.find((entry) => entry.content.includes("mixed-provider fallback"))?.source, "llm", "Structured LLM extractor preserves extraction-source provenance");
    } finally {
      await removeWithRetry(dir);
    }
}

async function verifyMarkdownMemoryRanking(): Promise<void> {
  section("4. Markdown Memory Ranking");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-markdown-"));
  const store = new MemoryStore(join(dir, "memories"));

  try {
    await store.save({
      topic: "runtime fallback",
      content: "TTY fallback under WSL needs gpt-4o shell_exec guard.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_old",
      timestamp: 100,
      sourceTurn: 1,
      relevanceKeywords: ["tty", "wsl", "gpt-4o", "shell_exec"],
      filePath: "",
    });
    await store.save({
      topic: "runtime fallback",
      content: "TTY fallback under WSL needs gpt-4o shell_exec guard.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_new",
      timestamp: 200,
      sourceTurn: 2,
      relevanceKeywords: ["tty", "wsl", "gpt-4o", "shell_exec"],
      filePath: "",
    });
    await store.save({
      topic: "release wording",
      content: "Keep this exact phrase for rollout: ship it exactly as written.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_phrase",
      timestamp: 150,
      sourceTurn: 3,
      relevanceKeywords: ["ship", "exact", "written"],
      filePath: "",
    });
    await store.save({
      topic: "rollout decision",
      content: "Decision: keep operator approvals conservative by default.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_decide",
      timestamp: 210,
      sourceTurn: 4,
      relevanceKeywords: ["decision", "approvals", "conservative"],
      filePath: "",
    });
    await store.save({
      topic: "rollout advice",
      content: "Advice: keep operator approvals conservative by default and review exceptions case by case.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_advice",
      timestamp: 215,
      sourceTurn: 4,
      relevanceKeywords: ["advice", "recommend", "should", "approvals", "conservative"],
      filePath: "",
    });
    await store.save({
      topic: "rollout reasoning",
      content: "Reasoning: we kept operator approvals conservative because dangerous tools need stronger guardrails by default.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_reasoning",
      timestamp: 216,
      sourceTurn: 4,
      relevanceKeywords: ["reasoning", "reason", "rationale", "because", "justify", "approvals", "conservative"],
      filePath: "",
    });
    await store.save({
      topic: "rollout entity",
      content: "Entity: fallback provider was gpt-4o, env var was OPENAI_API_KEY, endpoint stayed https://api.openai.com/v1, and log path stayed /tmp/colony.log during rollout checks.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_entity",
      timestamp: 217,
      sourceTurn: 4,
      relevanceKeywords: ["entity", "provider", "env var", "openai_api_key", "endpoint", "url", "path", "tool", "gpt-4o"],
      filePath: "",
    });
    await store.save({
      topic: "rollout infra entity",
      content: "Entity: rollout cluster was prod-east, deployment was colony-api, image was colony/api:1.2.3, and container was api-main during rollout checks.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_entity_infra",
      timestamp: 217.1,
      sourceTurn: 4,
      relevanceKeywords: ["entity", "cluster", "deployment", "image", "container", "prod-east", "colony-api", "api-main"],
      filePath: "",
    });
    await store.save({
      topic: "rollout ops entity",
      content: "Entity: rollout branch was feat/memory-palace, commit was abc1234, pull request was #42, ticket was COL-321, bug was BUG-77, exit code was 137, errno was EPERM, and Bun version was 1.2.4.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_entity_ops",
      timestamp: 217.15,
      sourceTurn: 4,
      relevanceKeywords: ["entity", "branch", "commit", "pull request", "ticket", "bug", "exit code", "errno", "bun version", "feat/memory-palace", "abc1234", "col-321", "bug-77", "eperm"],
      filePath: "",
    });
    await store.save({
      topic: "rollout metric",
      content: "Metric note: rollout latency budget stayed 120ms and token budget stayed 8k during fallback checks.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_metric",
      timestamp: 217.25,
      sourceTurn: 4,
      relevanceKeywords: ["metric", "latency", "budget", "token", "120ms", "8k"],
      filePath: "",
    });
    await store.save({
      topic: "rollout procedure",
      content: "Procedure note: rollout review playbook is first run the doctor, then inspect fallback logs, then rerun the guarded command.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_procedure",
      timestamp: 217.5,
      sourceTurn: 4,
      relevanceKeywords: ["procedure", "runbook", "playbook", "steps", "doctor", "logs"],
      filePath: "",
    });
    await store.save({
      topic: "rollout diagnostic",
      content: "Diagnostic: shell_exec failure came from a missing allowlist entry rather than provider outage.",
      caste: "assist_ant",
      agentId: "assist-ant",
      sessionId: "md_diagnostic",
      timestamp: 218,
      sourceTurn: 4,
      relevanceKeywords: ["diagnostic", "error", "failure", "root cause", "shell_exec", "allowlist"],
      filePath: "",
    });
      await store.save({
        topic: "rollout preference",
        content: "Preference: show compact summary before deep logs.",
        caste: "assist_ant",
        agentId: "assist-ant",
        sessionId: "md_prefer",
        timestamp: 220,
        sourceTurn: 5,
        relevanceKeywords: ["preference", "compact", "logs"],
        filePath: "",
      });
      await store.save({
        topic: "rollout risk",
        content: "Risk: avoid broad shell_exec grants because they are unsafe.",
        caste: "assist_ant",
        agentId: "assist-ant",
        sessionId: "md_risk",
        timestamp: 230,
        sourceTurn: 6,
        relevanceKeywords: ["risk", "avoid", "shell_exec", "unsafe", "grants"],
        filePath: "",
      });
      await store.save({
        topic: "provider routing change",
        content: "Decision change: provider routing moved from local-only behavior to mixed-provider defaults.",
        caste: "assist_ant",
        agentId: "assist-ant",
        sessionId: "md_change",
        timestamp: 240,
        sourceTurn: 7,
        relevanceKeywords: ["change", "decision", "provider", "routing", "local-only", "mixed-provider"],
        filePath: "",
      });
      await store.save({
        topic: "provider discovery",
        content: "Discovery note: terminal health checks taught us to probe shell state before model routing.",
        caste: "assist_ant",
        agentId: "assist-ant",
        sessionId: "md_discovery",
        timestamp: 250,
        sourceTurn: 8,
        relevanceKeywords: ["discovery", "learned", "terminal", "routing"],
        filePath: "",
      });
      await store.save({
        topic: "provider timeline",
        content: "Event note: debug session incident started with probe failure and ended with fallback recovery.",
        caste: "assist_ant",
        agentId: "assist-ant",
        sessionId: "md_event",
        timestamp: 260,
        sourceTurn: 9,
        relevanceKeywords: ["event", "incident", "timeline", "debug"],
        filePath: "",
      });

    const technical = await store.surfaceRelevant({
      query: "tty wsl gpt-4o shell_exec",
      caste: "assist_ant",
      sessionId: "md_new",
      maxFiles: 3,
    });
    assertEqual(technical[0]?.sessionId, "md_new", "Markdown memory ranking matches technical identifiers and prefers current session tie");

    const quoted = await store.surfaceRelevant({
      query: 'quote "ship it exactly as written"',
      caste: "assist_ant",
      sessionId: "md_new",
      maxFiles: 3,
    });
    assertEqual(quoted[0]?.sessionId, "md_phrase", "Markdown memory ranking rewards literal phrase match");

    const archived = await store.surfaceRelevant({
      query: "previous session tty fallback",
      caste: "assist_ant",
      sessionId: "md_new",
      maxFiles: 3,
    });
    assertEqual(archived[0]?.sessionId, "md_old", "Markdown memory ranking respects archived session scope");

    const earliest = await store.surfaceRelevant({
      query: "earliest tty fallback",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(earliest[0]?.sessionId, "md_old", "Markdown memory ranking respects earliest time preference");

    const latest = await store.surfaceRelevant({
      query: "latest tty fallback",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(latest[0]?.sessionId, "md_new", "Markdown memory ranking respects latest time preference");

    const decide = await store.surfaceRelevant({
      query: "what did we decide about approvals",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(decide[0]?.sessionId, "md_decide", "Markdown memory ranking maps decide wording to decision memory");
    assert(decide[0]?.matchReasons?.includes("intent-match") === true, "Markdown memory ranking preserves intent-match reasons");

    const prefer = await store.surfaceRelevant({
      query: "what do we prefer for rollout",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(prefer[0]?.sessionId, "md_prefer", "Markdown memory ranking maps prefer wording to preference memory");

    const rationale = await store.surfaceRelevant({
      query: "why did we choose conservative approvals",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(rationale[0]?.sessionId, "md_reasoning", "Markdown memory ranking maps why/rationale wording to reasoning memory");

    const entity = await store.surfaceRelevant({
      query: "which provider handled fallback",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(entity[0]?.sessionId, "md_entity", "Markdown memory ranking maps provider/file-style wording to entity memory");
    const entityEnv = await store.surfaceRelevant({
      query: "which env var enabled fallback",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(entityEnv[0]?.sessionId, "md_entity", "Markdown memory ranking maps env-var wording to entity memory");
    const entityInfra = await store.surfaceRelevant({
      query: "which cluster handled rollout",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(entityInfra[0]?.sessionId, "md_entity_infra", "Markdown memory ranking maps infra entity wording to entity memory");
    assert(entityInfra[0]?.matchReasons?.includes("intent-match") === true, "Markdown memory ranking preserves intent-match reason for infra entity wording");
    const entityOps = await store.surfaceRelevant({
      query: "which branch shipped rollout",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(entityOps[0]?.sessionId, "md_entity_ops", "Markdown memory ranking maps git/version/error entity wording to entity memory");
    assert(entityOps[0]?.matchReasons?.includes("intent-match") === true, "Markdown memory ranking preserves intent-match reason for git/version/error entity wording");
    const entityBug = await store.surfaceRelevant({
      query: "which bug blocked rollout",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(entityBug[0]?.sessionId, "md_entity_ops", "Markdown memory ranking maps bug-style work-item wording to entity memory");
    assert(entityBug[0]?.matchReasons?.includes("intent-match") === true, "Markdown memory ranking preserves intent-match reason for bug-style work-item wording");

    const metric = await store.surfaceRelevant({
      query: "what latency budget did rollout use",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(metric[0]?.sessionId, "md_metric", "Markdown memory ranking maps budget/perf wording to metric memory");

    const procedure = await store.surfaceRelevant({
      query: "what playbook steps should we follow for rollout review",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(procedure[0]?.sessionId, "md_procedure", "Markdown memory ranking maps runbook/playbook wording to procedure memory");

    const diagnostic = await store.surfaceRelevant({
      query: "what error caused shell_exec failure",
      caste: "assist_ant",
      maxFiles: 3,
    });
    assertEqual(diagnostic[0]?.sessionId, "md_diagnostic", "Markdown memory ranking maps failure/root-cause wording to diagnostic memory");

      const advice = await store.surfaceRelevant({
        query: "what should we do about approvals",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assertEqual(advice[0]?.sessionId, "md_advice", "Markdown memory ranking maps advice wording to advice memory");

      const risk = await store.surfaceRelevant({
        query: "what should we avoid with shell_exec approvals",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assertEqual(risk[0]?.sessionId, "md_risk", "Markdown memory ranking maps risk wording to caution memory");

      const comparison = await store.surfaceRelevant({
        query: "what changed about provider routing",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assertEqual(comparison[0]?.sessionId, "md_change", "Markdown memory ranking maps comparison wording to change memory");

      const discovery = await store.surfaceRelevant({
        query: "what did we learn about provider routing",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assertEqual(discovery[0]?.sessionId, "md_discovery", "Markdown memory ranking maps discovery wording to discovery memory");

      const event = await store.surfaceRelevant({
        query: "what happened during the debug session",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assertEqual(event[0]?.sessionId, "md_event", "Markdown memory ranking maps event wording to timeline memory");

      const heuristicService = new AutoMemoryService({
        store: new MemoryStore(join(dir, "heuristic-memories")),
      });
      const heuristicEntries = await heuristicService.extractMemories([
        { role: "user", content: "We should avoid broad shell_exec grants because they are unsafe and dangerous in rollout." },
        { role: "assistant", content: "What changed is provider routing moved from local-only to mixed-provider defaults after fallback." },
        { role: "assistant", content: "We learned terminal health checks must run before model routing because that breakthrough prevented dead starts." },
        { role: "assistant", content: "During the debug session the incident happened in this order: probe failed first, then fallback recovered." },
      ], "assist-ant", "assist_ant", "md_heuristic");
      assert(heuristicEntries.some((entry) => entry.topic.toLowerCase().includes("risk note")), "Markdown heuristic extractor captures risk paragraphs directly");
      assert(heuristicEntries.some((entry) => entry.topic.toLowerCase().includes("change note")), "Markdown heuristic extractor captures change paragraphs directly");
      assert(heuristicEntries.some((entry) => entry.topic.toLowerCase().includes("discovery note") || entry.topic.toLowerCase().includes("event note")), "Markdown heuristic extractor captures discovery or event paragraphs directly");
      assertEqual(heuristicEntries.find((entry) => entry.topic.toLowerCase().includes("risk note"))?.sourceTurn, 0, "Markdown heuristic extractor preserves source-turn provenance for risk paragraph");
      assertEqual(heuristicEntries.find((entry) => entry.topic.toLowerCase().includes("risk note"))?.source, "heuristic", "Markdown heuristic extractor preserves extraction-source provenance");
      const heuristicEntityEntries = await heuristicService.extractMemories([
        { role: "assistant", content: "The rollout cluster was prod-east, the deployment was colony-api, the image was colony/api:1.2.3, and the container was api-main." },
        { role: "assistant", content: "We should keep conservative approvals by default during rollout." },
      ], "assist-ant", "assist_ant", "md_heuristic_entity");
      assert(heuristicEntityEntries.some((entry) => entry.topic.toLowerCase().includes("entity note") && entry.content.toLowerCase().includes("prod-east")), "Markdown heuristic extractor captures infra entity paragraphs directly");
      const heuristicOpsEntries = await heuristicService.extractMemories([
        { role: "assistant", content: "The rollout branch was feat/memory-palace, the commit was abc1234, the pull request was #42, the ticket was COL-321, the bug was BUG-77, and Bun version was 1.2.4." },
      ], "assist-ant", "assist_ant", "md_heuristic_ops");
      assert(heuristicOpsEntries.some((entry) => entry.topic.toLowerCase().includes("entity note") && entry.content.toLowerCase().includes("feat/memory-palace")), "Markdown heuristic extractor captures git/version entity paragraphs directly");
      assert(heuristicOpsEntries.some((entry) => entry.topic.toLowerCase().includes("entity note") && entry.content.toLowerCase().includes("bug-77")), "Markdown heuristic extractor carries bug-style work-item paragraphs through entity recall");

      let llmPrompt = "";
      const llmService = new AutoMemoryService({
        store: new MemoryStore(join(dir, "llm-memories")),
        llmExtract: (systemPrompt) => {
          llmPrompt = systemPrompt;
          return [
            "CATEGORY: risk",
            "TOPIC: shell_exec approval guard",
            "CONTENT: Avoid broad shell_exec approval grants because they stay unsafe during rollout.",
            "KEYWORDS: shell_exec, approval, rollout",
            "SOURCE_TURN: 0",
            "",
            "CATEGORY: change",
            "TOPIC: provider routing delta",
            "CONTENT: Provider routing changed from local-only to mixed-provider fallback after health checks.",
            "KEYWORDS: provider, routing, fallback",
            "SOURCE_TURN: 1",
            "",
            "CATEGORY: discovery",
            "TOPIC: terminal health breakthrough",
            "CONTENT: We learned early terminal health checks prevent dead starts before model routing.",
            "KEYWORDS: terminal, health, breakthrough",
            "SOURCE_TURN: 1",
            "",
            "CATEGORY: event",
            "TOPIC: incident recovery timeline",
            "CONTENT: The incident happened in order: probe failed first, then fallback recovered.",
            "KEYWORDS: incident, probe, recovered",
            "SOURCE_TURN: 1",
            "",
            "TOPIC: legacy rollout fact",
            "CONTENT: Runtime fact: current session still keeps conservative approvals by default.",
            "KEYWORDS: runtime, approvals, conservative",
          ].join("\n");
        },
      });
      const llmEntries = await llmService.extractMemories([
        { role: "user", content: "What should we avoid with shell_exec approvals during rollout?" },
        { role: "assistant", content: "Provider routing changed after terminal health checks taught us to avoid dead starts, and the incident recovered after fallback." },
      ], "assist-ant", "assist_ant", "md_llm");
      assert(llmPrompt.includes("CATEGORY: <one allowed category>"), "Markdown LLM extractor prompt requires explicit category field");
      assert(llmPrompt.includes("advice, reasoning, diagnostic, entity, metric, procedure, decision"), "Markdown LLM extractor prompt documents reasoning, diagnostic, entity, metric, and procedure as first-class categories");
      assert(llmPrompt.includes("SOURCE_TURN: <turn number"), "Markdown LLM extractor prompt requires explicit source-turn field");
      assert(llmEntries.some((entry) => entry.topic.toLowerCase().startsWith("risk note: shell_exec approval guard")), "Markdown LLM extractor preserves explicit risk category in topic");
      assert(llmEntries.some((entry) => entry.topic.toLowerCase().startsWith("change note: provider routing delta")), "Markdown LLM extractor preserves explicit change category in topic");
      assert(llmEntries.some((entry) => entry.topic.toLowerCase().startsWith("discovery note: terminal health breakthrough")), "Markdown LLM extractor preserves explicit discovery category in topic");
      assert(llmEntries.some((entry) => entry.topic.toLowerCase().startsWith("event note: incident recovery timeline")), "Markdown LLM extractor preserves explicit event category in topic");
      assert(llmEntries.some((entry) => entry.topic === "legacy rollout fact"), "Markdown LLM extractor still accepts legacy no-category format");
      assertEqual(llmEntries.find((entry) => entry.topic.toLowerCase().startsWith("change note: provider routing delta"))?.sourceTurn, 1, "Markdown LLM extractor preserves explicit source-turn provenance");
      assertEqual(llmEntries.find((entry) => entry.topic.toLowerCase().startsWith("change note: provider routing delta"))?.source, "llm", "Markdown LLM extractor preserves extraction-source provenance");

      const llmRisk = await llmService.surfaceRelevant({
        query: "what should we avoid with shell_exec approvals",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assert(llmRisk[0]?.topic.toLowerCase().includes("risk note"), "Markdown LLM extractor category keywords steer risk recall");

      const llmChange = await llmService.surfaceRelevant({
        query: "what changed about provider routing",
        caste: "assist_ant",
        maxFiles: 3,
      });
      assert(llmChange[0]?.topic.toLowerCase().includes("change note"), "Markdown LLM extractor category keywords steer change recall");
    } finally {
      await removeWithRetry(dir);
    }
}

async function verifyMemoryServiceMempalaceRecall(): Promise<void> {
  section("5. MemPalace Exact Recall Routing");

  const dir = await mkdtemp(join(tmpdir(), "colony-memory-palace-"));
  const palacePath = join(dir, "palace");
  const memory = new ColonyMemoryService({ dataDir: dir, mempalacePath: palacePath });

  try {
    const store = await PalaceStore.open({ palacePath, create: true });
    try {
      store.addBatch([
        {
          id: "",
          content: "Decision: operator approvals stay conservative by default for dangerous tools.",
          wing: "colony",
          room: "security",
          hall: "hall_facts",
          sourceFile: "security.md",
          importance: 5,
          emotionalWeight: 0.7,
          metadata: {},
        },
        {
          id: "",
          content: "Decision: security playbook mirrors conservative operator approvals for dangerous tools.",
          wing: "security-playbook",
          room: "security",
          hall: "hall_facts",
          sourceFile: "security-playbook.md",
          importance: 4,
          emotionalWeight: 0.6,
          metadata: {},
        },
        {
          id: "",
          content: "Preference: security playbook keeps terse operator approval wording and mirrors conservative rollout language.",
          wing: "security-playbook",
          room: "security",
          hall: "hall_preferences",
          sourceFile: "security-playbook-preferences.md",
          importance: 4,
          emotionalWeight: 0.4,
          metadata: {},
        },
        {
          id: "",
          content: "Preference: memory notes should preserve security decision context for operator approvals, and use caveman summaries only for derived compression.",
          wing: "colony",
          room: "memory",
          hall: "hall_preferences",
          sourceFile: "memory.md",
          importance: 5,
          emotionalWeight: 0.4,
          metadata: {},
        },
        {
          id: "",
          content: "Launch mugs stay bright orange during rollout week.",
          wing: "colony",
          room: "kitchen",
          hall: "hall_preferences",
          sourceFile: "pcg-999.md",
          importance: 2,
          emotionalWeight: 0.1,
          metadata: {},
        },
        {
          id: "",
          content: "Runtime fact: remember that the memory ledger records conservative operator approval state for dangerous tools.",
          wing: "colony",
          room: "memory",
          hall: "hall_facts",
          sourceFile: "memory-facts.md",
          importance: 4,
          emotionalWeight: 0.3,
          metadata: {},
        },
        {
          id: "",
          content: "Preference: cafeteria wallpaper use bright orange during launch week.",
          wing: "colony",
          room: "memory",
          hall: "hall_preferences",
          sourceFile: "memory-fun.md",
          importance: 5,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Preference: ops memory keeps incident-response notes near security context.",
          wing: "ops",
          room: "memory",
          hall: "hall_preferences",
          sourceFile: "ops-memory.md",
          importance: 3,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Event: ops incidents archive tracks security approval failures after the operator approvals decision and containment work.",
          wing: "ops",
          room: "incidents",
          hall: "hall_events",
          sourceFile: "incidents.md",
          importance: 4,
          emotionalWeight: 0.5,
          metadata: {},
        },
        {
          id: "",
          content: "Fact: incident review keeps connected decision context for conservative operator approvals and rollback guardrails.",
          wing: "ops",
          room: "incidents",
          hall: "hall_facts",
          sourceFile: "incidents-facts.md",
          importance: 4,
          emotionalWeight: 0.4,
          metadata: {},
        },
        {
          id: "",
          content: "Advice: when operator approvals feel uncertain, keep dangerous-tool defaults conservative and inspect incident context first.",
          wing: "ops",
          room: "incidents",
          hall: "hall_advice",
          sourceFile: "incidents-advice.md",
          importance: 4,
          emotionalWeight: 0.4,
          metadata: {},
        },
        {
          id: "",
          content: "Constraint: incident review never broadens dangerous-tool approvals without fresh operator confirmation.",
          wing: "ops",
          room: "incidents",
          hall: "hall_facts",
          sourceFile: "incidents-constraints.md",
          importance: 4,
          emotionalWeight: 0.4,
          metadata: {},
        },
        {
          id: "",
          content: "Preference: incident review keeps caveman summaries derived-only and preserves exact transcript truth for operator approvals.",
          wing: "ops",
          room: "incidents",
          hall: "hall_preferences",
          sourceFile: "incidents-preferences.md",
          importance: 4,
          emotionalWeight: 0.3,
          metadata: {},
        },
        {
          id: "",
          content: "Event: ops incidents archive tracks snack inventory and catering updates for launch week.",
          wing: "ops",
          room: "incidents",
          hall: "hall_events",
          sourceFile: "incidents-fun.md",
          importance: 5,
          emotionalWeight: 0.1,
          metadata: {},
        },
        {
          id: "",
          content: "Event: colony celebration tunnel tracks launch banners and confetti stock.",
          wing: "colony",
          room: "celebration",
          hall: "hall_events",
          sourceFile: "celebration.md",
          importance: 5,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Event: security playbook celebration tunnel mirrors launch banner planning.",
          wing: "security-playbook",
          room: "celebration",
          hall: "hall_events",
          sourceFile: "celebration-playbook.md",
          importance: 5,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Event: colony celebration tunnel tracks launch snacks and cake inventory.",
          wing: "colony",
          room: "celebration",
          hall: "hall_events",
          sourceFile: "celebration-food.md",
          importance: 5,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Event: security playbook celebration tunnel tracks launch snacks and cake inventory.",
          wing: "security-playbook",
          room: "celebration",
          hall: "hall_events",
          sourceFile: "celebration-food-playbook.md",
          importance: 5,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Constraint: dangerous shell execution requires explicit review before tool launch.",
          wing: "colony",
          room: "vault",
          hall: "hall_facts",
          sourceFile: "policy-closet.md",
          importance: 3,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Constraint: dangerous shell execution requires explicit review before tool launch.",
          wing: "colony",
          room: "vault",
          hall: "hall_facts",
          sourceFile: "notes-cache.md",
          importance: 3,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Constraint: dangerous shell execution requires explicit review before tool launch in security playbook vault copy.",
          wing: "security-playbook",
          room: "vault",
          hall: "hall_facts",
          sourceFile: "policy-playbook-closet.md",
          importance: 3,
          emotionalWeight: 0.2,
          metadata: {},
        },
        {
          id: "",
          content: "Constraint: dangerous shell execution requires explicit review before tool launch in playbook cache mirror.",
          wing: "security-playbook",
          room: "vault",
          hall: "hall_facts",
          sourceFile: "notes-playbook-cache.md",
          importance: 3,
          emotionalWeight: 0.2,
          metadata: {},
        },
      ]);

      const sourceRanked = store.search("policy closet", {
        wing: "colony",
        hall: "hall_facts",
        nResults: 3,
      });
      assertEqual(sourceRanked.results[0]?.sourceFile, "policy-closet.md", "Direct palace search boosts source-file closet matches over same-content twins without room filter");
      const sourceFiltered = store.search("dangerous shell review", {
        wing: "colony",
        hall: "hall_facts",
        sourceFile: "policy-closet.md",
        nResults: 3,
      });
      assertEqual(sourceFiltered.results[0]?.sourceFile, "policy-closet.md", "Direct palace search supports explicit source-file closet filter");
    } finally {
      store.close();
    }

    let session = createAgentSession({
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      metadata: {
        workspaceName: "colony-ts",
        workspacePrimaryTargets: ["colony", "colony-ts"],
      },
    });
    session = addMessage(session, createSystemMessage(PromptBuilder.buildSystemPrompt({
      caste: Caste.ASSIST_ANT,
      agentId: "assist-ant",
    }), 100));
    session = addMessage(session, createUserMessage("What security decision did we make?"));
    await memory.captureSession(session);

    const factsContext = await memory.buildMemoryContext("exact decision about conservative operator approvals", session, {
      truthMode: "exact_only",
    });
    assert(factsContext.includes("Verbatim palace recall (exact mined drawers):"), "Memory context includes palace exact section");
    assert(factsContext.includes("Verbatim palace recall (exact mined drawers): showing "), "Direct palace header surfaces shown-vs-total truth");
    assert(factsContext.includes("[palace:colony/security/hall_facts]"), "Palace exact section includes hall-aware path");
    assert(factsContext.includes("operator approvals stay conservative"), "Palace exact section includes drawer content");

    const decisionNearbyContext = await memory.buildMemoryContext("what decision did we make about conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(decisionNearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Plain decision query expands to nearby palace context");
    assert(decisionNearbyContext.includes("Broader palace context (exact connected room drawers):"), "Plain decision query expands to broader palace graph context");
    assert(decisionNearbyContext.includes("Nearby palace context (exact adjacent room drawers): showing "), "Nearby palace header surfaces shown-vs-total truth");
    assert(decisionNearbyContext.includes("Broader palace context (exact connected room drawers): showing "), "Broader palace header surfaces shown-vs-total truth");
    assert(
      decisionNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < decisionNearbyContext.indexOf("Nearby palace context (exact adjacent room drawers):"),
      "Plain decision query keeps direct palace drawer before nearby context",
    );
    assert(
      decisionNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < decisionNearbyContext.indexOf("Broader palace context (exact connected room drawers):"),
      "Plain decision query keeps direct palace drawer before broader context",
    );
    const decisionPalaceCounts = decisionNearbyContext.match(/palace=(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    const decisionShownPalaceCounts = decisionNearbyContext.match(/shown-palace=(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    const decisionHiddenPalaceCounts = decisionNearbyContext.match(/hidden-palace=(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    assert(Boolean(decisionPalaceCounts && decisionShownPalaceCounts), "Decision nearby context exposes palace total and shown counts");
    const nearbyPalaceHidden = Number(decisionPalaceCounts?.[2]) > Number(decisionShownPalaceCounts?.[2]);
    const broaderPalaceHidden = Number(decisionPalaceCounts?.[3]) > Number(decisionShownPalaceCounts?.[3]);
    assert(
      Number(decisionHiddenPalaceCounts?.[2]) === Number(decisionPalaceCounts?.[2]) - Number(decisionShownPalaceCounts?.[2])
        && Number(decisionHiddenPalaceCounts?.[3]) === Number(decisionPalaceCounts?.[3]) - Number(decisionShownPalaceCounts?.[3]),
      "Palace hidden-count tag matches palace total minus shown rows for nearby and broader sections",
    );
    assert(nearbyPalaceHidden || broaderPalaceHidden, "Decision nearby context keeps at least one palace graph section truncated for hidden-row proof");
    if (nearbyPalaceHidden) {
      assert(decisionNearbyContext.includes("more nearby palace drawer"), "Nearby palace section surfaces hidden-row note when nearby graph recall is truncated");
    }
    if (broaderPalaceHidden) {
      assert(decisionNearbyContext.includes("more broader palace drawer"), "Broader palace section surfaces hidden-row note when broader graph recall is truncated");
    }

    const constraintNearbyContext = await memory.buildMemoryContext("what rule must we keep for conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(constraintNearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Plain constraint query expands to nearby palace context");
    assert(constraintNearbyContext.includes("Broader palace context (exact connected room drawers):"), "Plain constraint query expands to broader palace graph context");
    assert(
      constraintNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < constraintNearbyContext.indexOf("Nearby palace context (exact adjacent room drawers):"),
      "Plain constraint query keeps direct palace drawer before nearby context",
    );
    assert(
      constraintNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < constraintNearbyContext.indexOf("Broader palace context (exact connected room drawers):"),
      "Plain constraint query keeps direct palace drawer before broader context",
    );

    const adviceNearbyContext = await memory.buildMemoryContext("what should we do about conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(adviceNearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Plain advice query expands to nearby palace context");
    assert(adviceNearbyContext.includes("Broader palace context (exact connected room drawers):"), "Plain advice query expands to broader palace graph context");
    assert(
      adviceNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < adviceNearbyContext.indexOf("Nearby palace context (exact adjacent room drawers):"),
      "Plain advice query keeps direct palace drawer before nearby context",
    );
    assert(
      adviceNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < adviceNearbyContext.indexOf("Broader palace context (exact connected room drawers):"),
      "Plain advice query keeps direct palace drawer before broader context",
    );

    const exactAdviceContext = await memory.buildMemoryContext("exact what should we do about conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(exactAdviceContext.includes("[palace:colony/security/hall_facts]"), "Exact advice query falls back across halls when advice hall is empty");
    assert(exactAdviceContext.includes("stage:hall-fallback"), "Advice palace recall surfaces direct row-level hall-fallback rung provenance");
    assert(exactAdviceContext.includes("hall-via:advice"), "Advice palace query surfaces hall-inference source");

    const prefsContext = await memory.buildMemoryContext("what preference do we have about caveman summaries", session, {
      truthMode: "exact_only",
    });
    assert(prefsContext.includes("[palace:colony/memory/hall_preferences]"), "Preference query routes to hall_preferences");
    assert(prefsContext.includes("hall-via:preference"), "Preference palace query surfaces hall-inference source");

    const preferenceNearbyContext = await memory.buildMemoryContext("what preference do we have about caveman summaries in colony", session, {
      truthMode: "exact_only",
    });
    assert(preferenceNearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Plain preference query expands to nearby palace context");
    assert(preferenceNearbyContext.includes("Broader palace context (exact connected room drawers):"), "Plain preference query expands to broader palace graph context");
    assert(preferenceNearbyContext.includes("palace-broader-seed-via:nearby"), "Preference query surfaces nearby fallback source for broader graph seed");
    assert(preferenceNearbyContext.includes("palace-broader-fallback:memory->celebration"), "Preference query surfaces drift from direct room to nearby-seeded broader graph room");
    assert(
      preferenceNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < preferenceNearbyContext.indexOf("Nearby palace context (exact adjacent room drawers):"),
      "Plain preference query keeps direct palace drawer before nearby context",
    );
    assert(
      preferenceNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < preferenceNearbyContext.indexOf("Broader palace context (exact connected room drawers):"),
      "Plain preference query keeps direct palace drawer before broader context",
    );

    const riskNearbyContext = await memory.buildMemoryContext("what should we avoid with conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(riskNearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Plain risk query expands to nearby palace context");
    assert(riskNearbyContext.includes("Broader palace context (exact connected room drawers):"), "Plain risk query expands to broader palace graph context");
    assert(
      riskNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < riskNearbyContext.indexOf("Nearby palace context (exact adjacent room drawers):"),
      "Plain risk query keeps direct palace drawer before nearby context",
    );
    assert(
      riskNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < riskNearbyContext.indexOf("Broader palace context (exact connected room drawers):"),
      "Plain risk query keeps direct palace drawer before broader context",
    );

    const factNearbyContext = await memory.buildMemoryContext("what runtime fact should we remember about conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(factNearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Plain fact query expands to nearby palace context");
    assert(factNearbyContext.includes("Broader palace context (exact connected room drawers):"), "Plain fact query expands to broader palace graph context");
    assert(
      factNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < factNearbyContext.indexOf("Nearby palace context (exact adjacent room drawers):"),
      "Plain fact query keeps direct palace drawer before nearby context",
    );
    assert(
      factNearbyContext.indexOf("Verbatim palace recall (exact mined drawers):")
        < factNearbyContext.indexOf("Broader palace context (exact connected room drawers):"),
      "Plain fact query keeps direct palace drawer before broader context",
    );

    const rationaleFactsContext = await memory.buildMemoryContext("explain rationale for conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(rationaleFactsContext.includes("[palace:colony/security/hall_facts]"), "Rationale query routes palace recall to fact hall");

    const explicitWingContext = await memory.buildMemoryContext("exact decision in colony about conservative operator approvals", session, {
      truthMode: "exact_only",
    });
    assert(
      explicitWingContext.includes("[palace:colony/")
        && explicitWingContext.includes("/hall_facts]"),
      "Explicit query text routes palace recall to matching wing",
    );
    assert(explicitWingContext.includes("Related palace recall (exact cross-wing tunnel drawers):"), "Explicit wing recall includes cross-wing tunnel section");
    assert(explicitWingContext.includes("[palace-related:security-playbook/security/hall_facts]"), "Tunnel section includes related cross-wing drawer");
    assert(explicitWingContext.includes("wing-via:query"), "Explicit wing recall surfaces wing-inference source");

    const explicitRoomContext = await memory.buildMemoryContext("exact security decision in colony about conservative operator approvals", session, {
      truthMode: "exact_only",
    });
    assert(explicitRoomContext.includes("[palace:colony/security/hall_facts]"), "Explicit query text routes palace recall to matching room");
    assert(explicitRoomContext.includes("room-match-via:query+security"), "Explicit room recall surfaces room-match source");

    const sourceHintRoomContext = await memory.buildMemoryContext("exact policy closet dangerous shell review in colony", session, {
      truthMode: "exact_only",
    });
    assert(sourceHintRoomContext.includes("Memory routing note: truth:exact_only"), "Palace exact recall surfaces routing note with truth mode provenance");
    assert(sourceHintRoomContext.includes("truth-via:explicit"), "Palace exact recall surfaces explicit truth-mode source");
    assert(sourceHintRoomContext.includes("wing-via:query"), "Source-hint palace recall surfaces wing-inference source");
    assert(sourceHintRoomContext.includes("source:policy-closet.md"), "Palace exact recall routing note keeps local source-file hint visible");
    assert(sourceHintRoomContext.includes("room-via:source_hint"), "Palace exact recall routing note surfaces source-hint room inference");
    assert(sourceHintRoomContext.includes("room-match-via:source_hint+policy+closet"), "Source-hint palace recall surfaces room-match source");
    assert(sourceHintRoomContext.includes("source-via:wing"), "Palace exact recall routing note surfaces wing-scoped source-file inference");
    assert(sourceHintRoomContext.includes("source-file-via:wing+policy+closet"), "Palace exact recall routing note surfaces local source-file hint source");
    assert(sourceHintRoomContext.includes("palace-hit-via:strict"), "Source-hint palace recall surfaces strict direct-hit ladder rung");
    assert(sourceHintRoomContext.includes("palace-resolved-via:wing=inferred,room=source_hint,hall=inferred"), "Palace exact recall routing note surfaces resolved-path provenance for source-hint path");
    assert(sourceHintRoomContext.includes("palace-resolved:colony/vault/hall_facts"), "Palace exact recall routing note surfaces resolved palace path");
    assert(sourceHintRoomContext.includes("[palace:colony/vault/hall_facts]"), "Source-file closet hint routes palace recall to matching room when room word is absent");
    assert(sourceHintRoomContext.includes("stage:strict"), "Source-file closet hint surfaces direct row-level strict rung provenance");
    assert(sourceHintRoomContext.includes("(rank:1 drawer:"), "Palace exact recall surfaces local row-rank and drawer provenance");
    assert(sourceHintRoomContext.includes("source:policy-closet.md"), "Palace exact recall surfaces local source-file closet provenance");
    assert(sourceHintRoomContext.includes("sim:"), "Palace exact recall surfaces local similarity provenance");
    assert(sourceHintRoomContext.includes("dist:"), "Palace exact recall surfaces local distance provenance");
    assert(sourceHintRoomContext.includes("why:keyword-overlap,hall-match,source-hint"), "Palace exact recall surfaces local row-level boost reasons");

    const globalSourceHintContext = await memory.buildMemoryContext("exact playbook closet dangerous shell review", session, {
      truthMode: "exact_only",
    });
    assert(globalSourceHintContext.includes("[palace:security-playbook/vault/hall_facts]"), "Global source-file closet hint routes direct palace recall even when wing is not named");
    assert(globalSourceHintContext.includes("(rank:1 drawer:"), "Palace exact recall surfaces global row-rank and drawer provenance");
    assert(globalSourceHintContext.includes("source:policy-playbook-closet.md"), "Palace exact recall surfaces global source-file closet provenance");
    assert(globalSourceHintContext.includes("source-via:global"), "Palace exact recall routing note surfaces global source-file inference");
    assert(globalSourceHintContext.includes("source-file-via:global+playbook+closet"), "Palace exact recall routing note surfaces global source-file hint source");

    const globalRoomContext = await memory.buildMemoryContext("exact incidents connected decision context", session, {
      truthMode: "exact_only",
    });
    assert(globalRoomContext.includes("[palace:ops/incidents/hall_facts]"), "Global room inference routes exact recall from unique room name before wing is named");
    assert(globalRoomContext.includes("room-match-via:query+incidents"), "Global room recall surfaces room-match source");
    assert(globalRoomContext.includes("palace-resolved-via:wing=hit,room=query,hall=inferred"), "Global room recall surfaces resolved-path provenance for hit wing");

    const adviceClosetContext = await memory.buildMemoryContext("exact what should we do about playbook closet dangerous shell review", session, {
      truthMode: "exact_only",
    });
    assert(adviceClosetContext.includes("[palace:security-playbook/vault/hall_facts]"), "Advice-style source-file closet query keeps closet hint alive across fact-hall fallback");
    assert(adviceClosetContext.includes("palace-hit-via:strict"), "Advice-style source-file closet query surfaces strict ladder rung once fact-hall routing resolves up front");
    assert(adviceClosetContext.includes("palace-resolved-via:wing=hit,room=hit,hall=inferred"), "Advice-style source-file closet query surfaces resolved-path provenance");
    assert(adviceClosetContext.includes("palace-resolved:security-playbook/vault/hall_facts"), "Advice-style source-file closet query surfaces resolved fact-hall provenance");

    const widenedRoomContext = await memory.buildMemoryContext("exact celebration preference about caveman summaries in colony", session, {
      truthMode: "exact_only",
    });
    assert(widenedRoomContext.includes("[palace:colony/memory/hall_preferences]"), "Explicit wrong room widens to matching hall elsewhere in same wing before giving up");
    assert(widenedRoomContext.includes("room-fallback:celebration->memory"), "Widened palace recall surfaces room fallback when direct room filter misses");
    assert(widenedRoomContext.includes("palace-hit-via:drop-room"), "Widened palace recall surfaces drop-room ladder rung when explicit room filter misses");
    assert(widenedRoomContext.includes("stage:drop-room"), "Widened palace recall surfaces direct row-level drop-room rung provenance");
    assert(widenedRoomContext.includes("palace-resolved-via:wing=inferred,room=hit,hall=inferred"), "Widened palace recall surfaces resolved-path hit provenance after room fallback");
    assert(widenedRoomContext.includes("palace-resolved:colony/memory/hall_preferences"), "Widened palace recall keeps resolved palace path honest after room fallback");

    const sourceFallbackContext = await memory.buildMemoryContext("exact pcg999md caveman", session, {
      truthMode: "exact_only",
    });
    assert(sourceFallbackContext.includes("[palace:ops/incidents/hall_preferences]"), "Source-hint miss falls back to strongest matching preference drawer when hinted source file has no lexical hit");
    assert(sourceFallbackContext.includes("source:pcg-999.md"), "Source-hint miss keeps hinted source file visible in routing note");
    assert(sourceFallbackContext.includes("source-fallback:pcg-999.md->incidents-preferences.md"), "Source-hint miss surfaces source-file fallback to real winning drawer");
    assert(sourceFallbackContext.includes("palace-hit-via:drop-source"), "Source-hint miss surfaces drop-source ladder rung after hinted source file misses");
    assert(sourceFallbackContext.includes("stage:drop-source"), "Source-hint miss surfaces direct row-level drop-source rung provenance");
    assert(sourceFallbackContext.includes("palace-resolved-via:wing=hit,room=hit,hall=hit"), "Source-hint miss surfaces resolved-path hit provenance after source-file fallback");
    assert(sourceFallbackContext.includes("palace-resolved:ops/incidents/hall_preferences"), "Source-hint miss keeps resolved palace path honest after source fallback");

    const nearbyContext = await memory.buildMemoryContext("exact background around the security decision in colony", session, {
      truthMode: "exact_only",
    });
    assert(nearbyContext.includes("Nearby palace context (exact adjacent room drawers):"), "Background query expands to nearby room context");
    assert(nearbyContext.includes("palace-expand-via:background+around"), "Background query surfaces nearby-expansion source");
    assert(nearbyContext.includes("palace-nearby-seed:security"), "Background query surfaces nearby graph seed room");
    assert(nearbyContext.includes("palace-nearby-hit-via:drop-hall"), "Background query surfaces winning nearby graph hit rung");
    assert(nearbyContext.includes("palace-nearby-seed-via:query"), "Background query surfaces explicit-room source for nearby graph seed");
    assert(nearbyContext.includes("[palace-nearby:colony/memory/hall_preferences]"), "Nearby room section includes adjacent colony room");
    assert(nearbyContext.includes("rank:1") && nearbyContext.includes("stage:strict") && nearbyContext.includes("hop:1"), "Nearby palace context surfaces row-rank, rung, and hop provenance");
    assert(nearbyContext.includes("graph-nearby"), "Nearby palace context surfaces graph-nearby reasons");
    const nearbyLines = nearbyContext.split("\n").filter((line) => line.startsWith("- [palace-nearby:"));
    assert(
      nearbyLines[0]?.includes("preserve security decision context for operator approvals") === true,
      "Nearby drawer ranking prefers memory content tied to query over irrelevant adjacent preference noise",
    );

    const broaderContext = await memory.buildMemoryContext("exact broader context around the security decision in colony", session, {
      truthMode: "exact_only",
    });
    assert(broaderContext.includes("Broader palace context (exact connected room drawers):"), "Broader query expands to connected graph context");
    assert(broaderContext.includes("[palace-broader:ops/incidents/hall_events]"), "Broader section includes hop-two connected room");
    assert(broaderContext.includes("palace-broader-seed:hop2:security"), "Broader query surfaces hop-two graph seed room");
    assert(broaderContext.includes("palace-broader-hit-via:strict"), "Broader query surfaces winning broader graph hit rung");
    assert(broaderContext.includes("palace-broader-seed-via:direct"), "Broader query surfaces direct-room source for hop-two graph seed");
    assert(broaderContext.includes("rank:1") && broaderContext.includes("stage:drop-hall") && broaderContext.includes("hop:2"), "Broader palace context surfaces row-rank, rung, and hop provenance");
    assert(broaderContext.includes("graph-broader"), "Broader palace context surfaces graph-broader reasons");
    const broaderLines = broaderContext.split("\n").filter((line) => line.startsWith("- [palace-broader:"));
    assert(
      broaderLines[0]?.includes("connected decision context for conservative operator approvals")
        || broaderLines[0]?.includes("approval failures after the operator approvals decision"),
      "Broader drawer ranking prefers security-relevant hop-two content over irrelevant higher-importance content",
    );
    assert(
      broaderContext.indexOf("Broader palace context (exact connected room drawers):")
        < broaderContext.indexOf("Verbatim palace recall (exact mined drawers):"),
      "Broader query ranks connected context before direct palace drawers",
    );
    assert(broaderContext.includes("palace-via:broader+context"), "Broader palace query surfaces palace-order source");
    assert(broaderContext.includes("palace-broaden-via:broader"), "Broader palace query surfaces broaden-traversal source");

    const whyPalaceContext = await memory.buildMemoryContext("why did we decide on conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(whyPalaceContext.includes("Broader palace context (exact connected room drawers):"), "Why query expands to broader palace graph context");
    assert(
      whyPalaceContext.indexOf("Broader palace context (exact connected room drawers):")
        < whyPalaceContext.indexOf("Verbatim palace recall (exact mined drawers):"),
      "Why query ranks broader palace context before direct drawers",
    );
    assert(whyPalaceContext.includes("palace-via:reasoning"), "Why palace query surfaces reasoning-driven palace-order source");
    assert(whyPalaceContext.includes("palace-expand-via:decision+reasoning"), "Why palace query surfaces nearby-expansion source");
    assert(whyPalaceContext.includes("palace-broaden-via:reasoning+decision"), "Why palace query surfaces broaden-traversal source");

    const sourceHintNearbyContext = await memory.buildMemoryContext("exact background around policy closet dangerous shell review in colony", session, {
      truthMode: "exact_only",
    });
    assert(/palace-nearby-seed-via:(source_hint|hit)/.test(sourceHintNearbyContext), "Background source-hint query surfaces honest nearby graph-seed source after room resolution");

    const fallbackNearbyContext = await memory.buildMemoryContext("exact background around celebration preference about caveman summaries in colony", session, {
      truthMode: "exact_only",
    });
    assert(fallbackNearbyContext.includes("room-fallback:celebration->memory"), "Background fallback query keeps room-fallback truth");
    assert(fallbackNearbyContext.includes("palace-nearby-fallback:memory->memory") === false, "Nearby fallback tag avoids fake self-drift");
    assert(fallbackNearbyContext.includes("palace-nearby-fallback:celebration->memory"), "Background fallback query surfaces nearby graph drift from requested room to resolved seed room");
    assert(fallbackNearbyContext.includes("palace-nearby-hit-via:drop-hall"), "Background fallback query surfaces nearby hall-drop rung");
    assert(fallbackNearbyContext.includes("palace-nearby-seed-via:hit"), "Background fallback query surfaces resolved-hit source for nearby graph seed");

    const emptyBroaderContext = await memory.buildMemoryContext("exact broader context around policy closet dangerous shell review in colony", session, {
      truthMode: "exact_only",
    });
    assert(emptyBroaderContext.includes("palace-broader-seed-via:direct"), "No-result broader query still surfaces direct broader seed source");
    assert(emptyBroaderContext.includes("palace-broader-seed:hop"), "No-result broader query still surfaces attempted broader seed room");

    const relatedKitchenContext = await memory.buildMemoryContext("exact related kitchen orange mugs in colony", session, {
      truthMode: "exact_only",
    });
    assert(relatedKitchenContext.includes("palace-related-seed:tunnel-fallback:vault"), "Kitchen related query surfaces final cross-wing tunnel seed room");
    assert(relatedKitchenContext.includes("palace-related-fallback:kitchen->vault"), "Kitchen related query surfaces tunnel fallback drift from requested room to winning cross-wing seed");
    assert(relatedKitchenContext.includes("section-state:exact=empty,palace-direct=full,palace-nearby=truncated,palace-broader=empty,palace-related=full"), "Kitchen related query keeps section-state honest across direct, nearby, and related sections");

    const relatedContext = await memory.buildMemoryContext("exact related security decision in colony", session, {
      truthMode: "exact_only",
    });
    assert(
      relatedContext.indexOf("Related palace recall (exact cross-wing tunnel drawers):")
        < relatedContext.indexOf("Verbatim palace recall (exact mined drawers):"),
      "Related query ranks tunnel recall before direct palace drawers",
    );
    assert(relatedContext.includes("palace-via:related"), "Related palace query surfaces related-driven palace-order source");
    assert(relatedContext.includes("palace-expand-via:related"), "Related palace query surfaces nearby-expansion source");
    assert(relatedContext.includes("palace-related-via:related+query-wing"), "Related palace query surfaces cross-wing tunnel provenance from related wording plus explicit wing");
    assert(relatedContext.includes("palace-related-hit-via:strict"), "Related palace query surfaces winning cross-wing search rung");
    assert(!relatedContext.includes("palace-related-none:"), "Related palace query avoids false no-start tag when cross-wing recall really ran");
    assert(relatedContext.includes("stage:strict via:security cross-wing"), "Related palace rows surface row-level search rung provenance");

    const relatedPreferenceContext = await memory.buildMemoryContext("exact related preference about caveman summaries in colony", session, {
      truthMode: "exact_only",
    });
    assert(relatedPreferenceContext.includes("Related palace recall (exact cross-wing tunnel drawers):"), "Related preference query expands to cross-wing tunnel recall");
    assert(relatedPreferenceContext.includes("[palace-related:security-playbook/security/hall_preferences]"), "Related preference query falls back through nearby room seed when direct room has no tunnel twin");
    assert(/palace-related-seed:(tunnel|nearby):security/.test(relatedPreferenceContext), "Related preference query surfaces honest cross-wing seed room when direct room lacks a tunnel twin");
    assert(relatedPreferenceContext.includes("palace-related-fallback:memory->security"), "Related preference query surfaces drift from direct room to cross-wing tunnel seed");
    assert(relatedPreferenceContext.includes("rank:1") && relatedPreferenceContext.includes("cross-wing"), "Related palace recall surfaces row-rank and cross-wing provenance");
    assert(relatedPreferenceContext.includes("why:keyword-overlap,hall-match,cross-wing"), "Related palace recall surfaces cross-wing row-level reasons");
    assert(
      relatedPreferenceContext.indexOf("Related palace recall (exact cross-wing tunnel drawers):")
        < relatedPreferenceContext.indexOf("Verbatim palace recall (exact mined drawers):"),
      "Related preference query keeps tunnel recall before direct palace drawer",
    );

    const relatedAdviceContext = await memory.buildMemoryContext("exact related what should we do about conservative operator approvals in colony", session, {
      truthMode: "exact_only",
    });
    assert(relatedAdviceContext.includes("Related palace recall (exact cross-wing tunnel drawers):"), "Related advice query expands to cross-wing tunnel recall");
    assert(relatedAdviceContext.includes("[palace-related:security-playbook/security/hall_facts]"), "Related advice query falls back from advice hall to fact hall across wings");
    assert(relatedAdviceContext.includes("palace-related-hit-via:strict"), "Related advice query surfaces winning cross-wing search rung after hall fallback routing");
    assert(relatedAdviceContext.includes("stage:strict via:security cross-wing"), "Related advice query keeps row-level cross-wing search rung provenance");
    assert(
      relatedAdviceContext.indexOf("Related palace recall (exact cross-wing tunnel drawers):")
        < relatedAdviceContext.indexOf("Verbatim palace recall (exact mined drawers):"),
      "Related advice query keeps tunnel recall before direct palace drawer",
    );

    const relatedClosetContext = await memory.buildMemoryContext("exact related playbook closet dangerous shell review in colony", session, {
      truthMode: "exact_only",
    });
    assert(relatedClosetContext.includes("[palace-related:security-playbook/vault/hall_facts]"), "Related source-file closet query expands to cross-wing vault recall");
    assert(relatedClosetContext.includes("security playbook vault copy"), "Related source-file closet query prefers matching cross-wing closet drawer over cache twin");

    const globalRelatedClosetContext = await memory.buildMemoryContext("exact related playbook closet dangerous shell review", session, {
      truthMode: "exact_only",
    });
    assert(globalRelatedClosetContext.includes("[palace:security-playbook/vault/hall_facts]"), "Global source-file closet query resolves direct exact drawer without explicit wing");
    assert(globalRelatedClosetContext.includes("[palace-related:colony/vault/hall_facts]"), "Global source-file closet query wakes related cross-wing recall from resolved direct wing");
    assert(globalRelatedClosetContext.includes("palace-related-via:related+resolved-wing"), "Global source-file closet query surfaces cross-wing tunnel provenance from resolved direct wing");
    assert(globalRelatedClosetContext.includes("palace-related-seed:direct:vault"), "Global source-file closet query surfaces direct-room seed for cross-wing tunnel recall");

    const globalRelatedAdviceClosetContext = await memory.buildMemoryContext("exact related what should we do about playbook closet dangerous shell review", session, {
      truthMode: "exact_only",
    });
    assert(globalRelatedAdviceClosetContext.includes("[palace:security-playbook/vault/hall_facts]"), "Global related advice-style closet query resolves direct fact-hall drawer");
    assert(globalRelatedAdviceClosetContext.includes("[palace-related:colony/vault/hall_facts]"), "Global related advice-style closet query keeps related recall on resolved fact hall truth");

    const emptyRelatedContext = await memory.buildMemoryContext("exact related incident review in ops", session, {
      truthMode: "exact_only",
    });
    assert(emptyRelatedContext.includes("palace-related-miss-after:drop-hall-drop-source"), "No-result related query surfaces deepest exhausted cross-wing search rung");
    assert(emptyRelatedContext.includes("palace-related-fallback:incidents->memory"), "No-result related query keeps attempted tunnel-seed fallback truth");
    assert(emptyRelatedContext.includes("section-state:exact=empty,palace-direct=full,palace-nearby=full,palace-broader=truncated,palace-related=empty"), "No-result related query keeps section-state honest when tunnel recall fully misses");
    assert(emptyRelatedContext.includes("empty-sections:exact>palace-related"), "No-result related query marks related section empty instead of silently dropping it");

    const derivedContext = await memory.buildMemoryContext("summary recap of operator approvals", session, {
      truthMode: "derived_only",
    });
    assert(!derivedContext.includes("Verbatim palace recall (exact mined drawers):"), "Derived-only mode suppresses palace exact section");

    const preferDerivedContext = await memory.buildMemoryContext("remind me of context for ship it exactly as written", session, {
      truthMode: "prefer_derived",
    });
    const firstDerivedSection = preferDerivedContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):");
    const firstExactSection = [
      preferDerivedContext.indexOf("Verbatim recall (exact transcript excerpts):"),
      preferDerivedContext.indexOf("Verbatim palace recall (exact mined drawers):"),
    ].filter((index) => index >= 0).sort((left, right) => left - right)[0] ?? -1;
    assert(
      firstDerivedSection >= 0 && firstExactSection >= 0 && firstDerivedSection < firstExactSection,
      "Prefer-derived mode ranks derived recall before exact sections",
    );

    const preferExactContext = await memory.buildMemoryContext("what did i say literally about operator approvals", session, {
      truthMode: "prefer_exact",
    });
    assert(
      preferExactContext.indexOf("Verbatim recall (exact transcript excerpts):")
        < preferExactContext.indexOf("Derived compact recall (not verbatim; use to find truth, not replace it):"),
      "Prefer-exact mode ranks exact recall before derived sections",
    );
  } finally {
    await removeWithRetry(dir);
  }
}

async function verifyTruthModeInference(): Promise<void> {
  section("6. Truth Mode Controls");

  assertEqual(inferMemoryTruthMode("quote exact wording as written"), "exact_only", "Truth mode infers exact recall from quote wording");
  assertEqual(inferMemoryTruthProvenance("quote exact wording as written").join("+"), "exact+quote+as-written", "Truth provenance keeps exact-only trigger reasons");
  assertEqual(inferMemoryTruthMode("give me a summary recap"), "derived_only", "Truth mode infers derived recall from summary wording");
  assertEqual(inferMemoryTruthProvenance("give me a summary recap").join("+"), "summary+recap", "Truth provenance keeps derived-only trigger reasons");
  assertEqual(inferMemoryTruthMode("what did i say literally"), "prefer_exact", "Truth mode infers exact preference from literal wording");
  assertEqual(inferMemoryTruthProvenance("what did i say literally").join("+"), "said-by-me+literal", "Truth provenance keeps prefer-exact trigger reasons");
  assertEqual(inferMemoryTruthMode("remind me of the context"), "prefer_derived", "Truth mode infers derived preference from context wording");
  assertEqual(inferMemoryTruthProvenance("remind me of the context").join("+"), "context+remind-me", "Truth provenance keeps prefer-derived trigger reasons");
  assertEqual(inferMemoryTruthMode("why did we decide this"), "prefer_derived", "Truth mode infers derived preference from why wording");
  assertEqual(inferMemoryTruthMode("explain the rationale"), "prefer_derived", "Truth mode infers derived preference from rationale wording");
  assertEqual(inferMemoryTruthMode("justify this decision"), "prefer_derived", "Truth mode infers derived preference from justify wording");
  assertEqual(inferMemoryTruthMode("what should we do about approvals"), "prefer_derived", "Truth mode infers derived preference from advice wording");
  assertEqual(inferMemoryTruthMode("what should we avoid with shell_exec approvals"), "prefer_derived", "Truth mode infers derived preference from risk wording");
  assertEqual(inferMemoryTruthMode("what changed about provider routing"), "prefer_derived", "Truth mode infers derived preference from comparison wording");
  assertEqual(inferMemoryTruthMode("what did we decide about provider routing"), "prefer_derived", "Truth mode infers derived preference from decision wording");
  assertEqual(inferMemoryTruthMode("what do we prefer for output style"), "prefer_derived", "Truth mode infers derived preference from preference wording");
  assertEqual(inferMemoryTruthMode("what happened during the debug session"), "prefer_derived", "Truth mode infers derived preference from event wording");
  assertEqual(inferMemoryTruthMode("what rule must we keep for operator approvals"), "prefer_derived", "Truth mode infers derived preference from constraint wording");
  assertEqual(inferMemoryTruthMode("what did we learn about provider routing"), "prefer_derived", "Truth mode infers derived preference from discovery wording");
  assertEqual(inferMemoryTruthMode("what error caused shell_exec failure"), "prefer_derived", "Truth mode infers derived preference from diagnostic wording");
  assertEqual(inferMemoryTruthMode("which provider handled fallback"), "prefer_derived", "Truth mode infers derived preference from entity wording");
  assertEqual(inferMemoryTruthMode("which env var enabled fallback"), "prefer_derived", "Truth mode infers derived preference from env-var entity wording");
  assertEqual(inferMemoryTruthMode("which cluster handled rollout"), "prefer_derived", "Truth mode infers derived preference from infra entity wording");
  assertEqual(inferMemoryTruthMode("which branch shipped rollout"), "prefer_derived", "Truth mode infers derived preference from git/version/error entity wording");
  assertEqual(inferMemoryTruthMode("which bug blocked rollout"), "prefer_derived", "Truth mode infers derived preference from bug-style work-item entity wording");
  assertEqual(inferMemoryTruthMode("what latency budget did rollout use"), "prefer_derived", "Truth mode infers derived preference from metric wording");
  assertEqual(inferMemoryTruthMode("what playbook steps should we follow for rollout review"), "prefer_derived", "Truth mode infers derived preference from procedure wording");
  assertEqual(inferMemoryTruthMode("what runtime fact should we remember"), "prefer_derived", "Truth mode infers derived preference from fact wording");
  assertEqual(inferMemoryTruthProvenance("plain unmatched lookup").join("+"), "default", "Truth provenance falls back to default when no trigger fires");
  assertEqual(inferCompactDerivedFocusProvenance("summary recap please").join("+"), "summary+recap", "Compact-focus provenance keeps recap trigger reasons");
  assertEqual(inferCompactDerivedFocusProvenance("what changed about provider routing").join("+"), "comparison", "Compact-focus provenance keeps comparison trigger reasons");
  assertEqual(inferCompactDerivedFocusProvenance("what happened during the debug session").join("+"), "event", "Compact-focus provenance keeps event trigger reasons");
  assertEqual(inferStructuredFocusProvenance("what architecture pattern should we keep").join("+"), "pattern", "Structured-focus provenance keeps pattern trigger reasons");
  assertEqual(inferStructuredFocusProvenance("why did we decide this").join("+"), "reasoning", "Structured-focus provenance keeps reasoning trigger reasons");
  assertEqual(inferStructuredFocusProvenance("what changed about provider routing").join("+"), "comparison", "Structured-focus provenance keeps comparison trigger reasons");
  assert(hasAdviceIntent("what should we do about approvals"), "Shared advice helper detects should wording");
  assert(hasAdviceIntent("recommend a rollout path"), "Shared advice helper detects recommend wording");
  assert(hasReasoningIntent("because we had to justify the rollout"), "Shared reasoning helper detects because/justify wording");
  assert(hasReasoningIntent("what motivation drove this decision"), "Shared reasoning helper detects motivation wording");
  assert(hasDecisionIntent("what did we decide about provider routing"), "Shared decision helper detects decide wording");
  assert(hasDecisionIntent("agreed rollout plan"), "Shared decision helper detects agreed wording");
  assert(hasRiskIntent("what should we avoid with shell_exec approvals"), "Shared risk helper detects avoid wording");
  assert(hasRiskIntent("watch out for unsafe shell_exec approvals"), "Shared risk helper detects watch-out wording");
  assert(hasComparisonIntent("what changed about operator approvals"), "Shared comparison helper detects changed wording");
  assert(hasComparisonIntent("difference between old and new approvals"), "Shared comparison helper detects difference wording");
  assert(hasPreferenceIntent("what do we prefer for output style"), "Shared preference helper detects prefer wording");
  assert(hasPreferenceIntent("what style do we like"), "Shared preference helper detects style wording");
  assert(hasEventIntent("what happened during the debug session"), "Shared event helper detects happened wording");
  assert(hasEventIntent("incident timeline for rollout"), "Shared event helper detects timeline wording");
  assert(hasConstraintIntent("what rule must we keep for operator approvals"), "Shared constraint helper detects rule wording");
  assert(hasConstraintIntent("forbidden rollout pattern"), "Shared constraint helper detects forbidden wording");
  assert(hasDiscoveryIntent("what did we learn about provider routing"), "Shared discovery helper detects learn wording");
  assert(hasDiscoveryIntent("breakthrough pattern in fallback logic"), "Shared discovery helper detects breakthrough wording");
  assert(hasDiagnosticIntent("what error caused shell_exec failure"), "Shared diagnostic helper detects failure wording");
  assert(hasDiagnosticIntent("root cause traceback for rollout crash"), "Shared diagnostic helper detects root-cause/traceback wording");
  assert(hasEntityIntent("which provider handled fallback"), "Shared entity helper detects provider wording");
  assert(hasEntityIntent("what file path stores rollout policy"), "Shared entity helper detects file/path wording");
  assert(hasEntityIntent("which env var enabled fallback"), "Shared entity helper detects env-var wording");
  assert(hasEntityIntent("what endpoint and port does fallback use"), "Shared entity helper detects endpoint/port wording");
  assert(hasEntityIntent("which image handled rollout"), "Shared entity helper detects deploy-image wording");
  assert(hasEntityIntent("which namespace stores runtime data"), "Shared entity helper detects topology wording");
  assert(hasEntityIntent("which branch shipped rollout"), "Shared entity helper detects git/work-item entity wording");
  assert(hasEntityIntent("which bug blocked rollout"), "Shared entity helper detects bug-style work-item wording");
  assert(hasEntityIntent("which exit code failed rollout"), "Shared entity helper detects status/error entity wording");
  assert(hasEntityIntent("which bun version ran rollout"), "Shared entity helper detects runtime-version entity wording");
  const workItemKeywords = extractKeywords("which issue blocked rollout");
  assert(workItemKeywords.has("ticket"), "Keyword extraction expands issue wording into ticket alias");
  assert(workItemKeywords.has("bug"), "Keyword extraction expands issue wording into bug alias");
  assert(hasMetricIntent("what latency budget did rollout use"), "Shared metric helper detects latency/budget wording");
  assert(hasMetricIntent("show token usage threshold"), "Shared metric helper detects token/threshold wording");
  assert(hasProcedureIntent("what playbook steps should we follow"), "Shared procedure helper detects playbook/steps wording");
  assert(hasProcedureIntent("show the rollout runbook procedure"), "Shared procedure helper detects runbook/procedure wording");
  assert(hasFactIntent("what runtime fact should we remember"), "Shared fact helper detects runtime/fact wording");
  assert(hasFactIntent("environment status detail"), "Shared fact helper detects environment/detail wording");
  assert(hasPatternIntent("what architecture pattern should we keep"), "Shared pattern helper detects architecture-pattern wording");
  assert(hasPatternIntent("workflow convention for compaction"), "Shared pattern helper detects workflow-convention wording");
  assert(scoreLiteralPhraseMatch("Ship it exactly as written for release notes.", 'quote "ship it exactly as written"') > 0.9, "Literal phrase scoring rewards quoted contiguous match");
  assert(scoreLiteralPhraseMatch("Ship it, but keep release notes written exactly for review.", 'quote "ship it exactly as written"') < 0.9, "Literal phrase scoring does not overreward scrambled wording");
  const technicalKeywords = extractKeywords("TTY check failed under WSL for gpt-4o fallback via shell_exec and /tmp/colony.log");
  assert(technicalKeywords.has("tty"), "Keyword extraction keeps short technical token");
  assert(technicalKeywords.has("wsl"), "Keyword extraction keeps uppercase-style acronym");
  assert(technicalKeywords.has("gpt-4o"), "Keyword extraction keeps hyphenated model id");
  assert(technicalKeywords.has("shell_exec"), "Keyword extraction keeps underscored tool id");
  assert(technicalKeywords.has("tmp/colony.log") || technicalKeywords.has("/tmp/colony.log"), "Keyword extraction keeps path-like token");
  assertEqual(inferConversationRolePreference("what did i say about approvals"), "user", "Conversation role preference detects user recall");
  assertEqual(inferConversationRolePreference("what did you say about approvals"), "assistant", "Conversation role preference detects assistant recall");
  assertEqual(inferConversationRolePreference("show tool output for approvals"), "tool", "Conversation role preference detects tool recall");
  assertEqual(inferConversationRolePreference("why did we keep approvals conservative"), "assistant", "Conversation role preference detects explanation query");
  assertEqual(inferConversationRolePreference("what should we do about approvals"), "assistant", "Conversation role preference detects advice query");
  assertEqual(inferConversationRolePreference("what should we avoid with shell_exec approvals"), "assistant", "Conversation role preference detects risk query");
  assertEqual(inferConversationRolePreference("what changed about provider routing"), "assistant", "Conversation role preference detects comparison query");
  assertEqual(inferConversationRolePreference("what did we decide about provider routing"), "assistant", "Conversation role preference detects decision query");
  assertEqual(inferConversationRolePreference("what do we prefer for output style"), "assistant", "Conversation role preference detects preference query");
  assertEqual(inferConversationRolePreference("what happened during the debug session"), "assistant", "Conversation role preference detects event query");
  assertEqual(inferConversationRolePreference("what rule must we keep for operator approvals"), "assistant", "Conversation role preference detects constraint query");
  assertEqual(inferConversationRolePreference("what did we learn about provider routing"), "assistant", "Conversation role preference detects discovery query");
  assertEqual(inferConversationRolePreference("what error caused shell_exec failure"), "assistant", "Conversation role preference detects diagnostic query");
  assertEqual(inferConversationRolePreference("which provider handled fallback"), "assistant", "Conversation role preference detects entity query");
  assertEqual(inferConversationRolePreference("which env var enabled fallback"), "assistant", "Conversation role preference detects env-var entity query");
  assertEqual(inferConversationRolePreference("which deployment handled rollout"), "assistant", "Conversation role preference detects infra entity query");
  assertEqual(inferConversationRolePreference("which branch shipped rollout"), "assistant", "Conversation role preference detects git/version/error entity query");
  assertEqual(inferConversationRolePreference("which bug blocked rollout"), "assistant", "Conversation role preference detects bug-style work-item entity query");
  assertEqual(inferConversationRolePreference("what latency budget did rollout use"), "assistant", "Conversation role preference detects metric query");
  assertEqual(inferConversationRolePreference("what playbook steps should we follow for rollout review"), "assistant", "Conversation role preference detects procedure query");
  assertEqual(inferConversationRolePreference("what runtime fact should we remember"), "assistant", "Conversation role preference detects fact query");
  assertEqual(inferConversationRolePreference("what architecture pattern should we keep"), "assistant", "Conversation role preference detects pattern query");
  assertEqual(inferMemorySessionScopePreference("show previous session approval note"), "archived", "Session-scope preference detects archived recall");
  assertEqual(inferMemorySessionScopePreference("show current session approval note"), "current", "Session-scope preference detects current recall");
  assertEqual(inferMemoryTimePreference("show latest approval note"), "recent", "Time preference detects recent recall");
  assertEqual(inferMemoryTimePreference("show earliest approval note"), "oldest", "Time preference detects oldest recall");
  assert(inferStructuredMemoryCategoryHints("what did we decide").has("decision"), "Structured category hints detect decide wording");
  assert(inferStructuredMemoryCategoryHints("what did we decide about provider routing").has("decision"), "Structured category hints detect decision intent");
  assert(inferStructuredMemoryCategoryHints("what do we prefer").has("preference"), "Structured category hints detect prefer wording");
  assert(inferStructuredMemoryCategoryHints("why did we choose this").has("decision"), "Structured category hints detect why/rationale wording");
  assert(inferStructuredMemoryCategoryHints("why did we choose this").has("reasoning"), "Structured category hints detect first-class reasoning wording");
  assert(inferStructuredMemoryCategoryHints("what should we do now").has("advice"), "Structured category hints detect advice wording");
  assert(inferStructuredMemoryCategoryHints("what should we avoid with shell_exec approvals").has("risk"), "Structured category hints detect risk wording");
  assert(inferStructuredMemoryCategoryHints("what changed about provider routing").has("change"), "Structured category hints detect comparison wording");
  assert(inferStructuredMemoryCategoryHints("what do we prefer for output style").has("preference"), "Structured category hints detect preference wording");
  assert(inferStructuredMemoryCategoryHints("what happened during the debug session").has("event"), "Structured category hints detect event wording");
  assert(inferStructuredMemoryCategoryHints("what rule must we keep for operator approvals").has("constraint"), "Structured category hints detect constraint wording");
  assert(inferStructuredMemoryCategoryHints("what did we learn about provider routing").has("discovery"), "Structured category hints detect discovery wording");
  assert(inferStructuredMemoryCategoryHints("what error caused shell_exec failure").has("diagnostic"), "Structured category hints detect diagnostic wording");
  assert(inferStructuredMemoryCategoryHints("which provider handled fallback").has("entity"), "Structured category hints detect entity wording");
  assert(inferStructuredMemoryCategoryHints("which env var enabled fallback").has("entity"), "Structured category hints detect env-var entity wording");
  assert(inferStructuredMemoryCategoryHints("which branch shipped rollout").has("entity"), "Structured category hints detect git/version/error entity wording");
  assert(inferStructuredMemoryCategoryHints("which bug blocked rollout").has("entity"), "Structured category hints detect bug-style work-item entity wording");
  assert(inferStructuredMemoryCategoryHints("what latency budget did rollout use").has("metric"), "Structured category hints detect metric wording");
  assert(inferStructuredMemoryCategoryHints("what playbook steps should we follow for rollout review").has("procedure"), "Structured category hints detect procedure wording");
  assert(inferStructuredMemoryCategoryHints("what runtime fact should we remember").has("fact"), "Structured category hints detect fact wording");
  assertEqual(inferMempalaceHall("what decision did we make about approvals"), "hall_facts", "Hall inference routes decisions to facts");
  assertEqual(inferMempalaceHall("explain rationale for approvals"), "hall_facts", "Hall inference routes rationale wording to facts");
  assertEqual(inferMempalaceHall("justify approvals because dangerous tools run"), "hall_facts", "Hall inference routes justify/because wording to facts");
  assertEqual(inferMempalaceHall("what should we do about approvals"), "hall_advice", "Hall inference routes advice wording to advice hall");
  assertEqual(inferMempalaceHall("what should we avoid with shell_exec approvals"), "hall_facts", "Hall inference routes risk wording to fact hall");
  assertEqual(inferMempalaceHall("what changed about provider routing"), "hall_facts", "Hall inference routes comparison wording to fact hall");
  assertEqual(inferMempalaceHall("what do we prefer for output style"), "hall_preferences", "Hall inference routes preference wording to preference hall");
  assertEqual(inferMempalaceHall("what happened during the debug session"), "hall_events", "Hall inference routes event wording to events hall");
  assertEqual(inferMempalaceHall("what rule must we keep for operator approvals"), "hall_facts", "Hall inference routes constraint wording to fact hall");
  assertEqual(inferMempalaceHall("what did we learn about provider routing"), "hall_discoveries", "Hall inference routes discovery wording to discoveries hall");
  assertEqual(inferMempalaceHall("what error caused shell_exec failure"), "hall_facts", "Hall inference routes diagnostic wording to fact hall");
  assertEqual(inferMempalaceHall("which provider handled fallback"), "hall_facts", "Hall inference routes entity wording to fact hall");
  assertEqual(inferMempalaceHall("what latency budget did rollout use"), "hall_facts", "Hall inference routes metric wording to fact hall");
  assertEqual(inferMempalaceHall("what playbook steps should we follow for rollout review"), "hall_advice", "Hall inference routes procedure wording to advice hall");
  assertEqual(inferMempalaceHall("what runtime fact should we remember"), "hall_facts", "Hall inference routes fact wording to fact hall");
  assertEqual(inferMempalaceHall("what architecture pattern should we keep"), "hall_discoveries", "Hall inference routes pattern wording to discoveries hall");
  assertEqual(inferMempalaceHall("what preference do we have about formatting"), "hall_preferences", "Hall inference routes preferences to preferences");
  assertEqual(inferMempalaceHall("what happened during the debug session"), "hall_events", "Hall inference routes session/debug queries to events");
  assertEqual(inferMempalaceHallProvenance("what should we do about operator approvals").join("+"), "advice", "Hall inference provenance keeps advice trigger reasons");
  assertEqual(inferMempalaceHallProvenance("what preference do we have about formatting").join("+"), "preference", "Hall inference provenance keeps preference trigger reasons");
  assertEqual(inferMempalaceHallProvenance("explain rationale for approvals").join("+"), "reasoning", "Hall inference provenance keeps reasoning trigger reasons");
  assertEqual(inferMempalaceWing("what did colony decide about approvals", {
    tenantScope: "default",
    metadata: { workspaceName: "colony-ts", workspacePrimaryTargets: ["colony", "colony-ts"] },
  }), "colony", "Wing inference prefers explicit query match");
  assertEqual(inferMempalaceWingProvenance("what did colony decide about approvals", {
    tenantScope: "default",
    metadata: { workspaceName: "colony-ts", workspacePrimaryTargets: ["colony", "colony-ts"] },
  }).join("+"), "query", "Wing inference provenance keeps explicit-query trigger reasons");
  assertEqual(inferMempalaceWing("what did we decide about approvals", {
    tenantScope: "default",
    metadata: { workspacePrimaryTargets: ["colony"] },
  }), "colony", "Wing inference falls back to single primary target");
  assertEqual(inferMempalaceWingProvenance("what did we decide about approvals", {
    tenantScope: "default",
    metadata: { workspacePrimaryTargets: ["colony"] },
  }).join("+"), "single-candidate", "Wing inference provenance keeps single-candidate trigger reasons");
  assertEqual(inferMempalaceWing("what did we decide about approvals", {
    tenantScope: "default",
    metadata: { workspacePrimaryTargets: ["colony", "colony-ts"] },
  }), undefined, "Wing inference avoids guessing when multiple targets exist without explicit match");
  assertEqual(inferMempalaceWingProvenance("what did we decide about approvals", {
    tenantScope: "default",
    metadata: { workspacePrimaryTargets: ["colony", "colony-ts"] },
  }).join("+"), "default", "Wing inference provenance falls back to default when no trigger fires");
  assertEqual(inferMempalaceRoom("what security decision did colony make", ["security", "memory"]), "security", "Room inference prefers explicit query room match");
  assertEqual(inferMempalaceRoom("what did colony decide", ["security", "memory"]), undefined, "Room inference avoids guessing without explicit room match");
  assert(shouldExpandMempalaceContext("give me background around the security decision"), "Context expansion detects broad-background query");
  assert(!shouldExpandMempalaceContext("exact security decision"), "Context expansion stays off for narrow exact query");
  assert(shouldExpandMempalaceContext("why did we make the security decision"), "Context expansion detects explanation query");
  assert(shouldExpandMempalaceContext("what decision did we make about provider routing"), "Context expansion detects decision query");
  assert(shouldExpandMempalaceContext("what rule must we keep for operator approvals"), "Context expansion detects constraint query");
  assert(shouldExpandMempalaceContext("what should we do about operator approvals"), "Context expansion detects advice query");
  assert(shouldExpandMempalaceContext("what preference do we have about formatting"), "Context expansion detects preference query");
  assert(shouldExpandMempalaceContext("what should we avoid with shell_exec approvals"), "Context expansion detects risk query");
  assert(shouldExpandMempalaceContext("what runtime fact should we remember"), "Context expansion detects fact query");
  assert(shouldExpandMempalaceContext("what changed about provider routing"), "Context expansion detects comparison query");
  assert(shouldExpandMempalaceContext("what did we learn about provider routing"), "Context expansion detects discovery query");
  assert(shouldExpandMempalaceContext("what error caused shell_exec failure"), "Context expansion detects diagnostic query");
  assert(shouldExpandMempalaceContext("which provider handled fallback"), "Context expansion detects entity query");
  assert(shouldExpandMempalaceContext("which cluster handled rollout"), "Context expansion detects infra entity query");
  assert(shouldExpandMempalaceContext("which branch shipped rollout"), "Context expansion detects git/version/error entity query");
  assert(shouldExpandMempalaceContext("which bug blocked rollout"), "Context expansion detects bug-style work-item entity query");
  assert(shouldExpandMempalaceContext("what latency budget did rollout use"), "Context expansion detects metric query");
  assert(shouldExpandMempalaceContext("what playbook steps should we follow for rollout review"), "Context expansion detects procedure query");
  assert(shouldExpandMempalaceContext("what happened during the debug session"), "Context expansion detects event query");
  assert(shouldExpandMempalaceContext("what architecture pattern should we keep"), "Context expansion detects pattern query");
  assertEqual(inferMempalaceExpandProvenance("give me background around the security decision").join("+"), "background+around+decision", "Context expansion provenance keeps background trigger reasons");
  assertEqual(inferMempalaceExpandProvenance("exact related security decision").join("+"), "related", "Context expansion provenance keeps related trigger reasons under narrow exact mode");
  assertEqual(inferMempalaceExpandProvenance("why did we make the security decision").join("+"), "decision+reasoning", "Context expansion provenance keeps reasoning trigger reasons");
  assert(shouldBroadenMempalaceTraversal("give me the broader context around the security decision"), "Broader traversal detects wider-context query");
  assert(!shouldBroadenMempalaceTraversal("exact security decision"), "Broader traversal stays off for narrow exact query");
  assert(shouldBroadenMempalaceTraversal("explain the rationale for the security decision"), "Broader traversal detects rationale query");
  assert(shouldBroadenMempalaceTraversal("what changed about provider routing"), "Broader traversal detects comparison query");
  assert(shouldBroadenMempalaceTraversal("what did we learn about provider routing"), "Broader traversal detects discovery query");
  assert(shouldBroadenMempalaceTraversal("what error caused shell_exec failure"), "Broader traversal detects diagnostic query");
  assert(shouldBroadenMempalaceTraversal("which provider handled fallback"), "Broader traversal detects entity query");
  assert(shouldBroadenMempalaceTraversal("which image handled rollout"), "Broader traversal detects infra entity query");
  assert(shouldBroadenMempalaceTraversal("which bug blocked rollout"), "Broader traversal detects bug-style work-item entity query");
  assert(shouldBroadenMempalaceTraversal("which exit code failed rollout"), "Broader traversal detects git/version/error entity query");
  assert(shouldBroadenMempalaceTraversal("what latency budget did rollout use"), "Broader traversal detects metric query");
  assert(shouldBroadenMempalaceTraversal("what playbook steps should we follow for rollout review"), "Broader traversal detects procedure query");
  assert(shouldBroadenMempalaceTraversal("incident timeline for rollout"), "Broader traversal detects event query");
  assert(shouldBroadenMempalaceTraversal("what decision did we make about provider routing"), "Broader traversal detects decision query");
  assert(shouldBroadenMempalaceTraversal("what rule must we keep for operator approvals"), "Broader traversal detects constraint query");
  assert(shouldBroadenMempalaceTraversal("what should we do about operator approvals"), "Broader traversal detects advice query");
  assert(shouldBroadenMempalaceTraversal("what preference do we have about formatting"), "Broader traversal detects preference query");
  assert(shouldBroadenMempalaceTraversal("what should we avoid with shell_exec approvals"), "Broader traversal detects risk query");
  assert(shouldBroadenMempalaceTraversal("what runtime fact should we remember"), "Broader traversal detects fact query");
  assert(shouldBroadenMempalaceTraversal("what architecture pattern should we keep"), "Broader traversal detects pattern query");
  assertEqual(inferMempalaceBroadenProvenance("give me the broader context around the security decision").join("+"), "broader+decision", "Broader traversal provenance keeps broader trigger reasons");
  assertEqual(inferMempalaceBroadenProvenance("explain the rationale for the security decision").join("+"), "reasoning+decision", "Broader traversal provenance keeps reasoning trigger reasons");
  assertEqual(inferMempalaceBroadenProvenance("exact security decision").join("+"), "default", "Broader traversal provenance falls back to default when no broad trigger fires");
  assertEqual(
    inferMemorySectionPriority("prefer_derived").join(","),
    "derived,exact",
    "Memory section priority puts derived first for prefer-derived mode",
  );
  assertEqual(
    inferMemorySectionPriority("prefer_exact").join(","),
    "exact,derived",
    "Memory section priority keeps exact first for prefer-exact mode",
  );
  assertEqual(
    inferDerivedSectionPriority("what decision did we make").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for decision queries",
  );
  assertEqual(
    inferDerivedSectionPriority("summary recap please").join(","),
    "compact,structured",
    "Derived section priority keeps compact summaries first for recap queries",
  );
  assertEqual(inferCompactDerivedFocus("summary recap please"), "recap", "Compact derived focus detects recap queries");
  assertEqual(
    inferDerivedSectionPriority("why did we choose this").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for why queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what should we do next").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for advice queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what should we avoid with shell_exec approvals").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for risk queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what changed about provider routing").join(","),
    "compact,structured",
    "Derived section priority keeps compact summaries first for comparison queries",
  );
  assertEqual(inferCompactDerivedFocus("what changed about provider routing"), "delta", "Compact derived focus detects comparison queries");
  assertEqual(
    inferDerivedSectionPriority("what do we prefer for output style").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for preference queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what rule must we keep for operator approvals").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for constraint queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what did we learn about provider routing").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for discovery queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what error caused shell_exec failure").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for diagnostic queries",
  );
  assertEqual(
    inferDerivedSectionPriority("which provider handled fallback").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for entity queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what latency budget did rollout use").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for metric queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what playbook steps should we follow for rollout review").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for procedure queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what runtime fact should we remember").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for fact queries",
  );
  assertEqual(
    inferDerivedSectionPriority("what architecture pattern should we keep").join(","),
    "structured,compact",
    "Derived section priority lifts durable facts for pattern queries",
  );
  assertEqual(
    inferDerivedSectionPriorityProvenance("what architecture pattern should we keep").join("+"),
    "advice+pattern",
    "Derived section priority provenance keeps mixed pattern trigger reasons",
  );
  assertEqual(
    inferDerivedSectionPriority("what happened during the debug session").join(","),
    "compact,structured",
    "Derived section priority keeps compact summaries first for event queries",
  );
  assertEqual(inferCompactDerivedFocus("what happened during the debug session"), "timeline", "Compact derived focus detects event queries");
  assertEqual(
    inferDerivedSectionPriorityProvenance("what happened during the debug session").join("+"),
    "event",
    "Derived section priority provenance keeps event trigger reasons",
  );
  assertEqual(inferMemoryIntentTags("why did we decide this").join(","), "decision,reasoning", "Memory intent tags detect why-decision queries");
  assertEqual(inferMemoryIntentTags("what happened during the debug session").join(","), "event", "Memory intent tags detect event queries");
  assertEqual(inferMemoryIntentTags("what error caused shell_exec failure").join(","), "diagnostic", "Memory intent tags detect diagnostic queries");
  assertEqual(inferMemoryIntentTags("which provider handled fallback").join(","), "entity", "Memory intent tags detect entity queries");
  assert(inferMemoryIntentTags("which namespace stores runtime data").includes("entity"), "Memory intent tags detect infra entity queries");
  assert(inferMemoryIntentTags("which branch shipped rollout").includes("entity"), "Memory intent tags detect git/version/error entity queries");
  assert(inferMemoryIntentTags("which bug blocked rollout").includes("entity"), "Memory intent tags detect bug-style work-item entity queries");
  assertEqual(inferMemoryIntentTags("what latency budget did rollout use").join(","), "metric", "Memory intent tags detect metric queries");
  assertEqual(inferMemoryIntentTags("what playbook steps should we follow for rollout review").join(","), "advice,procedure", "Memory intent tags detect procedure queries without losing advice wording");
  assertEqual(inferMemoryIntentTags("what architecture pattern should we keep").join(","), "advice,pattern", "Memory intent tags detect pattern queries without leaking discovery");
  assertEqual(
    inferPalaceRecallPriority("why did we make the security decision").join(","),
    "broader,nearby,related,direct",
    "Palace ranking prioritizes broader context for why queries",
  );
  assertEqual(
    inferPalaceRecallPriorityProvenance("why did we make the security decision").join("+"),
    "reasoning",
    "Palace ranking provenance keeps reasoning trigger reasons",
  );
  assertEqual(
    inferPalaceRecallPriority("what decision did we make about operator approvals").join(","),
    "direct,nearby,broader,related",
    "Palace ranking keeps direct cave first for plain decision queries even when broader walk is enabled",
  );
  assertEqual(
    inferPalaceRecallPriority("what should we do about operator approvals").join(","),
    "direct,nearby,broader,related",
    "Palace ranking keeps direct cave first for plain advice queries even when broader walk is enabled",
  );
  assertEqual(
    inferPalaceRecallPriority("what playbook steps should we follow for rollout review").join(","),
    "direct,nearby,broader,related",
    "Palace ranking keeps direct cave first for plain procedure queries even when broader walk is enabled",
  );
  assertEqual(
    inferPalaceRecallPriority("what architecture pattern should we keep").join(","),
    "direct,nearby,broader,related",
    "Palace ranking keeps direct cave first for plain pattern queries even when broader walk is enabled",
  );
  const rankedTunnels = rankTunnelRooms("exact related decision about operator approvals in colony", [
    { room: "celebration", count: 4, halls: ["hall_events"], wings: ["colony", "security-playbook"] },
    { room: "security", count: 2, halls: ["hall_facts"], wings: ["colony", "security-playbook"] },
  ], "hall_facts");
  assertEqual(rankedTunnels[0]?.room, "security", "Tunnel ranking prefers hall/query-matching room over louder unrelated tunnel");
  assertEqual(
    inferPalaceRecallPriority("give me broader related context around the security decision").join(","),
    "broader,related,nearby,direct",
    "Palace ranking prioritizes broader and related caves for wide-context queries",
  );
  assertEqual(
    inferPalaceRecallPriorityProvenance("give me broader related context around the security decision").join("+"),
    "related+broader+context",
    "Palace ranking provenance keeps broader-related trigger reasons",
  );
  assertEqual(
    inferPalaceRecallPriority("exact security decision").join(","),
    "direct,nearby,broader,related",
    "Palace ranking keeps direct cave first for narrow exact queries",
  );
  assertEqual(
    inferPalaceRecallPriorityProvenance("exact security decision").join("+"),
    "default",
    "Palace ranking provenance falls back to default when no trigger fires",
  );
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 16 Verification (Hybrid Memory Truth + Compression)\n");

  await verifyArtifactStoreAndHybridRecall();
  await verifyMemoryServiceContextFormatting();
  await verifyStructuredExtractedMemoryRanking();
  await verifyMarkdownMemoryRanking();
  await verifyMemoryServiceMempalaceRecall();
  await verifyTruthModeInference();

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
