/**
 * Phase 56 Verification Script - Explicit-Approval Skill Staging
 *
 * Covers the next skills productization slice:
 *   1. Skill import candidates are blocked unless explicit approval is present
 *   2. Approved candidates are written only into quarantine/staging, never the live catalog
 *   3. Staged candidates can be reloaded and audited before later promotion
 *
 * Run: bun run src/verify-phase56.ts
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  auditSkillCatalog,
  loadSkillsFromDirectories,
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

function candidateSkillContent(): string {
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
    "This staged candidate body must stay out of manifests and reports.",
  ].join("\n");
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

async function createLiveRoot(): Promise<string> {
  const liveRoot = await mkdtemp(join(tmpdir(), "colony-live-skills-"));
  const existingDir = join(liveRoot, "tdd");
  await mkdir(existingDir, { recursive: true });
  await writeFile(join(existingDir, "SKILL.md"), [
    "---",
    "name: tdd",
    "description: Existing live skill.",
    "---",
    "",
    "# TDD",
    "",
    "Existing live catalog body.",
  ].join("\n"));
  return liveRoot;
}

async function verifyApprovalBlocksWrites(): Promise<void> {
  section("1. Approval Boundary");

  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-skills-"));
  const liveRoot = await createLiveRoot();
  try {
    const result = await stageSkillImportCandidate({
      content: candidateSkillContent(),
      stagingRoot,
      liveRoot,
      approval: {
        approved: false,
        reason: "operator has not reviewed upstream diff",
      },
      expectedSource: {
        repo: "https://github.com/jbrorepo/skills",
        path: "zoom-out/SKILL.md",
        ref: "main",
        revision: "zoom-out-revision",
      },
    });

    assertEqual(result.status, "blocked", "Unapproved candidate is blocked");
    assert(!result.staged, "Unapproved candidate is not staged");
    assertEqual(result.skillName, "zoom-out", "Blocked result still reports parsed skill name");
    assert(result.reason.includes("Explicit approval required"), "Blocked result explains approval requirement");
    assert(!(await exists(join(stagingRoot, "zoom-out", "SKILL.md"))), "Unapproved candidate does not write staging file");
    assert(!(await exists(join(liveRoot, "zoom-out", "SKILL.md"))), "Unapproved candidate does not write live file");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
  }
}

async function verifyApprovedStagingOnly(): Promise<void> {
  section("2. Approved Staging Only");

  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-skills-"));
  const liveRoot = await createLiveRoot();
  try {
    const result = await stageSkillImportCandidate({
      content: candidateSkillContent(),
      stagingRoot,
      liveRoot,
      approval: {
        approved: true,
        approvedBy: "operator",
        reason: "reviewed source metadata and body diff",
      },
      expectedSource: {
        repo: "https://github.com/jbrorepo/skills",
        path: "zoom-out/SKILL.md",
        ref: "main",
        revision: "zoom-out-revision",
      },
    });

    assertEqual(result.status, "staged", "Approved candidate is staged");
    assert(result.staged, "Approved candidate reports staged=true");
    assert(result.stagingPath?.endsWith("zoom-out\\SKILL.md") || result.stagingPath?.endsWith("zoom-out/SKILL.md") || false, "Staging path targets skill quarantine");
    assert(result.manifestPath?.endsWith(".colony-stage.json") ?? false, "Staging manifest path is returned");
    assert(await exists(result.stagingPath ?? ""), "Approved candidate writes staging SKILL.md");
    assert(await exists(result.manifestPath ?? ""), "Approved candidate writes staging manifest");
    assert(!(await exists(join(liveRoot, "zoom-out", "SKILL.md"))), "Approved staging does not write live catalog");

    const manifest = await readFile(result.manifestPath ?? "", "utf8");
    assert(manifest.includes("\"approvedBy\": \"operator\""), "Manifest records approver");
    assert(manifest.includes("\"status\": \"staged\""), "Manifest records staged status");
    assert(manifest.includes("\"path\": \"zoom-out/SKILL.md\""), "Manifest records expected source path");
    assert(!manifest.includes("must stay out"), "Manifest does not expose skill body text");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
  }
}

async function verifyStagedAuditGate(): Promise<void> {
  section("3. Staged Audit Gate");

  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-skills-"));
  const liveRoot = await createLiveRoot();
  try {
    await stageSkillImportCandidate({
      content: candidateSkillContent(),
      stagingRoot,
      liveRoot,
      approval: {
        approved: true,
        approvedBy: "operator",
        reason: "reviewed source metadata and body diff",
      },
      expectedSource: {
        repo: "https://github.com/jbrorepo/skills",
        path: "zoom-out/SKILL.md",
        ref: "main",
        revision: "zoom-out-revision",
      },
    });

    const stagedSkills = await loadSkillsFromDirectories([stagingRoot]);
    const liveSkills = await loadSkillsFromDirectories([liveRoot]);
    const audit = auditSkillCatalog(stagedSkills, {
      productCandidateNames: ["zoom-out"],
      expectedSources: {
        "zoom-out": {
          repo: "https://github.com/jbrorepo/skills",
          path: "zoom-out/SKILL.md",
          ref: "main",
          revision: "zoom-out-revision",
        },
      },
    });

    assertEqual(stagedSkills.length, 1, "Staged root reloads exactly one candidate skill");
    assertEqual(stagedSkills[0]?.name, "zoom-out", "Staged candidate reloads by name");
    assertEqual(liveSkills.length, 1, "Live root remains unchanged");
    assertEqual(liveSkills[0]?.name, "tdd", "Live root still contains only existing skill");
    assertEqual(audit.validSkills, 1, "Staged candidate passes audit gate");
    assertEqual(audit.sourceStaleCount, 0, "Staged candidate has no stale source drift");
    assertEqual(audit.sourceMismatchCount, 0, "Staged candidate has no source mismatch");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 56 Verification (Explicit-Approval Skill Staging)\n");

  await verifyApprovalBlocksWrites();
  await verifyApprovedStagingOnly();
  await verifyStagedAuditGate();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 56: Explicit-approval skill staging is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
