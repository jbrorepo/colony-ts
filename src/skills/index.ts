import { mkdir, readdir, readFile, realpath, writeFile } from "fs/promises";
import { join, relative, resolve, sep } from "path";

export interface SkillDefinition {
  name: string;
  description: string;
  body: string;
  filePath: string;
  rootDir: string;
  relativePath: string;
  caste?: string;
  tags: string[];
  toolsRequired: string[];
  requiresApproval: string[];
  trustLevel?: number;
  source: SkillSourceMetadata;
  metadata: Record<string, unknown>;
}

export interface SkillSourceMetadata {
  repo?: string;
  path?: string;
  ref?: string;
  revision?: string;
}

export interface SkillSearchMatch {
  skill: SkillDefinition;
  score: number;
}

export interface SkillPromptOptions {
  maxChars?: number;
}

export type SkillAuditClassification = "developer-only" | "product-candidate" | "unsupported";

export interface SkillAuditIssue {
  code: string;
  message: string;
  blocking: boolean;
}

export type SkillSourcePlanActionType = "import" | "update" | "keep" | "review";

export interface SkillSourcePlanAction {
  skillName: string;
  action: SkillSourcePlanActionType;
  classification: SkillAuditClassification;
  reasons: string[];
  source?: SkillSourceMetadata;
  expectedSource?: SkillSourceMetadata;
  commandPreview: string;
}

export interface SkillSourceUpdatePlan {
  dryRun: true;
  totalActions: number;
  importCount: number;
  updateCount: number;
  keepCount: number;
  reviewCount: number;
  actions: SkillSourcePlanAction[];
}

export interface SkillImportStagingApproval {
  approved: boolean;
  approvedBy?: string;
  reason?: string;
}

export interface SkillImportStagingRequest {
  content: string;
  stagingRoot: string;
  liveRoot?: string;
  approval: SkillImportStagingApproval;
  expectedSource?: SkillSourceMetadata;
}

export type SkillImportStagingStatus = "blocked" | "rejected" | "staged";

export interface SkillImportStagingResult {
  status: SkillImportStagingStatus;
  staged: boolean;
  skillName: string;
  reason: string;
  stagingPath?: string;
  manifestPath?: string;
  livePath?: string;
}

export interface SkillPromotionRequest {
  skillName: string;
  stagingRoot: string;
  liveRoot: string;
  rollbackRoot?: string;
  approval: SkillImportStagingApproval;
  expectedSource?: SkillSourceMetadata;
}

export type SkillPromotionStatus = "blocked" | "rejected" | "promoted";

export interface SkillPromotionResult {
  status: SkillPromotionStatus;
  promoted: boolean;
  skillName: string;
  reason: string;
  stagingPath?: string;
  livePath?: string;
  rollbackPath?: string;
  manifestPath?: string;
}

export interface SkillRollbackRequest {
  skillName: string;
  liveRoot: string;
  rollbackRoot: string;
  approval: SkillImportStagingApproval;
}

export type SkillRollbackStatus = "blocked" | "rejected" | "rolled_back";

export interface SkillRollbackResult {
  status: SkillRollbackStatus;
  rolledBack: boolean;
  skillName: string;
  reason: string;
  livePath?: string;
  rollbackPath?: string;
  manifestPath?: string;
}

export type SkillLifecycleEventKind = "staged" | "promoted" | "rolled_back";

export interface SkillLifecycleEvent {
  event: SkillLifecycleEventKind;
  status: string;
  skillName: string;
  approvedBy?: string;
  reason?: string;
  sourceRevision?: string;
  restoredSourceRevision?: string;
  replacedSourceRevision?: string;
  stagingPath?: string;
  livePath?: string;
  rollbackPath?: string;
  manifestPath?: string;
}

export interface SkillLifecycleEventInput {
  stageManifests?: Array<Record<string, unknown>>;
  promotionResults?: Record<string, SkillPromotionResult>;
  promotionManifests?: Array<Record<string, unknown>>;
  rollbackResults?: Record<string, SkillRollbackResult>;
  rollbackManifests?: Array<Record<string, unknown>>;
}

export interface SkillAuditEntry {
  name: string;
  canonicalName: string;
  classification: SkillAuditClassification;
  issues: SkillAuditIssue[];
  filePath: string;
  relativePath: string;
  source?: SkillSourceMetadata;
  expectedSource?: SkillSourceMetadata;
}

