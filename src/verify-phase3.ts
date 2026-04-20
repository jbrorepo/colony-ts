/**
 * Phase 3 Verification Script — The Heart
 *
 * Confirms:
 *   1. BudgetGate — context window pre-flight checks
 *   2. CostEstimator — per-model pricing with cache savings
 *   3. SessionBudget — per-session token + dollar caps
 *   4. CostRegistry — per-token pricing & calculate_cost
 *   5. ToolLoopDetector — sliding window + mutation oscillation
 *   6. CircuitBreaker — CLOSED/OPEN/HALF_OPEN state machine
 *
 * Run: bun run src/verify-phase3.ts
 */

import {
  BudgetGate,
  CostEstimator,
  SessionBudget,
} from "./llm/budget-gate";
import {
  MODEL_PRICING,
  getModelPricing,
  calculateCost,
} from "./llm/cost-registry";
import {
  ToolLoopDetector,
} from "./runtime/tool-loop-detector";
import {
  CircuitBreaker,
  createFailoverEvent,
} from "./llm/circuit-breaker";

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

function assertClose(actual: number, expected: number, label: string, epsilon = 0.0001): void {
  if (Math.abs(actual - expected) < epsilon) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label} — expected ~${expected}, got ${actual}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

// ---------------------------------------------------------------------------
// 1. BudgetGate
// ---------------------------------------------------------------------------

function verifyBudgetGate(): void {
  section("1. BudgetGate — Context Window Pre-Flight");

  const gate = new BudgetGate({ contextWindow: 128_000, responseReserve: 4096 });

  // Available tokens
  assertEqual(gate.availableTokens, 128_000 - 4096, "Available tokens = window - reserve");

  // Green zone
  const green = gate.check(50_000);
  assertEqual(green.allowed, true, "50k tokens: allowed");
  assert(green.utilisationPct < 85, "50k tokens: below warn threshold");
  assertEqual(green.recommendation, "", "50k tokens: no recommendation");

  // Warning zone (85-98%)
  const warn = gate.check(110_000);
  assertEqual(warn.allowed, true, "110k tokens: still allowed (warning)");
  assert(warn.utilisationPct >= 85, "110k tokens: in warning zone");
  assertEqual(warn.recommendation, "compact_soon", "Warning recommends compact_soon");

  // Hard block (>=98%)
  const blocked = gate.check(125_000);
  assertEqual(blocked.allowed, false, "125k tokens: blocked");
  assertEqual(blocked.recommendation, "compact_or_abort", "Hard block recommends compact_or_abort");
  assert(blocked.reason.includes("exceeds hard limit"), "Reason explains hard limit");

  // Zero available
  const tiny = new BudgetGate({ contextWindow: 4096, responseReserve: 4096 });
  const zero = tiny.check(1000);
  assertEqual(zero.allowed, false, "Zero available: blocked");
  assertEqual(zero.recommendation, "increase_context_window", "Zero available: increase recommendation");

  // Custom response reserve override
  const override = gate.check(125_000, 1000);
  // With 1000 reserve, available = 127000, util = 125000/127000 = 98.4% → blocked
  assertEqual(override.allowed, false, "Override reserve: still blocked at 98.4%");

  // Context window setter
  gate.contextWindow = 200_000;
  assertEqual(gate.contextWindow, 200_000, "Context window setter works");
}

// ---------------------------------------------------------------------------
// 2. CostEstimator
// ---------------------------------------------------------------------------

