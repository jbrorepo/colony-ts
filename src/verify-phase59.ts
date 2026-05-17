/**
 * Phase 59 Verification Script - Staged Skill Rollback Executor
 *
 * Covers the next skills productization slice:
 *   1. Rollback is blocked unless explicit approval is present
 *   2. Missing rollback evidence rejects without touching live skill files
 *   3. Approved rollback restores the previous live copy and writes body-free metadata
 *
 * Run: bun run src/verify-phase59.ts
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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
    "This promoted body must stay out of rollback metadata.",
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
    "This restored body must stay out of rollback metadata.",
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

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

async function createPromotedRoots(): Promise<{ stagingRoot: string; liveRoot: string; rollbackRoot: string; livePath: string; rollbackPath: string }> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-rollback-"));
  const liveRoot = await mkdtemp(join(tmpdir(), "colony-live-rollback-"));
  const rollbackRoot = await mkdtemp(join(tmpdir(), "colony-rollback-"));

  const liveSkillDir = join(liveRoot, "zoom-out");
  await mkdir(liveSkillDir, { recursive: true });
  await writeFile(join(liveSkillDir, "SKILL.md"), oldLiveSkillContent());

  await stageSkillImportCandidate({
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

  return {
    stagingRoot,
    liveRoot,
    rollbackRoot,
    livePath: promotion.livePath ?? join(liveRoot, "zoom-out", "SKILL.md"),
    rollbackPath: promotion.rollbackPath ?? join(rollbackRoot, "zoom-out", "SKILL.md.previous"),
  };
}

async function verifyRollbackApprovalRequired(): Promise<void> {
  section("1. Rollback Approval Boundary");

  const { stagingRoot, liveRoot, rollbackRoot, livePath } = await createPromotedRoots();
  try {
    const result = await rollbackPromotedSkillCandidate({
      skillName: "zoom-out",
      liveRoot,
      rollbackRoot,
      approval: {
        approved: false,
        reason: "operator has not approved rollback",
      },
    });

    const liveContent = await readFile(livePath, "utf8");
    assertEqual(result.status, "blocked", "Rollback without approval is blocked");
    assert(!result.rolledBack, "Blocked rollback reports rolledBack=false");
    assert(result.reason.includes("Explicit approval required"), "Blocked rollback explains approval requirement");
    assert(liveContent.includes("zoom-out-revision"), "Blocked rollback leaves promoted live content in place");
    assert(!(await exists(join(liveRoot, "zoom-out", ".colony-rollback.json"))), "Blocked rollback does not write metadata");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function verifyMissingRollbackEvidenceRejects(): Promise<void> {
  section("2. Missing Rollback Evidence");

  const { stagingRoot, liveRoot, rollbackRoot, livePath, rollbackPath } = await createPromotedRoots();
  try {
    await rm(rollbackPath, { force: true });
    const result = await rollbackPromotedSkillCandidate({
      skillName: "zoom-out",
      liveRoot,
      rollbackRoot,
      approval: {
        approved: true,
        approvedBy: "operator",
        reason: "approved but rollback evidence missing",
      },
    });

    const liveContent = await readFile(livePath, "utf8");
    assertEqual(result.status, "rejected", "Rollback without evidence is rejected");
    assert(!result.rolledBack, "Rejected rollback reports rolledBack=false");
    assert(result.reason.includes("Rollback evidence is missing"), "Rejected rollback explains missing evidence");
    assert(liveContent.includes("zoom-out-revision"), "Rejected rollback leaves promoted live content in place");
    assert(!(await exists(join(liveRoot, "zoom-out", ".colony-rollback.json"))), "Rejected rollback does not write metadata");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function verifyApprovedRollbackRestoresLiveCopy(): Promise<void> {
  section("3. Approved Rollback Restore");

  const { stagingRoot, liveRoot, rollbackRoot, livePath, rollbackPath } = await createPromotedRoots();
  try {
    const result = await rollbackPromotedSkillCandidate({
      skillName: "zoom-out",
      liveRoot,
      rollbackRoot,
      approval: {
        approved: true,
        approvedBy: "operator",
        reason: "approved rollback after bad import",
      },
    });

    assertEqual(result.status, "rolled_back", "Approved rollback is applied");
    assert(result.rolledBack, "Approved rollback reports rolledBack=true");
    assertEqual(result.livePath, livePath, "Rollback returns live path");
    assertEqual(result.rollbackPath, rollbackPath, "Rollback returns rollback evidence path");
    assert(result.manifestPath?.endsWith(".colony-rollback.json") ?? false, "Rollback manifest path is returned");
    assert(await exists(result.manifestPath ?? ""), "Rollback writes metadata manifest");

    const liveContent = await readFile(livePath, "utf8");
    const rollbackContent = await readFile(rollbackPath, "utf8");
    const manifest = await readFile(result.manifestPath ?? "", "utf8");
    assert(liveContent.includes("old-live-revision"), "Live skill is restored to previous revision");
    assert(rollbackContent.includes("old-live-revision"), "Rollback evidence remains available after restore");
    assert(manifest.includes("\"status\": \"rolled_back\""), "Rollback manifest records status");
    assert(manifest.includes("\"approvedBy\": \"operator\""), "Rollback manifest records approver");
    assert(manifest.includes("\"restoredSourceRevision\": \"old-live-revision\""), "Rollback manifest records restored revision");
    assert(!manifest.includes("promoted body"), "Rollback manifest does not expose promoted body text");
    assert(!manifest.includes("restored body"), "Rollback manifest does not expose restored body text");

    const liveSkills = await loadSkillsFromDirectories([liveRoot]);
    assertEqual(liveSkills[0]?.source.revision, "old-live-revision", "Reloaded live catalog sees restored revision");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 59 Verification (Staged Skill Rollback Executor)\n");

  await verifyRollbackApprovalRequired();
  await verifyMissingRollbackEvidenceRejects();
  await verifyApprovedRollbackRestoresLiveCopy();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 59: Staged skill rollback executor is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