export interface SkillCatalogAuditOptions {
  aliases?: Record<string, string>;
  productCandidateNames?: string[];
  developerOnlyNames?: string[];
  unsupportedNames?: string[];
  expectedSources?: Record<string, SkillSourceMetadata>;
}

export interface SkillCatalogAudit {
  totalSkills: number;
  validSkills: number;
  issueCount: number;
  aliasCount: number;
  sourceMissingCount: number;
  sourceStaleCount: number;
  sourceMismatchCount: number;
  classificationCounts: Record<SkillAuditClassification, number>;
  entries: SkillAuditEntry[];
}

export class SkillCatalog {
  private readonly _skills: SkillDefinition[];
  private readonly _byName: Map<string, SkillDefinition>;

  constructor(skills: SkillDefinition[]) {
    this._skills = [...skills].sort((left, right) => left.name.localeCompare(right.name));
    this._byName = new Map(this._skills.map((skill) => [skill.name.toLowerCase(), skill]));
  }

  static async fromDirectories(roots: string[]): Promise<SkillCatalog> {
    return new SkillCatalog(await loadSkillsFromDirectories(roots));
  }

  list(): SkillDefinition[] {
    return this._skills.map(cloneSkill);
  }

  get(name: string): SkillDefinition | null {
    const skill = this._byName.get(name.toLowerCase());
    return skill ? cloneSkill(skill) : null;
  }

