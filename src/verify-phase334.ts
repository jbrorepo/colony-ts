import { buildSkillsCommandPayload } from "./gateway-skills";
import type { SkillDefinition } from "./skills";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stagedSkill(name: string): SkillDefinition {
  return {
    name,
    description: "Staged lifecycle fixture.",
    body: "Staged body must not be required for missing-name validation.",
    filePath: `/stage/${name}/SKILL.md`,
    rootDir: "/stage",
    relativePath: `${name}/SKILL.md`,
    tags: ["staged"],
    toolsRequired: [],
    requiresApproval: ["promotion"],
    trustLevel: 2,
    source: {
      repo: "skills-main",
      path: `${name}/SKILL.md`,
      ref: "main",
      revision: "rev-334",
    },
    metadata: {},
  };
}

const context = {
  stage: {
    stagedSkills: [stagedSkill("review-helper")],
  },
};

for (const command of ["preview", "audit", "approve", "history"]) {
  const missing = buildSkillsCommandPayload(["staged", command], context);
  assert(missing.isError, `missing staged skill name is rejected for ${command}`);
  assert(missing.output.includes("Staged skill name required."), `missing staged ${command} explains name requirement`);
  assert(missing.output.includes(`/skills staged ${command} <name>`), `missing staged ${command} gives retry command`);
}

const flagOnlyPromote = buildSkillsCommandPayload(["staged", "promote", "--approved"], context);
assert(flagOnlyPromote.isError, "flag-only staged promote skill name is rejected");
assert(flagOnlyPromote.output.includes("Staged skill name required."), "flag-only staged promote explains name requirement");
assert(flagOnlyPromote.output.includes("/skills staged promote <name> --approved"), "flag-only staged promote gives retry command");
assert(!flagOnlyPromote.output.includes("Promotion Status:"), "flag-only staged promote emits no promotion status");

const flagOnlyRollback = buildSkillsCommandPayload(["staged", "rollback", "--approved"], context);
assert(flagOnlyRollback.isError, "flag-only staged rollback skill name is rejected");
assert(flagOnlyRollback.output.includes("Staged skill name required."), "flag-only staged rollback explains name requirement");
assert(flagOnlyRollback.output.includes("/skills staged rollback <name>"), "flag-only staged rollback gives retry command");
assert(!flagOnlyRollback.output.includes("Rollback Status:"), "flag-only staged rollback emits no rollback status");

const unknownNamed = buildSkillsCommandPayload(["staged", "preview", "missing-skill"], context);
assert(unknownNamed.isError, "unknown named staged skill is still rejected");
assert(unknownNamed.output.includes("Staged skill not found: missing-skill"), "unknown named staged skill still uses not-found path");

const validPreview = buildSkillsCommandPayload(["staged", "preview", "review-helper"], context);
assert(!validPreview.isError, "valid staged preview still succeeds");
assert(validPreview.output.includes("Staged Skill Preview: review-helper"), "valid staged preview preserves name");

console.log("Phase 334: staged skill command names are required.");
