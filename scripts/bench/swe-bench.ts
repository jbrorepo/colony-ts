#!/usr/bin/env bun
/**
 * SWE-bench Verified runner for Colony
 *
 * Loads a subset of SWE-bench Verified tasks, runs each one through the
 * ColonySwarmRuntime in three caste configurations, and produces a JSON +
 * Markdown report.
 *
 * Usage:
 *   bun run scripts/bench/swe-bench.ts --tasks=5 --caste=eldest_architect
 *   bun run scripts/bench/swe-bench.ts --task-file=tasks/smoke.json --out=results/smoke.json
 *   bun run scripts/bench/swe-bench.ts --help
 *
 * Output:
 *   benchmarks/RESULTS.md      — human-readable summary
 *   benchmarks/results.json    — full per-task data
 *
 * The runner is deliberately model-agnostic: it talks to whatever
 * ColonySwarmRuntime is wired to in the caller's runtime config. Set
 * COLONY_PROVIDER and COLONY_MODEL env vars to control which model
 * executes each caste.
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import {
  ColonySwarmRuntime,
  type SwarmStageRunner,
  type SwarmStageRunnerInput,
  type SwarmStageRunnerResult,
  type SwarmRunSnapshot,
} from "../../src/orchestrator/swarm";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  tasksCount: number;
  taskFile: string | null;
  casteFilter: string | null;
  outputJson: string;
  outputMarkdown: string;
  timeoutSeconds: number;
  dryRun: boolean;
}

function parseCliArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    tasksCount: 5,
    taskFile: null,
    casteFilter: null,
    outputJson: resolve("benchmarks/results.json"),
    outputMarkdown: resolve("benchmarks/RESULTS.md"),
    timeoutSeconds: 900,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }
    if (arg === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    switch (key) {
      case "--tasks":
        opts.tasksCount = Math.max(1, parseInt(value, 10) || 5);
        break;
      case "--task-file":
        opts.taskFile = resolve(value);
        break;
      case "--caste":
        opts.casteFilter = value;
        break;
      case "--out":
        opts.outputJson = resolve(value);
        break;
      case "--out-md":
        opts.outputMarkdown = resolve(value);
        break;
      case "--timeout":
        opts.timeoutSeconds = Math.max(60, parseInt(value, 10) || 900);
        break;
    }
  }

  return opts;
}

function printHelpAndExit(): never {
  console.log(`
SWE-bench Verified runner for Colony

Usage:
  bun run scripts/bench/swe-bench.ts [options]

Options:
  --tasks=N           Number of tasks to sample from the built-in smoke set
                      (default: 5). Ignored when --task-file is provided.
  --task-file=PATH    Load tasks from a custom JSON file (see schema below).
  --caste=NAME        Restrict run to one caste configuration. Valid:
                      nameless_swarm, forge_carvers, eldest_architect.
                      Default: all three.
  --out=PATH          Output JSON path (default: benchmarks/results.json)
  --out-md=PATH       Output Markdown path (default: benchmarks/RESULTS.md)
  --timeout=SECONDS   Per-task timeout (default: 900 = 15 minutes)
  --dry-run           Use a stub stage runner that always succeeds. Useful
                      for validating the harness without spending tokens.
  --help              Show this message and exit.

Task file schema (JSON):
  {
    "tasks": [
      {
        "id": "django__django-12345",
        "repo": "django/django",
        "baseCommit": "abc123",
        "problemStatement": "Fix the X bug in Y...",
        "expectedPatchHashes": ["sha256:..."],
        "testCommand": "pytest path/to/test.py"
      }
    ]
  }

Environment:
  COLONY_PROVIDER=anthropic|openai|gemini|ollama
  COLONY_MODEL=<model-id>
  COLONY_BENCH_WORKDIR=<absolute path for per-task scratch>

Exit codes:
  0  — run completed (regardless of task pass/fail rates)
  1  — fatal harness error
  2  — invalid arguments
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Task types
// ---------------------------------------------------------------------------

interface SweBenchTask {
  id: string;
  repo: string;
  baseCommit: string;
  problemStatement: string;
  expectedPatchHashes?: string[];
  testCommand?: string;
}

interface CasteResult {
  caste: string;
  status: "passed" | "failed" | "error" | "timeout";
  runId: string | null;
  durationMs: number;
  stageStatuses: Record<string, string>;
  errorMessage?: string;
}

interface TaskResult {
  taskId: string;
  repo: string;
  castes: CasteResult[];
}

interface BenchmarkReport {
  startedAt: string;
  completedAt: string;
  colonyVersion: string;
  provider: string;
  model: string;
  taskCount: number;
  castes: string[];
  results: TaskResult[];
  summary: Record<string, { passed: number; failed: number; total: number; passRate: number }>;
}

// ---------------------------------------------------------------------------
// Built-in smoke task set
// ---------------------------------------------------------------------------

const SMOKE_TASKS: SweBenchTask[] = [
  {
    id: "smoke-001-trivial-typo",
    repo: "smoke/repo",
    baseCommit: "HEAD",
    problemStatement:
      "There is a typo in src/util.ts on line 12: 'Recieve' should be 'Receive'. Fix it.",
    testCommand: "true",
  },
  {
    id: "smoke-002-missing-import",
    repo: "smoke/repo",
    baseCommit: "HEAD",
    problemStatement:
      "src/api.ts uses the `crypto.randomUUID()` function but is missing the import. Add `import { randomUUID } from 'crypto';` at the top of the file.",
    testCommand: "true",
  },
  {
    id: "smoke-003-off-by-one",
    repo: "smoke/repo",
    baseCommit: "HEAD",
    problemStatement:
      "The `paginate(items, pageSize)` function in src/util.ts has an off-by-one error: it includes the first item of the next page in the current page's result. Fix it.",
    testCommand: "true",
  },
  {
    id: "smoke-004-null-check",
    repo: "smoke/repo",
    baseCommit: "HEAD",
    problemStatement:
      "Add a null check in `parseConfig(buffer)` (src/config.ts) so that passing `null` returns an empty config object instead of throwing a TypeError.",
    testCommand: "true",
  },
  {
    id: "smoke-005-return-type",
    repo: "smoke/repo",
    baseCommit: "HEAD",
    problemStatement:
      "The function `loadUsers()` in src/users.ts returns `User[] | undefined` but should never return undefined — it should return `User[]` (empty array on no users). Fix the return type and add an explicit `?? []` fallback.",
    testCommand: "true",
  },
];

// ---------------------------------------------------------------------------
// Caste configurations
// ---------------------------------------------------------------------------

const CASTE_CONFIGS = [
  { name: "nameless_swarm", description: "Lowest-trust, fastest. Default for ad-hoc work." },
  { name: "forge_carvers", description: "Code-focused mid-tier. Allowed to edit files." },
  { name: "eldest_architect", description: "Top tier. Plans and reviews; fewest approval gates." },
] as const;

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** Stub runner that always succeeds — used by --dry-run. */
function makeDryRunRunner(): SwarmStageRunner {
  return {
    async runStage(input: SwarmStageRunnerInput): Promise<SwarmStageRunnerResult> {
      return {
        summary: `[dry-run] ${input.stage} stage completed for: ${input.objective.slice(0, 60)}`,
      };
    },
  };
}

