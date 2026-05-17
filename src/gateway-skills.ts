import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  auditSkillCatalog,
  buildSkillLifecycleEvents,
  buildSkillPromptInstructions,
  planSkillSourceUpdates,
  SkillCatalog,
  type SkillCatalogAuditOptions,
  type SkillDefinition,
  type SkillLifecycleEvent,
  type SkillPromotionResult,
  type SkillRollbackResult,
  type SkillSourceMetadata,
} from "./skills";

export interface GatewaySkillsContext {
  catalog?: SkillCatalog | null;
  skills?: SkillDefinition[];
  audit?: SkillCatalogAuditOptions;
  stage?: GatewaySkillsStageContext;
}

export interface GatewaySkillsStageContext {
  stagedSkills?: SkillDefinition[];
  stageManifests?: Array<Record<string, unknown>>;
  expectedSources?: Record<string, SkillSourceMetadata>;
  promotionResults?: Record<string, SkillPromotionResult>;
  promotionManifests?: Array<Record<string, unknown>>;
  rollbackResults?: Record<string, SkillRollbackResult>;
  rollbackManifests?: Array<Record<string, unknown>>;
  lifecycleEvents?: SkillLifecycleEvent[];
}

export function buildSkillsCommandPayload(
  args: string[],
  context: GatewaySkillsContext = {},
): GatewayBasicCommandPayload {
  const skills = resolveSkills(context);
  const command = (args[0] ?? "list").toLowerCase();

  if (args.length === 0 || command === "list") {
    return {
      output: renderSkillsList(skills),
      data: { action: "skills_list", count: skills.length },
    };
  }

  if (command === "search") {
    const query = args.slice(1).join(" ").trim();
    if (!query) {
      return { output: "Usage: /skills search <query>", isError: true, data: { action: "skills_usage" } };
    }
    const matches = searchSkills(skills, query);
    return {
      output: renderSkillSearch(query, matches),
      data: { action: "skills_search", query, count: matches.length },
    };
  }

  if (command === "inspect") {
    const name = args[1] ?? "";
    if (!name) {
      return { output: "Usage: /skills inspect <name>", isError: true, data: { action: "skills_usage" } };
    }
    const skill = skills.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    if (!skill) {
      return {
        output: `Skill not found: ${name}\n\nInspect: /skills | /skills search <query>`,
        isError: true,
        data: { action: "skills_missing", name },
      };
    }
    return {
      output: renderSkillInspect(skill),
      data: { action: "skills_inspect", name: skill.name },
    };
  }

  if (command === "audit") {
    const audit = auditSkillCatalog(skills, context.audit ?? {});
    return {
      output: renderSkillAudit(audit),
      data: {
        action: "skills_audit",
        count: audit.totalSkills,
        valid: audit.validSkills,
        issues: audit.issueCount,
        aliases: audit.aliasCount,
      },
    };
  }

  if (command === "plan") {
    const plan = planSkillSourceUpdates(skills, context.audit ?? {});
    return {
      output: renderSkillSourcePlan(plan),
      data: {
        action: "skills_plan",
        count: plan.totalActions,
        imports: plan.importCount,
        updates: plan.updateCount,
        reviews: plan.reviewCount,
        dryRun: plan.dryRun,
      },
    };
  }

  if (command === "staged" || command === "stage") {
    return buildStagedSkillsPayload(args.slice(1), context.stage ?? {});
  }

  return {
    output: "Usage: /skills [list|search <query>|inspect <name>|audit|plan|staged]",
    isError: true,
    data: { action: "skills_usage" },
  };
}

function resolveSkills(context: GatewaySkillsContext): SkillDefinition[] {
  if (context.catalog) return context.catalog.list();
  return [...(context.skills ?? [])].sort((left, right) => left.name.localeCompare(right.name));
}

function renderSkillsList(skills: SkillDefinition[]): string {
  const lines = ["Skills Catalog:", ""];
  if (skills.length === 0) {
    lines.push("No skills are loaded in this runtime snapshot.");
  } else {
    for (const skill of skills) {
      lines.push(`- ${skill.name} | ${skill.description || "no description"} | tags ${formatList(skill.tags)}`);
    }
  }
  lines.push("");
  lines.push("Inspect: /skills inspect <name> | /skills search <query> | /skills audit | /skills plan");
  return lines.join("\n");
}

