/**
 * Phase 14 Verification Script - Prompt Assembler
 *
 * Covers block assembly, history conversion, budget compaction, and
 * AgentLoop integration with the prompt assembler.
 *
 * Run: bun run src/verify-phase14.ts
 */

import { Caste } from "./caste/enums";
import { AgentLoop } from "./runtime/loop";
import { PromptAssembler, BlockType } from "./runtime/prompt-assembler";
import { PromptBuilder } from "./runtime/prompt-builder";
import {
  createAssistantMessage,
  createSystemMessage,
  serializeMessage,
  createToolCall,
  createToolResult,
  createUserMessage,
} from "./runtime/message";
import { addMessage, createAgentSession } from "./runtime/session";
import type { LLMMessage } from "./llm/models";

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

function verifyAssemblyCore(): void {
  section("1. Prompt Assembly Core");

  const systemPrompt = PromptBuilder.buildSystemPrompt({
    caste: Caste.ASSIST_ANT,
    agentId: "assist-ant",
    includeManifesto: true,
  });

  const assembler = new PromptAssembler({
    caste: Caste.ASSIST_ANT,
    contextWindowTokens: 6000,
    responseReserveTokens: 256,
  });

  const result = assembler.assemble({
    conversationHistory: [
      serializeMessage(createSystemMessage(systemPrompt, 100)),
      serializeMessage(createUserMessage("Need help debug auth middleware.")),
      serializeMessage(createAssistantMessage("I will inspect expiry handling first.")),
      serializeMessage(createSystemMessage("[Context Summary - 8 earlier messages compacted]\n\n- User focused on auth bug", 90)),
      serializeMessage(createToolResult("call_1", "file_read", "auth.ts contents", false, 12)),
    ],
    toolSchemas: [
      { function: { name: "file_read", description: "Read file contents" } },
      { function: { name: "grep_search", description: "Search workspace text" } },
    ],
    skillInstructions: ["Skill instruction one.", "Skill instruction two."],
    memoryContext: "Previous bug involved expiry comparison.",
    taskContext: "Fix auth expiry bug without widening access.",
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
      scriptNames: ["dev", "start", "build", "verify:all"],
      devCommand: "bun run --watch src/index.tsx",
      verifyCommand: "bun run verify:all",
      stackHints: ["bun", "react", "ink", "typescript", "zustand"],
    },
    sessionContext: {
      sessionId: "ses_prompt",
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      state: "ACTIVE",
      messageCount: 5,
      totalIterations: 2,
      totalTokensUsed: 321,
    },
    runtimeContext: {
      provider: "local",
      model: "llama3.2",
      circuitState: "closed",
      memoryTruthModeOverride: "prefer_exact",
      availableProviders: ["anthropic", "local"],
      failover: { local: ["anthropic"] },
      providerHealth: {
        local: { state: "closed", failureCount: 0 },
        anthropic: { state: "open", failureCount: 2 },
      },
      recentFailovers: [{
        fromProvider: "local",
        fromModel: "llama3.2",
        toProvider: "anthropic",
        toModel: "claude-sonnet-4-5",
        errorType: "LLMConnectionError",
        errorMessage: "connect refused",
        timestamp: 1713270000000,
      }],
      activeToolIds: ["file_read", "grep_search"],
      permittedToolIds: ["file_read", "grep_search"],
      sessionRuleCount: 1,
      sessionRules: ["file_read:abc1234567890def"],
      pendingApproval: false,
      budgetUsd: 10,
      contextUsedTokens: 1200,
      contextMaxTokens: 128000,
      contextPercentUsed: 0.9,
      compactionFailureCount: 0,
      lastCompactionStrategy: "standard",
      lastCompactionSavedTokens: 240,
      startupErrors: 0,
      startupWarnings: 1,
    },
    startupReport: {
      passed: false,
      errorCount: 0,
      warningCount: 1,
      checks: [
        { name: "Ollama server", passed: false, severity: "warning", message: "Cannot connect", fix: "Start Ollama." },
      ],
    },
    agentId: "assist-ant",
  });

  assertEqual(result.messages[0]?.role, "system", "Assembled prompt starts with system message");
  assert(result.messages[0]?.content.includes("## Identity: Assist-Ant"), "System prompt keeps identity block");
  assert(result.messages[0]?.content.includes("Available tools:"), "System prompt includes tool declarations");
  assert(result.messages[0]?.content.includes("Skill instruction one."), "System prompt includes skill block");
  assert(result.messages[0]?.content.includes("Relevant context from past interactions"), "System prompt includes memory block");
  assert(result.messages[0]?.content.includes("Current task context"), "System prompt includes task block");
  assert(result.messages[0]?.content.includes("Workspace:"), "System prompt includes workspace context");
  assert(result.messages[0]?.content.includes("Start dir: D:/The Colony Test/colony-ts/src/ui"), "System prompt includes workspace start dir");
  assert(result.messages[0]?.content.includes("Mode: single-package"), "System prompt includes workspace mode");
  assert(result.messages[0]?.content.includes("Stack: bun, react, ink, typescript, zustand"), "System prompt includes workspace stack hints");
  assert(result.messages[0]?.content.includes("Scripts: dev, start, build, verify:all"), "System prompt includes workspace scripts");
  assert(result.messages[0]?.content.includes("Dev command: bun run --watch src/index.tsx"), "System prompt includes workspace dev command");
  assert(result.messages[0]?.content.includes("Verify command: bun run verify:all"), "System prompt includes workspace verify command");
  assert(result.messages[0]?.content.includes("Runtime state:"), "System prompt includes runtime context");
  assert(result.messages[0]?.content.includes("Circuit: closed"), "System prompt includes circuit state");
  assert(result.messages[0]?.content.includes("Memory recall mode: prefer-exact"), "System prompt includes memory recall mode");
  assert(result.messages[0]?.content.includes("Provider health:"), "System prompt includes provider health section");
  assert(result.messages[0]?.content.includes("anthropic: open (failures: 2)"), "System prompt includes provider health detail");
  assert(result.messages[0]?.content.includes("Recent failovers:"), "System prompt includes recent failovers");
  assert(result.messages[0]?.content.includes("connect refused"), "System prompt includes failover error context");
  assert(result.messages[0]?.content.includes("Session state:"), "System prompt includes session context");
  assert(result.messages[0]?.content.includes("Exact-signature session rules: 1"), "System prompt includes session allow rule count");
  assert(result.messages[0]?.content.includes("Exact-signature rule list:"), "System prompt includes session allow rule list header");
  assert(result.messages[0]?.content.includes("file_read:abc1234567890def"), "System prompt includes session allow rule detail");
  assert(result.messages[0]?.content.includes("Budget cap: $10.00"), "System prompt includes budget cap");
  assert(result.messages[0]?.content.includes("Last compaction: standard"), "System prompt includes last compaction summary");
  assert(result.messages[0]?.content.includes("saved ~240 tokens"), "System prompt includes last compaction saved-token detail");
  assert(result.messages[0]?.content.includes("Startup checks: 0 error(s), 1 warning(s)"), "System prompt includes startup count summary");
  assert(result.messages[0]?.content.includes("Startup diagnostics:"), "System prompt includes startup diagnostics when degraded");
  assert(result.messages.slice(1).some((message) => message.role === "system" && message.content.includes("Context Summary")), "Compaction system summary preserved in history");
  assert(result.messages.some((message) => message.role === "tool" && message.name === "file_read"), "Tool result converted to tool message");
  assert(result.blocksUsed.some((block) => block.type === "TOOL_DECLARATIONS"), "Block report includes tool declarations");
  assert(result.blocksUsed.some((block) => block.type === "CONVERSATION_HISTORY"), "Block report includes history");
  assert(result.totalTokens > 0, "Assembled prompt reports token total");
}

