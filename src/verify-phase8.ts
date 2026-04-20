/**
 * Phase 8 Verification Script - Milestone 2 Core Safety
 *
 * Confirms conservative approval, compaction, tool-result externalization,
 * async tool safety, structured logging, and explicit deferred modules.
 *
 * Run: bun run src/verify-phase8.ts
 */

import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { LLMProvider, type CompletionParams } from "./llm/base";
import {
  createLLMResponse,
  type LLMChunk,
  type LLMMessage,
  type LLMResponse,
  type ModelInfo,
} from "./llm/models";
import { providerManager } from "./llm/provider-manager";
import {
  AgentLoop,
  type ToolResult,
} from "./runtime/loop";
import {
  ExactSessionApprovalPolicy,
  ToolApprovalService,
  buildApprovalRequest,
  createApprovalDecision,
} from "./runtime/approval";
import {
  CompactionEngine,
  ContextWindowTracker,
  estimateMicroCompactionOpportunity,
  formatCompactionResult,
  preserveRecentForCaste,
  recommendCompaction,
} from "./runtime/compaction";
import {
  ToolResultStorage,
  buildPersistedToolResultMessage,
  generateToolResultPreview,
} from "./runtime/tool-result-storage";
import { createMemoryLogger } from "./runtime/logger";
import { fileRead, grepSearch } from "./runtime/builtin-tools";
import { createAgentSession } from "./runtime/session";
import {
  createSystemMessage,
  createUserMessage,
  createAssistantMessage,
  createToolResult,
  serializeMessage,
  type SerializedMessage,
} from "./runtime/message";
import { Caste } from "./caste/enums";
import { DeferredSubsystemError, VanguardNode } from "./caste/nodes";
import { DeferredMemPalaceCompressorError, AAAKCompressor } from "./mempalace/compressor";
import { DeferredPheromoneRouterError, PheromoneRouter } from "./pheromones/router";
import { DeferredForagerError, ForagerAgent } from "./proactive/forager";

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

class Phase8Provider extends LLMProvider {
  mode: "tool" | "context_retry" = "tool";
  streamCalls = 0;

  constructor() {
    super("phase8_mock");
  }