function verifyCostEstimator(): void {
  section("2. CostEstimator — Per-Model Pricing");

  const estimator = new CostEstimator();

  // Claude Opus 4.6: $15/1M input, $75/1M output
  const opus = estimator.estimate("claude-opus-4-6", 5000, 1000);
  assertEqual(opus.pricingAvailable, true, "Opus pricing available");
  assertClose(opus.promptCostUsd, (5000 / 1_000_000) * 15, "Opus prompt cost");
  assertClose(opus.completionCostUsd, (1000 / 1_000_000) * 75, "Opus completion cost");
  assert(opus.totalUsd > 0, "Opus total > 0");

  // GPT-4o: $2.50/1M input, $10/1M output
  const gpt4o = estimator.estimate("gpt-4o", 10_000, 2_000);
  assertEqual(gpt4o.pricingAvailable, true, "GPT-4o pricing available");
  assertClose(gpt4o.promptCostUsd, (10_000 / 1_000_000) * 2.5, "GPT-4o prompt cost");

  // Cache savings (Anthropic)
  const cached = estimator.estimate("claude-opus-4-6", 1000, 500, 10_000);
  assert(cached.cacheSavingsUsd > 0, "Cache savings calculated");
  assertClose(cached.cacheReadCostUsd, (10_000 / 1_000_000) * 1.5, "Cache read cost");
  // Savings: full input would be 10k * 15/1M = 0.15, cache read = 10k * 1.5/1M = 0.015, savings = 0.135
  assertClose(cached.cacheSavingsUsd, 0.135, "Cache savings correct");

  // Local model (free)
  const local = estimator.estimate("llama3.1", 100_000, 50_000);
  assertEqual(local.pricingAvailable, true, "Local model pricing available");
  assertEqual(local.totalUsd, 0, "Local model is free");

  // Unknown model
  const unknown = estimator.estimate("nonexistent-model-xyz", 1000, 500);
  assertEqual(unknown.pricingAvailable, false, "Unknown model: pricing unavailable");

  // Prefix match
  const prefixed = estimator.estimate("claude-opus-4-6-20260101", 5000, 1000);
  assertEqual(prefixed.pricingAvailable, true, "Prefix match works for versioned model");

  // Custom pricing
  const custom = new CostEstimator({ "my-model": [5.0, 25.0, 0.0, 0.0] });
  const myModel = custom.estimate("my-model", 1000, 500);
  assertEqual(myModel.pricingAvailable, true, "Custom model pricing works");
  assertClose(myModel.promptCostUsd, (1000 / 1_000_000) * 5.0, "Custom prompt cost");
}

// ---------------------------------------------------------------------------
// 3. SessionBudget
// ---------------------------------------------------------------------------

function verifySessionBudget(): void {
  section("3. SessionBudget — Per-Session Spending Caps");

  // Token cap
  const tokenBudget = new SessionBudget({ maxTokens: 100_000, sessionId: "test-1" });

  const ok1 = tokenBudget.canSpend(30_000);
  assertEqual(ok1.allowed, true, "First spend: 30k within 100k cap");

  tokenBudget.recordSpend(30_000, 0.10);
  assertEqual(tokenBudget.totalTokens, 30_000, "Tracked 30k tokens");
  assertEqual(tokenBudget.callCount, 1, "Call count = 1");

  tokenBudget.recordSpend(50_000, 0.15);
  assertEqual(tokenBudget.totalTokens, 80_000, "Tracked 80k total tokens");

  const blocked = tokenBudget.canSpend(30_000);
  assertEqual(blocked.allowed, false, "30k would exceed 100k cap");
  assertEqual(blocked.recommendation, "end_session", "Recommends end_session");
  assertEqual(tokenBudget.deniedCount, 1, "Denied count = 1");

  // Dollar cap
  const dollarBudget = new SessionBudget({ maxUsd: 1.0, sessionId: "test-2" });

  dollarBudget.recordSpend(10_000, 0.50);
  dollarBudget.recordSpend(10_000, 0.40);
  assertEqual(dollarBudget.totalUsd, 0.90, "Tracked $0.90 total");

  const dollarBlocked = dollarBudget.canSpend(5_000, 0.20);
  assertEqual(dollarBlocked.allowed, false, "$0.20 would exceed $1.00 cap");

  // Stats
  const stats = tokenBudget.getStats();
  assertEqual(stats.sessionId, "test-1", "Stats: session ID");
  assertEqual(stats.maxTokens, 100_000, "Stats: max tokens");
  assert((stats.remainingTokens as number) === 20_000, "Stats: remaining tokens = 20k");

  // Reset
  tokenBudget.reset();
  assertEqual(tokenBudget.totalTokens, 0, "Reset: tokens zeroed");
  assertEqual(tokenBudget.callCount, 0, "Reset: call count zeroed");

  // Unlimited (no caps)
  const unlimited = new SessionBudget();
  const unlimitedOk = unlimited.canSpend(1_000_000, 999.99);
  assertEqual(unlimitedOk.allowed, true, "Unlimited: always allowed");
}

// ---------------------------------------------------------------------------
// 4. CostRegistry
// ---------------------------------------------------------------------------