function renderSkillSearch(query: string, matches: SkillDefinition[]): string {
  const lines = [`Skill Search: ${query}`, ""];
  if (matches.length === 0) {
    lines.push("No matching skills found.");
  } else {
    for (const skill of matches) {
      lines.push(`- ${skill.name} | ${skill.description || "no description"} | tags ${formatList(skill.tags)}`);
    }
  }
  lines.push("");
  lines.push("Inspect: /skills inspect <name> | /skills");
  return lines.join("\n");
}

function renderSkillInspect(skill: SkillDefinition): string {
  const preview = buildSkillPromptInstructions([skill], { maxChars: 700 });
  const lines = [`Skill: ${skill.name}`, ""];
  lines.push(`Description: ${skill.description || "none"}`);
  if (skill.caste) lines.push(`Caste: ${skill.caste}`);
  lines.push(`Trust: ${skill.trustLevel ?? "not specified"}`);
  lines.push(`Tags: ${formatList(skill.tags)}`);
  lines.push(`Tools required: ${formatList(skill.toolsRequired)}`);
  lines.push(`Requires approval: ${formatList(skill.requiresApproval)}`);
  lines.push(`Path: ${skill.relativePath}`);
  lines.push("");
  lines.push("Prompt preview:");
  lines.push(preview);
  lines.push("");
  lines.push("Inspect: /skills | /skills search <query>");
  return lines.join("\n");
}

function renderSkillAudit(audit: ReturnType<typeof auditSkillCatalog>): string {
  const lines = ["Skills Catalog Audit:", ""];
  lines.push(`Total: ${audit.totalSkills}`);
  lines.push(`Valid: ${audit.validSkills}`);
  lines.push(`Skills with issues: ${audit.issueCount}`);
  lines.push(`Aliases/renames: ${audit.aliasCount}`);
  lines.push(`Missing source: ${audit.sourceMissingCount}`);
  lines.push(`Stale source: ${audit.sourceStaleCount}`);
  lines.push(`Source mismatches: ${audit.sourceMismatchCount}`);
  lines.push(`Product candidates: ${audit.classificationCounts["product-candidate"]}`);
  lines.push(`Developer-only: ${audit.classificationCounts["developer-only"]}`);
  lines.push(`Unsupported: ${audit.classificationCounts.unsupported}`);

  const aliases = audit.entries.filter((entry) => entry.canonicalName !== entry.name);
  if (aliases.length > 0) {
    lines.push("");
    lines.push("Aliases:");
    for (const entry of aliases) {
      lines.push(`- ${entry.name} -> ${entry.canonicalName}`);
    }
  }

  const issueEntries = audit.entries.filter((entry) => entry.issues.length > 0);
  if (issueEntries.length > 0) {
    lines.push("");
    lines.push("Issues:");
    for (const entry of issueEntries) {
      const issueCodes = entry.issues.map((issue) => issue.code).join(", ");
      const name = entry.canonicalName === entry.name ? entry.name : `${entry.name} -> ${entry.canonicalName}`;
      lines.push(`- ${name} | ${entry.classification} | ${issueCodes}`);
      if (entry.source?.revision && entry.expectedSource?.revision && entry.source.revision !== entry.expectedSource.revision) {
        lines.push(`  Source revision: ${entry.source.revision} -> ${entry.expectedSource.revision}`);
      }
    }
  }

  lines.push("");
  lines.push("Inspect: /skills | /skills inspect <name> | /skills search <query>");
  return lines.join("\n");
}

function renderSkillSourcePlan(plan: ReturnType<typeof planSkillSourceUpdates>): string {
  const lines = ["Skills Import/Update Plan:", ""];
  lines.push(`Dry run: ${plan.dryRun ? "yes" : "no"}`);
  lines.push("Requires explicit approval before any file write.");
  lines.push(`Total actions: ${plan.totalActions}`);
  lines.push(`Imports: ${plan.importCount}`);
  lines.push(`Updates: ${plan.updateCount}`);
  lines.push(`Keeps: ${plan.keepCount}`);
  lines.push(`Reviews: ${plan.reviewCount}`);

  if (plan.actions.length > 0) {
    lines.push("");
    lines.push("Actions:");
    for (const action of plan.actions) {
      lines.push(`- ${action.skillName} | ${action.action} | ${action.reasons.join(", ")}`);
      if (action.source?.revision && action.expectedSource?.revision && action.source.revision !== action.expectedSource.revision) {
        lines.push(`  Source revision: ${action.source.revision} -> ${action.expectedSource.revision}`);
      } else if (action.expectedSource?.revision) {
        lines.push(`  Expected revision: ${action.expectedSource.revision}`);
      }
      lines.push(`  Preview: ${action.commandPreview}`);
    }
  }

  lines.push("");
  lines.push("Inspect: /skills audit | /skills inspect <name> | /skills search <query>");
  return lines.join("\n");
}

