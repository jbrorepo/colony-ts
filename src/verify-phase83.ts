/**
 * Phase 83 Verification Script - Safe Local Tool Breadth
 *
 * Covers the P0-Tool-Breadth-1 gap closure slice:
 *   1. `glob_find`, `git_status`, `git_diff`, `test_runner`, and `lint_runner`
 *      register with Phase 82 metadata contracts
 *   2. local discovery and git tools stay read-only, path-bounded, and output-bounded
 *   3. git diff output is redacted before surfacing
 *   4. test/lint wrappers are package-script bounded, output-bounded, and approval-gated
 *
 * Run: bun run src/verify-phase83.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  gitDiff,
  gitStatus,
  globFind,
  lintRunner,
  registerBuiltinTools,
  testRunner,
} from "./runtime/builtin-tools";
import { ToolExecutor, ToolRegistry } from "./runtime/tools-registry";

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

function parseJson(output: string): Record<string, unknown> {
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Expected JSON output, got: ${output.slice(0, 500)}`);
  }
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${code}): ${stdout}\n${stderr}`);
  }
}

function entriesOf(output: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(output.entries) ? output.entries as Array<Record<string, unknown>> : [];
}

function matchesOf(output: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(output.matches) ? output.matches as Array<Record<string, unknown>> : [];
}

function verifyRegistrationAndMetadata(): void {
  section("1. Registration and Metadata");

  const registry = new ToolRegistry();
  registerBuiltinTools(registry);

  for (const toolId of ["glob_find", "git_status", "git_diff", "test_runner", "lint_runner"]) {
    assert(registry.has(toolId), `Registered: ${toolId}`);
  }

  assertEqual(registry.get("glob_find").metadata.readOnly, true, "glob_find is read-only");
  assertEqual(registry.get("glob_find").metadata.concurrency, "parallel_safe", "glob_find is parallel-safe");
  assertEqual(registry.get("git_status").metadata.readOnly, true, "git_status is read-only");
  assertEqual(registry.get("git_diff").metadata.transcript.output, "externalized", "git_diff externalizes large output");

  assertEqual(registry.get("test_runner").requiresApproval, true, "test_runner requires approval");
  assertEqual(registry.get("test_runner").metadata.readOnly, false, "test_runner is executable, not read-only");
  assertEqual(registry.get("test_runner").metadata.destructive, true, "test_runner is destructive because package scripts can mutate");
  assertEqual(registry.get("test_runner").metadata.concurrency, "exclusive", "test_runner is exclusive");
  assertEqual(registry.get("lint_runner").requiresApproval, true, "lint_runner requires approval");
  assertEqual(registry.get("lint_runner").metadata.destructive, true, "lint_runner is destructive because package scripts can mutate");
}

async function verifyGlobFind(): Promise<void> {
  section("2. glob_find Path Safety and Bounds");

  const workspace = await mkdtemp(join(tmpdir(), "colony-glob-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "colony-glob-outside-"));
  try {
    await mkdir(join(workspace, "src", "nested"), { recursive: true });
    await mkdir(join(workspace, "node_modules", "ignored"), { recursive: true });
    await mkdir(join(workspace, ".git"), { recursive: true });
    await writeFile(join(workspace, "src", "index.ts"), "export const x = 1;\n", "utf-8");
    await writeFile(join(workspace, "src", "nested", "worker.ts"), "export const y = 2;\n", "utf-8");
    await writeFile(join(workspace, "node_modules", "ignored", "package.ts"), "ignored\n", "utf-8");
    await writeFile(join(workspace, ".git", "config"), "ignored\n", "utf-8");
    await writeFile(join(outside, "secret.ts"), "secret\n", "utf-8");

    const found = parseJson(await globFind({
      pattern: "**/*.ts",
      path: ".",
      max_results: 10,
    }, { workspace, enforcePathValidation: true }));
    const paths = matchesOf(found).map((entry) => String(entry.path)).sort();
    assertEqual(found.ok, true, "glob_find succeeds inside workspace");
    assert(paths.includes("src/index.ts"), "glob_find includes shallow TypeScript match");
    assert(paths.includes("src/nested/worker.ts"), "glob_find includes nested TypeScript match");
    assert(!paths.some((path) => path.includes("node_modules")), "glob_find skips node_modules by default");
    assert(!paths.some((path) => path.includes(".git")), "glob_find skips .git by default");

    const limited = parseJson(await globFind({
      pattern: "**/*.ts",
      path: ".",
      max_results: 1,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(limited.truncated, true, "glob_find reports truncation when max_results is hit");
    assertEqual(matchesOf(limited).length, 1, "glob_find respects max_results");

    const blocked = parseJson(await globFind({
      pattern: "**/*.ts",
      path: outside,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(blocked.ok, false, "glob_find blocks outside workspace");
    assert(String(blocked.error).includes("Path validation failed"), "glob_find reports path validation failure");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}

async function verifyGitTools(): Promise<void> {
  section("3. Structured Git Tools");

  const workspace = await mkdtemp(join(tmpdir(), "colony-git-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "colony-git-outside-"));
  try {
    await runGit(workspace, ["init"]);
    await runGit(workspace, ["config", "user.email", "phase83@example.test"]);
    await runGit(workspace, ["config", "user.name", "Phase 83"]);
    await writeFile(join(workspace, "README.md"), "hello\n", "utf-8");
    await runGit(workspace, ["add", "README.md"]);
    await runGit(workspace, ["commit", "-m", "initial"]);
    await writeFile(join(workspace, "README.md"), [
      "hello",
      "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ123456",
      "sk_live_abcdefghijklmnopqrstuvwxyz123456",
      "eyJaaaaaaaaaaa.eyJbbbbbbbbbbb.cccccccccccc",
      "api_key=abcdefghijklmnopqrstuvwxyz123456",
      "",
    ].join("\n"), "utf-8");
    await writeFile(join(workspace, "new.txt"), "new\n", "utf-8");

    const status = parseJson(await gitStatus({
      path: ".",
    }, { workspace, enforcePathValidation: true }));
    const entries = entriesOf(status);
    assertEqual(status.ok, true, "git_status succeeds in workspace repo");
    assert(entries.some((entry) => entry.path === "README.md" && String(entry.status).includes("M")), "git_status reports modified files");
    assert(entries.some((entry) => entry.path === "new.txt" && entry.status === "??"), "git_status reports untracked files");

    const diff = parseJson(await gitDiff({
      path: ".",
      max_chars: 4000,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(diff.ok, true, "git_diff succeeds in workspace repo");
    assert(String(diff.patch).includes("diff --git"), "git_diff includes patch text");
    assert(String(diff.patch).includes("sk-proj-****"), "git_diff redacts secret-like values");
    assert(!String(diff.patch).includes("abcdefghijklmnopqrstuvwxyz"), "git_diff does not leak raw secret body");
    assert(!String(diff.patch).includes("ghp_"), "git_diff does not leak GitHub PATs");
    assert(!String(diff.patch).includes("sk_live_"), "git_diff does not leak Stripe keys");
    assert(!String(diff.patch).includes("eyJaaaaaaaaaaa"), "git_diff does not leak JWT-like tokens");
    assert(!String(diff.patch).includes("api_key=abcdefghijklmnopqrstuvwxyz123456"), "git_diff does not leak generic API keys");

    const blocked = parseJson(await gitStatus({
      path: outside,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(blocked.ok, false, "git_status blocks outside workspace");
    assert(String(blocked.error).includes("Path validation failed"), "git_status reports path validation failure");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}

async function verifyRunnerWrappers(): Promise<void> {
  section("4. Package Script Runner Wrappers");

  const workspace = await mkdtemp(join(tmpdir(), "colony-runner-workspace-"));
  try {
    await writeFile(join(workspace, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.log('TEST_OK')\"",
        lint: "node -e \"console.log('LINT_OK')\"",
        "test:secret": "node -e \"console.log('ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ123456 sk_live_abcdefghijklmnopqrstuvwxyz123456 eyJaaaaaaaaaaa.eyJbbbbbbbbbbb.cccccccccccc api_key=abcdefghijklmnopqrstuvwxyz123456')\"",
        "test:noisy": "node -e \"console.log('x'.repeat(50000))\"",
        pretest: "node -e \"console.log('PRETEST_SHOULD_NOT_RUN')\"",
        posttest: "node -e \"console.log('POSTTEST_SHOULD_NOT_RUN')\"",
        postinstall: "node -e \"console.log('SHOULD_NOT_RUN')\"",
      },
    }, null, 2), "utf-8");

    const test = parseJson(await testRunner({
      script: "test",
      path: ".",
      timeout_seconds: 20,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(test.ok, true, "test_runner executes allowed test script");
    assertEqual(test.exitCode, 0, "test_runner returns exit code 0");
    assert(String(test.stdout).includes("TEST_OK"), "test_runner captures stdout");
    assert(!String(test.stdout).includes("PRETEST_SHOULD_NOT_RUN"), "test_runner does not execute pretest lifecycle scripts");
    assert(!String(test.stdout).includes("POSTTEST_SHOULD_NOT_RUN"), "test_runner does not execute posttest lifecycle scripts");
    assert(!String(test.stdout).includes("SHOULD_NOT_RUN"), "test_runner does not execute other scripts");

    const lint = parseJson(await lintRunner({
      script: "lint",
      path: ".",
      timeout_seconds: 20,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(lint.ok, true, "lint_runner executes allowed lint script");
    assertEqual(lint.exitCode, 0, "lint_runner returns exit code 0");
    assert(String(lint.stdout).includes("LINT_OK"), "lint_runner captures stdout");

    const secret = parseJson(await testRunner({
      script: "test:secret",
      path: ".",
      timeout_seconds: 20,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(secret.ok, true, "test_runner secret script executes for redaction check");
    const secretStdout = String(secret.stdout);
    assert(!secretStdout.includes("ghp_"), "test_runner does not leak GitHub PATs");
    assert(!secretStdout.includes("sk_live_"), "test_runner does not leak Stripe keys");
    assert(!secretStdout.includes("eyJaaaaaaaaaaa"), "test_runner does not leak JWT-like tokens");
    assert(!secretStdout.includes("api_key=abcdefghijklmnopqrstuvwxyz123456"), "test_runner does not leak generic API keys");

    const noisy = parseJson(await testRunner({
      script: "test:noisy",
      path: ".",
      timeout_seconds: 20,
      max_chars: 1000,
    }, { workspace, enforcePathValidation: true }));
    assertEqual(noisy.ok, true, "test_runner noisy script executes");
    assertEqual(noisy.truncated, true, "test_runner reports bounded noisy output truncation");
    assert(String(noisy.stdout).length < 1_200, "test_runner bounds noisy stdout before returning");

    const blocked = parseJson(await testRunner({
      script: "postinstall",
      path: ".",
    }, { workspace, enforcePathValidation: true }));
    assertEqual(blocked.ok, false, "test_runner blocks non-test scripts");
    assert(String(blocked.error).includes("not allowed"), "test_runner explains allowlist failure");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyExecutorIntegration(): Promise<void> {
  section("5. ToolExecutor Integration");

  const workspace = await mkdtemp(join(tmpdir(), "colony-breadth-exec-"));
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, "src", "app.ts"), "export const app = true;\n", "utf-8");

    const registry = new ToolRegistry();
    registerBuiltinTools(registry, { workspace, enforcePathValidation: true });
    const executor = new ToolExecutor(registry);
    const result = await executor.execute("glob_find", {
      pattern: "**/*.ts",
      path: ".",
    });

    assertEqual(result.error, null, "ToolExecutor executes glob_find without internal errors");
    const parsed = parseJson(result.output);
    assertEqual(parsed.ok, true, "ToolExecutor glob_find returns ok JSON");
    assert(matchesOf(parsed).some((entry) => entry.path === "src/app.ts"), "ToolExecutor glob_find returns expected match");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 83 Verification (Safe Local Tool Breadth)\n");

  verifyRegistrationAndMetadata();
  await verifyGlobFind();
  await verifyGitTools();
  await verifyRunnerWrappers();
  await verifyExecutorIntegration();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 83: safe local tool breadth is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
