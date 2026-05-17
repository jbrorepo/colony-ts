/**
 * Phase 57 Verification Script - Staged Skill Promotion Gate
 *
 * Covers the next skills productization slice:
 *   1. Staged candidates are blocked unless a second explicit approval is present
 *   2. Promotion is audit-gated before writing to the live catalog
 *   3. Approved promotion writes live skill content plus body-free rollback evidence
 *
 * Run: bun run src/verify-phase57.ts
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  auditSkillCatalog,
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
    "This promoted candidate body must stay out of manifests.",
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
    "This old live body must stay out of manifests.",
  ].join("\n");
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

async function createRootsWithStagedCandidate(): Promise<{ stagingRoot: string; liveRoot: string; rollbackRoot: string }> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "colony-stage-skills-"));
  const liveRoot = await mkdtemp(join(tmpdir(), "colony-live-skills-"));
  const rollbackRoot = await mkdtemp(join(tmpdir(), "colony-skill-rollback-"));

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
      reason: "reviewed source metadata and staged body",
    },
    expectedSource: expectedZoomOutSource(),
  });

  return { stagingRoot, liveRoot, rollbackRoot };
}

function expectedZoomOutSource() {
  return {
    repo: "https://github.com/jbrorepo/skills",
    path: "zoom-out/SKILL.md",
    ref: "main",
    revision: "zoom-out-revision",
  };
}

async function verifySecondApprovalRequired(): Promise<void> {
  section("1. Second Approval Boundary");

  const { stagingRoot, liveRoot, rollbackRoot } = await createRootsWithStagedCandidate();
  try {
    const result = await promoteStagedSkillCandidate({
      skillName: "zoom-out",
      stagingRoot,
      liveRoot,
      rollbackRoot,
      approval: {
        approved: false,
        reason: "operator has not reviewed staged audit",
      },
      expectedSource: expectedZoomOutSource(),
    });

    const liveContent = await readFile(join(liveRoot, "zoom-out", "SKILL.md"), "utf8");
    assertEqual(result.status, "blocked", "Promotion without second approval is blocked");
    assert(!result.promoted, "Blocked promotion reports promoted=false");
    assert(result.reason.includes("Second explicit approval required"), "Blocked promotion explains second approval requirement");
    assert(liveContent.includes("old-live-revision"), "Blocked promotion does not overwrite live skill");
    assert(!(await exists(join(rollbackRoot, "zoom-out", "SKILL.md.previous"))), "Blocked promotion does not create rollback file");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function verifyAuditGateBlocksDrift(): Promise<void> {
  section("2. Promotion Audit Gate");

  const { stagingRoot, liveRoot, rollbackRoot } = await createRootsWithStagedCandidate();
  try {
    const result = await promoteStagedSkillCandidate({
      skillName: "zoom-out",
      stagingRoot,
      liveRoot,
      rollbackRoot,
      approval: {
        approved: true,
        approvedBy: "operator",
        reason: "reviewed staged audit",
      },
      expectedSource: {
        ...expectedZoomOutSource(),
        revision: "different-reviewed-revision",
      },
    });

    const liveContent = await readFile(join(liveRoot, "zoom-out", "SKILL.md"), "utf8");
    assertEqual(result.status, "rejected", "Promotion with source drift is rejected");
    assert(!result.promoted, "Rejected promotion reports promoted=false");
    assert(result.reason.includes("audit gate"), "Rejected promotion names audit gate");
    assert(liveContent.includes("old-live-revision"), "Rejected promotion does not overwrite live skill");
    assert(!(await exists(join(liveRoot, "zoom-out", ".colony-promote.json"))), "Rejected promotion does not write promotion manifest");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function verifyApprovedPromotionWithRollback(): Promise<void> {
  section("3. Approved Promotion With Rollback Evidence");

  const { stagingRoot, liveRoot, rollbackRoot } = await createRootsWithStagedCandidate();
  try {
    const result = await promoteStagedSkillCandidate({
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

    assertEqual(result.status, "promoted", "Approved audited candidate is promoted");
    assert(result.promoted, "Approved promotion reports promoted=true");
    assert(result.livePath?.endsWith("zoom-out\\SKILL.md") || result.livePath?.endsWith("zoom-out/SKILL.md") || false, "Promotion writes live SKILL.md path");
    assert(result.rollbackPath?.endsWith("zoom-out\\SKILL.md.previous") || result.rollbackPath?.endsWith("zoom-out/SKILL.md.previous") || false, "Promotion returns rollback path");
    assert(result.manifestPath?.endsWith(".colony-promote.json") ?? false, "Promotion manifest path is returned");
    assert(await exists(result.livePath ?? ""), "Promotion writes live file");
    assert(await exists(result.rollbackPath ?? ""), "Promotion writes rollback file");
    assert(await exists(result.manifestPath ?? ""), "Promotion writes body-free manifest");

    const liveContent = await readFile(result.livePath ?? "", "utf8");
    const rollbackContent = await readFile(result.rollbackPath ?? "", "utf8");
    const manifest = await readFile(result.manifestPath ?? "", "utf8");
    assert(liveContent.includes("zoom-out-revision"), "Live skill now contains promoted revision");
    assert(rollbackContent.includes("old-live-revision"), "Rollback file preserves previous live revision");
    assert(manifest.includes("\"status\": \"promoted\""), "Promotion manifest records promoted status");
    assert(manifest.includes("\"approvedBy\": \"operator\""), "Promotion manifest records second approver");
    assert(manifest.includes("\"rollbackPath\""), "Promotion manifest records rollback path");
    assert(manifest.includes("\"revision\": \"zoom-out-revision\""), "Promotion manifest records promoted source revision");
    assert(!manifest.includes("must stay out"), "Promotion manifest does not expose promoted body text");
    assert(!manifest.includes("old live body"), "Promotion manifest does not expose rollback body text");

    const liveSkills = await loadSkillsFromDirectories([liveRoot]);
    const audit = auditSkillCatalog(liveSkills, {
      productCandidateNames: ["zoom-out"],
      expectedSources: {
        "zoom-out": expectedZoomOutSource(),
      },
    });
    assertEqual(audit.sourceStaleCount, 0, "Promoted live catalog passes source-stale audit");
    assertEqual(audit.sourceMismatchCount, 0, "Promoted live catalog passes source-mismatch audit");
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(liveRoot, { recursive: true, force: true });
    await rm(rollbackRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 57 Verification (Staged Skill Promotion Gate)\n");

  await verifySecondApprovalRequired();
  await verifyAuditGateBlocksDrift();
  await verifyApprovedPromotionWithRollback();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 57: Staged skill promotion gate is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
