/**
 * Phase 58 Verification Script - Staged Skill Operator Surface
 *
 * Covers the next skills productization slice:
 *   1. `/skills staged` exposes staged skill preview and audit views without body text
 *   2. `/skills staged approve/promote` makes the second-approval boundary explicit
 *   3. `/skills staged rollback` exposes rollback evidence after approved promotion
 *
 * Run: bun run src/verify-phase58.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { SlashCommandParser } from "./gateway";
import {
  loadSkillsFromDirectories,
  promoteStagedSkillCandidate,
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
    "This staged operator body must not appear in command output.",
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
    "This old operator body must not appear in command output.",
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

async function createStageContext(): Promise<{
  stagingRoot: string;
  liveRoot: string;
  rollbackRoot: string;
  parser: SlashCommandParser;
  promotedParser: SlashCommandParser;
}> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-surface-"));
  const liveRoot = await mkdtemp(join(tmpdir(), "colony-live-surface-"));
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
      reason: "reviewed source metadata and staged body",
    },
    expectedSource: expectedZoomOutSource(),
  });

  const stagedSkills = await loadSkillsFromDirectories([stagingRoot]);
  const stageManifest = JSON.parse(await readFile(staged.manifestPath ?? "", "utf8"));
  const parser = new SlashCommandParser({
    skills: {
      stage: {
        stagedSkills,
        stageManifests: [stageManifest],
        expectedSources: {
          "zoom-out": expectedZoomOutSource(),
        },
      },
    },
  });

  const promotion = await promoteStagedSkillCandidate({
    skillName: "zoom-out",
    stagingRoot,
    liveRoot,
    rollbackRoot,
    approval: {
      approved: true,
      approvedBy: "operator",
      reason: "reviewed staged audit and rollback path",
    },
    expectedSource: expectedZoomOutSource(),
  });
  const promotionManifest = JSON.parse(await readFile(promotion.manifestPath ?? "", "utf8"));
  const promotedParser = new SlashCommandParser({
    skills: {
      stage: {
        stagedSkills,
        stageManifests: [stageManifest],
        expectedSources: {
          "zoom-out": expectedZoomOutSource(),
        },
        promotionResults: {
          "zoom-out": promotion,
        },
        promotionManifests: [promotionManifest],
      },
    },
  });

  return { stagingRoot, liveRoot, rollbackRoot, parser, promotedParser };
}

async function verifyStagedPreviewAndAudit(): Promise<void> {
  section("1. Staged Preview and Audit Views");

  const { stagingRoot, liveRoot, rollbackRoot, parser } = await createStageContext();
  try {
    const list = parser.tryHandle("/skills staged");
    assert(list.handled, "/skills staged resolves");
    assert(!list.isError, "/skills staged is not an error");
    assert(list.output.includes("Staged Skills:"), "/skills staged renders header");
    assert(list.output.includes("zoom-out | staged | zoom-out-revision"), "/skills staged lists candidate revision");
    assert(list.output.includes("preview | audit | approve | promote | rollback"), "/skills staged shows operator workflow");
    assert(!list.output.includes("operator body"), "/skills staged does not expose body text");

    const preview = parser.tryHandle("/skills staged preview zoom-out");
    assert(preview.handled, "/skills staged preview resolves");
    assert(!preview.isError, "/skills staged preview is not an error");
    assert(preview.output.includes("Staged Skill Preview: zoom-out"), "Preview renders candidate name");
    assert(preview.output.includes("Description: Ask for broader project context"), "Preview renders metadata");
    assert(preview.output.includes("Source revision: zoom-out-revision"), "Preview renders source revision");
    assert(preview.output.includes("Stage status: staged"), "Preview renders stage manifest status");
    assert(!preview.output.includes("operator body"), "Preview does not expose body text");

    const audit = parser.tryHandle("/skills staged audit zoom-out");
    assert(audit.handled, "/skills staged audit resolves");
    assert(!audit.isError, "/skills staged audit is not an error");
    assert(audit.output.includes("Staged Skill Audit: zoom-out"), "Audit renders candidate name");
    assert(audit.output.includes("Valid: yes"), "Audit reports valid candidate");
    assert(audit.output.includes("Source mismatches: 0"), "Audit reports no source mismatches");
    assert(!audit.output.includes("operator body"), "Audit does not expose body text");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function verifyApprovalPromoteAndRollbackViews(): Promise<void> {
  section("2. Approval, Promote, and Rollback Views");

  const { stagingRoot, liveRoot, rollbackRoot, parser, promotedParser } = await createStageContext();
  try {
    const approve = parser.tryHandle("/skills staged approve zoom-out");
    assert(approve.handled, "/skills staged approve resolves");
    assert(!approve.isError, "/skills staged approve is not an error");
    assert(approve.output.includes("Second approval required before promotion"), "Approve view states second approval boundary");
    assert(approve.output.includes("/skills staged promote zoom-out --approved"), "Approve view shows explicit promote command");

    const blocked = parser.tryHandle("/skills staged promote zoom-out");
    assert(blocked.handled, "/skills staged promote resolves");
    assert(blocked.isError, "/skills staged promote without approval is an error");
    assert(blocked.output.includes("Use /skills staged approve zoom-out first"), "Blocked promote points to approval view");

    const promoted = promotedParser.tryHandle("/skills staged promote zoom-out --approved");
    assert(promoted.handled, "/skills staged promote --approved resolves");
    assert(!promoted.isError, "Approved promote view is not an error when promotion result is supplied");
    assert(promoted.output.includes("Promotion Status: promoted"), "Approved promote view renders promoted status");
    assert(promoted.output.includes("Rollback:"), "Approved promote view renders rollback evidence");
    assert(promoted.output.includes(".colony-promote.json"), "Approved promote view renders promotion manifest path");
    assert(!promoted.output.includes("operator body"), "Approved promote view does not expose body text");

    const rollback = promotedParser.tryHandle("/skills staged rollback zoom-out");
    assert(rollback.handled, "/skills staged rollback resolves");
    assert(!rollback.isError, "/skills staged rollback is not an error");
    assert(rollback.output.includes("Rollback Evidence: zoom-out"), "Rollback view renders candidate name");
    assert(rollback.output.includes("SKILL.md.previous"), "Rollback view renders previous-copy path");
    assert(rollback.output.includes("No rollback is applied by this view"), "Rollback view is non-mutating");
    assert(!rollback.output.includes("operator body"), "Rollback view does not expose body text");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 58 Verification (Staged Skill Operator Surface)\n");

  await verifyStagedPreviewAndAudit();
  await verifyApprovalPromoteAndRollbackViews();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 58: Staged skill operator surface is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
