/**
 * Phase 54 Verification Script - Skills Source Metadata Audit
 *
 * Covers the next skills productization slice:
 *   1. Skill loader exposes source repo/path/ref/revision metadata from SKILL.md frontmatter
 *   2. Skill audit detects missing and stale source metadata against expected revisions
 *   3. `/skills audit` renders source drift without exposing skill body text
 *
 * Run: bun run src/verify-phase54.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  SkillCatalog,
  auditSkillCatalog,
  loadSkillsFromDirectories,
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

async function createSourceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "colony-skill-source-"));

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
    "Challenge the plan against project terminology.",
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
    "Write the test first. Watch it fail.",
  ]);

  await writeSkill(root, "local-only", [
    "---",
    "name: local-only",
    "description: Local-only helper skill.",
    "---",
    "",
    "# Local",
    "",
    "This body must not appear in audit output.",
  ]);

  return root;
}

async function writeSkill(root: string, directory: string, lines: string[]): Promise<void> {
  const skillDir = join(root, directory);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), lines.join("\n"));
}

async function verifySourceMetadataLoadAndAudit(): Promise<void> {
  section("1. Source Metadata Load and Audit");

  const root = await createSourceFixture();
  try {
    const skills = await loadSkillsFromDirectories([root]);
    const domainModel = skills.find((skill) => skill.name === "domain-model");
    assertEqual(domainModel?.source.repo, "https://github.com/jbrorepo/skills", "Loader parses source repo");
    assertEqual(domainModel?.source.path, "domain-model/SKILL.md", "Loader parses source path");
    assertEqual(domainModel?.source.ref, "main", "Loader parses source ref");
    assertEqual(domainModel?.source.revision, "old-domain-revision", "Loader parses source revision");

    const audit = auditSkillCatalog(skills, {
      productCandidateNames: ["domain-model", "tdd"],
      expectedSources: {
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
      },
    });

    assertEqual(audit.sourceMissingCount, 1, "Audit counts skills missing source metadata");
    assertEqual(audit.sourceStaleCount, 1, "Audit counts stale source revisions");
    assertEqual(audit.sourceMismatchCount, 0, "Audit counts no source repo/path mismatches");

    const stale = audit.entries.find((entry) => entry.name === "domain-model");
    assert(stale?.issues.some((issue) => issue.code === "source_stale") ?? false, "Audit flags stale source revision");
    assertEqual(stale?.source?.revision, "old-domain-revision", "Audit preserves loaded source revision");
    assertEqual(stale?.expectedSource?.revision, "current-domain-revision", "Audit preserves expected source revision");

    const current = audit.entries.find((entry) => entry.name === "tdd");
    assert(!(current?.issues.some((issue) => issue.code.startsWith("source_")) ?? true), "Audit accepts current source revision");

    const missing = audit.entries.find((entry) => entry.name === "local-only");
    assert(missing?.issues.some((issue) => issue.code === "missing_source") ?? false, "Audit flags missing source metadata");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifySkillsAuditSourceRendering(): Promise<void> {
  section("2. /skills audit Source Rendering");

  const root = await createSourceFixture();
  try {
    const catalog = await SkillCatalog.fromDirectories([root]);
    const parser = new SlashCommandParser({
      skills: {
        catalog,
        audit: {
          productCandidateNames: ["domain-model", "tdd"],
          expectedSources: {
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
          },
        },
      },
    });

    const result = parser.tryHandle("/skills audit");
    assert(result.handled, "/skills audit resolves with source metadata");
    assert(!result.isError, "/skills audit source view is not an error");
    assert(result.output.includes("Missing source: 1"), "/skills audit includes missing source count");
    assert(result.output.includes("Stale source: 1"), "/skills audit includes stale source count");
    assert(result.output.includes("Source mismatches: 0"), "/skills audit includes source mismatch count");
    assert(result.output.includes("domain-model | product-candidate | source_stale"), "/skills audit shows stale source issue");
    assert(result.output.includes("local-only | developer-only | missing_source"), "/skills audit shows missing source issue");
    assert(result.output.includes("old-domain-revision -> current-domain-revision"), "/skills audit shows revision delta");
    assert(!result.output.includes("This body must not appear"), "/skills audit does not leak local-only body text");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 54 Verification (Skills Source Metadata Audit)\n");

  await verifySourceMetadataLoadAndAudit();
  await verifySkillsAuditSourceRendering();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 54: Skills source metadata audit is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
