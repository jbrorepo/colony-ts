/**
 * Phase 9 Verification Script - Phase 8 Voice Foundations
 *
 * Covers structured slash commands, Gemini provider normalization,
 * per-caste prompt templates, workspace detection, token-bucket rate
 * limiting, and effort resolution.
 *
 * Run: bun run src/verify-phase9.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { Caste, MethodCaste, listMethodCastes } from "./caste/enums";
import { LLMProvider, type CompletionParams } from "./llm/base";
import { LLMRateLimitError } from "./llm/exceptions";
import { EffortLevel, EffortResolver, modelSupportsEffort, modelSupportsMaxEffort } from "./llm/effort-resolver";
import { FailoverExecutor } from "./llm/failover-executor";
import { GeminiProvider } from "./llm/providers/gemini";
import { TokenBucketRateLimiter } from "./llm/rate-limiter";
import {
  createLLMResponse,
  type LLMChunk,
  type LLMMessage,
  type LLMResponse,
  type ModelInfo,
} from "./llm/models";
import { PromptBuilder } from "./runtime/prompt-builder";
import { PromptAssembler } from "./runtime/prompt-assembler";
import { createUserMessageQueue } from "./runtime/message-queue";
import { buildRuntimeContextSnapshot } from "./runtime/runtime-snapshot";
import { buildRuntimeTooling } from "./runtime/runtime-tooling";
import {
  getCastePromptTemplate,
  listCastePromptTemplates,
} from "./runtime/prompt-templates";
import { createAgentSession } from "./runtime/session";
import { createSystemMessage, createUserMessage, serializeMessage } from "./runtime/message";
import { detectWorkspace } from "./runtime/workspace";
import {
  formatStartupBlockMessage,
  formatStartupPlaceholder,
  formatStartupReport,
  runStartupDiagnostics,
  startupDoctorFocusCommand,
  startupDoctorInspectCommands,
} from "./runtime/startup-diagnostics";
import { SlashCommandParser } from "./gateway";

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

class CountingProvider extends LLMProvider {
  calls = 0;

  constructor() {
    super("counting");
  }

  async complete(_messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    this.calls++;
    return createLLMResponse("ok", params?.model ?? "model", this.providerName);
  }

  async *stream(_messages: LLMMessage[], params?: CompletionParams): AsyncIterable<LLMChunk> {
    this.calls++;
    yield { delta: "ok", model: params?.model ?? "model", finishReason: "stop" };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

async function withMockFetch<T>(
  handler: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response> | Response,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

async function verifySlashCommands(): Promise<void> {
  section("1. SlashCommandParser");

  const session = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  session.history.push(
    serializeMessage(createSystemMessage("system", 100)),
    serializeMessage(createUserMessage("hello")),
  );

  const parser = new SlashCommandParser({
    session,
    costTracker: {
      formatSummary: () => "mock cost summary",
      totalInputTokens: 10,
      totalOutputTokens: 5,
    },
    contextUsage: {
      usedTokens: 500,
      maxTokens: 1000,
      percentUsed: 50,
      compactionFailureCount: 0,
    },
    permissions: {
      caste: Caste.ASSIST_ANT,
      allowed: ["file_read"],
      denied: ["shell_exec"],
      active: ["file_read"],
    },
  });

  assert(parser.availableCommands.length >= 10, "Parser exposes at least 10 commands");
  assert(!parser.tryHandle("hello").handled, "Free text is unhandled");

  const swarm = parser.tryHandle('/swarm "hello world"');
  assertEqual(swarm.command, "swarm", "Quoted /swarm resolves");
  assertEqual(swarm.data.objective, "hello world", "Quoted swarm objective preserved");

  const status = parser.tryHandle("/status");
  assert(status.output.includes(session.sessionId), "Status includes session ID");
  assertEqual(status.data.messageCount, 2, "Status returns structured message count");

  const unknown = parser.tryHandle("/unknown");
  assert(unknown.handled && unknown.isError, "Unknown slash command is handled error");

  const clear = parser.tryHandle("/clear");
  assert(!clear.isError, "Clear command succeeds");
  assertEqual(session.history.length, 1, "Clear preserves only system message");

  parser.register("echo", (args) => ({
    handled: true,
    command: "echo",
    output: args.join("|"),
    data: { args },
    isError: false,
  }));
  assertEqual(parser.tryHandle("/echo a b").output, "a|b", "Custom command dispatches");
}

async function verifyGeminiProvider(): Promise<void> {
  section("2. GeminiProvider");

  let missingKey = false;
  try {
    new GeminiProvider({ apiKey: "" });
  } catch {
    missingKey = true;
  }
  assert(missingKey, "Gemini requires API key");

  const provider = new GeminiProvider({ apiKey: "test-key", defaultModel: "gemini-2.5-flash" });
  const models = provider.listModels();
  assert(models.some((model) => model.modelId === "gemini-2.5-pro"), "Gemini lists 2.5 Pro");
  assert(models.some((model) => model.supportsToolUse), "Gemini model metadata includes tool use");

  let capturedBody: Record<string, unknown> = {};
  await withMockFetch(async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [
            { text: "hello" },
            { functionCall: { name: "file_read", args: { path: "README.md" } } },
          ],
        },
        finishReason: "STOP",
      }],
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 3,
        totalTokenCount: 15,
      },
    }), { status: 200 });
  }, async () => {
    const response = await provider.complete(
      [
        { role: "system", content: "system prompt" },
        { role: "user", content: "hello" },
      ],
      {
        tools: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read file",
            parameters: { type: "object" },
          },
        }],
      },
    );
    assertEqual(response.content, "hello", "Gemini complete extracts text");
    assertEqual(response.finishReason, "tool_calls", "Gemini function call maps to tool_calls");
    assertEqual(response.usage.totalTokens, 15, "Gemini usage normalized");
    const rawCalls = (response.rawResponse?.tool_calls ?? []) as Record<string, unknown>[];
    assertEqual(rawCalls.length, 1, "Gemini tool call normalized");
  });

  const systemInstruction = capturedBody.systemInstruction as Record<string, unknown>;
  const contents = capturedBody.contents as Record<string, unknown>[];
  const tools = capturedBody.tools as Record<string, unknown>[];
  assert(JSON.stringify(systemInstruction).includes("system prompt"), "Gemini body separates system instruction");
  assertEqual(contents[0].role, "user", "Gemini body maps user role");
  assert(JSON.stringify(tools).includes("functionDeclarations"), "Gemini body maps tools");

  await withMockFetch(async () => {
    const encoder = new TextEncoder();
    return new Response(encoder.encode(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}]}\n\n',
    ), { status: 200 });
  }, async () => {
    const chunks: LLMChunk[] = [];
    for await (const chunk of provider.stream([{ role: "user", content: "hello" }])) {
      chunks.push(chunk);
    }
    assertEqual(chunks.map((chunk) => chunk.delta).join(""), "Hello", "Gemini stream parses SSE text");
    assertEqual(chunks.at(-1)?.finishReason, "stop", "Gemini stream maps finish reason");
  });

  await withMockFetch(async () => new Response("too many", { status: 429 }), async () => {
    let rateLimited = false;
    try {
      await provider.complete([{ role: "user", content: "hello" }]);
    } catch (e) {
      rateLimited = e instanceof LLMRateLimitError;
    }
    assert(rateLimited, "Gemini 429 maps to LLMRateLimitError");
  });
}

async function verifyPromptTemplates(): Promise<void> {
  section("3. Prompt Templates");

  assertEqual(listCastePromptTemplates().length, listMethodCastes().length, "Every method caste has a template");
  assert(getCastePromptTemplate(Caste.FORGE_CARVERS).delegationPrompt.includes("Develop-ant"), "Develop-ant template available through Forge compatibility");
  assert(getCastePromptTemplate(MethodCaste.COMMAND_ANT).delegationPrompt.includes("Command-ant"), "Command-ant template available");

  const prompt = PromptBuilder.buildSystemPrompt({
    caste: Caste.SHIELD_GENERALS,
    toolNames: ["file_read"],
  });
  assert(prompt.includes("## Identity: Vigil-ant"), "Prompt builder uses method identity registry");
  assert(prompt.includes("skeptical"), "Prompt preserves supplementary caste personality");
  assert(prompt.includes("concrete exploit paths"), "Prompt includes caste guideline");
}

async function verifyPromptRuntimeContext(): Promise<void> {
  section("3b. Prompt Runtime Context");

  const assembler = new PromptAssembler({
    caste: Caste.ASSIST_ANT,
    contextWindowTokens: 4096,
    responseReserveTokens: 256,
  });

  const result = assembler.assemble({
    taskContext: "Continue the current operator-approved task.",
    workspaceContext: {
      root: "D:/The Colony Test/colony-ts",
      startDir: "D:/The Colony Test/colony-ts/src/ui",
      name: "colony-ts",
      detected: true,
      reason: "marker:package.json",
      markers: ["package.json", "tsconfig.json"],
      projectType: "bun",
      packageManager: "bun",
      workspaceMode: "single-package",
      workspaceGlobs: ["apps/*", "packages/*"],
      workspacePackageCount: 3,
      workspaceAppCount: 1,
      workspaceLibraryCount: 2,
      workspaceOtherCount: 0,
      workspaceAppPackages: ["console"],
      workspaceLibraryPackages: ["runtime-core", "ui-shell"],
      workspaceOtherPackages: [],
      workspaceDevCandidates: ["console: bun --filter console run dev"],
      workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
      workspaceIntent: "terminal-app",
      workspacePrimaryTargets: ["colony-ts"],
      scriptNames: ["dev", "start", "build", "verify:all"],
      devCommand: "bun run --watch src/index.tsx",
      verifyCommand: "bun run verify:all",
      stackHints: ["bun", "react", "ink", "typescript", "zustand"],
    },
    runtimeContext: {
      provider: "local",
      model: "llama3.2",
      selectedProvider: "anthropic",
      selectedModel: "claude-sonnet-4-5",
      memoryTruthModeOverride: "prefer_derived",
      recentToolActivity: [
        {
          toolName: "file_read",
          status: "pending approval",
          detail: "low/read | Read file README.md",
        },
      ],
      recentHookEvents: [
        { kind: "PostToolUse", detail: "file_read", timestamp: 1, durationMs: 14 },
      ],
      sessionRuleCount: 2,
      sessionRules: ["file_read:abc1234567890def", "web_search:def4567890abc123"],
      pendingApproval: true,
      pendingApprovalToolName: "file_read",
      pendingApprovalRiskLevel: "low",
      pendingApprovalCategory: "read",
      pendingApprovalSummary: "Read file README.md",
      pendingApprovalSignature: "file_read:abc1234567890def",
      pendingApprovalReason: "Conservative mode requires human approval for every tool call.",
      pendingApprovalWarningCount: 1,
      pendingCompactionStrategy: "standard",
      lastCompactionStrategy: "reactive",
      lastCompactionSavedTokens: 180,
    },
    agentId: "assist-ant",
  });

  const systemPrompt = String(result.messages[0]?.content ?? "");
  assert(systemPrompt.includes("Workspace:"), "Assembled prompt includes workspace section");
  assert(systemPrompt.includes("Mode: single-package"), "Assembled prompt includes workspace mode");
  assert(systemPrompt.includes("Intent: terminal-app"), "Assembled prompt includes workspace intent");
  assert(systemPrompt.includes("Primary targets: colony-ts"), "Assembled prompt includes workspace primary targets");
  assert(systemPrompt.includes("Stack: bun, react, ink, typescript, zustand"), "Assembled prompt includes workspace stack hints");
  assert(systemPrompt.includes("Workspace apps: console"), "Assembled prompt includes workspace app package names");
  assert(systemPrompt.includes("Workspace libraries: runtime-core, ui-shell"), "Assembled prompt includes workspace library package names");
  assert(systemPrompt.includes("Workspace dev candidates: console: bun --filter console run dev"), "Assembled prompt includes workspace dev candidate commands");
  assert(systemPrompt.includes("Workspace verify candidates: runtime-core: bun --filter runtime-core run verify:all"), "Assembled prompt includes workspace verify candidate commands");
  assert(systemPrompt.includes("Scripts: dev, start, build, verify:all"), "Assembled prompt includes workspace scripts");
  assert(systemPrompt.includes("Dev command: bun run --watch src/index.tsx"), "Assembled prompt includes workspace dev command");
  assert(systemPrompt.includes("Verify command: bun run verify:all"), "Assembled prompt includes workspace verify command");
  assert(systemPrompt.includes("Runtime state:"), "Assembled prompt includes runtime section");
  assert(systemPrompt.includes("Next run LLM: anthropic:claude-sonnet-4-5"), "Assembled prompt includes selected next-run llm");
  assert(systemPrompt.includes("Memory recall mode: prefer-derived"), "Assembled prompt includes memory recall mode");
  assert(systemPrompt.includes("Recent tools: 1"), "Assembled prompt includes recent tool count");
  assert(systemPrompt.includes("file_read | pending approval | low/read | Read file README.md"), "Assembled prompt includes recent tool summary");
  assert(systemPrompt.includes("Recent hooks: 1"), "Assembled prompt includes recent hook count");
  assert(systemPrompt.includes("PostToolUse | file_read | 14ms"), "Assembled prompt includes recent hook summary");
  assert(systemPrompt.includes("Pending approval: yes"), "Assembled prompt includes pending approval flag");
  assert(systemPrompt.includes("Pending approval tool: file_read"), "Assembled prompt includes pending approval tool");
  assert(systemPrompt.includes("Pending approval detail: risk:low | category:read"), "Assembled prompt includes pending approval detail");
  assert(systemPrompt.includes("Pending approval summary: Read file README.md"), "Assembled prompt includes pending approval summary");
  assert(systemPrompt.includes("Pending approval signature: file_read:abc1234567890def"), "Assembled prompt includes pending approval signature");
  assert(systemPrompt.includes("Pending approval reason: Conservative mode requires human approval for every tool call."), "Assembled prompt includes pending approval reason");
  assert(systemPrompt.includes("Pending approval warnings: 1"), "Assembled prompt includes pending approval warnings");
  assert(systemPrompt.includes("Exact-signature session rules: 2"), "Assembled prompt includes exact-signature session rule count");
  assert(systemPrompt.includes("Exact-signature rule list:"), "Assembled prompt includes exact-signature rule list header");
  assert(systemPrompt.includes("file_read:abc1234567890def"), "Assembled prompt includes first exact-signature rule");
  assert(systemPrompt.includes("web_search:def4567890abc123"), "Assembled prompt includes second exact-signature rule");
  assert(systemPrompt.includes("Queued compaction: standard"), "Assembled prompt includes queued compaction state");
  assert(systemPrompt.includes("Last compaction: reactive (saved ~180 tokens"), "Assembled prompt keeps last compaction summary");

  const hookSource = await readFile(new URL("./ui/use-colony-loop.ts", import.meta.url), "utf-8");
  assert(
    hookSource.includes("selectedProvider:"),
    "Loop prompt context forwards selected provider detail",
  );
  assert(
    hookSource.includes("selectedModel:"),
    "Loop prompt context forwards selected model detail",
  );
  assert(
    hookSource.includes("recentToolActivity: summarizePromptToolActivity(store.messages, 3)"),
    "Loop prompt context forwards recent tool activity",
  );
  assert(
    hookSource.includes("recentHookEvents: store.recentHookEvents.map((event) => ({ ...event }))"),
    "Loop prompt context forwards recent hook events",
  );
  assert(
    hookSource.includes("memoryTruthModeOverride: store.memoryTruthModeOverride"),
    "Loop prompt context forwards memory recall override",
  );
  assert(
    hookSource.includes("pendingCompactionStrategy: store.pendingCompactionStrategy"),
    "Loop prompt context forwards queued compaction state",
  );
  assert(
    hookSource.includes("queuedPromptCount: store.queuedPromptCount"),
    "Loop prompt context forwards queued prompt count",
  );
  assert(
    hookSource.includes("queuedPromptPreview: store.queuedPromptPreview"),
    "Loop prompt context forwards queued prompt preview",
  );
  assert(
    hookSource.includes("interruptRequested: store.interruptRequested"),
    "Loop prompt context forwards stopping-run state",
  );
  assert(
    hookSource.includes("pendingApprovalToolName: store.pendingApproval?.toolName"),
    "Loop prompt context forwards pending approval tool detail",
  );
  assert(
    hookSource.includes("pendingApprovalSignature: store.pendingApproval?.signature"),
    "Loop prompt context forwards pending approval signature",
  );
  assert(
    hookSource.includes("sessionRules: [...store.sessionAllowRules]"),
    "Loop prompt context forwards exact-signature rule list",
  );
}

async function verifySharedRuntimeSnapshotContract(): Promise<void> {
  section("3c. Shared Runtime Snapshot Contract");

  const snapshot = buildRuntimeContextSnapshot({
    provider: "local",
    model: "llama3.2",
    selectedProvider: "anthropic",
    selectedModel: "claude-sonnet-4-5",
    queuedPromptCount: 1,
    queuedPromptPreview: "queued follow-up prompt",
    availableProviders: ["local", "anthropic"],
    failover: { local: ["anthropic"] },
    providerHealth: { local: { state: "open", failureCount: 3 } },
    recentFailovers: [{
      fromProvider: "local",
      toProvider: "anthropic",
      errorType: "LLMConnectionError",
      errorMessage: "connect refused",
      timestamp: 1,
    }],
    recentToolActivity: [{
      toolName: "file_read",
      status: "saved artifact",
      detail: "12,244 chars",
      artifactPath: "D:/The Colony Test/.colony/tool-results/ses_abc/artifact-1.txt",
    }],
    recentHookEvents: [{
      kind: "PostToolUse",
      detail: "file_read",
      timestamp: 2,
      durationMs: 14,
    }],
    activeToolIds: ["file_read"],
    permittedToolIds: ["file_read"],
    sessionRules: ["file_read:abc123"],
  });

  snapshot.availableProviders?.push("gemini");
  snapshot.failover?.local?.push("openai");
  if (snapshot.providerHealth?.local) snapshot.providerHealth.local.failureCount = 9;
  if (snapshot.recentFailovers?.[0]) snapshot.recentFailovers[0].toProvider = "openai";
  if (snapshot.recentToolActivity?.[0]) snapshot.recentToolActivity[0].status = "pending approval";
  if (snapshot.recentHookEvents?.[0]) snapshot.recentHookEvents[0].detail = "shell_exec";
  snapshot.activeToolIds?.push("shell_exec");
  snapshot.permittedToolIds?.push("web_search");
  snapshot.sessionRules?.push("web_search:def456");

  const fresh = buildRuntimeContextSnapshot({
    provider: "local",
    model: "llama3.2",
    selectedProvider: "anthropic",
    selectedModel: "claude-sonnet-4-5",
    queuedPromptCount: 1,
    queuedPromptPreview: "queued follow-up prompt",
    availableProviders: ["local", "anthropic"],
    failover: { local: ["anthropic"] },
    providerHealth: { local: { state: "open", failureCount: 3 } },
    recentFailovers: [{
      fromProvider: "local",
      toProvider: "anthropic",
      errorType: "LLMConnectionError",
      errorMessage: "connect refused",
      timestamp: 1,
    }],
    recentToolActivity: [{
      toolName: "file_read",
      status: "saved artifact",
      detail: "12,244 chars",
      artifactPath: "D:/The Colony Test/.colony/tool-results/ses_abc/artifact-1.txt",
    }],
    recentHookEvents: [{
      kind: "PostToolUse",
      detail: "file_read",
      timestamp: 2,
      durationMs: 14,
    }],
    activeToolIds: ["file_read"],
    permittedToolIds: ["file_read"],
    sessionRules: ["file_read:abc123"],
  });

  assertEqual(fresh.availableProviders?.join(","), "local,anthropic", "Runtime snapshot clones provider arrays");
  assertEqual(fresh.failover?.local?.join(","), "anthropic", "Runtime snapshot clones failover chains");
  assertEqual(fresh.providerHealth?.local?.failureCount, 3, "Runtime snapshot clones provider-health rows");
  assertEqual(fresh.recentFailovers?.[0]?.toProvider, "anthropic", "Runtime snapshot clones failover rows");
  assertEqual(fresh.recentToolActivity?.[0]?.status, "saved artifact", "Runtime snapshot clones tool activity");
  assertEqual(fresh.recentHookEvents?.[0]?.detail, "file_read", "Runtime snapshot clones hook activity");
  assertEqual(fresh.activeToolIds?.join(","), "file_read", "Runtime snapshot clones active tool ids");
  assertEqual(fresh.permittedToolIds?.join(","), "file_read", "Runtime snapshot clones permitted tool ids");
  assertEqual(fresh.sessionRules?.join(","), "file_read:abc123", "Runtime snapshot clones exact-signature rules");
  assertEqual(fresh.queuedPromptCount ?? 0, 1, "Runtime snapshot keeps queued prompt count");
  assertEqual(fresh.queuedPromptPreview ?? "", "queued follow-up prompt", "Runtime snapshot keeps queued prompt preview");

  const queue = createUserMessageQueue();
  assert(queue.enqueue("fix bug").accepted, "Queued prompt helper accepts first prompt");
  const replace = queue.enqueue("write tests");
  assertEqual(replace.replaced, true, "Queued prompt helper supersedes older prompt");
  assertEqual(queue.peek()?.content ?? "", "write tests", "Queued prompt helper exposes latest prompt");
  assertEqual(queue.enqueue("write tests").duplicate, true, "Queued prompt helper dedups identical prompt");
}

async function verifyWorkspaceDetection(): Promise<void> {
  section("4. Workspace Detection");

  const dir = await mkdtemp(join(tmpdir(), "colony-workspace-"));
  const nested = join(dir, "src", "deep");
  try {
    await mkdir(nested, { recursive: true });
    await writeFile(join(dir, "package.json"), JSON.stringify({
      name: "workspace-test",
      scripts: {
        dev: "bun run src/index.tsx",
        build: "bun build ./src/index.tsx --compile --outfile colony",
        "verify:all": "bun run verify:all",
      },
      dependencies: {
        react: "^18.2.0",
        ink: "^4.4.1",
        zustand: "^5.0.12",
      },
      devDependencies: {
        typescript: "^5.2.2",
      },
    }), "utf-8");
    await writeFile(join(dir, "tsconfig.json"), "{}", "utf-8");
    await writeFile(join(dir, "bun.lockb"), "", "utf-8");

    const info = await detectWorkspace({ startDir: nested });
    assert(info.detected, "Workspace marker detected");
    assertEqual(info.root, dir, "Workspace root found by walking up");
    assertEqual(info.name, "workspace-test", "Workspace package name read");
    assertEqual(info.packageManager, "bun", "Workspace package manager detected");
    assertEqual(info.projectType, "bun", "Workspace project type detected");
    assertEqual(info.workspaceMode, "single-package", "Workspace mode defaults to single-package");
    assertEqual(info.workspaceIntent, "terminal-app", "Workspace intent detects terminal app");
    assertEqual(info.workspacePrimaryTargets.join(", "), "workspace-test", "Workspace primary target defaults to package name");
    assertEqual(info.devCommand, "bun run src/index.tsx", "Workspace dev command detected from package scripts");
    assertEqual(info.verifyCommand, "bun run verify:all", "Workspace verify command detected from package scripts");
    assert(info.scriptNames.includes("dev"), "Workspace script list includes dev");
    assert(info.scriptNames.includes("verify:all"), "Workspace script list includes verify:all");
    assert(info.stackHints.includes("bun"), "Workspace stack hints include Bun");
    assert(info.stackHints.includes("react"), "Workspace stack hints include React");
    assert(info.stackHints.includes("ink"), "Workspace stack hints include Ink");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const noMarker = await mkdtemp(join(tmpdir(), "colony-no-workspace-"));
  try {
    const nested = join(noMarker, "child");
    await mkdir(nested, { recursive: true });
    const info = await detectWorkspace({ startDir: nested, markers: ["missing.marker"] });
    assert(!info.detected, "Missing markers return undetected workspace");
    assertEqual(info.root, nested, "Undetected workspace uses start dir");
  } finally {
    await rm(noMarker, { recursive: true, force: true });
  }

  const monorepo = await mkdtemp(join(tmpdir(), "colony-monorepo-workspace-"));
  try {
    const appDir = join(monorepo, "apps", "web");
    const packageDir = join(monorepo, "packages", "core");
    await mkdir(appDir, { recursive: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(monorepo, "package.json"), JSON.stringify({
      name: "workspace-monorepo",
      packageManager: "bun@1.3.10",
      workspaces: ["apps/*", "packages/*"],
    }), "utf-8");
    await writeFile(join(monorepo, "bun.lockb"), "", "utf-8");
    await writeFile(join(appDir, "package.json"), JSON.stringify({ name: "web-console", scripts: { dev: "bun run dev" } }), "utf-8");
    await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "core-lib", scripts: { "verify:all": "bun run verify:all" } }), "utf-8");

    const info = await detectWorkspace({ startDir: appDir });
    assertEqual(info.workspaceMode, "monorepo", "Workspace mode detects monorepo");
    assertEqual(info.workspacePackageCount, 2, "Workspace counts total workspace packages");
    assertEqual(info.workspaceAppCount, 1, "Workspace counts app packages");
    assertEqual(info.workspaceLibraryCount, 1, "Workspace counts library packages");
    assertEqual(info.workspaceOtherCount, 0, "Workspace counts other packages");
    assertEqual(info.workspaceAppPackages.join(", "), "web-console", "Workspace captures app package names");
    assertEqual(info.workspaceLibraryPackages.join(", "), "core-lib", "Workspace captures library package names");
    assertEqual(info.workspaceDevCandidates.join(", "), "web-console: bun --filter web-console run dev", "Workspace captures app dev candidate commands");
    assertEqual(info.workspaceVerifyCandidates.join(", "), "core-lib: bun --filter core-lib run verify:all", "Workspace captures verify candidate commands");
    assertEqual(info.workspaceGlobs.join(", "), "apps/*, packages/*", "Workspace preserves configured workspace globs");
    assertEqual(info.workspaceIntent, "app-monorepo", "Workspace intent detects app monorepo");
    assertEqual(info.workspacePrimaryTargets.join(", "), "web-console", "Workspace primary targets prefer app packages");
  } finally {
    await rm(monorepo, { recursive: true, force: true });
  }
}

async function verifyWorkspaceToolingBoundary(): Promise<void> {
  section("4b. Workspace Tooling Boundary");

  const workspaceRoot = await mkdtemp(join(tmpdir(), "colony-tool-workspace-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "colony-tool-outside-"));
  try {
    const insideFile = join(workspaceRoot, "inside.txt");
    const outsideFile = join(outsideRoot, "outside.txt");
    await writeFile(insideFile, "inside workspace", "utf-8");
    await writeFile(outsideFile, "outside workspace", "utf-8");

    const workspaceTools = buildRuntimeTooling("assist-ant", Caste.ASSIST_ANT, workspaceRoot);
    const insideRead = await workspaceTools.executor.execute("file_read", { path: insideFile });
    assertEqual(insideRead.output, "inside workspace", "Workspace-bound tooling can read inside files");

    const outsideRead = await workspaceTools.executor.execute("file_read", { path: outsideFile });
    assert(outsideRead.output.includes("Path validation failed"), "Workspace-bound tooling blocks outside files");

    const reboundTools = buildRuntimeTooling("assist-ant", Caste.ASSIST_ANT, outsideRoot);
    const reboundRead = await reboundTools.executor.execute("file_read", { path: outsideFile });
    assertEqual(reboundRead.output, "outside workspace", "Rebuilt tooling follows the detected workspace root");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
}

async function verifyGatewaySnapshotBuilders(): Promise<void> {
  section("5. Gateway Snapshot Builders");

  const gatewaySource = await readFile(new URL("./gateway.ts", import.meta.url), "utf-8");
  const doctorSnapshotSource = await readFile(new URL("./gateway-doctor-snapshot.ts", import.meta.url), "utf-8");
  const providerSnapshotSource = await readFile(new URL("./gateway-provider-snapshot.ts", import.meta.url), "utf-8");
  const statusSnapshotSource = await readFile(new URL("./gateway-status-snapshot.ts", import.meta.url), "utf-8");
  const eventsSnapshotSource = await readFile(new URL("./gateway-events-snapshot.ts", import.meta.url), "utf-8");
  const sessionSnapshotSource = await readFile(new URL("./gateway-session-snapshot.ts", import.meta.url), "utf-8");
  const sessionGatewaySource = await readFile(new URL("./gateway-session.ts", import.meta.url), "utf-8");
  const providerSource = await readFile(new URL("./gateway-provider.ts", import.meta.url), "utf-8");
  const gatewayContractSource = await readFile(new URL("./gateway-contract.ts", import.meta.url), "utf-8");
  const runtimeSnapshotSource = await readFile(new URL("./runtime/runtime-snapshot.ts", import.meta.url), "utf-8");
  const promptAssemblerSource = await readFile(new URL("./runtime/prompt-assembler.ts", import.meta.url), "utf-8");
  const sessionRecoverySource = await readFile(new URL("./runtime/session-recovery.ts", import.meta.url), "utf-8");
  const loopBridgeSource = await readFile(new URL("./ui/use-colony-loop.ts", import.meta.url), "utf-8");
  const storeSource = await readFile(new URL("./ui/store.ts", import.meta.url), "utf-8");
  const componentsSource = await readFile(new URL("./ui/components.tsx", import.meta.url), "utf-8");

  assert(
    gatewaySource.includes('from "./gateway-doctor-snapshot"'),
    "Gateway imports doctor snapshot builder",
  );
  assert(
    gatewaySource.includes("const snapshot = buildGatewayDoctorSnapshot(args, ctx);"),
    "Gateway builds doctor snapshot before payload render",
  );
  assert(
    gatewaySource.includes("const snapshot = buildGatewayProviderSnapshot(ctx);"),
    "Gateway builds provider snapshot before payload render",
  );
  assert(
    gatewaySource.includes('from "./gateway-status-snapshot"'),
    "Gateway imports status snapshot builder",
  );
  assert(
    statusSnapshotSource.includes('from "./runtime/startup-diagnostics"'),
    "Status snapshot module imports shared startup doctor helpers",
  );
  assert(
    gatewaySource.includes("const snapshot = buildGatewayStatusSnapshot(ctx);"),
    "Gateway builds status snapshot before payload render",
  );
  assert(
    gatewaySource.includes('from "./gateway-events-snapshot"'),
    "Gateway imports event snapshot builders",
  );
  assert(
    gatewaySource.includes("const snapshot = buildGatewayEventsSnapshot(ctx);"),
    "Gateway builds events snapshot before payload render",
  );
  assert(
    gatewaySource.includes("const snapshot = buildGatewayPerfSnapshot(ctx);"),
    "Gateway builds perf snapshot before payload render",
  );
  assert(
    gatewaySource.includes('from "./gateway-session-snapshot"'),
    "Gateway imports current-session snapshot builder",
  );
  assert(
    gatewaySource.includes("const currentSession = buildGatewayCurrentSessionSnapshot(ctx.session, sessions);"),
    "Gateway builds current-session snapshot before session payload routing",
  );
  assert(
    doctorSnapshotSource.includes("export function buildGatewayDoctorSnapshot"),
    "Doctor snapshot module owns doctor snapshot assembly",
  );
  assert(
    doctorSnapshotSource.includes("const providerDiagnosticsLines = doctorProviderDiagnosticsLines"),
    "Doctor snapshot module owns provider diagnostics assembly",
  );
  assert(
    providerSnapshotSource.includes("export function buildGatewayProviderSnapshot"),
    "Provider snapshot module owns provider command snapshot assembly",
  );
  assert(
    statusSnapshotSource.includes("export function buildGatewayStatusSnapshot"),
    "Status snapshot module owns status snapshot assembly",
  );
  assert(
    statusSnapshotSource.includes("renderStatusRuntimeSection"),
    "Status snapshot module owns runtime status section assembly",
  );
  assert(
    statusSnapshotSource.includes("startupDoctorInspectCommands(ctx.startupReport"),
    "Status snapshot module uses shared startup doctor inspect helper",
  );
  assert(
    eventsSnapshotSource.includes("export function buildGatewayEventsSnapshot"),
    "Events snapshot module owns events snapshot assembly",
  );
  assert(
    eventsSnapshotSource.includes("export function buildGatewayPerfSnapshot"),
    "Events snapshot module owns perf snapshot assembly",
  );
  assert(
    sessionSnapshotSource.includes("export function buildGatewayCurrentSessionSnapshot"),
    "Session snapshot module owns current-session alias assembly",
  );
  assert(
    sessionSnapshotSource.includes("currentHistoryAliases: currentSessionShortcutAliases"),
    "Session snapshot module owns current-session shortcut alias assembly",
  );
  assert(
    sessionGatewaySource.includes('from "./runtime/session-shortcuts"'),
    "Gateway session helpers import shared session-shortcut contract",
  );
  assert(
    sessionGatewaySource.includes("buildGatewayLiveSessionShortcutSnapshot"),
    "Gateway session helpers build a shared live-session shortcut snapshot",
  );
  assert(
    sessionGatewaySource.includes("return buildLiveCurrentHistoryHint("),
    "Gateway current-session history commands delegate to shared history-hint builder",
  );
  assert(
    sessionGatewaySource.includes("currentOwnsLatestHistoryAlias"),
    "Gateway latest-current detection delegates through shared session-shortcut truth",
  );
  assert(
    providerSource.includes("const perf = providerPerfSummaries(opts.costTracker, runtime);"),
    "Provider payload builder owns provider perf helper usage locally",
  );
  assert(
    !providerSource.includes("opts.providerPerfSummaries"),
    "Provider payload builder no longer depends on injected perf helper",
  );
  assert(
    runtimeSnapshotSource.includes("export interface RuntimeContextSnapshot"),
    "Runtime snapshot module owns the shared runtime context contract",
  );
  assert(
    runtimeSnapshotSource.includes("memoryTruthModeOverride?: MemoryTruthMode | null;"),
    "Runtime snapshot contract includes memory recall override",
  );
  assert(
    runtimeSnapshotSource.includes("export function buildRuntimeContextSnapshot"),
    "Runtime snapshot module exports the shared runtime snapshot builder",
  );
  assert(
    promptAssemblerSource.includes('from "./runtime-snapshot"'),
    "Prompt assembler imports the shared runtime snapshot contract",
  );
  assert(
    promptAssemblerSource.includes("export type PromptRuntimeContext = RuntimeContextSnapshot;"),
    "Prompt assembler aliases runtime context to the shared runtime snapshot contract",
  );
  assert(
    sessionRecoverySource.includes('from "./runtime-snapshot"'),
    "Session recovery imports the shared runtime snapshot contract",
  );
  assert(
    sessionRecoverySource.includes("export type SessionUsageSnapshot = RuntimeSessionUsageSnapshot;"),
    "Session recovery aliases usage snapshot to the shared runtime snapshot contract",
  );
  assert(
    sessionRecoverySource.includes("memoryTruthModeOverride: MemoryTruthMode | null;"),
    "Session recovery persists memory recall override",
  );
  assert(
    gatewayContractSource.includes('from "./runtime/runtime-snapshot"'),
    "Gateway contract imports the shared runtime snapshot contract",
  );
  assert(
    gatewayContractSource.includes("runtime?: Partial<RuntimeContextSnapshot> | null;"),
    "Gateway contract exposes runtime data through the shared runtime snapshot contract",
  );
  assert(
    loopBridgeSource.includes("runtime: buildRuntimeContextSnapshot({"),
    "Loop bridge builds prompt runtime data through the shared runtime snapshot builder",
  );
  assert(
    loopBridgeSource.includes("memoryTruthModeOverride: store.memoryTruthModeOverride"),
    "Loop bridge forwards memory recall override into runtime snapshot",
  );
  assert(
    storeSource.includes('from "../runtime/runtime-snapshot"'),
    "UI store imports the shared runtime snapshot contract",
  );
  assert(
    storeSource.includes("export function samePersistedSessionSummaries("),
    "UI store exports persisted-session equality helper for long-session stability",
  );
  assert(
    storeSource.includes("if (samePersistedSessionSummaries(state.persistedSessions, sessions)) {"),
    "UI store skips identical persisted-session catalog writes",
  );
  assert(
    storeSource.includes('export type ProviderHealthSummary = RuntimeProviderHealthSnapshot;'),
    "UI store aliases provider-health view data to the shared runtime snapshot contract",
  );
  assert(
    storeSource.includes("export type RuntimeStatusSummary =")
      && storeSource.includes('circuitState?: CircuitState;'),
    "UI store derives runtime status view data from the shared runtime snapshot contract",
  );
  assert(
    componentsSource.includes('from "../runtime/runtime-snapshot"'),
    "UI components import the shared runtime snapshot contract",
  );
  assert(
    storeSource.includes("export function sameProviderDiagnostics("),
    "UI store exports provider-diagnostic equality helper for long-session stability",
  );
  assert(
    storeSource.includes("export function sameContextWindowSnapshot("),
    "UI store exports context-window equality helper for long-session stability",
  );
  assert(
    storeSource.includes("export function sameStartupReport(")
      && storeSource.includes("export function sameWorkspaceInfo(")
      && storeSource.includes("export function sameCompactionResult(")
      && storeSource.includes("export function sameCompactionFailure(")
      && storeSource.includes("export function sameCompactionHandoff("),
    "UI store exports report/workspace/compaction equality helpers for long-session stability",
  );
  assert(
    storeSource.includes("if (")
      && storeSource.includes("sameProviderDiagnostics(")
      && storeSource.includes("state.providerHealth,")
      && storeSource.includes("state.recentFailovers,"),
    "UI store skips identical provider-diagnostic writes",
  );
  assert(
    storeSource.includes("if (sameStringArray(state.sessionAllowRules, normalized)) {"),
    "UI store skips identical exact-signature rule writes",
  );
  assert(
    storeSource.includes("sameContextWindowSnapshot(state.contextUsage, snapshot)")
      && storeSource.includes("state.tokensUsed === nextTokensUsed")
      && storeSource.includes("state.maxTokens === nextMaxTokens"),
    "UI store skips identical context-usage writes",
  );
  assert(
    storeSource.includes("sameWorkspaceInfo(state.workspaceInfo, info)")
      && storeSource.includes("sameStartupReport(state.startupReport, report)")
      && storeSource.includes("sameCompactionResult(state.lastCompaction, result)")
      && storeSource.includes("sameCompactionFailure(state.lastCompactionFailure, failure)")
      && storeSource.includes("sameCompactionHandoff(state.latestCompactionHandoff, handoff)")
      && storeSource.includes("state.lastError === error ? {} : { lastError: error }"),
    "UI store skips identical workspace, startup, compaction, handoff, and error writes",
  );
  assert(
    storeSource.includes("setRuntimeStatus: (status) => set((state) => {")
      && storeSource.includes("const changed: Partial<RuntimeStatusSummary> = {};"),
    "UI store diffs runtime-status patches before writing",
  );
  assert(
    storeSource.includes("setUsage: (usage) => set((state) => {")
      && storeSource.includes("const changed: Partial<Pick<ColonyViewState, \"tokensUsed\" | \"costUsd\" | \"callCount\" | \"deniedCount\">> = {};"),
    "UI store diffs usage patches before writing",
  );
  assert(
    storeSource.includes("setThinkingState: (isThinking, thinkingPhase = \"\") => set((state) => {")
      && storeSource.includes("state.isThinking === isThinking && state.thinkingPhase === thinkingPhase"),
    "UI store diffs thinking-state patches before writing",
  );
  assert(
    loopBridgeSource.includes("if (samePersistedSessionSummaries(persistedSessionsRef.current, sessions)) {"),
    "Loop bridge skips persisted-session refresh churn when catalog is unchanged",
  );
  assert(
    loopBridgeSource.includes("currentStore.setThinkingState(true, statusLabel(event));"),
    "Loop bridge uses guarded thinking-state setter during streaming status events",
  );
  assert(
    loopBridgeSource.includes("if (")
      && loopBridgeSource.includes("!sameProviderDiagnostics(")
      && loopBridgeSource.includes("providerHealthRef.current,")
      && loopBridgeSource.includes("failoverEventsRef.current,")
      && loopBridgeSource.includes("currentStore.setProviderDiagnostics(providerHealth, recentFailovers);"),
    "Loop bridge skips unchanged provider diagnostics while preserving runtime-status updates",
  );
  assert(
    componentsSource.includes("providerHealth?: Record<string, RuntimeProviderHealthSnapshot>;"),
    "Budget widget props use shared provider-health snapshot types",
  );
  assert(
    componentsSource.includes("recentFailovers?: RuntimeFailoverSnapshot[];"),
    "Budget widget props use shared failover snapshot types",
  );
}

async function verifyStartupDiagnostics(): Promise<void> {
  section("5. Startup Diagnostics");

  const workspace = {
    root: process.cwd(),
    startDir: process.cwd(),
    detected: true,
    reason: "marker:package.json",
    markers: ["package.json"],
    projectType: "bun" as const,
    packageManager: "bun" as const,
    name: "colony-ts",
    workspaceMode: "single-package" as const,
    workspaceGlobs: ["apps/*", "packages/*"],
    workspacePackageCount: 3,
    workspaceAppCount: 1,
    workspaceLibraryCount: 2,
    workspaceOtherCount: 0,
    workspaceAppPackages: ["console"],
    workspaceLibraryPackages: ["runtime-core", "ui-shell"],
    workspaceOtherPackages: [],
    workspaceDevCandidates: ["console: bun --filter console run dev"],
    workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
    workspaceIntent: "terminal-app",
    workspacePrimaryTargets: ["colony-ts"],
    scriptNames: ["dev", "start", "build", "verify:all"],
    devCommand: "bun run --watch src/index.tsx",
    verifyCommand: "bun run verify:all",
    stackHints: ["bun", "react", "ink", "typescript", "zustand"],
  };

  const localOk = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "local", model: "llama3.2" },
      providers: {
        local: { defaultModel: "llama3.2" },
        anthropic: { defaultModel: "claude-sonnet-4-5", apiKey: "test-key" },
      },
      casteModels: {},
      failover: { local: ["anthropic"] },
    },
    workspace,
    dataDir: join(tmpdir(), "colony-startup-test"),
    stdinIsTTY: true,
    stdinSupportsRawMode: true,
    stdoutColumns: 140,
    port: null,
    fetchImpl: async () => new Response(JSON.stringify({
      models: [{ name: "llama3.2:latest" }],
    }), { status: 200 }),
  });

  assert(localOk.passed, "Diagnostics pass when workspace, data dir, and local model are healthy");
  assert(localOk.checks.some((check) => check.name === "Ollama server" && check.passed), "Diagnostics include healthy Ollama check");
  assert(localOk.checks.some((check) => check.name === "Terminal TTY" && check.passed), "Diagnostics include healthy TTY check");
  assert(localOk.checks.some((check) => check.name === "Cloud fallback" && check.passed), "Diagnostics include cloud fallback availability");
  assert(localOk.checks.some((check) => check.name === "Anthropic credentials" && check.passed), "Diagnostics include ready cloud credentials");
  assert(localOk.checks.some((check) => check.name === "Permissions: sessions" && check.passed), "Diagnostics include writable session directory");
  assert(localOk.checks.some((check) => check.name === "Workspace dev command" && check.passed), "Diagnostics include detected workspace dev command");
  assert(localOk.checks.some((check) => check.name === "Workspace verify command" && check.passed), "Diagnostics include detected workspace verify command");

  const localMissing = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "local", model: "llama3.2" },
      providers: {
        local: { defaultModel: "llama3.2" },
      },
      casteModels: {},
      failover: {},
    },
    workspace: { ...workspace, detected: false, reason: "no_workspace_marker" },
    dataDir: join(tmpdir(), "colony-startup-test-2"),
    stdinIsTTY: true,
    stdinSupportsRawMode: true,
    stdoutColumns: 140,
    port: null,
    fetchImpl: async () => { throw new Error("connect refused"); },
  });

  assert(!localMissing.passed, "Diagnostics fail when only local provider is down");
  assert(localMissing.warningCount > 0 || localMissing.errorCount > 0, "Diagnostics count startup problems");
  assert(localMissing.checks.some((check) => check.name === "Cloud fallback" && !check.passed), "Diagnostics mark cloud fallback unavailable when no ready cloud provider");
  const reportText = formatStartupReport(localMissing);
  assert(reportText.includes("Startup checks"), "Formatted startup report has summary");
  assert(reportText.includes("Ollama server"), "Formatted startup report includes failing check");
  assertEqual(startupDoctorFocusCommand(localMissing), "/doctor local", "Startup focus helper targets local runtime failures");
  assertEqual(
    startupDoctorInspectCommands(localMissing).join(" | "),
    "/doctor | /doctor local | /doctor errors | /doctor warnings | /doctor first-run",
    "Startup inspect helper includes focused doctor commands",
  );
  assertEqual(
    formatStartupPlaceholder(localMissing),
    "Startup blocked: Ollama server | /doctor local | /doctor first-run",
    "Startup placeholder uses focused doctor commands",
  );
  assertEqual(
    formatStartupBlockMessage(localMissing),
    "Startup blocked: Ollama server - Cannot connect to http://localhost:11434: Error: connect refused\nFix: Install/start Ollama or configure cloud fallback.\nInspect: /doctor | /doctor local | /doctor errors | /doctor warnings | /doctor first-run",
    "Startup block message uses focused doctor commands",
  );

  const anthropicDefault = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "anthropic", model: "claude-sonnet-4-5" },
      providers: {
        anthropic: { defaultModel: "claude-sonnet-4-5", apiKey: "test-key" },
        local: { defaultModel: "llama3.2" },
      },
      casteModels: {},
      failover: { anthropic: ["local"] },
    },
    workspace,
    dataDir: join(tmpdir(), "colony-startup-test-3"),
    stdinIsTTY: true,
    stdinSupportsRawMode: true,
    stdoutColumns: 140,
    port: null,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/v1/models")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        models: [{ name: "llama3.2:latest" }],
      }), { status: 200 });
    },
  });

  assert(anthropicDefault.checks.some((check) => check.name === "Anthropic connectivity" && check.passed), "Default cloud provider connectivity is checked");

  const missingCloudKey = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "anthropic", model: "claude-sonnet-4-5" },
      providers: {
        anthropic: { defaultModel: "claude-sonnet-4-5" },
      },
      casteModels: {},
      failover: {},
    },
    workspace,
    dataDir: join(tmpdir(), "colony-startup-test-4"),
    stdinIsTTY: true,
    stdinSupportsRawMode: true,
    stdoutColumns: 140,
    port: null,
    fetchImpl: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
  });

  assert(!missingCloudKey.passed, "Diagnostics fail when default cloud provider has no key");
  assert(missingCloudKey.checks.some((check) => check.name === "Anthropic credentials" && !check.passed && check.severity === "error"), "Missing default cloud credential is an error");

  const missingWorkspaceCommands = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "local", model: "llama3.2" },
      providers: {
        local: { defaultModel: "llama3.2" },
      },
      casteModels: {},
      failover: {},
    },
    workspace: {
      ...workspace,
      scriptNames: ["build"],
      devCommand: null,
      verifyCommand: null,
    },
    dataDir: join(tmpdir(), "colony-startup-test-5"),
    stdinIsTTY: true,
    stdinSupportsRawMode: true,
    stdoutColumns: 140,
    port: null,
    fetchImpl: async () => new Response(JSON.stringify({
      models: [{ name: "llama3.2:latest" }],
    }), { status: 200 }),
  });

  assert(missingWorkspaceCommands.warningCount >= 2, "Diagnostics warn when workspace has no dev or verify command");
  assert(
    missingWorkspaceCommands.checks.some((check) =>
      check.name === "Workspace dev command"
      && !check.passed
      && String(check.fix).includes("dev/start script"),
    ),
    "Diagnostics explain missing workspace dev command",
  );
  assert(
    missingWorkspaceCommands.checks.some((check) =>
      check.name === "Workspace verify command"
      && !check.passed
      && String(check.fix).includes("verify/test script"),
    ),
    "Diagnostics explain missing workspace verify command",
  );

  const missingTty = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "local", model: "llama3.2" },
      providers: {
        local: { defaultModel: "llama3.2" },
      },
      casteModels: {},
      failover: {},
    },
    workspace,
    dataDir: join(tmpdir(), "colony-startup-test-tty"),
    stdinIsTTY: false,
    stdinSupportsRawMode: false,
    stdoutColumns: 0,
    port: null,
    fetchImpl: async () => new Response(JSON.stringify({
      models: [{ name: "llama3.2:latest" }],
    }), { status: 200 }),
  });

  assert(!missingTty.passed, "Diagnostics fail when no interactive terminal is present");
  assert(
    missingTty.checks.some((check) =>
      check.name === "Terminal TTY"
      && !check.passed
      && check.severity === "error",
    ),
    "Missing TTY is a startup error",
  );
  assert(
    missingTty.checks.some((check) =>
      check.name === "Terminal TTY"
      && String(check.fix).includes("interactive terminal"),
    ),
    "TTY diagnostics explain how to recover interactive terminal access",
  );

  const missingRawMode = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "local", model: "llama3.2" },
      providers: {
        local: { defaultModel: "llama3.2" },
      },
      casteModels: {},
      failover: {},
    },
    workspace,
    dataDir: join(tmpdir(), "colony-startup-test-raw-mode"),
    stdinIsTTY: true,
    stdinSupportsRawMode: false,
    stdoutColumns: 140,
    port: null,
    fetchImpl: async () => new Response(JSON.stringify({
      models: [{ name: "llama3.2:latest" }],
    }), { status: 200 }),
  });

  assert(
    missingRawMode.checks.some((check) =>
      check.name === "Terminal raw mode"
      && !check.passed
      && check.severity === "warning",
    ),
    "Missing raw mode is a startup warning",
  );
  assert(
    missingRawMode.checks.some((check) =>
      check.name === "Terminal raw mode"
      && check.message.includes("Ctrl/Page hotkeys"),
    ),
    "Raw-mode diagnostics explain keyboard shortcut fallout",
  );
  assert(
    missingRawMode.checks.some((check) =>
      check.name === "Terminal raw mode"
      && String(check.fix).includes("raw keyboard input"),
    ),
    "Raw-mode diagnostics explain how to recover keyboard shortcut support",
  );

  const narrowViewport = await runStartupDiagnostics({
    llmConfig: {
      defaults: { provider: "local", model: "llama3.2" },
      providers: {
        local: { defaultModel: "llama3.2" },
      },
      casteModels: {},
      failover: {},
    },
    workspace,
    dataDir: join(tmpdir(), "colony-startup-test-viewport"),
    stdinIsTTY: true,
    stdinSupportsRawMode: true,
    stdoutColumns: 72,
    port: null,
    fetchImpl: async () => new Response(JSON.stringify({
      models: [{ name: "llama3.2:latest" }],
    }), { status: 200 }),
  });

  assert(
    narrowViewport.checks.some((check) =>
      check.name === "Terminal viewport"
      && !check.passed
      && check.severity === "warning",
    ),
    "Narrow viewport is a startup warning",
  );
  assert(
    narrowViewport.checks.some((check) =>
      check.name === "Terminal viewport"
      && check.message.includes("72 columns"),
    ),
    "Viewport diagnostics include observed terminal width",
  );
  assert(
    narrowViewport.checks.some((check) =>
      check.name === "Terminal viewport"
      && String(check.fix).includes("100+ columns"),
    ),
    "Viewport diagnostics explain how to recover readable side-panel layout",
  );

  const originalWslDistro = process.env.WSL_DISTRO_NAME;
  const originalWslInterop = process.env.WSL_INTEROP;
  try {
    process.env.WSL_DISTRO_NAME = "Ubuntu";
    delete process.env.WSL_INTEROP;

    const wslLoopbackMissing = await runStartupDiagnostics({
      llmConfig: {
        defaults: { provider: "local", model: "llama3.2" },
        providers: {
          local: {
            defaultModel: "llama3.2",
            apiBase: "http://localhost:11434",
          },
          anthropic: { defaultModel: "claude-sonnet-4-5", apiKey: "test-key" },
        },
        casteModels: {},
        failover: { local: ["anthropic"] },
      },
      workspace,
      dataDir: join(tmpdir(), "colony-startup-test-wsl"),
      stdinIsTTY: true,
      stdinSupportsRawMode: true,
      stdoutColumns: 140,
      port: null,
      fetchImpl: async () => { throw new Error("connect refused"); },
    });

    assert(
      wslLoopbackMissing.checks.some((check) =>
        check.name === "WSL local-provider boundary"
        && !check.passed
        && check.message.includes("Windows-host Ollama")
        && String(check.fix).includes("COLONY_OLLAMA_BASE_URL"),
      ),
      "Diagnostics explain WSL loopback boundaries for local Ollama failures",
    );
  } finally {
    if (originalWslDistro === undefined) {
      delete process.env.WSL_DISTRO_NAME;
    } else {
      process.env.WSL_DISTRO_NAME = originalWslDistro;
    }
    if (originalWslInterop === undefined) {
      delete process.env.WSL_INTEROP;
    } else {
      process.env.WSL_INTEROP = originalWslInterop;
    }
  }
}

async function verifyRateLimiter(): Promise<void> {
  section("6. Token Bucket Rate Limiter");

  let now = 0;
  const limiter = new TokenBucketRateLimiter({ nowMs: () => now, defaultCapacity: 2, defaultRefillRatePerSecond: 1 });

  assert(limiter.tryConsume("gemini", 1).allowed, "First token allowed");
  assert(limiter.tryConsume("gemini", 1).allowed, "Second token allowed");
  const denied = limiter.tryConsume("gemini", 1);
  assert(!denied.allowed, "Empty bucket denies");
  assertEqual(denied.waitMs, 1000, "Wait time calculated from deficit");

  now += 1000;
  assert(limiter.tryConsume("gemini", 1).allowed, "Bucket refills over time");
  assert(limiter.tryConsume("anthropic", 2).allowed, "Buckets are isolated per key");

  const immediate = await limiter.waitForAvailability("gemini", 2, { maxWaitMs: 0 });
  assert(!immediate.allowed, "waitForAvailability respects max wait");

  const provider = new CountingProvider();
  const executorKey = "gemini:gemini-2.5-flash";
  limiter.configure(executorKey, { capacity: 1, refillRatePerSecond: 0 });
  limiter.tryConsume(executorKey, 1);
  const executor = new FailoverExecutor(
    () => provider,
    { rateLimiter: limiter, maxRateLimitWaitMs: 0, maxRetriesPerProvider: 0 },
  );

  let blocked = false;
  try {
    await executor.complete(
      [{ providerName: "gemini", modelId: "gemini-2.5-flash", source: "test" }],
      [{ role: "user", content: "hello" }],
    );
  } catch {
    blocked = true;
  }
  assert(blocked, "FailoverExecutor blocks locally rate-limited calls");
  assertEqual(provider.calls, 0, "Provider not called when local limiter denies");
}

async function verifyEffortResolver(): Promise<void> {
  section("7. Effort Resolver");

  const resolver = new EffortResolver();
  assertEqual(
    resolver.resolve({ caste: Caste.ASSIST_ANT, modelId: "claude-sonnet-4-5" }),
    EffortLevel.HIGH,
    "Assist Ant defaults high",
  );
  assertEqual(
    resolver.resolve({ caste: Caste.LIAISON_ANTS, modelId: "claude-sonnet-4-5" }),
    EffortLevel.LOW,
    "Liaison Ant defaults low",
  );

  resolver.setAgentEffort("agent-1", EffortLevel.MAX);
  assertEqual(
    resolver.resolve({ agentId: "agent-1", caste: Caste.ASSIST_ANT, modelId: "gemini-2.5-pro" }),
    EffortLevel.HIGH,
    "Max effort downgraded for unsupported max model",
  );
  assertEqual(
    resolver.resolve({ agentId: "agent-1", modelId: "claude-opus-4-6" }),
    EffortLevel.MAX,
    "Max effort retained for Opus 4.6",
  );

  const oldEnv = process.env.COLONY_EFFORT_LEVEL;
  try {
    process.env.COLONY_EFFORT_LEVEL = "low";
    assertEqual(
      resolver.resolve({ agentId: "agent-1", caste: Caste.ROOT_QUEEN, modelId: "claude-opus-4-6" }),
      EffortLevel.LOW,
      "Environment override wins",
    );
  } finally {
    if (oldEnv == null) delete process.env.COLONY_EFFORT_LEVEL;
    else process.env.COLONY_EFFORT_LEVEL = oldEnv;
  }

  assert(modelSupportsEffort("gemini-2.5-flash-latest"), "Gemini effort support detected by prefix");
  assert(modelSupportsMaxEffort("claude-opus-4-6"), "Max effort support detected");
  assertEqual(
    resolver.toApiParams(EffortLevel.HIGH, "claude-sonnet-4-5").thinking != null,
    true,
    "Anthropic effort maps to thinking budget",
  );
  assertEqual(
    resolver.toApiParams(EffortLevel.MEDIUM, "llama3.2").num_predict,
    2048,
    "Ollama effort maps to num_predict",
  );
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 9 Verification (The Voice Foundations)\n");

  await verifySlashCommands();
  await verifyGeminiProvider();
  await verifyPromptTemplates();
  await verifyPromptRuntimeContext();
  await verifySharedRuntimeSnapshotContract();
  await verifyWorkspaceDetection();
  await verifyWorkspaceToolingBoundary();
  await verifyGatewaySnapshotBuilders();
  await verifyStartupDiagnostics();
  await verifyRateLimiter();
  await verifyEffortResolver();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 9 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 9: The Voice foundations are GREEN.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
