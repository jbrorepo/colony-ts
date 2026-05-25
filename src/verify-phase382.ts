function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export {};

const truthFiles = [
  "AGENTS.md",
  "docs/PROJECT_STATE.md",
  "docs/BENCHMARK_BOARD.md",
  "docs/GAP_ANALYSIS.md",
  "docs/ROADMAP.md",
  "docs/EXECUTION_PLAN.md",
  "docs/DECISIONS.md",
  "docs/release/COMPETITOR_COMPLETION_BOARD.md",
];

for (const path of truthFiles) {
  const text = await Bun.file(path).text();
  assert(text.includes("phase384"), `${path} names phase384 as current verification truth`);
  assert(!text.includes("verify:phase282 plus `tsc --noEmit`"), `${path} does not keep stale phase282 gate wording`);
}

const projectState = await Bun.file("docs/PROJECT_STATE.md").text();
assert(projectState.includes("Phase 379"), "project state records phase379 provider redaction hardening");
assert(projectState.includes("Phase 380"), "project state records phase380 doctor redaction hardening");
assert(projectState.includes("Phase 381"), "project state records phase381 memory inspection redaction hardening");

const completionBoard = await Bun.file("docs/release/COMPETITOR_COMPLETION_BOARD.md").text();
assert(completionBoard.includes("Current frontier: Phase 384"), "completion board names phase384 frontier");
assert(completionBoard.includes("manual terminal UI smoke remains required"), "completion board keeps manual smoke evidence honest");
assert(completionBoard.includes("no default live plugin install"), "completion board preserves plugin non-goal");
assert(completionBoard.includes("no default external channel delivery"), "completion board preserves channel non-goal");

console.log("Phase 382: source-of-truth docs are synchronized to phase384 without overclaiming release scope.");