function verifyCostRegistry(): void {
  section("4. CostRegistry — Per-Token Pricing");

  // Known model
  const opusPricing = getModelPricing("claude-opus-4-6");
  assert(!opusPricing.isFree, "Opus is not free");
  assertClose(opusPricing.inputPerToken, 15e-6, "Opus input cost per token");
  assertClose(opusPricing.outputPerToken, 75e-6, "Opus output cost per token");
  assertClose(opusPricing.cacheReadPerToken, 1.5e-6, "Opus cache read per token");

  // Free model
  const llamaPricing = getModelPricing("llama3.1");
  assertEqual(llamaPricing.isFree, true, "Llama3.1 is free");
  assertEqual(llamaPricing.inputPerToken, 0, "Llama3.1 input cost = 0");

  // Prefix match
  const prefixed = getModelPricing("claude-opus-4-6-20260101");
  assert(!prefixed.isFree, "Versioned Opus matches via prefix");

  // Ollama-style
  const ollama = getModelPricing("mymodel");
  assertEqual(ollama.isFree, true, "Single lowercase word = Ollama free");

  // calculateCost
  const cost = calculateCost("claude-opus-4-6", {
    inputTokens: 10_000,
    outputTokens: 2_000,
    cacheReadTokens: 5_000,
  });
  assert(cost.totalUsd > 0, "calculateCost: total > 0");
  assert(cost.cacheSavingsUsd > 0, "calculateCost: cache savings > 0");
  assertClose(cost.inputCost, 10_000 * 15e-6, "calculateCost: input cost matches");
  assertClose(cost.outputCost, 2_000 * 75e-6, "calculateCost: output cost matches");

  // Registry size
  const knownModels = Object.keys(MODEL_PRICING);
  assert(knownModels.length >= 20, `At least 20 models in registry (got ${knownModels.length})`);
}

// ---------------------------------------------------------------------------
// 5. ToolLoopDetector
// ---------------------------------------------------------------------------

function verifyToolLoopDetector(): void {
  section("5. ToolLoopDetector — Sliding Window + Oscillation");

  // Basic loop detection
  const detector = new ToolLoopDetector({ caste: "ASSIST_ANT" });
  assertEqual(detector.threshold, 3, "Assist-Ant threshold = 3");

  // No loop yet
  detector.record("file_read", { path: "foo.py" });
  assertEqual(detector.isLooping, false, "1 call: no loop");

  detector.record("file_read", { path: "foo.py" });
  assertEqual(detector.isLooping, false, "2 calls: no loop");

  const loopResult = detector.record("file_read", { path: "foo.py" });
  assertEqual(loopResult.isLooping, true, "3 identical calls: loop detected");
  assertEqual(loopResult.toolName, "file_read", "Loop tool name correct");
  assert(loopResult.repeatCount >= 3, "Repeat count >= 3");
  assertEqual(detector.loopCount, 1, "Loop count = 1");

  // Guidance message
  const guidance = detector.getGuidanceMessage();
  assert(guidance.includes("⚠️ Loop Alert"), "Guidance has warning prefix");
  assert(guidance.includes("file_read"), "Guidance mentions the tool");

  // Different args — no loop
  detector.reset();
  detector.record("file_read", { path: "a.py" });
  detector.record("file_read", { path: "b.py" });
  detector.record("file_read", { path: "c.py" });
  // All different args — tool-name loop triggers for file_read
  assertEqual(detector.isLooping, true, "Same tool, different args: loop for file_read");

  // Nameless Swarm threshold
  const nsDetector = new ToolLoopDetector({ caste: "NAMELESS_SWARM" });
  assertEqual(nsDetector.threshold, 2, "Nameless Swarm threshold = 2");

  nsDetector.record("search", { query: "test" });
  const nsLoop = nsDetector.record("search", { query: "test" });
  assertEqual(nsLoop.isLooping, true, "Nameless: 2 repeats triggers loop");

  // Forge Carvers — higher tolerance
  const fcDetector = new ToolLoopDetector({ caste: "FORGE_CARVERS" });
  assertEqual(fcDetector.threshold, 4, "Forge Carvers threshold = 4");

  // Mutation oscillation
  const oscDetector = new ToolLoopDetector();
  oscDetector.recordMutation("file.ts", "edit", "version_A");
  oscDetector.recordMutation("file.ts", "edit", "version_B");
  oscDetector.recordMutation("file.ts", "edit", "version_A");
  const oscResult = oscDetector.recordMutation("file.ts", "edit", "version_B");
  assertEqual(oscResult.isOscillating, true, "ABAB oscillation detected");
  assert(oscResult.oscillationPath === "file.ts", "Oscillation path correct");

  // Oscillation guidance
  const oscGuidance = oscDetector.getGuidanceMessage();
  assert(oscGuidance.includes("oscillating"), "Oscillation guidance present");
  assert(oscGuidance.includes("file.ts"), "Oscillation guidance mentions file");

  // Reset
  oscDetector.reset();
  assertEqual(oscDetector.loopCount, 0, "Reset: loop count zeroed");
  assertEqual(oscDetector.lastDetection, null, "Reset: last detection null");
}

