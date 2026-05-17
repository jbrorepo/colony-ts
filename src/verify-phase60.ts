/**
 * Phase 60 Verification Script - Staged Rollback Operator Result
 *
 * Covers the next skills productization slice:
 *   1. `/skills staged rollback <name>` remains a non-mutating evidence view
 *   2. `/skills staged rollback <name> --approved` fails closed without a host rollback result
 *   3. Supplied approved rollback results render body-safe restored status and metadata
 *
 * Run: bun run src/verify-phase60.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { SlashCommandParser } from "./gateway";
import {
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
    "This promoted operator rollback body must not appear in command output.",
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
    "This restored operator rollback body must not appear in command output.",
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

async function createRollbackContext(): Promise<{ parser: SlashCommandParser; rollbackParser: SlashCommandParser; roots: string[] }> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-rollback-surface-"));
  const liveRoot = await mkdtemp(join(tmpdir(), "colony-live-rollback-surface-"));
  const rollbackRoot = await mkdtemp(join(tmpdir(), "colony-rollback-surface-"));

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
      reason: "reviewed staged body",
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
      reason: "reviewed rollback path",
    },
    expectedSource: expectedZoomOutSource(),
  });

  const stagedSkills = await loadSkillsFromDirectories([stagingRoot]);
  const stageManifest = JSON.parse(await readFile(staged.manifestPath ?? "", "utf8"));
  const promotionManifest = JSON.parse(await readFile(promotion.manifestPath ?? "", "utf8"));

  const parser = new SlashCommandParser({
    skills: {
      stage: {
        stagedSkills,
        stageManifests: [stageManifest],
        promotionResults: {
          "zoom-out": promotion,
        },
        promotionManifests: [promotionManifest],
      },
    },
  });

  const rollback = await rollbackPromotedSkillCandidate({
    skillName: "zoom-out",
    liveRoot,
    rollbackRoot,
    approval: {
      approved: true,
      approvedBy: "operator",
      reason: "approved rollback after bad import",
    },
  });
  const rollbackManifest = JSON.parse(await readFile(rollback.manifestPath ?? "", "utf8"));
  const rollbackParser = new SlashCommandParser({
    skills: {
      stage: {
        stagedSkills,
        stageManifests: [stageManifest],
        promotionResults: {
          "zoom-out": promotion,
        },
        promotionManifests: [promotionManifest],
        rollbackResults: {
          "zoom-out": rollback,
        },
        rollbackManifests: [rollbackManifest],
      },
    },
  });

  return { parser, rollbackParser, roots: [stagingRoot, liveRoot, rollbackRoot] };
}

async function verifyRollbackResultRendering(): Promise<void> {
  section("1. Approved Rollback Result Rendering");

  const { parser, rollbackParser, roots } = await createRollbackContext();
  try {
    const evidence = parser.tryHandle("/skills staged rollback zoom-out");
    assert(evidence.handled, "Rollback evidence view resolves");
    assert(!evidence.isError, "Rollback evidence view is not an error");
    assert(evidence.output.includes("Rollback Evidence: zoom-out"), "Rollback evidence view remains non-mutating");
    assert(evidence.output.includes("No rollback is applied by this view"), "Rollback evidence view keeps non-mutating warning");

    const blocked = parser.tryHandle("/skills staged rollback zoom-out --approved");
    assert(blocked.handled, "Approved rollback command resolves without host result");
    assert(blocked.isError, "Approved rollback without host result is an error");
    assert(blocked.output.includes("Rollback Status: unavailable for zoom-out"), "Approved rollback without host result is fail-closed");
    assert(blocked.output.includes("Host must call rollbackPromotedSkillCandidate()"), "Fail-closed rollback output names host API");

    const rendered = rollbackParser.tryHandle("/skills staged rollback zoom-out --approved");
    assert(rendered.handled, "Approved rollback result view resolves");
    assert(!rendered.isError, "Approved rollback result view is not an error");
    assert(rendered.output.includes("Rollback Status: rolled_back"), "Approved rollback renders rolled_back status");
    assert(rendered.output.includes("Live:"), "Approved rollback renders live path");
    assert(rendered.output.includes("Rollback evidence:"), "Approved rollback renders evidence path");
    assert(rendered.output.includes(".colony-rollback.json"), "Approved rollback renders rollback manifest path");
    assert(rendered.output.includes("Rollback evidence restored to live skill catalog"), "Approved rollback renders result reason");
    assert(!rendered.output.includes("operator rollback body"), "Approved rollback result does not expose skill body text");
  } finally {
    for (const root of roots) {
      await rm(root, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 60 Verification (Staged Rollback Operator Result)\n");

  await verifyRollbackResultRendering();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 60: Staged rollback operator result is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
