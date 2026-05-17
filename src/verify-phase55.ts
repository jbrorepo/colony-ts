/**
 * Phase 55 Verification Script - Safe Skill Import/Update Planner
 *
 * Covers the next skills productization slice:
 *   1. Skill planner proposes import/update/keep/review actions from source metadata
 *   2. Planner remains dry-run only and never exposes skill body text
 *   3. `/skills plan` renders operator-safe planned actions without mutating files
 *
 * Run: bun run src/verify-phase55.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  SkillCatalog,
  loadSkillsFromDirectories,
  planSkillSourceUpdates,
} from "./skills";
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

async function createPlannerFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "colony-skill-planner-"));

  await writeSkill(root, "domain-model", [
    "---",
    "name: domain-model",
    "description: Stress-test plans against project language and ADRs.",
    "source_repo: https://github.com/jbrorepo/skills",
    "source_path: domain-model/SKILL.md",
    "source_ref: main",
    "source_revision: old-domain-revision",
    "---",
    "",
    "# Domain Model",
    "",
    "This stale body must not appear in planner output.",
  ]);

  await writeSkill(root, "tdd", [
    "---",
    "name: tdd",
    "description: Test-driven development.",
    "source_repo: https://github.com/jbrorepo/skills",
    "source_path: tdd/SKILL.md",
    "source_ref: main",
    "source_revision: current-tdd-revision",
    "---",
    "",
    "# TDD",
    "",
    "This current body must not appear in planner output.",
  ]);

  await writeSkill(root, "local-only", [
    "---",
    "name: local-only",
    "description: Local-only helper.",
    "---",
    "",
    "# Local",
    "",
    "This local-only body must not appear in planner output.",
  ]);

  await writeSkill(root, "wrong-source", [
    "---",
    "name: wrong-source",
    "description: Source metadata points at the wrong upstream path.",
    "source_repo: https://github.com/jbrorepo/skills",
    "source_path: old-path/SKILL.md",
    "source_ref: main",
    "source_revision: wrong-source-revision",
    "---",
    "",
    "# Wrong",
    "",
    "This mismatched body must not appear in planner output.",
  ]);

  return root;
}

async function writeSkill(root: string, directory: string, lines: string[]): Promise<void> {
  const skillDir = join(root, directory);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), lines.join("\n"));
}

function expectedSources() {
  return {
    "domain-model": {
      repo: "https://github.com/jbrorepo/skills",
      path: "domain-model/SKILL.md",
      ref: "main",
      revision: "current-domain-revision",
    },
    tdd: {
      repo: "https://github.com/jbrorepo/skills",
      path: "tdd/SKILL.md",
      ref: "main",
      revision: "current-tdd-revision",
    },
    "zoom-out": {
      repo: "https://github.com/jbrorepo/skills",
      path: "zoom-out/SKILL.md",
      ref: "main",
      revision: "zoom-out-revision",
    },
    "wrong-source": {
      repo: "https://github.com/jbrorepo/skills",
      path: "wrong-source/SKILL.md",
      ref: "main",
      revision: "wrong-source-revision",
    },
  };
}

async function verifyPlannerActions(): Promise<void> {
  section("1. Planner Actions");

  const root = await createPlannerFixture();
  try {
    const skills = await loadSkillsFromDirectories([root]);
    const plan = planSkillSourceUpdates(skills, {
      productCandidateNames: ["domain-model", "tdd", "zoom-out"],
      expectedSources: expectedSources(),
    });

    assertEqual(plan.totalActions, 5, "Planner includes local and expected-source actions");
    assertEqual(plan.importCount, 1, "Planner counts missing expected source imports");
    assertEqual(plan.updateCount, 1, "Planner counts stale source updates");
    assertEqual(plan.keepCount, 1, "Planner counts current sources to keep");
    assertEqual(plan.reviewCount, 2, "Planner counts mismatch and local-only review actions");
    assert(plan.dryRun, "Planner is explicitly dry-run");

    const update = plan.actions.find((action) => action.skillName === "domain-model");
    assertEqual(update?.action, "update", "Stale skill is planned as update");
    assertEqual(update?.source?.revision, "old-domain-revision", "Update preserves loaded revision");
    assertEqual(update?.expectedSource?.revision, "current-domain-revision", "Update preserves expected revision");
    assert(update?.commandPreview.includes("import") ?? false, "Update includes approval-oriented command preview");

    const importAction = plan.actions.find((action) => action.skillName === "zoom-out");
    assertEqual(importAction?.action, "import", "Missing expected source is planned as import");
    assertEqual(importAction?.expectedSource?.path, "zoom-out/SKILL.md", "Import action keeps expected source path");

    const keep = plan.actions.find((action) => action.skillName === "tdd");
    assertEqual(keep?.action, "keep", "Current skill is planned as keep");

    const mismatch = plan.actions.find((action) => action.skillName === "wrong-source");
    assertEqual(mismatch?.action, "review", "Source mismatch is planned for review");
    assert(mismatch?.reasons.includes("source_mismatch") ?? false, "Review action records mismatch reason");

    const localOnly = plan.actions.find((action) => action.skillName === "local-only");
    assertEqual(localOnly?.action, "review", "Local-only skill is planned for review");
    assert(localOnly?.reasons.includes("missing_source") ?? false, "Local-only review records missing source reason");

    const serialized = JSON.stringify(plan);
    assert(!serialized.includes("must not appear"), "Planner result does not expose local skill body text");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifySkillsPlanRendering(): Promise<void> {
  section("2. /skills plan Operator Rendering");

  const root = await createPlannerFixture();
  try {
    const catalog = await SkillCatalog.fromDirectories([root]);
    const parser = new SlashCommandParser({
      skills: {
        catalog,
        audit: {
          productCandidateNames: ["domain-model", "tdd", "zoom-out"],
          expectedSources: expectedSources(),
        },
      },
    });

    const result = parser.tryHandle("/skills plan");
    assert(result.handled, "/skills plan resolves");
    assert(!result.isError, "/skills plan is not an error");
    assert(result.output.includes("Skills Import/Update Plan:"), "/skills plan renders header");
    assert(result.output.includes("Dry run: yes"), "/skills plan makes dry-run status explicit");
    assert(result.output.includes("Imports: 1"), "/skills plan includes import count");
    assert(result.output.includes("Updates: 1"), "/skills plan includes update count");
    assert(result.output.includes("Reviews: 2"), "/skills plan includes review count");
    assert(result.output.includes("zoom-out | import | missing_local"), "/skills plan shows missing import action");
    assert(result.output.includes("domain-model | update | source_stale"), "/skills plan shows stale update action");
    assert(result.output.includes("wrong-source | review | source_mismatch"), "/skills plan shows source mismatch review");
    assert(result.output.includes("local-only | review | missing_source"), "/skills plan shows local-only review");
    assert(result.output.includes("Requires explicit approval before any file write"), "/skills plan states approval boundary");
    assert(!result.output.includes("must not appear"), "/skills plan does not expose skill body text");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 55 Verification (Safe Skill Import/Update Planner)\n");

  await verifyPlannerActions();
  await verifySkillsPlanRendering();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 55: Safe skill import/update planner is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
