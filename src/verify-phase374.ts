import { buildSkillsCommandPayload } from "./gateway-skills";
import type { SkillDefinition, SkillLifecycleEvent, SkillPromotionResult } from "./skills";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("SKILL_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

function fixtureSkill(name = "review-helper"): SkillDefinition {
  return {
    name,
    description: "Reviews release safety ghp_SKILL_SURFACE_DESCRIPTION_SHOULD_NOT_LEAK12345678",
    body: "Prompt body includes github_pat_SKILL_SURFACE_BODY_SHOULD_NOT_LEAK12345678",
    filePath: `/skills/${name}/SKILL.md`,
    rootDir: "/skills",
    relativePath: `${name}/ghp_SKILL_SURFACE_RELATIVE_PATH_SHOULD_NOT_LEAK12345678/SKILL.md`,
    caste: "consult_ant_github_pat_SKILL_SURFACE_CASTE_SHOULD_NOT_LEAK12345678",
    tags: ["review", "ghp_SKILL_SURFACE_TAG_SHOULD_NOT_LEAK12345678"],
    toolsRequired: ["shell_exec", "github_pat_SKILL_SURFACE_TOOL_SHOULD_NOT_LEAK12345678"],
    requiresApproval: ["file_write", "ghp_SKILL_SURFACE_APPROVAL_SHOULD_NOT_LEAK12345678"],
    trustLevel: 2,
    source: {
      repo: "skills-main-ghp_SKILL_SURFACE_REPO_SHOULD_NOT_LEAK12345678",
      path: `${name}/github_pat_SKILL_SURFACE_SOURCE_PATH_SHOULD_NOT_LEAK12345678/SKILL.md`,
      ref: "main-ghp_SKILL_SURFACE_REF_SHOULD_NOT_LEAK12345678",
      revision: "rev-github_pat_SKILL_SURFACE_REVISION_SHOULD_NOT_LEAK12345678",
    },
    metadata: {},
  };
}

const skill = fixtureSkill();
const promotion: SkillPromotionResult = {
  status: "blocked",
  promoted: false,
  skillName: skill.name,
  reason: "approval failed ghp_SKILL_SURFACE_PROMOTION_REASON_SHOULD_NOT_LEAK12345678",
  livePath: "/live/github_pat_SKILL_SURFACE_LIVE_PATH_SHOULD_NOT_LEAK12345678",
  rollbackPath: "/rollback/ghp_SKILL_SURFACE_ROLLBACK_PATH_SHOULD_NOT_LEAK12345678",
  manifestPath: "/manifest/github_pat_SKILL_SURFACE_MANIFEST_PATH_SHOULD_NOT_LEAK12345678.json",
};
const lifecycleEvent: SkillLifecycleEvent = {
  event: "promoted",
  status: "blocked-ghp_SKILL_SURFACE_EVENT_STATUS_SHOULD_NOT_LEAK12345678",
  skillName: skill.name,
  approvedBy: "github_pat_SKILL_SURFACE_APPROVER_SHOULD_NOT_LEAK12345678",
  reason: "reason ghp_SKILL_SURFACE_EVENT_REASON_SHOULD_NOT_LEAK12345678",
  sourceRevision: "src-github_pat_SKILL_SURFACE_EVENT_SOURCE_SHOULD_NOT_LEAK12345678",
  livePath: "/live/ghp_SKILL_SURFACE_EVENT_LIVE_PATH_SHOULD_NOT_LEAK12345678",
  manifestPath: "/manifest/github_pat_SKILL_SURFACE_EVENT_MANIFEST_SHOULD_NOT_LEAK12345678.json",
};

const context = {
  skills: [skill],
  stage: {
    stagedSkills: [skill],
    stageManifests: [
      {
        skillName: skill.name,
        status: "staged-ghp_SKILL_SURFACE_STAGE_STATUS_SHOULD_NOT_LEAK12345678",
      },
    ],
    promotionResults: {
      [skill.name]: promotion,
    },
    lifecycleEvents: [lifecycleEvent],
  },
  toolDefinitions: [
    {
      name: "shell-ghp_SKILL_SURFACE_TOOL_NAME_SHOULD_NOT_LEAK12345678",
      description: "Tool metadata github_pat_SKILL_SURFACE_TOOL_DESCRIPTION_SHOULD_NOT_LEAK12345678",
      riskLevel: "high-ghp_SKILL_SURFACE_RISK_SHOULD_NOT_LEAK12345678",
      requiresApproval: true,
    },
  ],
};

const list = buildSkillsCommandPayload(["list"], context).output;
assert(list.includes("Reviews release safety [REDACTED]"), "skills list redacts descriptions");
assert(list.includes("tags review, [REDACTED]"), "skills list redacts tags");
assertRedacted(list, "skills list");

const inspect = buildSkillsCommandPayload(["inspect", skill.name], context).output;
assert(inspect.includes("Description: Reviews release safety [REDACTED]"), "skill inspect redacts description");
assert(inspect.includes("Path: review-helper/[REDACTED]/SKILL.md"), "skill inspect redacts relative path");
assert(inspect.includes("Prompt body includes [REDACTED]"), "skill inspect redacts prompt preview");
assertRedacted(inspect, "skill inspect");

const docs = buildSkillsCommandPayload(["docs-preview"], context).output;
assert(docs.includes("Source: skills-main-[REDACTED] review-helper/[REDACTED]/SKILL.md main-[REDACTED] rev-[REDACTED]"), "docs preview redacts source metadata");
assert(docs.includes("- shell-[REDACTED] | risk high-[REDACTED]"), "docs preview redacts tool metadata");
assertRedacted(docs, "skills docs preview");

const stagedPreview = buildSkillsCommandPayload(["staged", "preview", skill.name], context).output;
assert(stagedPreview.includes("Stage status: staged-[REDACTED]"), "staged preview redacts status");
assert(stagedPreview.includes("Source revision: rev-[REDACTED]"), "staged preview redacts source revision");
assertRedacted(stagedPreview, "staged preview");

const promote = buildSkillsCommandPayload(["staged", "promote", skill.name, "--approved"], context).output;
assert(promote.includes("Live: /live/[REDACTED]"), "promotion result redacts live path");
assert(promote.includes("Reason: approval failed [REDACTED]"), "promotion result redacts reason");
assertRedacted(promote, "promotion result");

const history = buildSkillsCommandPayload(["staged", "history", skill.name], context).output;
assert(history.includes("approvedBy [REDACTED]"), "staged history redacts approval actor");
assert(history.includes("reason reason [REDACTED]"), "staged history redacts event reason");
assert(history.includes("live /live/[REDACTED]"), "staged history redacts paths");
assertRedacted(history, "staged history");

console.log("Phase 374: skill status surfaces redact secret-shaped metadata.");
