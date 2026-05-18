import { buildSkillsCommandPayload } from "./gateway-skills";
import type { SkillDefinition } from "./skills";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureSkill(name: string): SkillDefinition {
  return {
    name,
    description: "Lookup safety fixture.",
    body: "Use this fixture for skill lookup validation.",
    filePath: `/skills/${name}/SKILL.md`,
    rootDir: "/skills",
    relativePath: `${name}/SKILL.md`,
    tags: ["lookup"],
    toolsRequired: [],
    requiresApproval: [],
    trustLevel: 2,
    source: {
      repo: "skills-main",
      path: `${name}/SKILL.md`,
      ref: "main",
      revision: "rev-335",
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

const missingInspect = buildSkillsCommandPayload(["inspect", "--approved"], context);
assert(missingInspect.isError, "flag-only skill inspect name is rejected");
assert(missingInspect.output.includes("Skill name required."), "flag-only inspect explains name requirement");
assert(missingInspect.output.includes("/skills inspect <name>"), "flag-only inspect gives retry command");

const secretInspect = buildSkillsCommandPayload(["inspect", "ghp_SHOULD_NOT_LEAK12345678"], context);
assert(secretInspect.isError, "secret-shaped skill inspect name is rejected");
assert(secretInspect.output.includes("Skill name rejected."), "secret-shaped inspect explains rejection");
assert(!secretInspect.output.includes("SHOULD_NOT_LEAK"), "secret-shaped inspect redacts token body");
assert(!secretInspect.output.includes("ghp_"), "secret-shaped inspect redacts token prefix");

const malformedInspect = buildSkillsCommandPayload(["inspect", "../../escape"], context);
assert(malformedInspect.isError, "path-shaped skill inspect name is rejected");
assert(malformedInspect.output.includes("Skill name rejected."), "path-shaped inspect explains rejection");

const secretStagedPreview = buildSkillsCommandPayload(["staged", "preview", "ghp_SHOULD_NOT_LEAK12345678"], context);
assert(secretStagedPreview.isError, "secret-shaped staged skill name is rejected");
assert(secretStagedPreview.output.includes("Staged skill name rejected."), "secret-shaped staged lookup explains rejection");
assert(!secretStagedPreview.output.includes("SHOULD_NOT_LEAK"), "secret-shaped staged lookup redacts token body");
assert(!secretStagedPreview.output.includes("ghp_"), "secret-shaped staged lookup redacts token prefix");

const validInspect = buildSkillsCommandPayload(["inspect", "review-helper"], context);
assert(!validInspect.isError, "valid skill inspect still succeeds");
assert(validInspect.output.includes("Skill: review-helper"), "valid inspect preserves skill name");

const validStagedPreview = buildSkillsCommandPayload(["staged", "preview", "review-helper"], context);
assert(!validStagedPreview.isError, "valid staged preview still succeeds");
assert(validStagedPreview.output.includes("Staged Skill Preview: review-helper"), "valid staged preview preserves skill name");

console.log("Phase 335: skill lookup names are required, shaped, and redacted.");