function buildStagedSkillsPayload(
  args: string[],
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const action = (args[0] ?? "list").toLowerCase();
  const name = args[1] ?? "";

  if (args.length === 0 || action === "list") return renderStagedSkillsList(context);

  if (action === "preview") {
    const skill = findStagedSkill(context, name);
    if (!skill) return missingStagedSkill(name);
    return renderStagedSkillPreview(skill, context);
  }

  if (action === "audit") {
    const skill = findStagedSkill(context, name);
    if (!skill) return missingStagedSkill(name);
    return renderStagedSkillAudit(skill, context);
  }

  if (action === "approve") {
    const skill = findStagedSkill(context, name);
    if (!skill) return missingStagedSkill(name);
    return {
      output: [
        `Staged Skill Approval: ${skill.name}`,
        "",
        "Second approval required before promotion.",
        `Run: /skills staged promote ${skill.name} --approved`,
        "",
        "This view does not write files. Promotion still requires the host to call the fail-closed promotion API.",
      ].join("\n"),
      data: { action: "skills_staged_approve", name: skill.name },
    };
  }

  if (action === "promote") {
    const skill = findStagedSkill(context, name);
    if (!skill) return missingStagedSkill(name);
    if (!args.includes("--approved")) {
      return {
        output: `Second approval required before promotion.\n\nUse /skills staged approve ${skill.name} first.`,
        isError: true,
        data: { action: "skills_staged_promote_blocked", name: skill.name },
      };
    }
    const promotion = context.promotionResults?.[skill.name] ?? context.promotionResults?.[skill.name.toLowerCase()];
    if (!promotion) {
      return {
        output: [
          `Promotion Status: unavailable for ${skill.name}`,
          "",
          "The operator view has approval, but no promotion result was supplied by the host.",
          "Host must call promoteStagedSkillCandidate() and pass its result back for rendering.",
        ].join("\n"),
        isError: true,
        data: { action: "skills_staged_promote_unavailable", name: skill.name },
      };
    }
    return renderPromotionResult(skill, promotion, context);
  }

  if (action === "rollback") {
    const skill = findStagedSkill(context, name);
    if (!skill) return missingStagedSkill(name);
    if (args.includes("--approved")) {
      const rollback = context.rollbackResults?.[skill.name] ?? context.rollbackResults?.[skill.name.toLowerCase()];
      if (!rollback) {
        return {
          output: [
            `Rollback Status: unavailable for ${skill.name}`,
            "",
            "The operator view has approval, but no rollback result was supplied by the host.",
            "Host must call rollbackPromotedSkillCandidate() and pass its result back for rendering.",
          ].join("\n"),
          isError: true,
          data: { action: "skills_staged_rollback_unavailable", name: skill.name },
        };
      }
      return renderRollbackResult(skill, rollback, context);
    }
    const promotion = context.promotionResults?.[skill.name] ?? context.promotionResults?.[skill.name.toLowerCase()];
    return renderRollbackEvidence(skill, promotion, context);
  }

  if (action === "history" || action === "events") {
    const skill = findStagedSkill(context, name);
    if (!skill) return missingStagedSkill(name);
    return renderStagedSkillHistory(skill, context);
  }

  return {
    output: "Usage: /skills staged [list|preview <name>|audit <name>|approve <name>|promote <name> --approved|rollback <name>|history <name>]",
    isError: true,
    data: { action: "skills_staged_usage" },
  };
}

function renderStagedSkillsList(context: GatewaySkillsStageContext): GatewayBasicCommandPayload {
  const stagedSkills = sortedSkills(context.stagedSkills ?? []);
  const lines = ["Staged Skills:", ""];
  if (stagedSkills.length === 0) {
    lines.push("No staged skills are available in this runtime snapshot.");
  } else {
    for (const skill of stagedSkills) {
      const manifest = findManifest(context.stageManifests ?? [], skill.name);
      const status = readString(manifest, "status", "staged");
      lines.push(`- ${skill.name} | ${status} | ${skill.source.revision ?? "unknown-revision"}`);
    }
  }
  lines.push("");
  lines.push("Workflow: preview | audit | approve | promote | rollback | history");
  return {
    output: lines.join("\n"),
    data: { action: "skills_staged_list", count: stagedSkills.length },
  };
}

