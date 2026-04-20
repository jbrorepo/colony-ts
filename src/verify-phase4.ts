/**
 * Phase 4 Verification Script — The Brain
 *
 * Confirms:
 *   1. LLM Error Hierarchy — 4 error types with metadata
 *   2. LLM Models — LLMMessage, TokenUsage, LLMResponse, LLMChunk, ModelInfo
 *   3. LLM Provider — abstract contract enforcement
 *   4. Token Estimation — content type detection, heuristics, caching
 *   5. Model Selector — 4-tier resolution + failover chain
 *
 * Run: bun run src/verify-phase4.ts
 */

import {
  LLMError,
  LLMConnectionError,
  LLMRateLimitError,
  LLMResponseError,
  LLMConfigError,
} from "./llm/exceptions";
import {
  createLLMResponse,
  emptyTokenUsage,
  type LLMMessage,
  type LLMChunk,
  type ModelInfo,
} from "./llm/models";
import { LLMProvider, type CompletionParams } from "./llm/base";
import {
  TokenEstimationService,
  ContentType,
  EstimationStrategy,
  detectContentType,
} from "./runtime/token-estimation";
import {
  ModelSelector,
  defaultLLMConfig,
  type LLMConfig,
} from "./llm/selector";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

// ---------------------------------------------------------------------------
// 1. LLM Error Hierarchy
// ---------------------------------------------------------------------------

function verifyExceptions(): void {
  section("1. LLM Error Hierarchy");

  // Base LLMError
  const base = new LLMError("test error", { provider: "anthropic", model: "opus" });
  assertEqual(base.name, "LLMError", "LLMError.name");
  assertEqual(base.provider, "anthropic", "LLMError.provider");
  assertEqual(base.model, "opus", "LLMError.model");
  assert(base instanceof Error, "LLMError extends Error");

  // Connection error (retryable)
  const conn = new LLMConnectionError("timeout", { provider: "openai" });
  assertEqual(conn.name, "LLMConnectionError", "Connection error name");
  assert(conn instanceof LLMError, "Connection extends LLMError");
  assert(conn instanceof Error, "Connection extends Error");

  // Rate limit error
  const rate = new LLMRateLimitError("429 Too Many Requests", {
    provider: "anthropic",
    retryAfter: 30,
  });
  assertEqual(rate.name, "LLMRateLimitError", "Rate limit error name");
  assertEqual(rate.retryAfter, 30, "Rate limit retryAfter");
  assert(rate instanceof LLMError, "Rate limit extends LLMError");

  // Response error (non-retryable)
  const resp = new LLMResponseError("Invalid prompt", { statusCode: 400 });
  assertEqual(resp.name, "LLMResponseError", "Response error name");
  assertEqual(resp.statusCode, 400, "Response status code");

  // Config error
  const config = new LLMConfigError("Missing API key");
  assertEqual(config.name, "LLMConfigError", "Config error name");
  assert(config instanceof LLMError, "Config extends LLMError");

  // Default values
  const defaultErr = new LLMError("test");
  assertEqual(defaultErr.provider, "", "Default provider empty");
  assertEqual(defaultErr.model, "", "Default model empty");
}

// ---------------------------------------------------------------------------
// 2. LLM Models
// ---------------------------------------------------------------------------

function verifyModels(): void {
  section("2. LLM Models — Response Types");

  // TokenUsage
  const usage = emptyTokenUsage();
  assertEqual(usage.promptTokens, 0, "Empty usage: prompt = 0");
  assertEqual(usage.completionTokens, 0, "Empty usage: completion = 0");
  assertEqual(usage.cacheReadTokens, 0, "Empty usage: cache read = 0");

  // LLMResponse
  const response = createLLMResponse("Hello world", "claude-opus-4-6", "anthropic", {
    finishReason: "end_turn",
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  });
  assertEqual(response.content, "Hello world", "Response content");
  assertEqual(response.model, "claude-opus-4-6", "Response model");
  assertEqual(response.provider, "anthropic", "Response provider");
  assertEqual(response.finishReason, "end_turn", "Response finish reason");
  assert(response.traceId.length === 16, "Trace ID is 16 chars");
  assert(response.timestamp.length > 0, "Timestamp present");
  assertEqual(response.usage.promptTokens, 100, "Usage prompt tokens");

  // LLMMessage
  const msg: LLMMessage = {
    role: "user",
    content: "Hello",
    name: "test_user",
  };
  assertEqual(msg.role, "user", "Message role");
  assertEqual(msg.content, "Hello", "Message content");

  // LLMChunk
  const chunk: LLMChunk = { delta: "Hi", model: "gpt-4o", finishReason: null };
  assertEqual(chunk.delta, "Hi", "Chunk delta");
  assertEqual(chunk.finishReason, null, "Chunk no finish reason");

  // ModelInfo
  const info: ModelInfo = {
    modelId: "claude-opus-4-6",
    provider: "anthropic",
    contextWindow: 200_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  };
  assertEqual(info.contextWindow, 200_000, "ModelInfo context window");
  assertEqual(info.supportsToolUse, true, "ModelInfo tool use");
}

