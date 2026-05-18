import { buildSkillsCommandPayload } from "./gateway-skills";
import type { SkillDefinition } from "./skills";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

const context = {
  skills: [fixtureSkill("generated-docs")],
  toolDefinitions: [{ name: "shell_exec", description: "Run bounded shell commands.", riskLevel: "high" }],
};

const preview = buildSkillsCommandPayload(["docs-preview"], context);
assert(!preview.isError, "/skills docs-preview remains accepted");
assert(preview.output.includes("Preview only; no files were written."), "docs preview remains read-only");

const writeAttempt = buildSkillsCommandPayload(["docs-preview", "--write"], context);
assert(writeAttempt.isError, "docs-preview --write is rejected");
assert(writeAttempt.output.includes("Skills docs-preview is preview-only."), "docs-preview --write explains preview boundary");
assert(writeAttempt.output.includes("No files were written."), "docs-preview --write preserves no-write truth");
assert(writeAttempt.data?.action !== "skills_docs_preview", "docs-preview --write does not emit preview action");

const approvedSaveAttempt = buildSkillsCommandPayload(["docs-preview", "--approved", "--save"], context);
assert(approvedSaveAttempt.isError, "docs-preview approved save attempt is rejected");
assert(approvedSaveAttempt.output.includes("Skill docs generation cannot write, promote, save, or install from this command."), "docs-preview save rejection names blocked mutations");

const docsAliasWriteAttempt = buildSkillsCommandPayload(["docs", "--output", "SKILLS.md"], context);
assert(docsAliasWriteAttempt.isError, "docs alias output attempt is rejected");
assert(docsAliasWriteAttempt.output.includes("/skills docs-preview"), "docs alias output rejection gives recovery command");

console.log("Phase 330: skills docs-preview rejects mutation-shaped arguments.");
