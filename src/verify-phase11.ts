/**
 * Phase 11 Verification Script - LLM Operations
 *
 * Covers in-memory usage accumulation, query filters, summary aggregation,
 * running cost, cache hit rate, AgentLoop integration, and failover probes.
 *
 * Run: bun run src/verify-phase11.ts
 */

import { Caste } from "./caste/enums";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  CavemanBridge,
  compressTextCaveman,
  isCloudProvider,
} from "./llm/caveman-bridge";
import {
  LLMProviderConfig,
  loadLLMConfig,
  loadLLMConfigFromEnv,
  parseConfigText,
  parseLLMConfigObject,
} from "./llm/config";
import { LLMConfigError } from "./llm/exceptions";
import {
  ErrorCategory,
  FailoverObservation,
  FailoverProbe,
  ModelHealth,
  classifyProbeError,
} from "./llm/failover-probe";
import { FailoverExecutor } from "./llm/failover-executor";
import { LLMProvider, type CompletionParams } from "./llm/base";
import { createLLMResponse, type LLMChunk, type LLMMessage, type LLMResponse, type ModelInfo, type TokenUsage } from "./llm/models";
import { providerManager } from "./llm/provider-manager";
import { ModelSelector } from "./llm/selector";
import { LLMUsageTracker } from "./llm/usage";
import { AgentLoop } from "./runtime/loop";
import { createAgentSession } from "./runtime/session";

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

