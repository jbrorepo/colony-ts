/**
 * Phase 5 Verification Script — The Nerves
 *
 * Confirms:
 *   1. ToolRegistry — register, lookup, LLM schema export
 *   2. ToolExecutor — execute, timeout, validation, truncation
 *   3. Builtin shell_exec — blocked commands, output capture
 *   4. Builtin file tools — read, write, list, edit
 *   5. Builtin grep — regex search
 *   6. registerBuiltinTools — full registration
 *
 * Run: bun run src/verify-phase5.ts
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  ToolRegistry,
  ToolExecutor,
  ToolNotFoundError,
  ToolValidationError,
  ToolError,
  createToolDefinition,
  isToolSuccess,
} from "./runtime/tools-registry";
import {
  shellExec,
  fileRead,
  fileWrite,
  fileList,
  fileEdit,
  grepSearch,
  registerBuiltinTools,
} from "./runtime/builtin-tools";

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

// Test workspace
const WORKSPACE = join(process.cwd(), ".colony-test-workspace");

function setupWorkspace(): void {
  if (existsSync(WORKSPACE)) rmSync(WORKSPACE, { recursive: true });
  mkdirSync(WORKSPACE, { recursive: true });
  mkdirSync(join(WORKSPACE, "src"), { recursive: true });
  writeFileSync(join(WORKSPACE, "README.md"), "# Test Project\n", "utf-8");
  writeFileSync(join(WORKSPACE, "src", "index.ts"), "export const x = 42;\n", "utf-8");
  writeFileSync(join(WORKSPACE, "src", "utils.ts"), "export function add(a: number, b: number) { return a + b; }\n", "utf-8");
}

function cleanupWorkspace(): void {
  if (existsSync(WORKSPACE)) rmSync(WORKSPACE, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. ToolRegistry
// ---------------------------------------------------------------------------

function verifyRegistry(): void {
  section("1. ToolRegistry — Registration & Lookup");

  const registry = new ToolRegistry();

  // Register
  const echoDef = createToolDefinition("echo", "Echo", {
    description: "Echo the input",
    category: "custom",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  });
  registry.register(echoDef, (args: Record<string, unknown>) => String(args.text ?? ""));

  assertEqual(registry.count, 1, "Registry has 1 tool");
  assertEqual(registry.has("echo"), true, "Registry has 'echo'");

  // Lookup
  const found = registry.get("echo");
  assertEqual(found.name, "Echo", "Lookup returns correct name");
  assertEqual(found.category, "custom", "Lookup returns correct category");

  // Handler
  const handler = registry.getHandler("echo");
  assert(typeof handler === "function", "Handler is a function");

  // Duplicate registration throws
  let dupThrew = false;
  try {
    registry.register(echoDef, () => "");
  } catch (e) {
    dupThrew = e instanceof ToolError;
  }
  assert(dupThrew, "Duplicate registration throws ToolError");

  // Not found throws
  let notFoundThrew = false;
  try {
    registry.get("nonexistent");
  } catch (e) {
    notFoundThrew = e instanceof ToolNotFoundError;
  }
  assert(notFoundThrew, "Not found throws ToolNotFoundError");

  // Register another and list
  registry.register(
    createToolDefinition("add", "Add", { category: "math" }),
    () => "0",
  );
  assertEqual(registry.count, 2, "Registry has 2 tools");

  const all = registry.listTools();
  assertEqual(all.length, 2, "listTools returns 2");
  assertEqual(all[0].toolId, "add", "Sorted: add first");

  const customOnly = registry.listTools("custom");
  assertEqual(customOnly.length, 1, "Filter: 1 custom tool");

  // Unregister
  assertEqual(registry.unregister("add"), true, "Unregister existing returns true");
  assertEqual(registry.unregister("add"), false, "Unregister missing returns false");
  assertEqual(registry.count, 1, "Registry back to 1 tool");

  // registerOrReplace
  registry.registerOrReplace(
    createToolDefinition("echo", "Echo v2", { description: "Updated" }),
    () => "v2",
  );
  assertEqual(registry.get("echo").name, "Echo v2", "Replace updates definition");

  // LLM schema export
  const schemas = registry.toPromptSchema();
  assertEqual(schemas.length, 1, "Schema exports 1 tool");
  assertEqual((schemas[0] as any).type, "function", "Schema type is function");
  assertEqual((schemas[0] as any).function.name, "echo", "Schema function name");

  // Reset
  registry.reset();
  assertEqual(registry.count, 0, "Reset clears everything");
}

// ---------------------------------------------------------------------------
// 2. ToolExecutor
// ---------------------------------------------------------------------------

async function verifyExecutor(): Promise<void> {
  section("2. ToolExecutor — Execute, Timeout, Validation");

  const registry = new ToolRegistry();

  // Simple sync tool
  registry.register(
    createToolDefinition("greet", "Greet", {
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    }),
    (args: Record<string, unknown>) => `Hello, ${args.name}!`,
  );

  const executor = new ToolExecutor(registry);

  // Success
  const result = await executor.execute("greet", { name: "Colony" });
  assertEqual(result.error, null, "Successful execution: no error");
  assertEqual(result.output, "Hello, Colony!", "Output matches");
  assert(isToolSuccess(result), "isToolSuccess returns true");
  assert(result.durationSeconds >= 0, "Duration tracked");

  // Not found
  const missing = await executor.execute("nonexistent");
  assert(missing.error !== null, "Missing tool: has error");
  assert(missing.error!.includes("not found"), "Error mentions not found");

  // Validation — missing required
  const invalid = await executor.execute("greet", {});
  assert(invalid.error !== null, "Missing required: has error");
  assert(invalid.error!.includes("Validation"), "Error mentions validation");

  // Validation — unknown fields
  registry.register(
    createToolDefinition("strict", "Strict", {
      parameters: {
        type: "object",
        properties: { a: { type: "string" } },
        additionalProperties: false,
      },
    }),
    (args: Record<string, unknown>) => String(args.a ?? ""),
  );

  const unknown = await executor.execute("strict", { a: "ok", b: "extra" });
  assert(unknown.error !== null, "Unknown field: has error");
  assert(unknown.error!.includes("Unknown"), "Error mentions unknown");

  // Timeout
  registry.register(
    createToolDefinition("slow", "Slow Tool", { timeoutSeconds: 0.1 }),
    async () => {
      await new Promise((r) => setTimeout(r, 500));
      return "done";
    },
  );

  const timeout = await executor.execute("slow");
  assert(timeout.error !== null, "Timeout: has error");
  assert(timeout.timedOut, "Timeout flag set");

  // Output truncation
  registry.register(
    createToolDefinition("big", "Big Output", { maxOutputBytes: 50 }),
    () => "x".repeat(200),
  );

  const big = await executor.execute("big");
  assert(big.truncated, "Big output: truncated flag");
  assert(big.output.includes("[output truncated]"), "Truncation marker present");
}

// ---------------------------------------------------------------------------
// 3. Builtin shell_exec
// ---------------------------------------------------------------------------

async function verifyShellExec(): Promise<void> {
  section("3. Builtin shell_exec — Command Execution");

  // Simple command
  const echo = await shellExec({ command: "echo hello" });
  assert(echo.includes("hello"), "echo output captured");
  assert(echo.includes("[exit code: 0]"), "exit code 0");

  // Empty command
  const empty = await shellExec({ command: "" });
  assert(empty.includes("[error]"), "Empty command: error");

  // Blocked command
  const blocked = await shellExec({ command: "rm -rf /" });
  assert(blocked.includes("[error]"), "Blocked command: error");
  assert(blocked.includes("Blocked"), "Blocked command: mentions blocked");

  // Fork bomb blocked
  const forkBomb = await shellExec({ command: ":(){:|:&};:" });
  assert(forkBomb.includes("[error]"), "Fork bomb: blocked");

  // Timeout
  const timeoutCommand = process.platform === "win32"
    ? "Start-Sleep -Milliseconds 500"
    : "sleep 0.5";
  const timeout = await shellExec({ command: timeoutCommand, timeout_seconds: 0.1 });
  assert(timeout.includes("timed out"), "Timeout: command is killed");

  // Bad command (nonexistent)
  const bad = await shellExec({ command: "nonexistent_command_12345" });
  assert(bad.includes("[exit code:") || bad.includes("[error]"), "Bad command: error or non-zero exit");
}

// ---------------------------------------------------------------------------
// 4. Builtin file tools
// ---------------------------------------------------------------------------

async function verifyFileTools(): Promise<void> {
  section("4. Builtin File Tools — Read, Write, List, Edit");

  setupWorkspace();

  // file_read
  const readme = await fileRead({ path: join(WORKSPACE, "README.md") });
  assert(readme.includes("# Test Project"), "file_read: content correct");

  // file_read not found
  const missing = await fileRead({ path: join(WORKSPACE, "nope.txt") });
  assert(missing.includes("[error]"), "file_read: not found error");

  // file_write
  const writeResult = await fileWrite({
    path: join(WORKSPACE, "new.txt"),
    content: "Hello Colony",
  });
  assert(writeResult.includes("Successfully wrote"), "file_write: success message");
  assert(writeResult.includes("12 characters"), "file_write: character count");

  // Verify written
  const readBack = await fileRead({ path: join(WORKSPACE, "new.txt") });
  assertEqual(readBack, "Hello Colony", "file_write: content verified");

  // file_list
  const listing = await fileList({ directory: WORKSPACE });
  assert(listing.includes("README.md"), "file_list: shows README.md");
  assert(listing.includes("[DIR ]"), "file_list: shows directories");
  assert(listing.includes("[FILE]"), "file_list: shows files");

  // file_edit
  writeFileSync(join(WORKSPACE, "edit_test.txt"), "foo bar baz", "utf-8");

  const editResult = await fileEdit({
    path: join(WORKSPACE, "edit_test.txt"),
    old_string: "bar",
    new_string: "REPLACED",
  });
  assert(editResult.includes("Edited"), "file_edit: success");

  const editContent = await fileRead({ path: join(WORKSPACE, "edit_test.txt") });
  assert(editContent.includes("REPLACED"), "file_edit: content updated");
  assert(!editContent.includes("bar"), "file_edit: old content removed");

  // file_edit — not found
  const editMissing = await fileEdit({
    path: join(WORKSPACE, "edit_test.txt"),
    old_string: "xyz_not_there",
    new_string: "abc",
  });
  assert(editMissing.includes("[error]"), "file_edit: not found error");

  // file_edit — multiple matches
  writeFileSync(join(WORKSPACE, "dup.txt"), "aaa aaa aaa", "utf-8");
  const editDup = await fileEdit({
    path: join(WORKSPACE, "dup.txt"),
    old_string: "aaa",
    new_string: "bbb",
  });
  assert(editDup.includes("3 times"), "file_edit: multiple match error");

  cleanupWorkspace();
}

// ---------------------------------------------------------------------------
// 5. Builtin grep_search
// ---------------------------------------------------------------------------

async function verifyGrepSearch(): Promise<void> {
  section("5. Builtin grep_search — Regex File Search");

  setupWorkspace();

  // Search across workspace
  const result = await grepSearch({ pattern: "export", path: WORKSPACE });
  assert(result.includes("export"), "grep_search: found exports");
  assert(result.includes("index.ts"), "grep_search: found in index.ts");
  assert(result.includes("utils.ts"), "grep_search: found in utils.ts");

  // Pattern with no matches
  const noMatch = await grepSearch({ pattern: "zzz_nonexistent_pattern", path: WORKSPACE });
  assert(noMatch.includes("No matches"), "grep_search: no matches message");

  // Invalid regex
  const badRegex = await grepSearch({ pattern: "[invalid", path: WORKSPACE });
  assert(badRegex.includes("[error]"), "grep_search: invalid regex error");

  // Non-existent path
  const badPath = await grepSearch({ pattern: "test", path: "/nonexistent/path" });
  assert(badPath.includes("[error]"), "grep_search: bad path error");

  cleanupWorkspace();
}

// ---------------------------------------------------------------------------
// 6. registerBuiltinTools
// ---------------------------------------------------------------------------

function verifyRegistration(): void {
  section("6. registerBuiltinTools — Full Registration");

  const registry = new ToolRegistry();
  registerBuiltinTools(registry);

  assert(registry.has("shell_exec"), "Registered: shell_exec");
  assert(registry.has("file_read"), "Registered: file_read");
  assert(registry.has("file_write"), "Registered: file_write");
  assert(registry.has("file_list"), "Registered: file_list");
  assert(registry.has("file_edit"), "Registered: file_edit");
  assert(registry.has("grep_search"), "Registered: grep_search");

  assertEqual(registry.count, 6, "6 builtin tools registered");

  // Category filtering
  const fileTools = registry.listTools("file");
  assert(fileTools.length >= 4, "At least 4 file tools");

  const shellTools = registry.listTools("shell");
  assertEqual(shellTools.length, 1, "1 shell tool");
  assertEqual(shellTools[0].toolId, "shell_exec", "Shell tool is shell_exec");

  // Schema export
  const schemas = registry.toPromptSchema();
  assertEqual(schemas.length, 6, "Schema exports 6 tools");

  // Filtered schema
  const fileSchemas = registry.toPromptSchema(["file_read", "file_write"]);
  assertEqual(fileSchemas.length, 2, "Filtered schema: 2 tools");

  // Each schema has correct structure
  for (const schema of schemas) {
    const s = schema as Record<string, unknown>;
    assertEqual(s.type, "function", `Schema type for ${(s.function as any)?.name}`);
    const fn = s.function as Record<string, unknown>;
    assert(typeof fn.name === "string", `Schema has string name`);
    assert(typeof fn.description === "string", `Schema has description`);
    assert(typeof fn.parameters === "object", `Schema has parameters`);
  }
}

// ---------------------------------------------------------------------------
// Run all verifications
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n⚡ THE COLONY — Phase 5 Verification (The Nerves)\n");

  verifyRegistry();
  await verifyExecutor();
  await verifyShellExec();
  await verifyFileTools();
  await verifyGrepSearch();
  verifyRegistration();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.error("\n⚠️  Phase 5 verification FAILED. Fix issues above.");
    process.exit(1);
  } else {
    console.log("\n⚡ Phase 5: The Nerves are GREEN. Ready for Phase 6.");
  }
}

main();