  search(query: string, options: { limit?: number } = {}): SkillSearchMatch[] {
    const tokens = tokenize(query);
    const limit = Math.max(1, options.limit ?? 5);
    if (tokens.length === 0) {
      return this.list().slice(0, limit).map((skill) => ({ skill, score: 0 }));
    }

    return this._skills
      .map((skill) => ({
        skill,
        score: scoreSkill(skill, tokens),
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
      .slice(0, limit)
      .map((match) => ({ skill: cloneSkill(match.skill), score: match.score }));
  }
}

export async function loadSkillsFromDirectories(roots: string[]): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const rootDir = await realpath(root).catch(() => null);
    if (!rootDir || seen.has(rootDir)) continue;
    seen.add(rootDir);
    const files = await findSkillFiles(rootDir);
    for (const filePath of files) {
      const skill = await loadSkillFile(rootDir, filePath);
      if (skill) skills.push(skill);
    }
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export function buildSkillPromptInstructions(
  skills: SkillDefinition[],
  options: SkillPromptOptions = {},
): string {
  const maxChars = Math.max(80, options.maxChars ?? 4_000);
  const blocks = skills.map((skill) => {
    const lines = [`## Skill: ${skill.name}`];
    if (skill.description) lines.push(`Description: ${skill.description}`);
    if (skill.caste) lines.push(`Caste: ${skill.caste}`);
    if (skill.toolsRequired.length > 0) lines.push(`Tools required: ${skill.toolsRequired.join(", ")}`);
    if (skill.requiresApproval.length > 0) lines.push(`Requires approval: ${skill.requiresApproval.join(", ")}`);
    lines.push("");
    lines.push(skill.body.trim());
    return lines.join("\n");
  });

  const prompt = blocks.join("\n\n");
  if (prompt.length <= maxChars) return prompt;
  return `${prompt.slice(0, Math.max(0, maxChars - 37)).trimEnd()}\n... [skill instructions truncated]`;
}

export function auditSkillCatalog(
  skills: SkillDefinition[],
  options: SkillCatalogAuditOptions = {},
): SkillCatalogAudit {
  const aliases = normalizeNameMap(options.aliases ?? {});
  const productCandidateNames = normalizeNameSet(options.productCandidateNames ?? []);
  const developerOnlyNames = normalizeNameSet(options.developerOnlyNames ?? []);
  const unsupportedNames = normalizeNameSet(options.unsupportedNames ?? []);
  const expectedSources = normalizeSourceMap(options.expectedSources ?? {});

  const entries = [...skills]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((skill) => {
      const normalizedName = normalizeName(skill.name);
      const canonicalName = aliases.get(normalizedName) ?? skill.name;
      const normalizedCanonicalName = normalizeName(canonicalName);
      const expectedSource = expectedSources.get(normalizedCanonicalName) ?? expectedSources.get(normalizedName);
      const issues: SkillAuditIssue[] = [];

      if (!skill.description.trim()) {
        issues.push({
          code: "missing_description",
          message: "Skill frontmatter is missing a description.",
          blocking: true,
        });
      }

      if (!skill.body.trim()) {
        issues.push({
          code: "empty_body",
          message: "Skill body is empty.",
          blocking: true,
        });
      }

      if (canonicalName !== skill.name) {
        issues.push({
          code: "alias_renamed",
          message: `Skill is known by current canonical name '${canonicalName}'.`,
          blocking: false,
        });
      }

      const sourceIssues = auditSourceMetadata(skill.source, expectedSource);
      issues.push(...sourceIssues);

      return {
        name: skill.name,
        canonicalName,
        classification: classifySkill({
          name: normalizedName,
          canonicalName: normalizedCanonicalName,
          productCandidateNames,
          developerOnlyNames,
          unsupportedNames,
        }),
        issues,
        filePath: skill.filePath,
        relativePath: skill.relativePath,
        source: hasSourceMetadata(skill.source) ? { ...skill.source } : undefined,
        expectedSource: expectedSource ? { ...expectedSource } : undefined,
      };
    });

  const classificationCounts: Record<SkillAuditClassification, number> = {
    "developer-only": 0,
    "product-candidate": 0,
    unsupported: 0,
  };

  for (const entry of entries) {
    classificationCounts[entry.classification]++;
  }

  return {
    totalSkills: entries.length,
    validSkills: entries.filter((entry) => !entry.issues.some((issue) => issue.blocking)).length,
    issueCount: entries.filter((entry) => entry.issues.length > 0).length,
    aliasCount: entries.filter((entry) => entry.canonicalName !== entry.name).length,
    sourceMissingCount: entries.filter((entry) => entry.issues.some((issue) => issue.code === "missing_source")).length,
    sourceStaleCount: entries.filter((entry) => entry.issues.some((issue) => issue.code === "source_stale")).length,
    sourceMismatchCount: entries.filter((entry) => entry.issues.some((issue) => issue.code === "source_mismatch")).length,
    classificationCounts,
    entries,
  };
}

export function planSkillSourceUpdates(
  skills: SkillDefinition[],
  options: SkillCatalogAuditOptions = {},
): SkillSourceUpdatePlan {
  const audit = auditSkillCatalog(skills, options);
  const aliases = normalizeNameMap(options.aliases ?? {});
  const expectedSources = normalizeSourceMap(options.expectedSources ?? {});
  const seenNames = new Set<string>();
  const actions: SkillSourcePlanAction[] = [];

  for (const entry of audit.entries) {
    const normalizedName = normalizeName(entry.name);
    const normalizedCanonicalName = normalizeName(entry.canonicalName);
    seenNames.add(normalizedName);
    seenNames.add(normalizedCanonicalName);

    const reasons = entry.issues.map((issue) => issue.code);
    const hasBlockingIssue = entry.issues.some((issue) => issue.blocking);
    const hasSourceMismatch = reasons.includes("source_mismatch");
    const hasMissingSource = reasons.includes("missing_source");
    const hasStaleSource = reasons.includes("source_stale");
    const action: SkillSourcePlanActionType =
      hasBlockingIssue || hasSourceMismatch || hasMissingSource
        ? "review"
        : hasStaleSource
          ? "update"
          : "keep";

    actions.push({
      skillName: entry.name,
      action,
      classification: entry.classification,
      reasons: reasons.length > 0 ? reasons : ["current"],
      source: entry.source ? { ...entry.source } : undefined,
      expectedSource: entry.expectedSource ? { ...entry.expectedSource } : undefined,
      commandPreview: previewSkillPlanCommand(entry.name, action, entry.expectedSource),
    });
  }

  const classificationSets = {
    productCandidateNames: normalizeNameSet(options.productCandidateNames ?? []),
    developerOnlyNames: normalizeNameSet(options.developerOnlyNames ?? []),
    unsupportedNames: normalizeNameSet(options.unsupportedNames ?? []),
  };

  for (const [normalizedExpectedName, expectedSource] of expectedSources.entries()) {
    const canonicalName = aliases.get(normalizedExpectedName) ?? normalizedExpectedName;
    if (seenNames.has(normalizedExpectedName) || seenNames.has(normalizeName(canonicalName))) continue;

    actions.push({
      skillName: canonicalName,
      action: "import",
      classification: classifySkill({
        name: normalizedExpectedName,
        canonicalName: normalizeName(canonicalName),
        ...classificationSets,
      }),
      reasons: ["missing_local"],
      expectedSource: { ...expectedSource },
      commandPreview: previewSkillPlanCommand(canonicalName, "import", expectedSource),
    });
  }

  actions.sort((left, right) => actionPriority(left.action) - actionPriority(right.action)
    || left.skillName.localeCompare(right.skillName));

  return {
    dryRun: true,
    totalActions: actions.length,
    importCount: actions.filter((action) => action.action === "import").length,
    updateCount: actions.filter((action) => action.action === "update").length,
    keepCount: actions.filter((action) => action.action === "keep").length,
    reviewCount: actions.filter((action) => action.action === "review").length,
    actions,
  };
}

export async function stageSkillImportCandidate(
  request: SkillImportStagingRequest,
): Promise<SkillImportStagingResult> {
  const parsed = parseSkillMarkdown(request.content);
  const skillName = readString(parsed.frontmatter, "name") || "unknown-skill";
  const source: SkillSourceMetadata = {
    repo: readOptionalString(parsed.frontmatter, "source_repo"),
    path: readOptionalString(parsed.frontmatter, "source_path"),
    ref: readOptionalString(parsed.frontmatter, "source_ref"),
    revision: readOptionalString(parsed.frontmatter, "source_revision"),
  };

  if (!request.approval.approved) {
    return {
      status: "blocked",
      staged: false,
      skillName,
      reason: "Explicit approval required before staging a skill import candidate.",
    };
  }

  const validationError = validateSkillStagingCandidate(skillName, parsed.body, parsed.frontmatter, source, request.expectedSource);
  if (validationError) {
    return {
      status: "rejected",
      staged: false,
      skillName,
      reason: validationError,
    };
  }

  const safeName = safeSkillDirectoryName(skillName);
  const stagingDir = confinedPath(request.stagingRoot, safeName);
  const stagingPath = confinedPath(request.stagingRoot, safeName, "SKILL.md");
  const manifestPath = confinedPath(request.stagingRoot, safeName, ".colony-stage.json");
  const livePath = request.liveRoot ? confinedPath(request.liveRoot, safeName, "SKILL.md") : undefined;

  await mkdir(stagingDir, { recursive: true });
  await writeFile(stagingPath, request.content);
  await writeFile(manifestPath, JSON.stringify({
    status: "staged",
    skillName,
    approvedBy: request.approval.approvedBy ?? "unknown",
    approvalReason: request.approval.reason ?? "",
    source,
    expectedSource: request.expectedSource ? { ...request.expectedSource } : undefined,
    livePath,
  }, null, 2));

  return {
    status: "staged",
    staged: true,
    skillName,
    reason: "Skill import candidate staged in quarantine for audit-gated review.",
    stagingPath,
    manifestPath,
    livePath,
  };
}

export async function promoteStagedSkillCandidate(
  request: SkillPromotionRequest,
): Promise<SkillPromotionResult> {
  const safeName = safeSkillDirectoryName(request.skillName);
  if (!safeName) {
    return {
      status: "rejected",
      promoted: false,
      skillName: request.skillName,
      reason: "Skill name is not safe for promotion.",
    };
  }

  if (!request.approval.approved) {
    return {
      status: "blocked",
      promoted: false,
      skillName: safeName,
      reason: "Second explicit approval required before promoting a staged skill candidate.",
    };
  }

  const stagingPath = confinedPath(request.stagingRoot, safeName, "SKILL.md");
  const stageManifestPath = confinedPath(request.stagingRoot, safeName, ".colony-stage.json");
  const stagedContent = await readFile(stagingPath, "utf8").catch(() => null);
  if (stagedContent == null) {
    return {
      status: "rejected",
      promoted: false,
      skillName: safeName,
      reason: "Staged skill candidate is missing.",
      stagingPath,
    };
  }

  const stageManifest = await readFile(stageManifestPath, "utf8").catch(() => null);
  if (!stageManifest?.includes("\"status\": \"staged\"")) {
    return {
      status: "rejected",
      promoted: false,
      skillName: safeName,
      reason: "Staged skill candidate manifest is missing or invalid.",
      stagingPath,
    };
  }

  const stagedSkills = await loadSkillsFromDirectories([request.stagingRoot]);
  const stagedSkill = stagedSkills.find((skill) => normalizeName(skill.name) === safeName);
  if (!stagedSkill) {
    return {
      status: "rejected",
      promoted: false,
      skillName: safeName,
      reason: "Staged skill candidate cannot be loaded for audit.",
      stagingPath,
    };
  }

  const expectedSources = request.expectedSource ? { [stagedSkill.name]: request.expectedSource } : {};
  const audit = auditSkillCatalog([stagedSkill], {
    productCandidateNames: [stagedSkill.name],
    expectedSources,
  });
  const auditIssues = audit.entries.flatMap((entry) => entry.issues);
  const blockingAuditIssues = auditIssues.filter((issue) =>
    issue.blocking || issue.code === "missing_source" || issue.code === "source_stale" || issue.code === "source_mismatch"
  );
  if (blockingAuditIssues.length > 0 || audit.validSkills !== 1) {
    return {
      status: "rejected",
      promoted: false,
      skillName: safeName,
      reason: `Staged skill candidate failed audit gate: ${blockingAuditIssues.map((issue) => issue.code).join(", ")}`,
      stagingPath,
    };
  }

  const liveDir = confinedPath(request.liveRoot, safeName);
  const livePath = confinedPath(request.liveRoot, safeName, "SKILL.md");
  const manifestPath = confinedPath(request.liveRoot, safeName, ".colony-promote.json");
  const rollbackRoot = request.rollbackRoot ?? confinedPath(request.liveRoot, ".colony-rollback");
  const rollbackPath = confinedPath(rollbackRoot, safeName, "SKILL.md.previous");
  const existingLiveContent = await readFile(livePath, "utf8").catch(() => null);

  await mkdir(liveDir, { recursive: true });
  if (existingLiveContent != null) {
    await mkdir(confinedPath(rollbackRoot, safeName), { recursive: true });
    await writeFile(rollbackPath, existingLiveContent);
  }
  await writeFile(livePath, stagedContent);
  await writeFile(manifestPath, JSON.stringify({
    status: "promoted",
    skillName: stagedSkill.name,
    approvedBy: request.approval.approvedBy ?? "unknown",
    approvalReason: request.approval.reason ?? "",
    source: stagedSkill.source,
    expectedSource: request.expectedSource ? { ...request.expectedSource } : undefined,
    stagingPath,
    stageManifestPath,
    livePath,
    rollbackPath: existingLiveContent != null ? rollbackPath : undefined,
  }, null, 2));

  return {
    status: "promoted",
    promoted: true,
    skillName: stagedSkill.name,
    reason: "Staged skill candidate promoted to live catalog after audit and explicit approval.",
    stagingPath,
    livePath,
    rollbackPath: existingLiveContent != null ? rollbackPath : undefined,
    manifestPath,
  };
}

export async function rollbackPromotedSkillCandidate(
  request: SkillRollbackRequest,
): Promise<SkillRollbackResult> {
  const safeName = safeSkillDirectoryName(request.skillName);
  if (!safeName) {
    return {
      status: "rejected",
      rolledBack: false,
      skillName: request.skillName,
      reason: "Skill name is not safe for rollback.",
    };
  }

  if (!request.approval.approved) {
    return {
      status: "blocked",
      rolledBack: false,
      skillName: safeName,
      reason: "Explicit approval required before restoring rollback evidence.",
    };
  }

  const livePath = confinedPath(request.liveRoot, safeName, "SKILL.md");
  const manifestPath = confinedPath(request.liveRoot, safeName, ".colony-rollback.json");
  const rollbackPath = confinedPath(request.rollbackRoot, safeName, "SKILL.md.previous");
  const rollbackContent = await readFile(rollbackPath, "utf8").catch(() => null);
  if (rollbackContent == null) {
    return {
      status: "rejected",
      rolledBack: false,
      skillName: safeName,
      reason: "Rollback evidence is missing.",
      livePath,
      rollbackPath,
    };
  }

  const parsedRollback = parseSkillMarkdown(rollbackContent);
  const restoredSourceRevision = readOptionalString(parsedRollback.frontmatter, "source_revision") ?? "unknown";
  const currentContent = await readFile(livePath, "utf8").catch(() => "");
  const parsedCurrent = parseSkillMarkdown(currentContent);
  const replacedSourceRevision = readOptionalString(parsedCurrent.frontmatter, "source_revision") ?? "unknown";

  await mkdir(confinedPath(request.liveRoot, safeName), { recursive: true });
  await writeFile(livePath, rollbackContent);
  await writeFile(manifestPath, JSON.stringify({
    status: "rolled_back",
    skillName: safeName,
    approvedBy: request.approval.approvedBy ?? "unknown",
    approvalReason: request.approval.reason ?? "",
    livePath,
    rollbackPath,
    restoredSourceRevision,
    replacedSourceRevision,
  }, null, 2));

  return {
    status: "rolled_back",
    rolledBack: true,
    skillName: safeName,
    reason: "Rollback evidence restored to live skill catalog after explicit approval.",
    livePath,
    rollbackPath,
    manifestPath,
  };
}

export function buildSkillLifecycleEvents(input: SkillLifecycleEventInput): SkillLifecycleEvent[] {
  const events: SkillLifecycleEvent[] = [];

  for (const manifest of [...(input.stageManifests ?? [])].sort(compareManifestSkillNames)) {
    const skillName = readString(manifest, "skillName");
    if (!skillName) continue;
    const source = readObject(manifest, "source");
    events.push({
      event: "staged",
      status: readString(manifest, "status") || "unknown",
      skillName,
      approvedBy: readOptionalString(manifest, "approvedBy"),
      sourceRevision: readOptionalString(source, "revision"),
      livePath: readOptionalString(manifest, "livePath"),
      manifestPath: readOptionalString(manifest, "manifestPath"),
    });
  }

  const promotionNames = collectLifecycleNames(input.promotionResults, input.promotionManifests);
  for (const skillName of promotionNames) {
    const result = findLifecycleResult(input.promotionResults, skillName);
    const manifest = findLifecycleManifest(input.promotionManifests ?? [], skillName) ?? {};
    const source = readObject(manifest, "source");
    events.push({
      event: "promoted",
      status: result?.status ?? (readString(manifest, "status") || "unknown"),
      skillName: result?.skillName ?? (readString(manifest, "skillName") || skillName),
      approvedBy: readOptionalString(manifest, "approvedBy"),
      reason: result?.reason,
      sourceRevision: readOptionalString(source, "revision"),
      stagingPath: result?.stagingPath ?? readOptionalString(manifest, "stagingPath"),
      livePath: result?.livePath ?? readOptionalString(manifest, "livePath"),
      rollbackPath: result?.rollbackPath ?? readOptionalString(manifest, "rollbackPath"),
      manifestPath: result?.manifestPath ?? readOptionalString(manifest, "manifestPath"),
    });
  }

  const rollbackNames = collectLifecycleNames(input.rollbackResults, input.rollbackManifests);
  for (const skillName of rollbackNames) {
    const result = findLifecycleResult(input.rollbackResults, skillName);
    const manifest = findLifecycleManifest(input.rollbackManifests ?? [], skillName) ?? {};
    events.push({
      event: "rolled_back",
      status: result?.status ?? (readString(manifest, "status") || "unknown"),
      skillName: result?.skillName ?? (readString(manifest, "skillName") || skillName),
      approvedBy: readOptionalString(manifest, "approvedBy"),
      reason: result?.reason,
      restoredSourceRevision: readOptionalString(manifest, "restoredSourceRevision"),
      replacedSourceRevision: readOptionalString(manifest, "replacedSourceRevision"),
      livePath: result?.livePath ?? readOptionalString(manifest, "livePath"),
      rollbackPath: result?.rollbackPath ?? readOptionalString(manifest, "rollbackPath"),
      manifestPath: result?.manifestPath ?? readOptionalString(manifest, "manifestPath"),
    });
  }

  return events;
}

async function findSkillFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort((left, right) => left.localeCompare(right));
}

async function loadSkillFile(rootDir: string, filePath: string): Promise<SkillDefinition | null> {
  const content = await readFile(filePath, "utf8").catch(() => null);
  if (content == null) return null;
  const parsed = parseSkillMarkdown(content);
  const name = readString(parsed.frontmatter, "name") || fallbackSkillName(filePath);
  return {
    name,
    description: readString(parsed.frontmatter, "description"),
    body: parsed.body.trim(),
    filePath,
    rootDir,
    relativePath: relative(rootDir, filePath),
    caste: readOptionalString(parsed.frontmatter, "caste"),
    tags: readStringList(parsed.frontmatter, "tags"),
    toolsRequired: readStringList(parsed.frontmatter, "tools_required"),
    requiresApproval: readStringList(parsed.frontmatter, "requires_approval"),
    trustLevel: readOptionalNumber(parsed.frontmatter, "trust_level"),
    source: {
      repo: readOptionalString(parsed.frontmatter, "source_repo"),
      path: readOptionalString(parsed.frontmatter, "source_path"),
      ref: readOptionalString(parsed.frontmatter, "source_ref"),
      revision: readOptionalString(parsed.frontmatter, "source_revision"),
    },
    metadata: { ...parsed.frontmatter },
  };
}

function parseSkillMarkdown(content: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!content.startsWith("---\n")) return { frontmatter: {}, body: content };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: content };
  const rawFrontmatter = content.slice(4, end);
  const body = content.slice(end + 4).replace(/^\r?\n/, "");
  return {
    frontmatter: parseSimpleFrontmatter(rawFrontmatter),
    body,
  };
}

function parseSimpleFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#") || line.startsWith(" ")) continue;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2] ?? "";
    if (rawValue.trim() === "") {
      const list: string[] = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? "";
        const listMatch = /^\s*-\s*(.+)$/.exec(next);
        if (!listMatch) break;
        list.push(unquote(listMatch[1].trim()));
        index++;
      }
      result[key] = list;
    } else {
      result[key] = parseScalar(rawValue.trim());
    }
  }

  return result;
}

function parseScalar(value: string): unknown {
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((entry) => unquote(entry.trim())).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return unquote(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = readString(record, key);
  return value || undefined;
}

function readObject(record: Record<string, unknown> | null, key: string): Record<string, unknown> {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function fallbackSkillName(filePath: string): string {
  return filePath.split(/[\\/]/).slice(-2, -1)[0] ?? "skill";
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreSkill(skill: SkillDefinition, tokens: string[]): number {
  const name = skill.name.toLowerCase();
  const description = skill.description.toLowerCase();
  const tags = skill.tags.map((tag) => tag.toLowerCase());
  const body = skill.body.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (name.includes(token)) score += 10;
    if (tags.some((tag) => tag.includes(token))) score += 7;
    if (description.includes(token)) score += 4;
    if (body.includes(token)) score += 1;
  }

  return score;
}

function classifySkill(opts: {
  name: string;
  canonicalName: string;
  productCandidateNames: Set<string>;
  developerOnlyNames: Set<string>;
  unsupportedNames: Set<string>;
}): SkillAuditClassification {
  if (opts.unsupportedNames.has(opts.name) || opts.unsupportedNames.has(opts.canonicalName)) {
    return "unsupported";
  }
  if (opts.productCandidateNames.has(opts.name) || opts.productCandidateNames.has(opts.canonicalName)) {
    return "product-candidate";
  }
  if (opts.developerOnlyNames.has(opts.name) || opts.developerOnlyNames.has(opts.canonicalName)) {
    return "developer-only";
  }
  return "developer-only";
}

function normalizeNameMap(record: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(record)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => [normalizeName(key), value]),
  );
}