// ---------------------------------------------------------------------------
// 3. LLM Provider (abstract contract)
// ---------------------------------------------------------------------------

function verifyProvider(): void {
  section("3. LLM Provider — Abstract Contract");

  // Create a concrete test provider
  class TestProvider extends LLMProvider {
    async complete(messages: LLMMessage[]): Promise<any> {
      return createLLMResponse("test", "test-model", this.providerName);
    }
    async *stream(messages: LLMMessage[]): AsyncIterable<LLMChunk> {
      yield { delta: "hello", model: "test-model", finishReason: null };
      yield { delta: "", model: "test-model", finishReason: "stop" };
    }
    async healthCheck(): Promise<boolean> { return true; }
    listModels(): ModelInfo[] {
      return [{
        modelId: "test-model",
        provider: this.providerName,
        contextWindow: 4096,
        supportsStreaming: true,
        supportsEmbedding: false,
        supportsToolUse: false,
      }];
    }
  }

  const provider = new TestProvider("test-provider");
  assertEqual(provider.providerName, "test-provider", "Provider name set");

  // Test complete
  provider.complete([{ role: "user", content: "hi" }]).then((r) => {
    assert(r.content === "test", "Complete returns response");
  });

  // Test listModels
  const models = provider.listModels();
  assertEqual(models.length, 1, "listModels returns 1 model");
  assertEqual(models[0].modelId, "test-model", "Model ID correct");

  // Test embed throws
  let embedThrew = false;
  provider.embed(["test"]).catch((e) => {
    embedThrew = e.message.includes("does not support embeddings");
  });

  // healthCheck
  provider.healthCheck().then((ok) => {
    assert(ok, "Health check returns true");
  });

  // Verify abstract contract
  assert(provider instanceof LLMProvider, "TestProvider extends LLMProvider");
}

// ---------------------------------------------------------------------------
// 4. Token Estimation
// ---------------------------------------------------------------------------

function verifyTokenEstimation(): void {
  section("4. TokenEstimationService — Content-Aware Counting");

  const service = new TokenEstimationService();

  // Empty text
  const empty = service.count("");
  assertEqual(empty.tokenCount, 0, "Empty text: 0 tokens");
  assertEqual(empty.isExact, true, "Empty text: exact");

  // Plain text (char heuristic: len/4)
  const plain = service.count("Hello, world! This is a test.");
  assert(plain.tokenCount > 0, "Plain text: tokens > 0");
  assertEqual(plain.strategy, EstimationStrategy.CHAR_HEURISTIC, "Plain text: char heuristic");

  // JSON content (detected by content, 2 bytes/token ratio)
  const json = service.count('{"key": "value", "count": 42}');
  assert(json.tokenCount > 0, "JSON: tokens > 0");
  assertEqual(json.strategy, EstimationStrategy.FILE_TYPE_HEURISTIC, "JSON: file type heuristic");

  // Code file (by extension)
  const code = service.count("function hello() { return 42; }", {
    filename: "test.ts",
  });
  assert(code.tokenCount > 0, "Code: tokens > 0");
  assertEqual(code.strategy, EstimationStrategy.FILE_TYPE_HEURISTIC, "Code: file type heuristic");

  // Cache hit
  const first = service.count("cache test string");
  const second = service.count("cache test string");
  assertEqual(second.cacheHit, true, "Second call: cache hit");
  assertEqual(second.tokenCount, first.tokenCount, "Cache returns same count");

  // Content type detection
  assertEqual(detectContentType('{"a":1}'), ContentType.JSON, "Detect JSON from content");
  assertEqual(detectContentType("# Hello"), ContentType.MARKDOWN, "Detect Markdown from content");
  assertEqual(detectContentType("<?xml version"), ContentType.XML, "Detect XML from content");
  assertEqual(detectContentType("hello world"), ContentType.PLAIN_TEXT, "Detect plain text");
  assertEqual(detectContentType("", "test.py"), ContentType.CODE, "Detect code from .py extension");
  assertEqual(detectContentType("", "data.json"), ContentType.JSON, "Detect JSON from .json extension");
  assertEqual(detectContentType("", "README.md"), ContentType.MARKDOWN, "Detect MD from .md extension");
  assertEqual(detectContentType("", "page.html"), ContentType.XML, "Detect HTML as XML");

  // countMessages
  const msgCount = service.countMessages([
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hello world" },
    { role: "assistant", content: "Hi there!" },
  ]);
  assert(msgCount > 0, "countMessages returns > 0");

  // Configure for model
  service.configureForModel("gpt-4o");
  const afterReconfig = service.count("test after reconfig");
  assert(afterReconfig.tokenCount > 0, "Works after model reconfig");
  assertEqual(afterReconfig.cacheHit, false, "Cache cleared on reconfig");

  // Explicit content type
  const explicit = service.count("some data", {
    contentType: ContentType.CODE,
  });
  assertEqual(explicit.strategy, EstimationStrategy.FILE_TYPE_HEURISTIC, "Explicit type uses file heuristic");

  // No cache mode
  const noCache = new TokenEstimationService({ enableCache: false });
  const r1 = noCache.count("no cache test");
  const r2 = noCache.count("no cache test");
  assertEqual(r2.cacheHit, false, "No-cache mode: no cache hit");
}