// ---------------------------------------------------------------------------
// 6. CircuitBreaker
// ---------------------------------------------------------------------------

function verifyCircuitBreaker(): void {
  section("6. CircuitBreaker — CLOSED/OPEN/HALF_OPEN");

  const breaker = new CircuitBreaker({ threshold: 3, cooldownSeconds: 0.1 });

  // Initial state
  assertEqual(breaker.state, "closed", "Initial state: CLOSED");
  assertEqual(breaker.isAvailable(), true, "Initially available");
  assertEqual(breaker.failureCount, 0, "No failures initially");

  // Record failures
  breaker.recordFailure();
  assertEqual(breaker.failureCount, 1, "1 failure recorded");
  assertEqual(breaker.state, "closed", "Still CLOSED after 1 failure");

  breaker.recordFailure();
  breaker.recordFailure();
  assertEqual(breaker.state, "open", "OPEN after 3 failures");
  assertEqual(breaker.isAvailable(), false, "Not available when OPEN");

  // Success resets
  breaker.recordSuccess();
  assertEqual(breaker.state, "closed", "CLOSED after success");
  assertEqual(breaker.failureCount, 0, "Failures reset on success");

  // Half-open after cooldown
  const fast = new CircuitBreaker({ threshold: 1, cooldownSeconds: 0.05 });
  fast.recordFailure();
  assertEqual(fast.state, "open", "OPEN after 1 failure (threshold=1)");

  // Wait for cooldown
  const start = performance.now();
  while (performance.now() - start < 60) { /* busy wait 60ms */ }

  assertEqual(fast.state, "half_open", "HALF_OPEN after cooldown");
  assertEqual(fast.isAvailable(), true, "Available in HALF_OPEN");

  // toDict serialization
  const dict = breaker.toDict();
  assert("state" in dict, "toDict has state");
  assert("failureCount" in dict, "toDict has failureCount");
  assert("threshold" in dict, "toDict has threshold");

  // Force reset
  const resetter = new CircuitBreaker({ threshold: 2 });
  resetter.recordFailure();
  resetter.recordFailure();
  assertEqual(resetter.state, "open", "OPEN before reset");
  resetter.reset();
  assertEqual(resetter.state, "closed", "CLOSED after force reset");

  // FailoverEvent
  const event = createFailoverEvent({
    fromProvider: "anthropic",
    fromModel: "claude-opus-4-6",
    toProvider: "openai",
    toModel: "gpt-4o",
    errorType: "LLMConnectionError",
    errorMessage: "timeout",
  });
  assert(event.timestamp > 0, "FailoverEvent has timestamp");
  assertEqual(event.fromProvider, "anthropic", "Event from provider");
  assertEqual(event.toModel, "gpt-4o", "Event to model");
}

// ---------------------------------------------------------------------------
// Run all verifications
// ---------------------------------------------------------------------------

function main(): void {
  console.log("\n❤️  THE COLONY — Phase 3 Verification (The Heart)\n");

  verifyBudgetGate();
  verifyCostEstimator();
  verifySessionBudget();
  verifyCostRegistry();
  verifyToolLoopDetector();
  verifyCircuitBreaker();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.error("\n⚠️  Phase 3 verification FAILED. Fix issues above.");
    process.exit(1);
  } else {
    console.log("\n❤️  Phase 3: The Heart is GREEN. Ready for Phase 4.");
  }
}

main();