function verifyBudgetCompaction(): void {
  section("2. Block Budget Compaction");

  const assembler = new PromptAssembler({
    caste: Caste.SHIELD_GENERALS,
    contextWindowTokens: 140,
    responseReserveTokens: 20,
  });

  const result = assembler.assemble({
    customSystemPrompt: "Identity block.",
    skillInstructions: ["Skill ".repeat(30)],
    memoryContext: "Memory ".repeat(40),
    taskContext: "Task ".repeat(40),
    conversationHistory: [serializeMessage(createUserMessage("History ".repeat(20)))],
  });

  assert(result.wasCompacted, "Prompt assembler compacts blocks when over budget");
  assert(result.droppedBlocks.length > 0, "Compaction records dropped blocks");
  assertEqual(result.droppedBlocks[0], BlockType[BlockType.TASK_CONTEXT], "Lowest-priority task context drops first");
  assert(!result.droppedBlocks.includes(BlockType[BlockType.CASTE_IDENTITY]), "Identity block survives before lower-priority blocks");
}

function verifyLoopIntegration(): void {
  section("3. AgentLoop Integration");

  let session = createAgentSession({
    agentId: "assist-ant",
    caste: Caste.ASSIST_ANT,
  });
  session = addMessage(session, createSystemMessage(PromptBuilder.buildSystemPrompt({
    caste: Caste.ASSIST_ANT,
    agentId: "assist-ant",
  }), 100));
  session = addMessage(session, createUserMessage("Check auth bug."));
  session = addMessage(session, createAssistantMessage("Need file.", {
    toolCalls: [createToolCall("file_read", { path: "src/auth.ts" }, "call_1")],
  }));
  session = addMessage(session, createSystemMessage("[CONTEXT RECOVERY - 5 messages compacted due to context overflow]\n\nKey user requests...", 90));
  session = addMessage(session, createToolResult("call_1", "file_read", "auth.ts", false, 10));

  const loop = new AgentLoop({
    session,
    toolSchemas: [{
      function: {
        name: "file_read",
        description: "Read file",
        parameters: { type: "object" },
      },
    }],
    promptContext: {
      workspace: {
        root: "D:/The Colony Test/colony-ts",
        startDir: "D:/The Colony Test/colony-ts/src/runtime",
        name: "colony-ts",
        detected: true,
        projectType: "bun",
        packageManager: "bun",
        workspaceMode: "single-package",
        workspaceGlobs: ["apps/*", "packages/*"],
        workspacePackageCount: 3,
        workspaceAppCount: 1,
        workspaceLibraryCount: 2,
        workspaceOtherCount: 0,
        scriptNames: ["dev", "start", "build", "verify:all"],
        devCommand: "bun run --watch src/index.tsx",
        verifyCommand: "bun run verify:all",
        stackHints: ["bun", "react", "ink", "typescript", "zustand"],
      },
      startupReport: {
        passed: false,
        errorCount: 0,
        warningCount: 1,
        checks: [
          { name: "Ollama server", passed: false, severity: "warning", message: "Cannot connect", fix: "Start Ollama." },
        ],
      },
      runtime: {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        circuitState: "open",
        memoryTruthModeOverride: "derived_only",
        availableProviders: ["anthropic", "local"],
        failover: { local: ["anthropic"] },
        providerHealth: {
          anthropic: { state: "open", failureCount: 3 },
          local: { state: "closed", failureCount: 0 },
        },
        recentFailovers: [{
          fromProvider: "local",
          fromModel: "llama3.2",
          toProvider: "anthropic",
          toModel: "claude-sonnet-4-5-20250929",
          errorType: "LLMConnectionError",
          errorMessage: "connect refused",
          timestamp: 1713270005000,
        }],
        activeToolIds: ["file_read"],
        permittedToolIds: ["file_read"],
        sessionRuleCount: 2,
        sessionRules: ["file_read:abc1234567890def", "web_search:def4567890abc123"],
        budgetUsd: 5,
        lastCompactionStrategy: "reactive",
        lastCompactionSavedTokens: 512,
      },
    },
  });

  const messages = (loop as any)._buildMessages() as LLMMessage[];
  assertEqual(messages[0]?.role, "system", "Loop uses assembled system prompt");
  assert(messages[0]?.content.includes("Available tools:"), "Loop system prompt includes tool declarations");
  assert(messages[0]?.content.includes("Workspace:"), "Loop prompt includes workspace context");
  assert(messages[0]?.content.includes("Start dir: D:/The Colony Test/colony-ts/src/runtime"), "Loop prompt includes workspace start dir");
  assert(messages[0]?.content.includes("Mode: single-package"), "Loop prompt includes workspace mode");
  assert(messages[0]?.content.includes("Stack: bun, react, ink, typescript, zustand"), "Loop prompt includes workspace stack hints");
  assert(messages[0]?.content.includes("Scripts: dev, start, build, verify:all"), "Loop prompt includes workspace scripts");
  assert(messages[0]?.content.includes("Runtime state:"), "Loop prompt includes runtime context");
  assert(messages[0]?.content.includes("Provider: anthropic"), "Loop prompt keeps runtime provider context");
  assert(messages[0]?.content.includes("Model: claude-sonnet-4-5-20250929"), "Loop prompt keeps runtime model context");
  assert(messages[0]?.content.includes("Circuit: open"), "Loop prompt keeps runtime circuit context");
  assert(messages[0]?.content.includes("Memory recall mode: derived-only"), "Loop prompt keeps memory recall mode");
  assert(messages[0]?.content.includes("Provider health:"), "Loop prompt includes provider health section");
  assert(messages[0]?.content.includes("connect refused"), "Loop prompt includes recent failover detail");
  assert(messages[0]?.content.includes("Exact-signature session rules: 2"), "Loop prompt keeps session allow rule count");
  assert(messages[0]?.content.includes("Exact-signature rule list:"), "Loop prompt keeps session allow rule list header");
  assert(messages[0]?.content.includes("file_read:abc1234567890def"), "Loop prompt keeps exact-signature rule detail");
  assert(messages[0]?.content.includes("Budget cap: $5.00"), "Loop prompt keeps budget cap");
  assert(messages[0]?.content.includes("Last compaction: reactive"), "Loop prompt keeps last compaction context");
  assert(messages[0]?.content.includes("saved ~512 tokens"), "Loop prompt keeps last compaction saved-token detail");
  assert(messages[0]?.content.includes("Session state:"), "Loop prompt includes session state");
  assertEqual(messages.filter((message) => message.role === "system").length, 2, "Loop preserves later compaction system summary");
  const assistant = messages.find((message) => message.role === "assistant");
  assert((assistant?.toolCalls?.[0] as Record<string, unknown>)?.function != null, "Loop normalizes assistant tool calls to function shape");
  assert(((assistant?.toolCalls?.[0] as Record<string, unknown>)?.function as Record<string, unknown>)?.arguments === "{\"path\":\"src/auth.ts\"}", "Loop stringifies assistant tool-call arguments");
}

function main(): void {
  console.log("\nTHE COLONY - Phase 14 Verification (Prompt Assembler)\n");

  verifyAssemblyCore();
  verifyBudgetCompaction();
  verifyLoopIntegration();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 14 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 14: Prompt assembler is GREEN.");
}

main();
