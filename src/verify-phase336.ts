import { buildSkillsCommandPayload } from "./gateway-skills";
import type { SkillDefinition } from "./skills";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureSkill(name: string): SkillDefinition {
  return {
    name,
    description: "Reviews code and release safety.",
    body: "Use this fixture for search validation.",
    filePath: `/skills/${name}/SKILL.md`,
    rootDir: "/skills",
    relativePath: `${name}/SKILL.md`,
    tags: ["review", "release"],
    toolsRequired: [],
    requiresApproval: [],
    trustLevel: 2,
    source: {
      repo: "skills-main",
      path: `${name}/SKILL.md`,
      ref: "main",
      revision: "rev-336",
    },
    metadata: {},
  };
}

const context = {
  skills: [fixtureSkill("review-helper")],
};

const flagOnlySearch = buildSkillsCommandPayload(["search", "--approved"], context);
assert(flagOnlySearch.isError, "flag-only skill search query is rejected");
assert(flagOnlySearch.output.includes("Skill search query required."), "flag-only search explains query requirement");
assert(flagOnlySearch.output.includes("/skills search <query>"), "flag-only search gives retry command");

const secretSearch = buildSkillsCommandPayload(["search", "ghp_SHOULD_NOT_LEAK12345678"], context);
assert(!secretSearch.isError, "secret-shaped skill search stays a read-only search");
assert(secretSearch.output.includes("Skill Search: [REDACTED]"), "secret-shaped search renders redacted query");
assert(!secretSearch.output.includes("SHOULD_NOT_LEAK"), "secret-shaped search redacts token body");
assert(!secretSearch.output.includes("ghp_"), "secret-shaped search redacts token prefix");
assert(secretSearch.data?.query === "[REDACTED]", "secret-shaped search stores only redacted query data");

const validSearch = buildSkillsCommandPayload(["search", "review"], context);
assert(!validSearch.isError, "valid skill search still succeeds");
assert(validSearch.output.includes("Skill Search: review"), "valid search preserves display query");
assert(validSearch.output.includes("review-helper"), "valid search returns matching skill");
assert(validSearch.data?.query === "review", "valid search preserves data query");

console.log("Phase 336: skill search queries are required and redacted.");