// ---------------------------------------------------------------------------
// 5. Model Selector
// ---------------------------------------------------------------------------

function verifyModelSelector(): void {
  section("5. ModelSelector — 4-Tier Resolution");

  // Config with multiple providers
  const config: LLMConfig = {
    defaults: { provider: "local" },
    providers: {
      local: { defaultModel: "llama3.1" },
      anthropic: { defaultModel: "claude-opus-4-6" },
      openai: { defaultModel: "gpt-4o" },
    },
    casteModels: {
      assist_ant: { provider: "openai", model: "gpt-4o" },
    },
    failover: {
      anthropic: ["openai", "local"],
      openai: ["anthropic", "local"],
    },
  };

  const selector = new ModelSelector(config);

  // 1. Caste resolution — custom config
  const assistCandidates = selector.select({ caste: "assist_ant" });
  assertEqual(assistCandidates[0].providerName, "openai", "Assist-Ant: OpenAI from config");
  assertEqual(assistCandidates[0].modelId, "gpt-4o", "Assist-Ant: GPT-4o model");
  assertEqual(assistCandidates[0].source, "caste", "Assist-Ant: source = caste");

  // Failover chain appended
  assert(assistCandidates.length > 1, "Failover chain appended");
  assert(
    assistCandidates.some(c => c.source === "failover"),
    "Failover candidates present",
  );

  // 2. Caste resolution — built-in defaults
  const queenCandidates = selector.select({ caste: "root_queen" });
  assertEqual(queenCandidates[0].providerName, "anthropic", "Root Queen: Anthropic default");
  assertEqual(queenCandidates[0].modelId, "claude-opus-4-6", "Root Queen: Opus model");

  // Local fallback is always in chain
  assert(
    queenCandidates.some(c => c.providerName === "local"),
    "Local fallback always present",
  );

  // 3. Global default (no caste)
  const globalCandidates = selector.select();
  assertEqual(globalCandidates[0].providerName, "local", "Global: local provider");
  assertEqual(globalCandidates[0].modelId, "llama3.1", "Global: llama3.1 model");
  assertEqual(globalCandidates[0].source, "global", "Global: source = global");

  // 4. getCasteMapping merges defaults + config
  const mapping = selector.getCasteMapping();
  assert("root_queen" in mapping, "Mapping has built-in root_queen");
  assert("assist_ant" in mapping, "Mapping has config assist_ant");
  assertEqual(mapping.assist_ant.provider, "openai", "Config overrides built-in");

  // 5. getConfiguredProviders
  const providers = selector.getConfiguredProviders();
  assert(providers.includes("local"), "Providers includes local");
  assert(providers.includes("anthropic"), "Providers includes anthropic");

  // 6. getFailoverChain
  const chain = selector.getFailoverChain("anthropic");
  assert(chain.includes("openai"), "Anthropic failover includes openai");
  assert(chain.includes("local"), "Anthropic failover includes local");

  // 7. Config error on bad default
  const badConfig: LLMConfig = {
    defaults: { provider: "nonexistent" },
    providers: {},
    casteModels: {},
    failover: {},
  };
  const badSelector = new ModelSelector(badConfig);
  let configThrew = false;
  try {
    badSelector.select();
  } catch (e) {
    configThrew = e instanceof Error && e.name === "LLMConfigError";
  }
  assert(configThrew, "LLMConfigError thrown on bad config");

  // 8. Reload
  selector.reload(defaultLLMConfig());
  const reloaded = selector.select();
  assertEqual(reloaded[0].providerName, "local", "Reloaded: local default");
}

// ---------------------------------------------------------------------------
// Run all verifications
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n🧠 THE COLONY — Phase 4 Verification (The Brain)\n");

  verifyExceptions();
  verifyModels();
  verifyProvider();
  verifyTokenEstimation();
  verifyModelSelector();

  // Wait for async assertions
  await new Promise((r) => setTimeout(r, 100));

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.error("\n⚠️  Phase 4 verification FAILED. Fix issues above.");
    process.exit(1);
  } else {
    console.log("\n🧠 Phase 4: The Brain is GREEN. Ready for Phase 5.");
  }
}

main();
