/**
 * Phase 30 Verification Script - Skills Catalog Foundation
 *
 * Covers the first Phase 5 tools/skills/MCP slice:
 *   1. File-based SKILL.md discovery with frontmatter metadata
 *   2. Query-based skill selection and bounded prompt instruction building
 *   3. `/skills` operator visibility for list/search/inspect surfaces
 *
 * Run: bun run src/verify-phase30.ts
 */

import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  SkillCatalog,
  buildSkillPromptInstructions,
  loadSkillsFromDirectories,
} from "./skills";
import { parseCommand, SlashCommandParser } from "./gateway";

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

async function createSkillFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "colony-skills-"));
  const reviewDir = join(root, "code-review");
  const deployDir = join(root, "deploy");
  await mkdir(reviewDir, { recursive: true });
  await mkdir(deployDir, { recursive: true });
  await writeFile(join(reviewDir, "SKILL.md"), [
    "---",
    "name: code-review",
    "description: Reviews code for correctness, security, and maintainability. Use when asked to review code or PRs.",
    "caste: FORGE_CARVER",
    "tags: [code, review, security]",
    "tools_required:",
    "  - filesystem.read_file",
    "  - grep_search",
    "requires_approval:",
    "  - shell_exec",
    "trust_level: 3",
    "---",
    "",
    "# Code Review",
    "",
    "Read the diff before judging. Prioritize correctness, security, and regressions.",
    "Never execute helper scripts from the skill body automatically.",
  ].join("\n"));

  await writeFile(join(deployDir, "SKILL.md"), [
    "---",
    "name: deploy-check",
    "description: Checks deployment readiness and release risk. Use when preparing a production release.",
    "tags: [deploy, release]",
    "tools_required: [file_read]",
    "---",
    "",
    "# Deploy Check",
    "",
    "Confirm verification evidence before release.",
  ].join("\n"));
  await writeFile(join(deployDir, "helper.js"), "throw new Error('must not execute');\n");
  return root;
}

async function verifySkillDiscovery(): Promise<void> {
  section("1. SKILL.md Discovery");

  const root = await createSkillFixture();
  try {
    const skills = await loadSkillsFromDirectories([root]);
    assertEqual(skills.length, 2, "Loader discovers two SKILL.md files");
    assertEqual(skills[0]?.name, "code-review", "Skills sort by name");
    assertEqual(skills[0]?.description.startsWith("Reviews code"), true, "Loader parses description");
    assertEqual(skills[0]?.caste, "FORGE_CARVER", "Loader parses caste metadata");
    assert(skills[0]?.tags.includes("security") ?? false, "Loader parses inline tag array");
    assert(skills[0]?.toolsRequired.includes("filesystem.read_file") ?? false, "Loader parses multiline tools_required");
    assert(skills[0]?.requiresApproval.includes("shell_exec") ?? false, "Loader parses requires_approval");
    assertEqual(skills[0]?.trustLevel, 3, "Loader parses numeric trust level");
    assert(skills[0]?.body.includes("Prioritize correctness"), "Loader preserves body instructions");
    assert(!skills[1]?.body.includes("must not execute"), "Loader ignores adjacent helper script content");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifySkillSelectionAndPrompt(): Promise<void> {
  section("2. Skill Selection and Prompt Instructions");

  const root = await createSkillFixture();
  try {
    const catalog = await SkillCatalog.fromDirectories([root]);
    const search = catalog.search("review code for security", { limit: 2 });
    assertEqual(search[0]?.skill.name, "code-review", "Catalog search ranks matching skill first");
    assert(search[0]?.score > 0, "Catalog search reports positive score");
    assertEqual(catalog.get("deploy-check")?.name, "deploy-check", "Catalog retrieves skill by name");

    const prompt = buildSkillPromptInstructions(search.map((match) => match.skill), {
      maxChars: 320,
    });
    assert(prompt.includes("## Skill: code-review"), "Prompt instructions include skill heading");
    assert(prompt.includes("Tools required: filesystem.read_file, grep_search"), "Prompt instructions include required tools");
    assert(prompt.includes("Requires approval: shell_exec"), "Prompt instructions include approval requirements");
    assert(prompt.length <= 360, "Prompt instructions stay bounded");
    assert(!prompt.includes("helper.js"), "Prompt instructions do not mention helper scripts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifySkillsGatewayCommand(): Promise<void> {
  section("3. /skills Operator Command");

  const root = await createSkillFixture();
  try {
    const catalog = await SkillCatalog.fromDirectories([root]);
    const parser = new SlashCommandParser({
      skills: {
        catalog,
      },
    });

    const parsed = parseCommand("/skills search review");
    assertEqual(parsed.type, "skills", "parseCommand recognizes /skills");
    assertEqual(parsed.args[0], "search", "parseCommand preserves /skills subcommand");

    const list = parser.tryHandle("/skills");
    assertEqual(list.handled, true, "/skills command resolves");
    assert(list.output.includes("Skills Catalog"), "/skills renders catalog header");
    assert(list.output.includes("code-review"), "/skills lists discovered skill");
    assert(list.output.includes("deploy-check"), "/skills lists second skill");
    assert(list.output.includes("/skills inspect <name>"), "/skills teaches inspect command");

    const search = parser.tryHandle("/skills search security review");
    assert(search.output.includes("Skill Search"), "/skills search renders search header");
    assert(search.output.includes("code-review"), "/skills search includes matching skill");
    assert(!search.output.includes("helper.js"), "/skills search does not expose helper script content");

    const inspect = parser.tryHandle("/skills inspect code-review");
    assert(inspect.output.includes("Skill: code-review"), "/skills inspect renders skill detail");
    assert(inspect.output.includes("Trust: 3"), "/skills inspect includes trust level");
    assert(inspect.output.includes("Requires approval: shell_exec"), "/skills inspect includes approval policy");
    assert(inspect.output.includes("Prompt preview:"), "/skills inspect includes bounded prompt preview");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 30 Verification (Skills Catalog Foundation)\n");

  await verifySkillDiscovery();
  await verifySkillSelectionAndPrompt();
  await verifySkillsGatewayCommand();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 30: Skills catalog foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
