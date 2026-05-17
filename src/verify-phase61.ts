/**
 * Phase 61 Verification Script - Staged Skill Lifecycle History
 *
 * Covers the next skills productization slice:
 *   1. Stage/promote/rollback metadata can be projected into body-safe lifecycle events
 *   2. `/skills staged history <name>` renders stage, promote, and rollback lifecycle inspection
 *   3. Lifecycle inspection never exposes staged, promoted, or restored skill body text
 *
 * Run: bun run src/verify-phase61.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { SlashCommandParser } from "./gateway";
import {
  buildSkillLifecycleEvents,
  loadSkillsFromDirectories,
  promoteStagedSkillCandidate,
  rollbackPromotedSkillCandidate,
  stageSkillImportCandidate,
} from "./skills";

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

function stagedSkillContent(): string {
  return [
    "---",
    "name: zoom-out",
    "description: Ask for broader project context before changing architecture.",
    "source_repo: https://github.com/jbrorepo/skills",
    "source_path: zoom-out/SKILL.md",
    "source_ref: main",
    "source_revision: zoom-out-revision",
    "---",
    "",
    "# Zoom Out",
    "",
    "This staged lifecycle body must not appear in event output.",
  ].join("\n");
}

function oldLiveSkillContent(): string {
  return [
    "---",
    "name: zoom-out",
    "description: Older live copy.",
    "source_repo: https://github.com/jbrorepo/skills",
    "source_path: zoom-out/SKILL.md",
    "source_ref: main",
    "source_revision: old-live-revision",
    "---",
    "",
    "# Old Zoom Out",
    "",
    "This restored lifecycle body must not appear in event output.",
  ].join("\n");
}

function expectedZoomOutSource() {
  return {
    repo: "https://github.com/jbrorepo/skills",
    path: "zoom-out/SKILL.md",
    ref: "main",
    revision: "zoom-out-revision",
  };
}

async function createLifecycleContext(): Promise<{ parser: SlashCommandParser; roots: string[]; events: ReturnType<typeof buildSkillLifecycleEvents> }> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-history-"));
  const liveRoot = await mkdtemp(join(tmpdir(), "colony-live-history-"));
  const rollbackRoot = await mkdtemp(join(tmpdir(), "colony-rollback-history-"));

  const liveSkillDir = join(liveRoot, "zoom-out");
  await mkdir(liveSkillDir, { recursive: true });
  await writeFile(join(liveSkillDir, "SKILL.md"), oldLiveSkillContent());

  const staged = await stageSkillImportCandidate({
    content: stagedSkillContent(),
    stagingRoot,
    liveRoot,
    approval: {
      approved: true,
      approvedBy: "operator",
      reason: "reviewed staged lifecycle body",
    },
    expectedSource: expectedZoomOutSource(),
  });

  const promotion = await promoteStagedSkillCandidate({
    skillName: "zoom-out",
    stagingRoot,
    liveRoot,
    rollbackRoot,
    approval: {
      approved: true,
      approvedBy: "operator",
      reason: "reviewed promotion lifecycle metadata",
    },
    expectedSource: expectedZoomOutSource(),
  });

  const rollback = await rollbackPromotedSkillCandidate({
    skillName: "zoom-out",
    liveRoot,
    rollbackRoot,
    approval: {
      approved: true,
      approvedBy: "operator",
      reason: "reviewed rollback lifecycle metadata",
    },
  });

  const stagedSkills = await loadSkillsFromDirectories([stagingRoot]);
  const stageManifest = JSON.parse(await readFile(staged.manifestPath ?? "", "utf8"));
  const promotionManifest = JSON.parse(await readFile(promotion.manifestPath ?? "", "utf8"));
  const rollbackManifest = JSON.parse(await readFile(rollback.manifestPath ?? "", "utf8"));
  const events = buildSkillLifecycleEvents({
    stageManifests: [stageManifest],
    promotionResults: { "zoom-out": promotion },
    promotionManifests: [promotionManifest],
    rollbackResults: { "zoom-out": rollback },
    rollbackManifests: [rollbackManifest],
  });

  const parser = new SlashCommandParser({
    skills: {
      stage: {
        stagedSkills,
        stageManifests: [stageManifest],
        promotionResults: { "zoom-out": promotion },
        promotionManifests: [promotionManifest],
        rollbackResults: { "zoom-out": rollback },
        rollbackManifests: [rollbackManifest],
        lifecycleEvents: events,
      },
    },
  });

  return { parser, roots: [stagingRoot, liveRoot, rollbackRoot], events };
}

async function verifyLifecycleEventProjection(): Promise<void> {
  section("1. Lifecycle Event Projection");

  const { roots, events } = await createLifecycleContext();
  try {
    assertEqual(events.length, 3, "Lifecycle projection includes stage, promote, and rollback events");
    assertEqual(events[0]?.event, "staged", "First lifecycle event is staged");
    assertEqual(events[1]?.event, "promoted", "Second lifecycle event is promoted");
    assertEqual(events[2]?.event, "rolled_back", "Third lifecycle event is rolled_back");
    assertEqual(events[0]?.sourceRevision, "zoom-out-revision", "Stage event preserves source revision");
    assertEqual(events[2]?.restoredSourceRevision, "old-live-revision", "Rollback event preserves restored revision");
    const serialized = JSON.stringify(events);
    assert(!serialized.includes("staged lifecycle body"), "Lifecycle events do not expose staged body text");
    assert(!serialized.includes("restored lifecycle body"), "Lifecycle events do not expose restored body text");
  } finally {
    for (const root of roots) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function verifyLifecycleHistoryCommand(): Promise<void> {
  section("2. /skills staged history Operator View");

  const { parser, roots } = await createLifecycleContext();
  try {
    const history = parser.tryHandle("/skills staged history zoom-out");
    assert(history.handled, "/skills staged history resolves");
    assert(!history.isError, "/skills staged history is not an error");
    assert(history.output.includes("Staged Skill History: zoom-out"), "History view renders candidate name");
    assert(history.output.includes("staged | staged | approvedBy operator"), "History view renders stage event");
    assert(history.output.includes("promoted | promoted | approvedBy operator"), "History view renders promotion event");
    assert(history.output.includes("rolled_back | rolled_back | approvedBy operator"), "History view renders rollback event");
    assert(history.output.includes("source zoom-out-revision"), "History view renders source revision");
    assert(history.output.includes("restored old-live-revision"), "History view renders restored revision");
    assert(history.output.includes("skill bodies are not loaded by this view"), "History view states body-safe boundary");
    assert(!history.output.includes("staged lifecycle body"), "History view does not expose staged body text");
    assert(!history.output.includes("restored lifecycle body"), "History view does not expose restored body text");

    const missing = parser.tryHandle("/skills staged history missing-skill");
    assert(missing.handled, "/skills staged history missing skill resolves");
    assert(missing.isError, "/skills staged history missing skill is an error");
    assert(missing.output.includes("Staged skill not found"), "Missing history points to staged skill lookup");
  } finally {
    for (const root of roots) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 61 Verification (Staged Skill Lifecycle History)\n");

  await verifyLifecycleEventProjection();
  await verifyLifecycleHistoryCommand();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 61: Staged skill lifecycle history is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
