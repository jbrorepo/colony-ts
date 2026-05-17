/**
 * Phase 82 Verification Script - Tool Metadata Contracts
 *
 * Covers the P0-Tool-Metadata gap closure slice:
 *   1. Tool definitions normalize typed safety/runtime metadata
 *   2. Builtin tools declare read-only/destructive/concurrency/persistence truth
 *   3. Runtime categories derive from metadata rather than legacy names only
 *   4. MCP tools/list exposes safe metadata annotations
 *   5. /tools can render definition metadata for operator inspection
 *
 * Run: bun run src/verify-phase82.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { buildToolsCommandPayload } from "./gateway-tools";
import { McpToolAdapter } from "./mcp";
import { registerBuiltinTools } from "./runtime/builtin-tools";
import { buildRuntimeTooling, deriveToolLoopCategory } from "./runtime/runtime-tooling";
import {
  ToolExecutor,
  ToolRegistry,
  createToolDefinition,
} from "./runtime/tools-registry";

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
  assert(Object.is(actual, expected), `${label} (expected ${String(expected)}, got ${String(actual)})`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function registryWithBuiltins(): ToolRegistry {
  const registry = new ToolRegistry();
  registerBuiltinTools(registry, { workspace: process.cwd(), enforcePathValidation: true });
  return registry;
}

function verifyDefinitionMetadataDefaults(): void {
  section("1. Tool Definition Metadata Defaults");

  const definition = createToolDefinition("custom_probe", "Custom Probe");
  const metadata = definition.metadata;

  assertEqual(metadata.readOnly, false, "Custom tools default to not read-only");
  assertEqual(metadata.destructive, false, "Custom tools default to not destructive");
  assertEqual(metadata.concurrency, "exclusive", "Custom tools default to exclusive concurrency");
  assertEqual(metadata.interrupt, "interruptible", "Custom tools default to interruptible");
  assertEqual(metadata.progress, "activity", "Custom tools default to activity progress");
  assertEqual(metadata.transcript.searchIndexed, false, "Custom transcript is not search-indexed by default");
  assertEqual(metadata.transcript.output, "externalized", "Custom transcript defaults to externalized output");
  assertEqual(metadata.persistedResult.mode, "threshold", "Custom persisted result mode defaults to threshold");
  assertEqual(metadata.persistedResult.thresholdBytes, 10_000, "Custom persisted result threshold is 10KB");
}

function verifyBuiltinMetadata(): void {
  section("2. Builtin Tool Metadata");

  const registry = registryWithBuiltins();
  const read = registry.get("file_read").metadata;
  const list = registry.get("file_list").metadata;
  const grep = registry.get("grep_search").metadata;
  const write = registry.get("file_write").metadata;
  const edit = registry.get("file_edit").metadata;
  const shell = registry.get("shell_exec").metadata;
  const glob = registry.get("glob_find").metadata;
  const gitStatus = registry.get("git_status").metadata;
  const gitDiff = registry.get("git_diff").metadata;
  const test = registry.get("test_runner");
  const lint = registry.get("lint_runner");
  const webFetch = registry.get("web_fetch");
  const webSearch = registry.get("web_search");

  assertEqual(read.readOnly, true, "file_read is read-only");
  assertEqual(read.destructive, false, "file_read is not destructive");
  assertEqual(read.concurrency, "parallel_safe", "file_read is parallel-safe");
  assertEqual(read.transcript.searchIndexed, true, "file_read transcript is search-indexed");

  assertEqual(list.readOnly, true, "file_list is read-only");
  assertEqual(list.concurrency, "parallel_safe", "file_list is parallel-safe");

  assertEqual(grep.readOnly, true, "grep_search is read-only");
  assertEqual(grep.search.indexed, true, "grep_search declares search metadata");
  assertEqual(grep.search.queryParameter, "pattern", "grep_search declares query parameter");
  assertEqual(grep.concurrency, "parallel_safe", "grep_search is parallel-safe");

  assertEqual(write.readOnly, false, "file_write is not read-only");
  assertEqual(write.destructive, true, "file_write is destructive");
  assertEqual(write.concurrency, "exclusive", "file_write is exclusive");
  assertEqual(write.transcript.searchIndexed, false, "file_write output is not transcript-search indexed");

  assertEqual(edit.destructive, true, "file_edit is destructive");
  assertEqual(edit.concurrency, "exclusive", "file_edit is exclusive");

  assertEqual(shell.destructive, true, "shell_exec is destructive/risky");
  assertEqual(shell.concurrency, "exclusive", "shell_exec is exclusive");
  assertEqual(shell.progress, "streaming", "shell_exec declares streaming progress");

  assertEqual(glob.readOnly, true, "glob_find is read-only");
  assertEqual(glob.search.indexed, true, "glob_find declares search metadata");
  assertEqual(glob.concurrency, "parallel_safe", "glob_find is parallel-safe");
  assertEqual(gitStatus.readOnly, true, "git_status is read-only");
  assertEqual(gitStatus.concurrency, "parallel_safe", "git_status is parallel-safe");
  assertEqual(gitDiff.readOnly, true, "git_diff is read-only");
  assertEqual(gitDiff.transcript.output, "externalized", "git_diff transcript output is externalized");
  assertEqual(test.requiresApproval, true, "test_runner requires approval");
  assertEqual(test.metadata.destructive, true, "test_runner is marked destructive because package scripts can mutate");
  assertEqual(test.metadata.concurrency, "exclusive", "test_runner is exclusive");
  assertEqual(lint.requiresApproval, true, "lint_runner requires approval");
  assertEqual(lint.metadata.destructive, true, "lint_runner is marked destructive because package scripts can mutate");
  assertEqual(lint.metadata.progress, "streaming", "lint_runner declares streaming progress");
  assertEqual(webFetch.requiresApproval, true, "web_fetch requires approval");
  assertEqual(webFetch.metadata.readOnly, true, "web_fetch is read-only");
  assertEqual(webFetch.metadata.destructive, false, "web_fetch is not destructive");
  assertEqual(webFetch.metadata.concurrency, "parallel_safe", "web_fetch is parallel-safe");
  assertEqual(webFetch.metadata.transcript.output, "externalized", "web_fetch externalizes output");
  assertEqual(webSearch.requiresApproval, true, "web_search requires approval");
  assertEqual(webSearch.metadata.readOnly, true, "web_search is read-only");
  assertEqual(webSearch.metadata.search.indexed, true, "web_search declares search metadata");
  assertEqual(webSearch.metadata.search.queryParameter, "query", "web_search declares query parameter");
}

async function verifyRuntimeCategoryDerivation(): Promise<void> {
  section("3. Runtime Category Derivation");

  const dir = await mkdtemp(join(tmpdir(), "colony-phase82-"));
  try {
    const tooling = buildRuntimeTooling("phase82-agent", "assist_ant", dir);
    assertEqual(tooling.toolCategories.get("file_read"), "read", "file_read category derives as read");
    assertEqual(tooling.toolCategories.get("file_list"), "read", "file_list category derives as read");
    assertEqual(tooling.toolCategories.get("grep_search"), "search", "grep_search category derives as search");
    assertEqual(tooling.toolCategories.get("file_write"), "write", "file_write category derives as write");
    assertEqual(tooling.toolCategories.get("file_edit"), "write", "file_edit category derives as write");
    assertEqual(tooling.toolCategories.get("shell_exec"), "shell", "shell_exec category remains shell");
    assertEqual(tooling.toolCategories.get("glob_find"), "search", "glob_find category derives as search");
    assertEqual(tooling.toolCategories.get("git_status"), "read", "git_status category derives as read");
    assertEqual(tooling.toolCategories.get("git_diff"), "read", "git_diff category derives as read");
    assertEqual(tooling.toolCategories.get("test_runner"), "runner", "test_runner remains exclusive runner");
    assertEqual(tooling.toolCategories.get("web_fetch"), "web", "web_fetch category derives as web");
    assertEqual(tooling.toolCategories.get("web_search"), "search", "web_search category derives as search");

    const exclusiveRead = createToolDefinition("exclusive_read_probe", "Exclusive Read Probe", {
      category: "file",
      metadata: {
        readOnly: true,
        destructive: false,
        concurrency: "exclusive",
      },
    });
    assertEqual(
      deriveToolLoopCategory(exclusiveRead),
      "read_exclusive",
      "Read-only exclusive tools do not enter parallel read category",
    );

    const exclusiveSearch = createToolDefinition("exclusive_search_probe", "Exclusive Search Probe", {
      category: "file",
      metadata: {
        readOnly: true,
        destructive: false,
        concurrency: "exclusive",
        search: {
          indexed: true,
          queryParameter: "query",
        },
      },
    });
    assertEqual(
      deriveToolLoopCategory(exclusiveSearch),
      "read_exclusive",
      "Exclusive search tools do not enter parallel search category",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function verifyMcpAnnotations(): void {
  section("4. MCP Metadata Annotations");

  const registry = registryWithBuiltins();
  const adapter = new McpToolAdapter(registry, new ToolExecutor(registry), {
    exposedToolIds: ["file_read", "file_write", "grep_search", "glob_find", "test_runner", "web_fetch", "web_search"],
  });
  const tools = adapter.listTools();
  const read = tools.find((tool) => tool.name === "file_read")?.annotations ?? {};
  const write = tools.find((tool) => tool.name === "file_write")?.annotations ?? {};
  const grep = tools.find((tool) => tool.name === "grep_search")?.annotations ?? {};
  const glob = tools.find((tool) => tool.name === "glob_find")?.annotations ?? {};
  const test = tools.find((tool) => tool.name === "test_runner")?.annotations ?? {};
  const webFetch = tools.find((tool) => tool.name === "web_fetch")?.annotations ?? {};
  const webSearch = tools.find((tool) => tool.name === "web_search")?.annotations ?? {};

  assertEqual(read.readOnlyHint, true, "MCP exposes file_read spec readOnlyHint");
  assertEqual(read.destructiveHint, false, "MCP exposes file_read spec destructiveHint");
  assertEqual(read.idempotentHint, true, "MCP exposes file_read spec idempotentHint");
  assertEqual(read.openWorldHint, false, "MCP exposes file_read spec openWorldHint");
  assertEqual(read.readOnly, true, "MCP preserves file_read Colony read-only metadata");
  assertEqual(read.destructive, false, "MCP preserves file_read Colony destructive metadata");
  assertEqual(read.concurrency, "parallel_safe", "MCP exposes file_read concurrency metadata");
  assertEqual(read.persistedResult, "threshold", "MCP exposes file_read persisted-result mode");

  assertEqual(write.readOnlyHint, false, "MCP exposes file_write spec readOnlyHint");
  assertEqual(write.destructiveHint, true, "MCP exposes file_write spec destructiveHint");
  assertEqual(write.idempotentHint, false, "MCP exposes file_write spec idempotentHint");
  assertEqual(write.openWorldHint, false, "MCP exposes file_write spec openWorldHint");
  assertEqual(write.readOnly, false, "MCP preserves file_write Colony read-only metadata");
  assertEqual(write.destructive, true, "MCP preserves file_write Colony destructive metadata");
  assertEqual(write.concurrency, "exclusive", "MCP exposes file_write concurrency metadata");

  assertEqual(grep.readOnlyHint, true, "MCP exposes grep_search spec readOnlyHint");
  assertEqual(grep.searchIndexed, true, "MCP exposes grep_search search metadata");
  assertEqual(glob.readOnlyHint, true, "MCP exposes glob_find spec readOnlyHint");
  assertEqual(glob.searchIndexed, true, "MCP exposes glob_find search metadata");
  assertEqual(test.readOnlyHint, false, "MCP exposes test_runner spec readOnlyHint");
  assertEqual(test.concurrency, "exclusive", "MCP exposes test_runner concurrency metadata");
  assertEqual(webFetch.openWorldHint, true, "MCP exposes web_fetch open-world metadata");
  assertEqual(webFetch.requiresApproval, true, "MCP exposes web_fetch approval metadata");
  assertEqual(webFetch.readOnlyHint, true, "MCP exposes web_fetch read-only metadata");
  assertEqual(webSearch.openWorldHint, true, "MCP exposes web_search open-world metadata");
  assertEqual(webSearch.searchIndexed, true, "MCP exposes web_search search metadata");
}

function verifyToolsRendering(): void {
  section("5. /tools Metadata Rendering");

  const registry = registryWithBuiltins();
  const payload = buildToolsCommandPayload({
    args: [],
    activeTools: ["file_read", "file_write", "glob_find", "grep_search", "test_runner", "web_fetch", "web_search"],
    permittedTools: ["file_read", "file_write", "glob_find", "grep_search", "test_runner", "web_fetch", "web_search"],
    deniedTools: [],
    sessionRuleCount: 0,
    pendingApproval: null,
    recentActivity: [],
    toolDefinitions: registry.listTools(),
  });

  assert(payload.output.includes("Tool metadata:"), "/tools summary renders metadata section");
  assert(payload.output.includes("file_read | read-only | safe=parallel_safe"), "/tools shows read-only parallel-safe file_read");
  assert(payload.output.includes("file_write | mutating | destructive | safe=exclusive"), "/tools shows destructive exclusive file_write");
  assert(payload.output.includes("grep_search | read-only | search | safe=parallel_safe"), "/tools shows search metadata");
  assert(payload.output.includes("glob_find | read-only | search | safe=parallel_safe"), "/tools shows glob metadata");
  assert(payload.output.includes("test_runner | mutating | destructive | safe=exclusive"), "/tools shows runner metadata");
  assert(payload.output.includes("web_fetch | read-only | safe=parallel_safe"), "/tools shows web_fetch metadata");
  assert(payload.output.includes("web_search | read-only | search | safe=parallel_safe"), "/tools shows web_search metadata");
  assert(payload.output.includes("persist=threshold@10000B"), "/tools shows persisted-result threshold");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 82 Verification (Tool Metadata Contracts)\n");

  verifyDefinitionMetadataDefaults();
  verifyBuiltinMetadata();
  await verifyRuntimeCategoryDerivation();
  verifyMcpAnnotations();
  verifyToolsRendering();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 82: tool metadata contracts are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