function renderStagedSkillPreview(
  skill: SkillDefinition,
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const manifest = findManifest(context.stageManifests ?? [], skill.name);
  const lines = [`Staged Skill Preview: ${skill.name}`, ""];
  lines.push(`Description: ${skill.description || "none"}`);
  lines.push(`Stage status: ${readString(manifest, "status", "unknown")}`);
  lines.push(`Source repo: ${skill.source.repo ?? "unknown"}`);
  lines.push(`Source path: ${skill.source.path ?? "unknown"}`);
  lines.push(`Source ref: ${skill.source.ref ?? "unknown"}`);
  lines.push(`Source revision: ${skill.source.revision ?? "unknown"}`);
  lines.push("");
  lines.push(`Next: /skills staged audit ${skill.name} | /skills staged approve ${skill.name}`);
  return {
    output: lines.join("\n"),
    data: { action: "skills_staged_preview", name: skill.name },
  };
}

function renderStagedSkillAudit(
  skill: SkillDefinition,
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const audit = auditSkillCatalog([skill], {
    productCandidateNames: [skill.name],
    expectedSources: context.expectedSources ?? {},
  });
  const entry = audit.entries[0];
  const lines = [`Staged Skill Audit: ${skill.name}`, ""];
  lines.push(`Valid: ${audit.validSkills === 1 ? "yes" : "no"}`);
  lines.push(`Issues: ${entry?.issues.map((issue) => issue.code).join(", ") || "none"}`);
  lines.push(`Missing source: ${audit.sourceMissingCount}`);
  lines.push(`Stale source: ${audit.sourceStaleCount}`);
  lines.push(`Source mismatches: ${audit.sourceMismatchCount}`);
  lines.push("");
  lines.push(`Next: /skills staged approve ${skill.name}`);
  return {
    output: lines.join("\n"),
    data: {
      action: "skills_staged_audit",
      name: skill.name,
      valid: audit.validSkills === 1,
      issues: entry?.issues.length ?? 0,
    },
  };
}

function renderPromotionResult(
  skill: SkillDefinition,
  promotion: SkillPromotionResult,
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const manifest = findManifest(context.promotionManifests ?? [], skill.name);
  const manifestPath = promotion.manifestPath ?? readString(manifest, "manifestPath");
  const lines = [`Promotion Status: ${promotion.status}`, ""];
  lines.push(`Skill: ${skill.name}`);
  lines.push(`Live: ${promotion.livePath ?? "not written"}`);
  lines.push(`Rollback: ${promotion.rollbackPath ?? "not available"}`);
  lines.push(`Manifest: ${manifestPath || "not available"}`);
  lines.push(`Reason: ${promotion.reason}`);
  lines.push("");
  lines.push(`Rollback view: /skills staged rollback ${skill.name}`);
  return {
    output: lines.join("\n"),
    isError: promotion.status !== "promoted",
    data: { action: "skills_staged_promote", name: skill.name, status: promotion.status },
  };
}

function renderRollbackEvidence(
  skill: SkillDefinition,
  promotion: SkillPromotionResult | undefined,
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const manifest = findManifest(context.promotionManifests ?? [], skill.name);
  const rollbackPath = promotion?.rollbackPath ?? readString(manifest, "rollbackPath");
  const lines = [`Rollback Evidence: ${skill.name}`, ""];
  lines.push(`Rollback path: ${rollbackPath || "not available"}`);
  lines.push(`Promotion manifest: ${promotion?.manifestPath ?? readString(manifest, "manifestPath", "not available")}`);
  lines.push("");
  lines.push("No rollback is applied by this view. It only exposes rollback evidence.");
  return {
    output: lines.join("\n"),
    isError: !rollbackPath,
    data: { action: "skills_staged_rollback", name: skill.name, rollbackAvailable: Boolean(rollbackPath) },
  };
}