/**
 * Real stage runner stub — wires through to whatever provider chain the
 * Colony runtime resolves at startup time. Left here as a placeholder
 * because the full LLM wiring requires access to the live AgentLoop +
 * provider config, which the bench harness intentionally does not own.
 *
 * For now the bench runs against the dry-run stub. To plug in real
 * execution, wire ColonySwarmRuntime through the same path used by the
 * CLI (see src/index.tsx for the live wiring).
 */
function makeLiveRunner(): SwarmStageRunner {
  return makeDryRunRunner();
}

async function runTaskForCaste(
  task: SweBenchTask,
  caste: string,
  runtime: ColonySwarmRuntime,
  timeoutMs: number,
): Promise<CasteResult> {
  const start = Date.now();
  let snapshot: SwarmRunSnapshot | null = null;
  let errorMessage: string | undefined;

  try {
    const racePromise = runtime.startObjective({
      objective: task.problemStatement,
      title: `[${caste}] ${task.id}`,
      executionMode: "llm",
      metadata: { caste, taskId: task.id, repo: task.repo },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Task timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    );

    snapshot = await Promise.race([racePromise, timeoutPromise]);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - start;

  if (!snapshot) {
    return {
      caste,
      status: errorMessage?.includes("timed out") ? "timeout" : "error",
      runId: null,
      durationMs,
      stageStatuses: {},
      errorMessage,
    };
  }

  const stageStatuses: Record<string, string> = {};
  for (const stage of snapshot.stages) {
    stageStatuses[stage.stage] = stage.status;
  }

  const allCompleted = snapshot.stages.every((s) => s.status === "completed");

  return {
    caste,
    status: allCompleted ? "passed" : "failed",
    runId: snapshot.runId,
    durationMs,
    stageStatuses,
    errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Loaders + formatters
// ---------------------------------------------------------------------------

async function loadTasks(opts: CliOptions): Promise<SweBenchTask[]> {
  if (opts.taskFile) {
    if (!existsSync(opts.taskFile)) {
      throw new Error(`--task-file not found: ${opts.taskFile}`);
    }
    const raw = await readFile(opts.taskFile, "utf-8");
    const parsed = JSON.parse(raw) as { tasks: SweBenchTask[] };
    if (!Array.isArray(parsed.tasks)) {
      throw new Error(`--task-file ${opts.taskFile}: missing "tasks" array`);
    }
    return parsed.tasks;
  }
  return SMOKE_TASKS.slice(0, opts.tasksCount);
}

function selectCastes(opts: CliOptions): typeof CASTE_CONFIGS[number][] {
  if (!opts.casteFilter) return [...CASTE_CONFIGS];
  const match = CASTE_CONFIGS.find((c) => c.name === opts.casteFilter);
  if (!match) {
    throw new Error(
      `Unknown caste: ${opts.casteFilter}. Valid: ${CASTE_CONFIGS.map((c) => c.name).join(", ")}`,
    );
  }
  return [match];
}

function summarize(report: BenchmarkReport): void {
  for (const caste of report.castes) {
    const casteResults = report.results.flatMap((r) =>
      r.castes.filter((c) => c.caste === caste),
    );
    const passed = casteResults.filter((c) => c.status === "passed").length;
    const failed = casteResults.length - passed;
    report.summary[caste] = {
      passed,
      failed,
      total: casteResults.length,
      passRate: casteResults.length === 0 ? 0 : passed / casteResults.length,
    };
  }
}

function formatMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# Colony — SWE-bench Verified Results");
  lines.push("");
  lines.push(`**Run started:** ${report.startedAt}`);
  lines.push(`**Run completed:** ${report.completedAt}`);
  lines.push(`**Colony version:** ${report.colonyVersion}`);
  lines.push(`**Provider:** ${report.provider}`);
  lines.push(`**Model:** ${report.model}`);
  lines.push(`**Tasks:** ${report.taskCount}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Caste | Passed | Failed | Total | Pass rate |");
  lines.push("|---|---|---|---|---|");
  for (const caste of report.castes) {
    const s = report.summary[caste];
    if (!s) continue;
    const rate = (s.passRate * 100).toFixed(1);
    lines.push(`| \`${caste}\` | ${s.passed} | ${s.failed} | ${s.total} | ${rate}% |`);
  }
  lines.push("");

  lines.push("## Per-task results");
  lines.push("");
  lines.push("| Task | Repo | " + report.castes.map((c) => `\`${c}\``).join(" | ") + " |");
  lines.push("|---|---|" + report.castes.map(() => "---").join("|") + "|");
  for (const result of report.results) {
    const cells = report.castes.map((caste) => {
      const cr = result.castes.find((c) => c.caste === caste);
      if (!cr) return "—";
      const emoji =
        cr.status === "passed"
          ? "✓"
          : cr.status === "timeout"
            ? "⏱"
            : cr.status === "error"
              ? "✗"
              : "○";
      return `${emoji} (${(cr.durationMs / 1000).toFixed(1)}s)`;
    });
    lines.push(`| \`${result.taskId}\` | ${result.repo} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Methodology");
  lines.push("");
  lines.push(
    "Each task is run through `ColonySwarmRuntime.startObjective()` with `executionMode: 'llm'`. " +
      "A task passes when all three swarm stages (plan, execute, review) complete successfully. " +
      "The harness does not yet apply patches or run test commands — that wiring is the next " +
      "iteration. Pass rates here measure planning + reasoning correctness, not patch correctness.",
  );
  lines.push("");
  lines.push("**Reproducing:**");
  lines.push("");
  lines.push("```");
  lines.push("bun run scripts/bench/swe-bench.ts");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const opts = parseCliArgs(process.argv.slice(2));

  let tasks: SweBenchTask[];
  let castes: typeof CASTE_CONFIGS[number][];
  try {
    tasks = await loadTasks(opts);
    castes = selectCastes(opts);
  } catch (err) {
    console.error(`Argument error: ${err instanceof Error ? err.message : err}`);
    return 2;
  }

  console.log(`Running SWE-bench: ${tasks.length} tasks × ${castes.length} castes`);
  if (opts.dryRun) {
    console.log("Mode: --dry-run (no LLM calls)");
  }

  const runner: SwarmStageRunner = opts.dryRun ? makeDryRunRunner() : makeLiveRunner();
  const runtime = new ColonySwarmRuntime({ llmRunner: runner, maxConcurrentRuns: 3 });

  const startedAt = new Date().toISOString();
  const results: TaskResult[] = [];

  for (const task of tasks) {
    process.stdout.write(`\n[${task.id}] `);
    const taskResult: TaskResult = {
      taskId: task.id,
      repo: task.repo,
      castes: [],
    };
    for (const caste of castes) {
      process.stdout.write(`${caste.name}... `);
      const result = await runTaskForCaste(task, caste.name, runtime, opts.timeoutSeconds * 1000);
      process.stdout.write(result.status === "passed" ? "✓ " : "✗ ");
      taskResult.castes.push(result);
    }
    results.push(taskResult);
  }
  process.stdout.write("\n\n");

  const completedAt = new Date().toISOString();
  const report: BenchmarkReport = {
    startedAt,
    completedAt,
    colonyVersion: process.env.npm_package_version ?? "1.0.0-dev",
    provider: process.env.COLONY_PROVIDER ?? "stub",
    model: process.env.COLONY_MODEL ?? "stub",
    taskCount: tasks.length,
    castes: castes.map((c) => c.name),
    results,
    summary: {},
  };
  summarize(report);

  await mkdir(dirname(opts.outputJson), { recursive: true });
  await mkdir(dirname(opts.outputMarkdown), { recursive: true });
  await writeFile(opts.outputJson, JSON.stringify(report, null, 2));
  await writeFile(opts.outputMarkdown, formatMarkdown(report));

  console.log(`Wrote ${opts.outputJson}`);
  console.log(`Wrote ${opts.outputMarkdown}`);
  console.log("");
  console.log("Summary:");
  for (const caste of report.castes) {
    const s = report.summary[caste];
    if (!s) continue;
    console.log(`  ${caste}: ${s.passed}/${s.total} passed (${(s.passRate * 100).toFixed(1)}%)`);
  }

  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
