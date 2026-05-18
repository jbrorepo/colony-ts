import type { SkillDefinition } from "./index";
import { scrubSecrets } from "../security/log-sanitizer";

export interface GeneratedSkillDocsToolDefinition {
  name?: string;
  toolId?: string;
  description?: string;
  category?: string;
  riskLevel?: string;
  requiresApproval?: boolean;
}

export interface GeneratedSkillDocsPreviewInput {
  skills: SkillDefinition[];
  toolDefinitions?: GeneratedSkillDocsToolDefinition[];
  maxChars?: number;
}

export interface GeneratedSkillDocsPreview {
  markdown: string;
  skillCount: number;
  toolCount: number;
  truncated: boolean;
}

export function generateSkillDocsPreview(input: GeneratedSkillDocsPreviewInput): GeneratedSkillDocsPreview {
  const skills = [...input.skills].sort((left, right) => left.name.localeCompare(right.name));
  const tools = [...(input.toolDefinitions ?? [])].sort((left, right) => toolName(left).localeCompare(toolName(right)));
  const lines = [
    "# Generated Skill Documentation Preview",
    "",
    "Preview only; no files were written.",
    "",
    `Skills: ${skills.length}`,
    `Tools: ${tools.length}`,
  ];

  for (const skill of skills) {
    lines.push("", `## ${redactGeneratedDocsText(skill.name)}`);
    lines.push(redactGeneratedDocsText(skill.description || "No description provided."));
    lines.push(`Tools required: ${formatList(skill.toolsRequired)}`);
    lines.push(`Requires approval: ${formatList(skill.requiresApproval)}`);
    lines.push(`Tags: ${formatList(skill.tags)}`);
    lines.push(`Trust level: ${skill.trustLevel ?? "not specified"}`);
    lines.push(`Source: ${formatSource(skill)}`);
  }

  lines.push("", "## Tool Metadata");
  if (tools.length === 0) {
    lines.push("No active tool metadata supplied.");
  } else {
    for (const tool of tools) {
      lines.push(`- ${redactGeneratedDocsText(toolName(tool))} | risk ${redactGeneratedDocsText(tool.riskLevel ?? tool.category ?? "unknown")} | approval ${tool.requiresApproval ? "yes" : "unknown"} | ${redactGeneratedDocsText(tool.description ?? "no description")}`);
    }
  }

  const full = lines.join("\n");
  const maxChars = Math.max(200, input.maxChars ?? 6_000);
  const markdown = full.length > maxChars
    ? `${full.slice(0, maxChars - 35).trimEnd()}\n... [docs preview truncated]`
    : full;
  return {
    markdown,
    skillCount: skills.length,
    toolCount: tools.length,
    truncated: markdown.length < full.length,
  };
}

function toolName(tool: GeneratedSkillDocsToolDefinition): string {
  return tool.name ?? tool.toolId ?? "unknown-tool";
}

function formatSource(skill: SkillDefinition): string {
  const parts = [
    skill.source.repo,
    skill.source.path,
    skill.source.ref,
    skill.source.revision,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.map(redactGeneratedDocsText).join(" ") : "not specified";
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map(redactGeneratedDocsText).join(", ") : "none";
}

function redactGeneratedDocsText(value: string): string {
  return scrubSecrets(value.replace(/[\r\n]+/g, " ").trim())
    .replace(/(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]");
}