function renderRollbackResult(
  skill: SkillDefinition,
  rollback: SkillRollbackResult,
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const manifest = findManifest(context.rollbackManifests ?? [], skill.name);
  const manifestPath = rollback.manifestPath ?? readString(manifest, "manifestPath");
  const lines = [`Rollback Status: ${rollback.status}`, ""];
  lines.push(`Skill: ${skill.name}`);
  lines.push(`Live: ${rollback.livePath ?? "not restored"}`);
  lines.push(`Rollback evidence: ${rollback.rollbackPath ?? "not available"}`);
  lines.push(`Manifest: ${manifestPath || "not available"}`);
  lines.push(`Reason: ${rollback.reason}`);
  return {
    output: lines.join("\n"),
    isError: rollback.status !== "rolled_back",
    data: { action: "skills_staged_rollback_result", name: skill.name, status: rollback.status },
  };
}

function renderStagedSkillHistory(
  skill: SkillDefinition,
  context: GatewaySkillsStageContext,
): GatewayBasicCommandPayload {
  const events = resolveLifecycleEvents(context).filter((event) => event.skillName.toLowerCase() === skill.name.toLowerCase());
  const lines = [`Staged Skill History: ${skill.name}`, ""];

  if (events.length === 0) {
    lines.push("No staged lifecycle events are available in this runtime snapshot.");
  } else {
    for (const event of events) {
      lines.push(`- ${event.event} | ${event.status} | approvedBy ${event.approvedBy ?? "unknown"}`);
      const details = formatLifecycleEventDetails(event);
      if (details.length > 0) lines.push(`  ${details.join(" | ")}`);
      const paths = formatLifecycleEventPaths(event);
      if (paths.length > 0) lines.push(`  ${paths.join(" | ")}`);
    }
  }

  lines.push("");
  lines.push("Source: manifest/result metadata only; skill bodies are not loaded by this view.");
  return {
    output: lines.join("\n"),
    data: { action: "skills_staged_history", name: skill.name, count: events.length },
  };
}

function missingStagedSkill(name: string): GatewayBasicCommandPayload {
  return {
    output: `Staged skill not found: ${name}\n\nInspect: /skills staged`,
    isError: true,
    data: { action: "skills_staged_missing", name },
  };
}

function findStagedSkill(context: GatewaySkillsStageContext, name: string): SkillDefinition | null {
  const normalizedName = name.toLowerCase();
  return sortedSkills(context.stagedSkills ?? []).find((skill) => skill.name.toLowerCase() === normalizedName) ?? null;
}

function sortedSkills(skills: SkillDefinition[]): SkillDefinition[] {
  return [...skills].sort((left, right) => left.name.localeCompare(right.name));
}

function findManifest(manifests: Array<Record<string, unknown>>, skillName: string): Record<string, unknown> | null {
  const normalizedName = skillName.toLowerCase();
  return manifests.find((manifest) => readString(manifest, "skillName").toLowerCase() === normalizedName) ?? null;
}

function resolveLifecycleEvents(context: GatewaySkillsStageContext): SkillLifecycleEvent[] {
  return context.lifecycleEvents ?? buildSkillLifecycleEvents({
    stageManifests: context.stageManifests,
    promotionResults: context.promotionResults,
    promotionManifests: context.promotionManifests,
    rollbackResults: context.rollbackResults,
    rollbackManifests: context.rollbackManifests,
  });
}

function formatLifecycleEventDetails(event: SkillLifecycleEvent): string[] {
  const details: string[] = [];
  if (event.sourceRevision) details.push(`source ${event.sourceRevision}`);
  if (event.restoredSourceRevision) details.push(`restored ${event.restoredSourceRevision}`);
  if (event.replacedSourceRevision) details.push(`replaced ${event.replacedSourceRevision}`);
  if (event.reason) details.push(`reason ${event.reason}`);
  return details;
}

function formatLifecycleEventPaths(event: SkillLifecycleEvent): string[] {
  const paths: string[] = [];
  if (event.stagingPath) paths.push(`staging ${event.stagingPath}`);
  if (event.livePath) paths.push(`live ${event.livePath}`);
  if (event.rollbackPath) paths.push(`rollback ${event.rollbackPath}`);
  if (event.manifestPath) paths.push(`manifest ${event.manifestPath}`);
  return paths;
}

function readString(record: Record<string, unknown> | null, key: string, fallback = ""): string {
  if (!record) return fallback;
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function searchSkills(skills: SkillDefinition[], query: string): SkillDefinition[] {
  const catalog = new SkillCatalog(skills);
  return catalog.search(query, { limit: 8 }).map((match) => match.skill);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}