function assertClose(actual: number, expected: number, label: string, tolerance = 1e-9): void {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${expected}, got ${actual}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

const usageA: TokenUsage = {
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
  cacheReadTokens: 20,
  cacheWriteTokens: 5,
};

const usageB: TokenUsage = {
  promptTokens: 300,
  completionTokens: 100,
  totalTokens: 400,
  cacheReadTokens: 80,
  cacheWriteTokens: 10,
};

class UsageProvider extends LLMProvider {
  completeCalls = 0;
  streamCalls = 0;

  constructor(private readonly modelId: string, private readonly usage: TokenUsage) {
    super("usage_mock");
  }

  async complete(_messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    this.completeCalls++;
    return createLLMResponse("tracked response", params?.model ?? this.modelId, this.providerName, {
      usage: this.usage,
      finishReason: "stop",
    });
  }

  async *stream(_messages: LLMMessage[], params?: CompletionParams): AsyncIterable<LLMChunk> {
    this.streamCalls++;
    yield { delta: "tracked ", model: params?.model ?? this.modelId, finishReason: null };
    yield { delta: "stream", model: params?.model ?? this.modelId, finishReason: "stop" };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [{
      modelId: this.modelId,
      provider: this.providerName,
      contextWindow: 200_000,
      supportsStreaming: true,
      supportsEmbedding: false,
      supportsToolUse: true,
    }];
  }
}

class ProbeProvider extends LLMProvider {
  calls = 0;

  constructor(
    providerName: string,
    private readonly behavior: "success" | "rate" | "auth" | "server" | "connection" | "invalid" | "unknown" = "success",
  ) {
    super(providerName);
  }

  async complete(_messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    this.calls++;
    if (this.behavior === "rate") throw new Error("429 rate limit");
    if (this.behavior === "auth") throw new Error("401 auth failed");
    if (this.behavior === "server") throw new Error("503 server unavailable");
    if (this.behavior === "connection") throw new Error("connection refused");
    if (this.behavior === "invalid") throw new Error("400 invalid request");
    if (this.behavior === "unknown") throw new Error("weird provider failure");
    return createLLMResponse("ok", params?.model ?? "probe-model", this.providerName, { usage: usageA });
  }

  async *stream(): AsyncIterable<LLMChunk> {
    yield { delta: "ok", model: "probe-model", finishReason: "stop" };
  }

  async healthCheck(): Promise<boolean> {
    return this.behavior === "success";
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

class CaptureProvider extends LLMProvider {
  capturedMessages: LLMMessage[][] = [];
  completeCalls = 0;
  streamCalls = 0;

  constructor(
    providerName: string,
    private readonly completeContent: string,
    private readonly streamChunks: LLMChunk[] = [],
  ) {
    super(providerName);
  }

  async complete(messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    this.completeCalls++;
    this.capturedMessages.push(messages);
    return createLLMResponse(this.completeContent, params?.model ?? "capture-model", this.providerName, {
      usage: usageA,
      finishReason: "stop",
    });
  }

  async *stream(messages: LLMMessage[], _params?: CompletionParams): AsyncIterable<LLMChunk> {
    this.streamCalls++;
    this.capturedMessages.push(messages);
    for (const chunk of this.streamChunks) yield chunk;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

function verifyUsageTrackerCore(): void {
  section("1. LLMUsageTracker Core");

  let now = 1000;
  const tracker = new LLMUsageTracker({ nowSeconds: () => now });

  tracker.record({
    tenant: "tenant-a",
    caste: "assist_ant",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: usageA,
  });
  now += 2;
  tracker.record({
    tenant: "tenant-a",
    caste: "assist_ant",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    usage: usageB,
  });
  tracker.record({
    tenant: "tenant-a",
    caste: "shield_generals",
    provider: "gemini",
    model: "gemini-2.5-flash",
    usage: usageA,
  });
  tracker.record({
    tenant: "tenant-b",
    caste: "assist_ant",
    provider: "local",
    model: "llama3.2",
    usage: usageA,
  });

  assertEqual(tracker.recordCount(), 3, "Tracker creates one record per tuple");

  const all = tracker.getUsage();
  assertEqual(all.length, 3, "getUsage returns all records");
  assertEqual(all[0].totalTokens, 550, "Usage sorted by total tokens descending");
  assertEqual(all[0].requestCount, 2, "Same tuple accumulates request count");
  assertEqual(all[0].firstSeen, 1000, "First seen retained");
  assertEqual(all[0].lastSeen, 1002, "Last seen updates");

  assertEqual(tracker.getUsage({ tenant: "tenant-a" }).length, 2, "Filter by tenant works");
  assertEqual(tracker.getUsage({ caste: "shield_generals" }).length, 1, "Filter by caste works");
  assertEqual(tracker.getUsage({ provider: "anthropic" }).length, 1, "Filter by provider works");
  assertEqual(tracker.getTenantUsage("tenant-b").length, 1, "getTenantUsage works");

  const summary = tracker.getSummary({ tenant: "tenant-a" });
  assertEqual(summary.totalPromptTokens, 500, "Summary prompt tokens");
  assertEqual(summary.totalCompletionTokens, 200, "Summary completion tokens");
  assertEqual(summary.totalTokens, 700, "Summary total tokens");
  assertEqual(summary.totalCacheReadTokens, 120, "Summary cache read tokens");
  assertEqual(summary.totalCacheWriteTokens, 20, "Summary cache write tokens");
  assertEqual(summary.totalRequests, 3, "Summary request count");
  assertEqual(summary.byProvider.anthropic.totalTokens, 550, "Summary by provider tokens");
  assertEqual(summary.byProvider.anthropic.requestCount, 2, "Summary by provider requests");
  assertEqual(summary.byCaste.assist_ant.totalTokens, 550, "Summary by caste tokens");
  assertEqual(summary.recordCount, 2, "Summary record count");

  assertClose(tracker.cacheHitRate({ tenant: "tenant-a" }), 120 / 620, "Cache hit rate uses prompt+cache reads");

  const runningCost = tracker.getRunningCost({ tenant: "tenant-a" });
  assert(runningCost.totalUsd > 0, "Running cost total > 0 for paid models");
  assert(runningCost.totalCacheSavingsUsd > 0, "Running cost includes cache savings");
  assert(runningCost.costPerMinute > 0, "Running cost per minute calculated");
  assertEqual(runningCost.byModel.length, 2, "Running cost includes per-model rows");

  tracker.reset();
  assertEqual(tracker.recordCount(), 0, "Reset clears records");
  assertEqual(tracker.getSummary().totalTokens, 0, "Reset clears summary totals");
  assertEqual(tracker.cacheHitRate(), 0, "Empty cache hit rate is zero");
  assertEqual(tracker.getRunningCost().totalUsd, 0, "Empty running cost is zero");
}

async function verifyAgentLoopUsageIntegration(): Promise<void> {
  section("2. AgentLoop Usage Integration");

  const tracker = new LLMUsageTracker();
  const provider = new UsageProvider("usage-model", usageB);
  providerManager.register("usage_mock", provider);

  const session = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  const loop = new AgentLoop({
    session,
    config: {
      tenant: "tenant-loop",
      model: "usage-model",
      maxIterations: 1,
    },
    usageTracker: tracker,
    llmConfig: {
      defaults: { provider: "usage_mock", model: "usage-model" },
      providers: { usage_mock: { defaultModel: "usage-model" } },
      casteModels: {},
      failover: {},
    },
  });

  await loop.run("hello");
  const usage = tracker.getUsage({ tenant: "tenant-loop" });
  assertEqual(usage.length, 1, "Non-streaming AgentLoop records one usage row");
  assertEqual(usage[0].provider, "usage_mock", "Non-streaming provider recorded");
  assertEqual(usage[0].model, "usage-model", "Non-streaming model recorded");
  assertEqual(usage[0].caste, Caste.ASSIST_ANT, "Non-streaming caste recorded");
  assertEqual(usage[0].totalTokens, usageB.totalTokens, "Non-streaming real usage recorded");

  const streamTracker = new LLMUsageTracker();
  const streamSession = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  const streamLoop = new AgentLoop({
    session: streamSession,
    config: {
      tenant: "tenant-stream",
      model: "usage-model",
      maxIterations: 1,
    },
    usageTracker: streamTracker,
    llmConfig: {
      defaults: { provider: "usage_mock", model: "usage-model" },
      providers: { usage_mock: { defaultModel: "usage-model" } },
      casteModels: {},
      failover: {},
    },
  });

  for await (const _event of streamLoop.runStreaming("hello stream")) {
    // Consume stream to completion.
  }

  const streamUsage = streamTracker.getUsage({ tenant: "tenant-stream" });
  assertEqual(streamUsage.length, 1, "Streaming AgentLoop records one usage row");
  assertEqual(streamUsage[0].provider, "usage_mock", "Streaming provider recorded");
  assertEqual(streamUsage[0].model, "usage-model", "Streaming model recorded");
  assert(streamUsage[0].totalTokens > 0, "Streaming estimated usage recorded");

  const disabledTracker = new LLMUsageTracker();
  const disabledSession = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  const disabledLoop = new AgentLoop({
    session: disabledSession,
    config: { tenant: "tenant-disabled", model: "usage-model", maxIterations: 1 },
    usageTracker: null,
    llmConfig: {
      defaults: { provider: "usage_mock", model: "usage-model" },
      providers: { usage_mock: { defaultModel: "usage-model" } },
      casteModels: {},
      failover: {},
    },
  });
  await disabledLoop.run("hello disabled");
  assertEqual(disabledTracker.recordCount(), 0, "Usage tracker can be disabled by passing null");
}

async function verifyFailoverProbe(): Promise<void> {
  section("3. Failover Probe");

  let now = 1_000;
  const health = new ModelHealth({
    providerName: "anthropic",
    modelId: "claude-sonnet-4-5",
    nowSeconds: () => now,
  });
  assertEqual(health.successRate, 1, "New health assumes success rate 1.0");
  health.recordObservation(new FailoverObservation({
    providerName: "anthropic",
    modelId: "claude-sonnet-4-5",
    timestamp: now,
    success: true,
    latencyMs: 100,
  }));
  assertEqual(health.totalProbes, 1, "Health records success probe");
  assertEqual(health.consecutiveSuccesses, 1, "Health increments consecutive successes");
  assert(health.healthWeight > 0.9 && health.healthWeight <= 1, "Healthy low-latency model has high weight");

  health.recordObservation(new FailoverObservation({
    providerName: "anthropic",
    modelId: "claude-sonnet-4-5",
    timestamp: now,
    success: false,
    errorCategory: ErrorCategory.SERVER_ERROR,
  }));
  health.recordObservation(new FailoverObservation({
    providerName: "anthropic",
    modelId: "claude-sonnet-4-5",
    timestamp: now,
    success: false,
    errorCategory: ErrorCategory.SERVER_ERROR,
  }));
  assertEqual(health.consecutiveFailures, 2, "Two failures tracked");
  assert(!health.isHealthy, "Two failures mark unhealthy");
  assert(health.inCooldown, "Two failures enter cooldown");
  assertEqual(health.healthWeight, 0, "Cooldown health weight is zero");
  now += 31;
  assert(!health.inCooldown, "Cooldown expires by time");
  assertEqual(health.healthWeight, 0.1, "Unhealthy after cooldown gets minimal weight");

  const providers = new Map<string, LLMProvider>([
    ["ok", new ProbeProvider("ok", "success")],
    ["rate", new ProbeProvider("rate", "rate")],
    ["auth", new ProbeProvider("auth", "auth")],
  ]);
  const probe = new FailoverProbe({
    providerGetter: (name) => {
      const provider = providers.get(name);
      if (!provider) throw new Error("provider missing");
      return provider;
    },
    config: { probeTimeoutSeconds: 1, maxObservations: 2 },
    nowSeconds: () => now,
  });

  assertEqual((await probe.probeAll()).length, 0, "probeAll with no models returns empty");
  probe.registerModel("ok", "model-a");
  probe.registerModel("ok", "model-a");
  assertEqual(Object.keys(probe.getHealthStatus()).length, 1, "Duplicate model registration ignored");

  const ok = await probe.probeOne("ok", "model-a");
  assert(ok.success, "Successful probe returns success observation");
  assertEqual(ok.errorCategory, ErrorCategory.NONE, "Successful probe has no error category");
  assertEqual(probe.observations.length, 1, "Successful probe recorded");
  assert(probe.getHealthWeights()["ok/model-a"] > 0, "Successful probe has positive health weight");

  probe.registerModel("rate", "model-b");
  const all = await probe.probeAll();
  assertEqual(all.length, 2, "probeAll probes registered models concurrently");
  assert(probe.observations.length <= 2, "Observation log respects maxObservations cap");

  const firstRate = await probe.probeOne("rate", "model-b");
  const secondRate = await probe.probeOne("rate", "model-b");
  assert(!firstRate.success && !secondRate.success, "Failing probes return failure observations");
  assertEqual(secondRate.errorCategory, ErrorCategory.RATE_LIMIT, "429 categorized as rate limit");
  assert(probe.getHealthStatus()["rate/model-b"].inCooldown, "Repeated failures put model in cooldown");
  const skipped = await probe.probeOne("rate", "model-b");
  assertEqual(skipped.errorMessage, "Model in cooldown, skipping probe", "Cooldown probe is skipped");

  assertEqual(classifyProbeError(new Error("timeout while waiting")), ErrorCategory.TIMEOUT, "Timeout classified");
  assertEqual(classifyProbeError(new Error("403 forbidden")), ErrorCategory.AUTH_ERROR, "Auth classified");
  assertEqual(classifyProbeError(new Error("502 bad gateway")), ErrorCategory.SERVER_ERROR, "Server error classified");
  assertEqual(classifyProbeError(new Error("connection refused")), ErrorCategory.CONNECTION_ERROR, "Connection classified");
  assertEqual(classifyProbeError(new Error("400 invalid input")), ErrorCategory.INVALID_REQUEST, "Invalid request classified");
  assertEqual(classifyProbeError(new Error("something else")), ErrorCategory.UNKNOWN, "Unknown classified");

  const noGetter = new FailoverProbe({ nowSeconds: () => now });
  noGetter.registerModel("missing", "model");
  const missing = await noGetter.probeOne("missing", "model");
  assert(!missing.success, "Missing provider getter fails probe");
  assertEqual(missing.errorCategory, ErrorCategory.UNKNOWN, "Missing provider getter categorized unknown");
}

async function verifyCavemanBridge(): Promise<void> {
  section("4. Caveman Bridge");

  const original = "Sure, the database connection pooling issue happens because there are too many new connections.\n```ts\nconst value = 1;\n```";
  const compressed = compressTextCaveman(original);
  assert(compressed.length < original.length, "Caveman compressor shortens prose");
  assert(compressed.includes("```ts\nconst value = 1;\n```"), "Caveman compressor preserves fenced code");
  assert(isCloudProvider("anthropic"), "Anthropic is cloud provider");
  assert(!isCloudProvider("local"), "Local is not cloud provider");

  const cloud = new CaptureProvider("anthropic", "bug auth middleware. expiry check use < not <=. fix.");
  const cleanup = new CaptureProvider("local", "The authentication middleware has a bug: the token expiry check uses `<` instead of `<=`. Change that comparison and add a boundary test.");
  const executor = new FailoverExecutor((name) => {
    if (name === "anthropic") return cloud;
    if (name === "local") return cleanup;
    throw new Error("missing provider");
  }, {
    maxRetriesPerProvider: 0,
    cavemanBridge: new CavemanBridge({ cleanupTimeoutMs: 100 }),
  });

  const response = await executor.complete(
    [{ providerName: "anthropic", modelId: "claude-sonnet-4-5", source: "global" }],
    [
      { role: "system", content: "You are The Colony. Please provide a helpful response with the full explanation." },
      { role: "user", content: "Please explain why the auth middleware bug happens and how to fix it." },
    ],
  );
  assert(response.content.startsWith("The authentication middleware"), "Cloud response cleaned through local Assist-Ant");
  assert(cloud.capturedMessages[0][0].content.includes("Token-saving protocol active"), "Cloud system message gets caveman protocol");
  assert(!cloud.capturedMessages[0][1].content.toLowerCase().includes("please"), "Cloud user message compressed");
  assert(cleanup.capturedMessages[0][1].content.includes("Cloud terse answer"), "Cleanup prompt receives terse cloud answer");
  assertEqual((response.rawResponse?.caveman_bridge as Record<string, unknown>)?.cloud_provider, "anthropic", "Raw response records caveman bridge metadata");

  const localOnly = new CaptureProvider("local", "local answer");
  const localExecutor = new FailoverExecutor((name) => {
    if (name === "local") return localOnly;
    throw new Error("missing provider");
  }, {
    cavemanBridge: new CavemanBridge({ cleanupTimeoutMs: 100 }),
  });
  await localExecutor.complete(
    [{ providerName: "local", modelId: "llama3.2", source: "global" }],
    [{ role: "user", content: "Please keep this exact prose for local model." }],
  );
  assertEqual(localOnly.capturedMessages[0][0].content, "Please keep this exact prose for local model.", "Local provider bypasses caveman compression");

  const streamCloud = new CaptureProvider("anthropic", "", [
    { delta: "bug auth. ", model: "claude-sonnet-4-5", finishReason: null },
    { delta: "fix <=.", model: "claude-sonnet-4-5", finishReason: "stop" },
  ]);
  const streamCleanup = new CaptureProvider("local", "The auth bug is fixed by changing the comparison to `<=`.");
  const streamExecutor = new FailoverExecutor((name) => {
    if (name === "anthropic") return streamCloud;
    if (name === "local") return streamCleanup;
    throw new Error("missing provider");
  }, {
    cavemanBridge: new CavemanBridge({ cleanupTimeoutMs: 100, streamChunkChars: 12 }),
  });
  const streamed: LLMChunk[] = [];
  for await (const chunk of streamExecutor.stream(
    [{ providerName: "anthropic", modelId: "claude-sonnet-4-5", source: "global" }],
    [{ role: "user", content: "Please explain the auth bug." }],
  )) {
    streamed.push(chunk);
  }
  assertEqual(streamed.map((chunk) => chunk.delta).join(""), "The auth bug is fixed by changing the comparison to `<=`.", "Streaming cloud response cleaned locally before yield");
  assert(streamed.length > 2, "Cleaned stream is chunked for UI");

  const toolCloud = new CaptureProvider("anthropic", "", [
    {
      delta: "",
      model: "claude-sonnet-4-5",
      finishReason: "tool_calls",
      toolCalls: [{ id: "call_1", type: "function", function: { name: "file_read", arguments: "{}" } }],
    },
  ]);
  const toolCleanup = new CaptureProvider("local", "should not run");
  const toolExecutor = new FailoverExecutor((name) => {
    if (name === "anthropic") return toolCloud;
    if (name === "local") return toolCleanup;
    throw new Error("missing provider");
  }, {
    cavemanBridge: new CavemanBridge({ cleanupTimeoutMs: 100 }),
  });
  const toolChunks: LLMChunk[] = [];
  for await (const chunk of toolExecutor.stream(
    [{ providerName: "anthropic", modelId: "claude-sonnet-4-5", source: "global" }],
    [{ role: "user", content: "Read file." }],
  )) {
    toolChunks.push(chunk);
  }
  assertEqual(toolChunks[0].toolCalls?.length ?? 0, 1, "Tool-call stream bypasses cleanup and replays raw tool call");
  assertEqual(toolCleanup.completeCalls, 0, "Tool-call stream does not call local cleanup");

  const noLocalCloud = new CaptureProvider("anthropic", "raw terse cloud answer");
  const noLocalExecutor = new FailoverExecutor((name) => {
    if (name === "anthropic") return noLocalCloud;
    throw new Error("missing local provider");
  }, {
    maxRetriesPerProvider: 0,
    cavemanBridge: new CavemanBridge({ cleanupTimeoutMs: 10 }),
  });
  const fallback = await noLocalExecutor.complete(
    [{ providerName: "anthropic", modelId: "claude-sonnet-4-5", source: "global" }],
    [{ role: "user", content: "Please answer." }],
  );
  assertEqual(fallback.content, "raw terse cloud answer", "Missing local cleanup falls back to cloud response");
}

async function verifyLlmConfigLoader(): Promise<void> {
  section("5. LLM Config Loader");

  const envDefault = loadLLMConfigFromEnv({});
  assertEqual(envDefault.defaults.provider, "default", "Env fallback uses default provider name");
  assertEqual(String(envDefault.providers.default.type), "ollama", "Env fallback default provider type is ollama");
  assertEqual(envDefault.providers.default.defaultModel, "llama3.2", "Env fallback default model is llama3.2");
  assertEqual(String(envDefault.providers.default.apiBase), "http://localhost:11434", "Ollama env fallback base URL");
  assert(!("apiKey" in envDefault.providers.default), "Env fallback does not store raw API key");

  const envOpenAi = loadLLMConfigFromEnv({
    COLONY_LLM_PROVIDER: "openai_compatible",
    COLONY_LLM_MODEL: "gpt-4o-mini",
    COLONY_LLM_API_KEY: "sk-secret-not-stored",
  });
  assertEqual(String(envOpenAi.providers.default.apiBase), "http://localhost:11434/v1", "OpenAI-compatible env fallback gets /v1 base");
  assertEqual(envOpenAi.providers.default.defaultModel, "gpt-4o-mini", "Env model override works");

  const providerConfig = new LLMProviderConfig({
    type: "anthropic",
    api_key_env: "ANTHROPIC_API_KEY",
    default_model: "claude-sonnet-4-5",
  });
  assertEqual(providerConfig.resolveApiKey({ ANTHROPIC_API_KEY: "sk-ant-test" }), "sk-ant-test", "Provider config resolves API key from env");
  assertEqual(providerConfig.resolveApiKey({}), "", "Missing API key env resolves empty");

  const parsedJson = parseLLMConfigObject(JSON.parse(JSON.stringify({
    providers: {
      anthropic: {
        type: "anthropic",
        api_base: "https://api.anthropic.com",
        api_key_env: "ANTHROPIC_API_KEY",
        default_model: "claude-sonnet-4-5",
        timeout_seconds: 30,
      },
      local: {
        type: "ollama",
        api_base: "http://localhost:11434",
        default_model: "llama3.2",
      },
    },
    defaults: {
      provider: "anthropic",
      max_tokens: 2048,
      temperature: 0.2,
    },
    caste_models: {
      assist_ant: { provider: "anthropic", model: "claude-sonnet-4-5" },
    },
    failover: {
      anthropic: ["local"],
    },
  }))).toSelectorConfig();
  assertEqual(parsedJson.providers.anthropic.defaultModel, "claude-sonnet-4-5", "JSON config parses provider model");
  assertEqual(parsedJson.defaults.provider, "anthropic", "JSON config parses defaults");
  assertEqual(parsedJson.casteModels.assist_ant.provider, "anthropic", "JSON config parses caste models");
  assertEqual(parsedJson.failover.anthropic[0], "local", "JSON config parses failover");

  const candidates = new ModelSelector(parsedJson).select({ caste: "assist_ant" });
  assertEqual(candidates[0].providerName, "anthropic", "Loaded config works with ModelSelector primary");
  assertEqual(candidates[1].providerName, "local", "Loaded config works with ModelSelector failover");

  const yamlRaw = parseConfigText(`
providers:
  gemini:
    type: gemini
    api_base: https://generativelanguage.googleapis.com/v1beta
    api_key_env: GEMINI_API_KEY
    default_model: gemini-2.5-flash
  local:
    type: ollama
    api_base: http://localhost:11434
    default_model: llama3.2
defaults:
  provider: gemini
  max_tokens: 1024
  temperature: 0.1
caste_models:
  shield_generals:
    provider: gemini
    model: gemini-2.5-pro
failover:
  gemini:
    - local
`);
  const yamlConfig = parseLLMConfigObject(yamlRaw).toSelectorConfig();
  assertEqual(yamlConfig.providers.gemini.defaultModel, "gemini-2.5-flash", "YAML config parses provider model");
  assertEqual(yamlConfig.defaults.provider, "gemini", "YAML config parses defaults");
  assertEqual(yamlConfig.casteModels.shield_generals.model, "gemini-2.5-pro", "YAML config parses caste model");
  assertEqual(yamlConfig.failover.gemini[0], "local", "YAML config parses list failover");

  const temp = await mkdtemp(join(tmpdir(), "colony-llm-config-"));
  try {
    const configPath = join(temp, "llm.json");
    await writeFile(configPath, JSON.stringify({
      providers: {
        local: { type: "ollama", default_model: "llama3.2" },
      },
      defaults: { provider: "local" },
    }), "utf-8");
    const loaded = await loadLLMConfig({ env: { COLONY_LLM_CONFIG: configPath } });
    assertEqual(loaded.providers.local.defaultModel, "llama3.2", "loadLLMConfig loads file from env path");

    let missingFile = false;
    try {
      await loadLLMConfig({ configPath: join(temp, "missing.yml") });
    } catch (e) {
      missingFile = e instanceof LLMConfigError;
    }
    assert(missingFile, "Missing config file throws LLMConfigError");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }

  let badProvider = false;
  try {
    parseLLMConfigObject({ providers: { bad: "not-map" } });
  } catch (e) {
    badProvider = e instanceof LLMConfigError;
  }
  assert(badProvider, "Malformed provider config throws LLMConfigError");

  let badJson = false;
  try {
    parseConfigText("{bad json", "bad.json");
  } catch (e) {
    badJson = e instanceof LLMConfigError;
  }
  assert(badJson, "Invalid JSON config throws LLMConfigError");
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 11 Verification (LLM Operations)\n");

  verifyUsageTrackerCore();
  await verifyAgentLoopUsageIntegration();
  await verifyFailoverProbe();
  await verifyCavemanBridge();
  await verifyLlmConfigLoader();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 11 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 11: LLM operations are GREEN.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
