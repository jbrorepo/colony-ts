import { buildSkillsCommandPayload } from "./gateway-skills";
import type { SkillDefinition } from "./skills";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureSkill(name: string): SkillDefinition {
  return {
    name,
    description: "Builds deterministic skill views.",
    body: "Use this fixture for command input validation.",
    filePath: `/skills/${name}/SKILL.md`,
    rootDir: "/skills",
    relativePath: `${name}/SKILL.md`,
    tags: ["validation"],
    toolsRequired: [],
    requiresApproval: ["promotion"],
    trustLevel: 2,
    source: {
      repo: "skills-main",
      path: `${name}/SKILL.md`,
      ref: "main",
      revision: "rev-351",
    },
    metadata: {},
  };
}

const context = {
  skills: [fixtureSkill("review-helper")],
  stage: {
    stagedSkills: [fixtureSkill("review-helper")],
  },
};

const flagOnlySkills = buildSkillsCommandPayload(["--approved"], context);
assert(!flagOnlySkills.isError, "flag-only skills command renders default list");
assert(flagOnlySkills.output.includes("Skills Catalog:"), "flag-only skills command renders list heading");
assert(!flagOnlySkills.output.includes("Unknown skills command"), "flag-only skills command does not treat approval flag as command");

const unknownSkills = buildSkillsCommandPayload(["launch"], context);
assert(unknownSkills.isError, "unknown skills command is rejected");
assert(unknownSkills.output.includes("Unknown skills command 'launch'"), "unknown skills command is named");
assert(unknownSkills.output.includes("Next valid command: /skills list"), "unknown skills command gives recovery path");

const secretSkills = buildSkillsCommandPayload(["github_pat_SKILLS_SHOULD_NOT_LEAK12345678"], context);
assert(secretSkills.isError, "secret-shaped skills command is rejected");
assert(secretSkills.output.includes("Unknown skills command '[REDACTED]'"), "secret-shaped skills command renders redacted label");
assert(!secretSkills.output.includes("SKILLS_SHOULD_NOT_LEAK"), "secret-shaped skills command redacts token body");
assert(!secretSkills.output.includes("github_pat_"), "secret-shaped skills command redacts token prefix");

const flagOnlyStaged = buildSkillsCommandPayload(["staged", "--approved"], context);
assert(!flagOnlyStaged.isError, "flag-only staged skills command renders default staged list");
assert(flagOnlyStaged.output.includes("Staged Skills:"), "flag-only staged skills command renders staged heading");

const unknownStaged = buildSkillsCommandPayload(["staged", "launch"], context);
assert(unknownStaged.isError, "unknown staged skills action is rejected");
assert(unknownStaged.output.includes("Unknown staged skills command 'launch'"), "unknown staged skills action is named");
assert(unknownStaged.output.includes("Next valid command: /skills staged"), "unknown staged skills action gives recovery path");

const secretStaged = buildSkillsCommandPayload(["staged", "ghp_STAGED_SHOULD_NOT_LEAK12345678"], context);
assert(secretStaged.isError, "secret-shaped staged skills action is rejected");
assert(secretStaged.output.includes("Unknown staged skills command '[REDACTED]'"), "secret-shaped staged skills action renders redacted label");
assert(!secretStaged.output.includes("STAGED_SHOULD_NOT_LEAK"), "secret-shaped staged skills action redacts token body");
assert(!secretStaged.output.includes("ghp_"), "secret-shaped staged skills action redacts token prefix");

console.log("Phase 351: skills command inputs ignore flags and redact secrets.");
