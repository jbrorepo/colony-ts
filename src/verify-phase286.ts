/**
 * Phase 286 Verification Script - Generated Skill Documentation
 *
 * Run: bun run src/verify-phase286.ts
 */

import { generateSkillDocsPreview } from "./skills/generated-docs";
import type { SkillDefinition } from "./skills";
import { buildSkillsCommandPayload } from "./gateway-skills";

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
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function fixtureSkill(name: string): SkillDefinition {
  return {
    name,
    description: "Builds deterministic generated docs.",
    body: "Use this skill for generated documentation previews.",
    filePath: `/skills/${name}/SKILL.md`,
    rootDir: "/skills",
    relativePath: `${name}/SKILL.md`,
    tags: ["docs", "preview"],
    toolsRequired: ["shell_exec"],
    requiresApproval: ["file_write"],
    trustLevel: 2,
    source: {
      repo: "skills-main",
      path: `${name}/SKILL.md`,
      ref: "main",
      revision: "abc123",
    },
    metadata: {},
  };
}

function verifyPureGenerator(): void {
  const preview = generateSkillDocsPreview({
    skills: [fixtureSkill("generated-docs")],
    toolDefinitions: [{ name: "shell_exec", description: "Run bounded shell commands.", riskLevel: "high" }],
  });

  assert(preview.markdown.includes("# Generated Skill Documentation Preview"), "Preview renders stable heading");
  assert(preview.markdown.includes("generated-docs"), "Preview includes skill name");
  assert(preview.markdown.includes("Tools required: shell_exec"), "Preview includes tool requirements");
  assert(preview.markdown.includes("Requires approval: file_write"), "Preview includes approval requirements");
  assert(preview.markdown.includes("Source: skills-main generated-docs/SKILL.md main abc123"), "Preview includes source metadata");
  assert(preview.markdown.includes("Tool Metadata"), "Preview includes tool metadata section");
  assert(preview.markdown.includes("Preview only; no files were written."), "Preview states no file writes");
  assertEqual(preview.skillCount, 1, "Preview reports skill count");
  assertEqual(preview.toolCount, 1, "Preview reports tool count");
}

function verifyGatewayPreview(): void {
  const payload = buildSkillsCommandPayload(["docs-preview"], {
    skills: [fixtureSkill("generated-docs")],
    toolDefinitions: [{ name: "shell_exec", description: "Run bounded shell commands.", riskLevel: "high" }],
  });
  assertEqual(payload.data?.action, "skills_docs_preview", "/skills docs-preview data action is stable");
  assert(payload.output.includes("# Generated Skill Documentation Preview"), "/skills docs-preview renders generated Markdown");
  assert(payload.output.includes("Preview only; no files were written."), "/skills docs-preview is read-only");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 286 Verification (Generated Skill Documentation)\n");
  verifyPureGenerator();
  verifyGatewayPreview();
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 286: generated skill documentation is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