function normalizeSourceMap(record: Record<string, SkillSourceMetadata>): Map<string, SkillSourceMetadata> {
  return new Map(
    Object.entries(record).map(([key, value]) => [normalizeName(key), { ...value }]),
  );
}

function normalizeNameSet(values: string[]): Set<string> {
  return new Set(values.map(normalizeName).filter(Boolean));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function compareManifestSkillNames(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return readString(left, "skillName").localeCompare(readString(right, "skillName"));
}

function collectLifecycleNames<T extends { skillName: string }>(
  results: Record<string, T> | undefined,
  manifests: Array<Record<string, unknown>> | undefined,
): string[] {
  const names = new Set<string>();
  for (const result of Object.values(results ?? {})) {
    if (result.skillName) names.add(result.skillName);
  }
  for (const manifest of manifests ?? []) {
    const skillName = readString(manifest, "skillName");
    if (skillName) names.add(skillName);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function findLifecycleResult<T extends { skillName: string }>(
  results: Record<string, T> | undefined,
  skillName: string,
): T | undefined {
  const normalizedName = normalizeName(skillName);
  return Object.values(results ?? {}).find((result) => normalizeName(result.skillName) === normalizedName)
    ?? results?.[skillName]
    ?? results?.[normalizedName];
}

function findLifecycleManifest(
  manifests: Array<Record<string, unknown>>,
  skillName: string,
): Record<string, unknown> | null {
  const normalizedName = normalizeName(skillName);
  return manifests.find((manifest) => normalizeName(readString(manifest, "skillName")) === normalizedName) ?? null;
}

function auditSourceMetadata(
  source: SkillSourceMetadata,
  expectedSource?: SkillSourceMetadata,
): SkillAuditIssue[] {
  const issues: SkillAuditIssue[] = [];
  if (!hasSourceMetadata(source)) {
    issues.push({
      code: "missing_source",
      message: "Skill source metadata is missing.",
      blocking: false,
    });
    return issues;
  }

  if (!expectedSource) return issues;

  if (
    expectedSource.repo && source.repo && source.repo !== expectedSource.repo ||
    expectedSource.path && source.path && source.path !== expectedSource.path ||
    expectedSource.ref && source.ref && source.ref !== expectedSource.ref
  ) {
    issues.push({
      code: "source_mismatch",
      message: "Skill source repo/path/ref does not match the expected source.",
      blocking: false,
    });
  }

  if (expectedSource.revision && source.revision && source.revision !== expectedSource.revision) {
    issues.push({
      code: "source_stale",
      message: "Skill source revision is stale.",
      blocking: false,
    });
  }

  return issues;
}

function hasSourceMetadata(source: SkillSourceMetadata): boolean {
  return Boolean(source.repo || source.path || source.ref || source.revision);
}

function validateSkillStagingCandidate(
  skillName: string,
  body: string,
  frontmatter: Record<string, unknown>,
  source: SkillSourceMetadata,
  expectedSource?: SkillSourceMetadata,
): string | null {
  if (!skillName || skillName === "unknown-skill") return "Skill candidate is missing a name.";
  if (!safeSkillDirectoryName(skillName)) return "Skill candidate name is not safe for staging.";
  if (!readString(frontmatter, "description").trim()) return "Skill candidate is missing a description.";
  if (!body.trim()) return "Skill candidate body is empty.";
  if (!source.repo || !source.path || !source.ref || !source.revision) {
    return "Skill candidate must include source repo/path/ref/revision metadata before staging.";
  }
  if (expectedSource && !sourceMetadataMatches(source, expectedSource)) {
    return "Skill candidate source metadata does not match the reviewed expected source.";
  }
  return null;
}

function sourceMetadataMatches(source: SkillSourceMetadata, expectedSource: SkillSourceMetadata): boolean {
  if (expectedSource.repo && source.repo !== expectedSource.repo) return false;
  if (expectedSource.path && source.path !== expectedSource.path) return false;
  if (expectedSource.ref && source.ref !== expectedSource.ref) return false;
  if (expectedSource.revision && source.revision !== expectedSource.revision) return false;
  return true;
}

function safeSkillDirectoryName(skillName: string): string {
  const normalized = normalizeName(skillName);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) return "";
  return normalized;
}

function confinedPath(root: string, ...segments: string[]): string {
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...segments);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("Refusing to stage skill candidate outside the staging root.");
  }
  return target;
}

function previewSkillPlanCommand(
  skillName: string,
  action: SkillSourcePlanActionType,
  expectedSource?: SkillSourceMetadata,
): string {
  if (action === "keep") return "No import or update needed.";
  if (action === "review") return "Review source metadata before approving any file write.";

  const sourceLabel = expectedSource
    ? [
      expectedSource.repo,
      expectedSource.path,
      expectedSource.ref ? `ref=${expectedSource.ref}` : "",
      expectedSource.revision ? `revision=${expectedSource.revision}` : "",
    ].filter(Boolean).join(" ")
    : "unknown source";
  return `Requires approval: /skills import ${skillName} --source ${sourceLabel}`;
}

function actionPriority(action: SkillSourcePlanActionType): number {
  if (action === "import") return 0;
  if (action === "update") return 1;
  if (action === "review") return 2;
  return 3;
}

function cloneSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    tags: [...skill.tags],
    toolsRequired: [...skill.toolsRequired],
    requiresApproval: [...skill.requiresApproval],
    source: { ...skill.source },
    metadata: { ...skill.metadata },
  };
}
