/**
 * Phase 53 Verification Script - Skills Catalog Audit
 *
 * Covers the next skills/productization slice:
 *   1. Skill catalog audit detects aliases/renames and metadata gaps
 *   2. Skills are classified as developer-only, product-candidate, or unsupported
 *   3. `/skills audit` exposes the audit summary without executing skill bodies
 *
 * Run: bun run src/verify-phase53.ts
 */

import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
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

async function createAuditFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "colony-skill-audit-"));

  await writeSkill(root, "tdd", [
    "---",
    "name: tdd",
    "description: Test-driven development with red-green-refactor.",
    "tags: [development, testing]",
    "trust_level: 4",
    "---",
    "",
    "# TDD",
    "",
    "Write the test first. Watch it fail. Then implement the smallest fix.",
  ]);

  await writeSkill(root, "write-a-prd", [
    "---",
    "name: write-a-prd",
    "description: Older PRD skill name that should map to to-prd.",
    "tags: [planning]",
    "---",
    "",
    "# Write a PRD",
    "",
    "Create a product requirements document from context.",
  ]);

  await writeSkill(root, "migrate-to-shoehorn", [
    "---",
    "name: migrate-to-shoehorn",
    "description: Migrates tests to a dependency-specific fixture helper.",
    "tags: [migration]",
    "---",
    "",
    "# Migrate",
    "",
    "Replace test assertions with a specialized package.",
  ]);

  await writeSkill(root, "broken-skill", [
    "---",
    "name: broken-skill",
    "tags: [broken]",
    "---",
  ]);

  return root;
}

async function writeSkill(root: string, directory: string, lines: string[]): Promise<void> {
  const skillDir = join(root, directory);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), lines.join("\n"));
}

async function verifySkillCatalogAudit(): Promise<void> {
  section("1. Skill Catalog Audit");

  const root = await createAuditFixture();
  try {
    const skills = await loadSkillsFromDirectories([root]);
    const audit = auditSkillCatalog(skills, {
      aliases: {
        "write-a-prd": "to-prd",
      },
      productCandidateNames: ["tdd", "to-prd"],
      unsupportedNames: ["migrate-to-shoehorn"],
    });

    assertEqual(audit.totalSkills, 4, "Audit counts all loaded skills");
    assertEqual(audit.validSkills, 3, "Audit counts skills without blocking metadata gaps");
    assertEqual(audit.issueCount, 4, "Audit counts metadata, alias, and missing-source issues");
    assertEqual(audit.aliasCount, 1, "Audit counts detected aliases");
    assertEqual(audit.classificationCounts["product-candidate"], 2, "Audit counts product candidates");
    assertEqual(audit.classificationCounts["developer-only"], 1, "Audit counts developer-only skills");
    assertEqual(audit.classificationCounts.unsupported, 1, "Audit counts unsupported skills");

    const aliased = audit.entries.find((entry) => entry.name === "write-a-prd");
    assertEqual(aliased?.canonicalName, "to-prd", "Audit resolves renamed canonical skill name");
    assertEqual(aliased?.classification, "product-candidate", "Aliased skill inherits canonical product classification");
    assert(aliased?.issues.some((issue) => issue.code === "alias_renamed") ?? false, "Audit records rename issue");

    const broken = audit.entries.find((entry) => entry.name === "broken-skill");
    assertEqual(broken?.classification, "developer-only", "Unknown valid-looking skill defaults to developer-only");
    assert(broken?.issues.some((issue) => issue.code === "missing_description") ?? false, "Audit flags missing description");
    assert(broken?.issues.some((issue) => issue.code === "empty_body") ?? false, "Audit flags empty body");

    const unsupported = audit.entries.find((entry) => entry.name === "migrate-to-shoehorn");
    assertEqual(unsupported?.classification, "unsupported", "Audit honors unsupported skill list");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifySkillsAuditCommand(): Promise<void> {
  section("2. /skills audit Operator Command");

  const root = await createAuditFixture();
  try {
    const catalog = await SkillCatalog.fromDirectories([root]);
    const parser = new SlashCommandParser({
      skills: {
        catalog,
        audit: {
          aliases: {
            "write-a-prd": "to-prd",
          },
          productCandidateNames: ["tdd", "to-prd"],
          unsupportedNames: ["migrate-to-shoehorn"],
        },
      },
    });

    const result = parser.tryHandle("/skills audit");
    assert(result.handled, "/skills audit resolves");
    assert(!result.isError, "/skills audit is not an error");
    assert(result.output.includes("Skills Catalog Audit"), "/skills audit renders audit header");
    assert(result.output.includes("Total: 4"), "/skills audit includes total count");
    assert(result.output.includes("Aliases/renames: 1"), "/skills audit includes alias count");
    assert(result.output.includes("Product candidates: 2"), "/skills audit includes product count");
    assert(result.output.includes("Unsupported: 1"), "/skills audit includes unsupported count");
    assert(result.output.includes("write-a-prd -> to-prd"), "/skills audit shows alias mapping");
    assert(result.output.includes("broken-skill | developer-only | missing_description, empty_body"), "/skills audit shows metadata gaps");
    assert(!result.output.includes("Write the test first"), "/skills audit does not expose skill body text");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 53 Verification (Skills Catalog Audit)\n");

  await verifySkillCatalogAudit();
  await verifySkillsAuditCommand();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 53: Skills catalog audit is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