  async complete(_messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    return createLLMResponse("ok", params?.model ?? "phase8-model", this.providerName, {
      usage: {
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  }

  async *stream(_messages: LLMMessage[], params?: CompletionParams): AsyncIterable<LLMChunk> {
    this.streamCalls++;
    const model = params?.model ?? "phase8-model";
    if (this.mode === "context_retry" && this.streamCalls === 1) {
      throw new Error("context length exceeded");
    }
    if (this.mode === "tool") {
      yield {
        delta: "",
        model,
        finishReason: "tool_calls",
        toolCalls: [{
          id: "call_phase8",
          type: "function",
          function: {
            name: "file_read",
            arguments: JSON.stringify({ path: "README.md" }),
          },
        }],
      };
      return;
    }
    yield { delta: "ok", model, finishReason: "stop" };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [{
      modelId: "phase8-model",
      provider: this.providerName,
      contextWindow: 4096,
      supportsStreaming: true,
      supportsEmbedding: false,
      supportsToolUse: true,
    }];
  }
}

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0
      ? createUserMessage(`User request ${i}: ${"context ".repeat(30)}`)
      : createAssistantMessage(`Assistant response ${i}: ${"details ".repeat(40)}`),
  );
}

async function verifyApprovals(): Promise<void> {
  section("1. Approval Service");

  const call = { id: "call1", name: "file_read", arguments: { path: "README.md" } };
  const request = buildApprovalRequest(call, {
    sessionId: "ses_test",
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
    category: "read",
  });
  assert(request.requestId.startsWith("apr_"), "Approval request ID");
  assertEqual(request.toolName, "file_read", "Approval request tool");
  assertEqual(request.riskLevel, "low", "file_read risk low");
  assert(request.reason.includes("Conservative mode"), "Approval request reason explains conservative approval policy");
  assert(request.details.includes("Arguments:"), "Approval request includes argument details");
  assert(request.signature.startsWith("file_read:"), "Approval request includes exact-call signature");

  const onceService = new ToolApprovalService({
    resolver: async (req) => createApprovalDecision(req.requestId, "once"),
  });
  const once = await onceService.evaluate(call, {
    sessionId: "ses_test",
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
    category: "read",
  });
  assert(once.approved, "Allow once approves");
  assertEqual(once.decision.scope, "once", "Allow once scope");

  const denyService = new ToolApprovalService({
    resolver: async (req) => createApprovalDecision(req.requestId, "deny", { reason: "no" }),
  });
  const denied = await denyService.evaluate(call, {
    sessionId: "ses_test",
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
    category: "read",
  });
  assert(!denied.approved, "Deny once rejects");
  assertEqual(denied.decision.scope, "deny", "Deny scope");

  const policy = new ExactSessionApprovalPolicy();
  let resolverCalls = 0;
  const sessionService = new ToolApprovalService({
    policy,
    resolver: async (req) => {
      resolverCalls++;
      return createApprovalDecision(req.requestId, "session");
    },
  });
  const first = await sessionService.evaluate(call, {
    sessionId: "ses_test",
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
    category: "read",
  });
  const second = await sessionService.evaluate(call, {
    sessionId: "ses_test",
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
    category: "read",
  });
  assert(first.approved && second.approved, "Session allow approves repeated exact call");
  assertEqual(resolverCalls, 1, "Session allow skips second prompt");
  assertEqual(policy.listRules().length, 1, "Session policy has one exact rule");
  policy.replaceRules(["tool:b", "tool:a"]);
  assertEqual(policy.listRules()[0], "tool:a", "Session policy can rehydrate exact rules");

  const shellDenied = await onceService.evaluate(
    { id: "call2", name: "shell_exec", arguments: { command: "echo hi" } },
    {
      sessionId: "ses_test",
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      category: "shell",
    },
  );
  assert(!shellDenied.approved, "Denied caste tool rejects before prompt");
  assert(shellDenied.deniedBeforePrompt, "Caste denial is before prompt");

  const cancel = createApprovalDecision("apr_cancel", "cancel");
  assert(!cancel.approved, "Cancel decision is not approved");
}

async function verifyNoExecutionBeforeApproval(): Promise<void> {
  section("2. AgentLoop Approval Gate");

  const provider = new Phase8Provider();
  provider.mode = "tool";
  providerManager.register("phase8_mock", provider);

  let approvalResolve: ((value: ReturnType<typeof createApprovalDecision>) => void) | null = null;
  let approvalSeen = false;
  let approvalEventSeen = false;
  let approvalEventBeforeResolver = false;
  let executed = false;
  let deniedToolOutput = "";

  const session = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  const loop = new AgentLoop({
    session,
    config: { model: "phase8-model", maxIterations: 1 },
    llmConfig: {
      defaults: { provider: "phase8_mock", model: "phase8-model" },
      providers: { phase8_mock: { defaultModel: "phase8-model" } },
      casteModels: {},
      failover: {},
    },
    toolSchemas: [{
      type: "function",
      function: {
        name: "file_read",
        description: "Read",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    }],
    toolCategories: new Map([["file_read", "read"]]),
    approvalHandler: async (request) => {
      approvalSeen = true;
      approvalEventBeforeResolver = approvalEventSeen;
      return await new Promise((resolve) => {
        approvalResolve = resolve;
      });
    },
    onUpdate: (event) => {
      if (event.type === "approval_request") {
        approvalEventSeen = true;
      }
    },
    toolExecutor: async (): Promise<ToolResult> => {
      executed = true;
      return { callId: "call_phase8", name: "file_read", output: "read", isError: false, durationMs: 1 };
    },
  });

  const run = (async () => {
    for await (const event of loop.runStreaming("read the file")) {
      if (event.type === "tool_result") {
        deniedToolOutput = event.output;
      }
    }
  })();

  await waitFor(() => approvalSeen);
  assert(approvalSeen, "Approval prompt reached");
  assert(approvalEventSeen, "Approval request event emitted");
  assert(approvalEventBeforeResolver, "Approval request event emits before resolver prompt state");
  assert(!executed, "Tool not executed before approval resolves");
  approvalResolve!(createApprovalDecision("apr_test", "deny", { reason: "test denial" }));
  await run;
  assert(!executed, "Denied tool never executes");
  assert(deniedToolOutput.includes("Reason: test denial"), "Denied tool result includes decision reason");
  assert(deniedToolOutput.includes("Signature: file_read:"), "Denied tool result includes exact signature");
  assert(deniedToolOutput.includes("Summary:"), "Denied tool result includes summary context");
}

async function verifyCompaction(): Promise<void> {
  section("3. Compaction and Context Tracking");

  const system = createSystemMessage("system prompt", 100);
  const messages: SerializedMessage[] = [system, ...makeMessages(24)].map(serializeMessage);

  const below = await new CompactionEngine({
    caste: Caste.ASSIST_ANT,
    triggerThreshold: 0.8,
  }).compact(messages, { currentUsageFraction: 0.20 });
  assert(!below.compacted, "Below threshold does not compact");
  assertEqual(below.triggerSource, "auto_threshold", "Below threshold keeps auto trigger source");
  assertEqual(below.preservedSystemCount, 1, "Below threshold still counts system messages");
  assertEqual(below.summarizedMessageCount, 0, "Below threshold summarizes nothing");
  assert(formatCompactionResult(below).includes("Compaction not needed"), "No-op compaction formats clearly");

  const standard = await new CompactionEngine({
    caste: Caste.ASSIST_ANT,
  }).compact(messages, { force: true, triggerSource: "manual" });
  assert(standard.compacted, "Standard compaction runs when forced");
  assertEqual(standard.messages[0].type, "system", "System message preserved first");
  assert(String(standard.messages[1].content).includes("Context Summary"), "Summary system message inserted");
  assertEqual(preserveRecentForCaste(Caste.ASSIST_ANT), 12, "Assist caste preserves 12 recent messages");
  assertEqual(standard.triggerSource, "manual", "Standard compaction records manual trigger");
  assertEqual(standard.preservedSystemCount, 1, "Standard compaction counts preserved system messages");
  assertEqual(standard.preservedRecentCount, 12, "Standard compaction preserves caste-aware recent count");
  assertEqual(
    standard.summarizedMessageCount,
    messages.filter((message) => message.type !== "system").length - standard.preservedRecentCount,
    "Standard compaction counts summarized messages",
  );
  assert(standard.summaryLineCount > 0, "Standard compaction records summary line count");
  assert(formatCompactionResult(standard).includes("manual request"), "Standard compaction format includes trigger");

  const reactive = await new CompactionEngine({
    caste: Caste.ASSIST_ANT,
  }).compact(messages, { strategy: "reactive", force: true, triggerSource: "reactive_overflow" });
  assert(reactive.compacted, "Reactive compaction runs");
  assert(reactive.finalCount < standard.finalCount, "Reactive preserves fewer messages than standard");
  assert(String(reactive.messages[1].content).includes("CONTEXT RECOVERY"), "Reactive summary marker inserted");
  assertEqual(reactive.triggerSource, "reactive_overflow", "Reactive compaction records overflow trigger");
  assertEqual(reactive.preservedRecentCount, 6, "Reactive compaction preserves smaller recent window");
  assert(reactive.summaryLineCount > 0, "Reactive compaction records summary lines");
  assert(formatCompactionResult(reactive).includes("reactive overflow recovery"), "Reactive format includes overflow trigger");

  const microMessages: SerializedMessage[] = [
    system,
    serializeMessage(createUserMessage("Need the stale tool output trimmed.")),
    serializeMessage(createToolResult("tool_1", "grep_search", "match\n".repeat(1600), false, 12)),
    serializeMessage(createAssistantMessage("Captured the first grep output.")),
    serializeMessage(createToolResult("tool_2", "file_read", "result line\n".repeat(1400), false, 14)),
    serializeMessage(createUserMessage("Keep the latest exchange untouched.")),
    serializeMessage(createAssistantMessage("Latest answer stays verbatim.")),
  ];
  const microOpportunity = estimateMicroCompactionOpportunity(microMessages, {
    caste: Caste.ASSIST_ANT,
    preserveRecent: 2,
    maxChars: 1200,
  });
  assertEqual(microOpportunity.candidateCount, 2, "Micro opportunity counts older large tool results");
  assert(microOpportunity.tokensSavedEstimate > 0, "Micro opportunity estimates token savings");

  const micro = await new CompactionEngine({
    caste: Caste.ASSIST_ANT,
    preserveRecent: 2,
    microResultChars: 1200,
  }).compact(microMessages, { strategy: "micro", force: true, triggerSource: "manual" });
  assert(micro.compacted, "Micro compaction runs");
  assertEqual(micro.strategyUsed, "micro", "Micro compaction records strategy");
  assertEqual(micro.finalCount, microMessages.length, "Micro compaction preserves transcript shape");
  assertEqual(micro.summarizedMessageCount, 2, "Micro compaction counts trimmed tool results");
  assert(String(micro.messages[2]?.content ?? "").includes("trimmed by micro compaction"), "Micro compaction trims older tool result content in place");
  assert(formatCompactionResult(micro).includes("Trimmed 2 older tool results"), "Micro format explains trimmed tool results");

  const smartQueued = recommendCompaction({
    pendingStrategy: "standard",
    contextUsage: {
      usedTokens: 90_000,
      maxTokens: 100_000,
      remainingTokens: 10_000,
      percentUsed: 90,
      messageCount: microMessages.length,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: true,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
    history: microMessages,
    messageCount: microMessages.length,
    caste: Caste.ASSIST_ANT,
  });
  assertEqual(smartQueued.strategy, null, "Smart compaction helper holds when a strategy is already queued");
  assert(smartQueued.reason.includes("already queued"), "Smart compaction helper explains queued hold");

  const smartMicro = recommendCompaction({
    contextUsage: {
      usedTokens: 148_000,
      maxTokens: 200_000,
      remainingTokens: 52_000,
      percentUsed: 74,
      messageCount: microMessages.length,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
    history: microMessages,
    messageCount: microMessages.length,
    caste: Caste.ASSIST_ANT,
  });
  assertEqual(smartMicro.strategy, "micro", "Smart compaction helper recommends micro for stale large tool output");
  assert(smartMicro.reason.includes("older tool results"), "Smart compaction helper explains micro recommendation");
  assertEqual(smartMicro.microCandidateCount, 2, "Smart compaction helper carries micro candidate count");

  const smartReactive = recommendCompaction({
    contextUsage: {
      usedTokens: 198_000,
      maxTokens: 200_000,
      remainingTokens: 2_000,
      percentUsed: 99,
      messageCount: messages.length,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: true,
      isAtBlockingLimit: true,
      compactionFailureCount: 0,
    },
    history: messages,
    messageCount: messages.length,
    caste: Caste.ASSIST_ANT,
  });
  assertEqual(smartReactive.strategy, "reactive", "Smart compaction helper escalates to reactive when context blocks");

  const tracker = new ContextWindowTracker({ maxTokens: 100 });
  const snapshot = tracker.snapshot(messages);
  assert(snapshot.usedTokens > 0, "Context tracker counts tokens");
  assert(snapshot.percentUsed > 0, "Context tracker reports utilization");
}

async function verifyReactiveRetry(): Promise<void> {
  section("4. Reactive Retry");

  const provider = new Phase8Provider();
  provider.mode = "context_retry";
  providerManager.register("phase8_mock_retry", provider);

  const session = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  const loop = new AgentLoop({
    session,
    config: { model: "phase8-model", maxIterations: 1 },
    llmConfig: {
      defaults: { provider: "phase8_mock_retry", model: "phase8-model" },
      providers: { phase8_mock_retry: { defaultModel: "phase8-model" } },
      casteModels: {},
      failover: {},
    },
  });

  const events: string[] = [];
  for await (const event of loop.runStreaming("hello")) {
    events.push(event.type);
  }

  assertEqual(provider.streamCalls, 2, "Context-length failure retries once");
  assert(events.includes("compaction"), "Reactive compaction event emitted");
  assert(events.includes("delta"), "Retry streams final response");
}

async function verifyToolResultStorage(): Promise<void> {
  section("5. Tool Result Storage");

  const dir = await mkdtemp(join(tmpdir(), "colony-phase8-"));
  try {
    const storage = new ToolResultStorage({
      sessionId: "ses_phase8",
      dataDir: dir,
      thresholdChars: 10_000,
      previewChars: 2_000,
    });

    const small = await storage.externalizeIfNeeded("grep_search", "small", "short output");
    assertEqual(small.persisted, null, "Small result stays inline");
    assertEqual(small.content, "short output", "Small result content unchanged");

    const largeText = `${"line\n".repeat(3_000)}tail`;
    const large = await storage.externalizeIfNeeded("grep_search", "large", largeText);
    assert(large.persisted !== null, "Large result persisted");
    assert(large.content.includes("<persisted-output>"), "Reference message inserted");
    assert(large.content.length < largeText.length, "React-facing output is smaller");
    assert(large.persisted!.filepath.includes("ses_phase8"), "Stable session path used");

    const reread = await storage.read("large");
    assertEqual(reread, largeText, "Persisted result can be read back");

    const secretLargeText = `Authorization: Bearer ${"A".repeat(30)}\n${"secret line\n".repeat(1500)}`;
    const secretLarge = await storage.externalizeIfNeeded("grep_search", "secret", secretLargeText);
    const secretReread = await storage.read("secret");
    assert(secretLarge.persisted !== null, "Secret-bearing large result persisted");
    assert(secretLarge.content.includes("redacted before persistence"), "Persisted-output message notes redaction");
    assert(secretReread !== null && !secretReread.includes(`Bearer ${"A".repeat(30)}`), "Persisted large result redacts secrets before disk");

    const preview = generateToolResultPreview("a\n".repeat(3_000), 100);
    assert(preview.hasMore, "Preview marks truncation");
    assert(buildPersistedToolResultMessage(large.persisted!).includes(large.persisted!.filepath), "Reference includes filepath");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyExternalizedToolResultEvent(): Promise<void> {
  section("5b. Externalized Tool Result Event");

  const dir = await mkdtemp(join(tmpdir(), "colony-phase8-event-"));
  const provider = new Phase8Provider();
  provider.mode = "tool";
  providerManager.register("phase8_mock_externalized", provider);

  try {
    const session = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
    const loop = new AgentLoop({
      session,
      config: { model: "phase8-model", maxIterations: 1 },
      llmConfig: {
        defaults: { provider: "phase8_mock_externalized", model: "phase8-model" },
        providers: { phase8_mock_externalized: { defaultModel: "phase8-model" } },
        casteModels: {},
        failover: {},
      },
      toolSchemas: [{
        type: "function",
        function: {
          name: "file_read",
          description: "Read",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
      }],
      toolCategories: new Map([["file_read", "read"]]),
      approvalHandler: async (request) => createApprovalDecision(request.requestId, "once"),
      toolExecutor: async (): Promise<ToolResult> => ({
        callId: "call_phase8",
        name: "file_read",
        output: "line\n".repeat(160),
        isError: false,
        durationMs: 8,
      }),
      toolResultStorage: new ToolResultStorage({
        sessionId: session.sessionId,
        dataDir: dir,
        thresholdChars: 120,
        previewChars: 80,
      }),
    });

    let toolEvent: { output: string; externalized?: { filepath: string; preview: string; hasMore: boolean } | null } | null = null;
    for await (const event of loop.runStreaming("read the file")) {
      if (event.type === "tool_result") {
        toolEvent = event;
      }
    }

    assert(toolEvent !== null, "Streaming emits tool_result event");
    assert(Boolean(toolEvent?.output.includes("<persisted-output>")), "Streaming tool_result keeps persisted-output marker");
    assert(Boolean(toolEvent?.externalized != null), "Streaming tool_result includes structured persisted metadata");
    assert(Boolean(toolEvent?.externalized?.filepath.includes(session.sessionId)), "Persisted metadata carries session-scoped filepath");
    assertEqual(Boolean(toolEvent?.externalized?.hasMore), true, "Persisted metadata reports truncated preview");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyAsyncBuiltins(): Promise<void> {
  section("6. Async Built-in Tools");

  const temp = await mkdtemp(join(tmpdir(), "colony-tools-"));
  try {
    const filePath = join(temp, "sample.txt");
    await writeFile(filePath, "alpha\nbeta\n", "utf-8");
    const read = await fileRead({ path: filePath });
    assert(read.includes("alpha"), "Async file_read returns content");
    const grep = await grepSearch({ pattern: "beta", path: temp });
    assert(grep.includes("sample.txt"), "Async grep_search returns match");

    const source = await Bun.file(join(process.cwd(), "src", "runtime", "builtin-tools.ts")).text();
    for (const forbidden of ["readFileSync", "writeFileSync", "readdirSync", "statSync", "existsSync", "mkdirSync"]) {
      assert(!source.includes(forbidden), `No blocking ${forbidden}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function verifyLoggingAndDeferred(): Promise<void> {
  section("7. Logging and Deferred Modules");

  const { logger, lines } = createMemoryLogger();
  logger.info("llm_failure", {
    sessionId: "ses_log",
    api_key: "sk-ant-abcdefghijklmnopqrstuvwxyz",
  });
  assertEqual(lines.length, 1, "Structured logger emits one line");
  assert(lines[0].includes("\"event\":\"llm_failure\""), "Structured log includes event");
  assert(!lines[0].includes("sk-ant-abcdefghijklmnopqrstuvwxyz"), "Structured log sanitizes secrets");

  let eliteDeferred = false;
  try {
    await new VanguardNode().execute("plan");
  } catch (e) {
    eliteDeferred = e instanceof DeferredSubsystemError;
  }
  assert(eliteDeferred, "Elite nodes are explicit deferred modules");

  let compressorDeferred = false;
  try {
    new AAAKCompressor().compress("Context");
  } catch (e) {
    compressorDeferred = e instanceof DeferredMemPalaceCompressorError;
  }
  assert(compressorDeferred, "MemPalace compressor is deferred");

  let routerDeferred = false;
  try {
    await new PheromoneRouter().routeQuery("hello", "scout");
  } catch (e) {
    routerDeferred = e instanceof DeferredPheromoneRouterError;
  }
  assert(routerDeferred, "Pheromone router is deferred");

  let foragerDeferred = false;
  try {
    new ForagerAgent().startWatching(() => undefined);
  } catch (e) {
    foragerDeferred = e instanceof DeferredForagerError;
  }
  assert(foragerDeferred, "Forager has no runtime side effects");
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 2_000) {
      throw new Error("Timed out waiting for predicate");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 8 Verification (Core Safety)\n");

  await verifyApprovals();
  await verifyNoExecutionBeforeApproval();
  await verifyCompaction();
  await verifyReactiveRetry();
  await verifyToolResultStorage();
  await verifyExternalizedToolResultEvent();
  await verifyAsyncBuiltins();
  await verifyLoggingAndDeferred();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 8 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 8: Core Safety is GREEN.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
