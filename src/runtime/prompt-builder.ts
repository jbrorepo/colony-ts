/**
 * Prompt builder — constructs system prompts from runtime identity + caste guidance.
 *
 * The identity registry is now the primary source of agent persona and
 * boundaries. Prompt templates remain as supplementary caste-specific guidance
 * so existing delegation and tone hints are preserved.
 */

import { Caste } from "../caste/enums";
import {
  IdentityRegistry,
  colonyIdentityRegistry,
  renderPromptBlock,
  type AgentIdentity,
} from "./identity";
import { getCastePromptTemplate } from "./prompt-templates";

export class PromptBuilder {
  /**
   * Build the complete system prompt for an agent.
   */
  static buildSystemPrompt(opts: {
    caste: string;
    agentId?: string;
    toolNames?: string[];
    customInstructions?: string;
    includeManifesto?: boolean;
    identityRegistry?: IdentityRegistry;
  }): string {
    const registry = opts.identityRegistry ?? colonyIdentityRegistry;
    const identity = resolveIdentity(registry, opts.agentId, opts.caste);
    const casteGuidance = getCastePromptTemplate(identity.caste);
    const parts: string[] = [];

    parts.push(
      renderPromptBlock(identity, {
        includeManifesto: opts.includeManifesto !== false,
      }),
    );

    if (opts.toolNames?.length) {
      parts.push("");
      parts.push("## Available Tools");
      parts.push("");
      parts.push(`You have access to ${opts.toolNames.length} tools: ${opts.toolNames.join(", ")}`);
      parts.push("Use tools when they help you accomplish the user's request. Do not use tools unnecessarily.");
    }

    if (opts.customInstructions) {
      parts.push("");
      parts.push("## Additional Instructions");
      parts.push("");
      parts.push(opts.customInstructions);
    }

    parts.push("");
    parts.push("## Caste Guidance");
    parts.push("");
    parts.push(`**Specialization:** ${casteGuidance.role}`);
    parts.push(`**Operating Style:** ${casteGuidance.personality}`);
    parts.push(`**Delegation Focus:** ${casteGuidance.delegationPrompt}`);

    parts.push("");
    parts.push("## Guidelines");
    parts.push("");
    parts.push("- Think step by step before acting.");
    parts.push("- If you're unsure, ask the user for clarification.");
    parts.push("- Prefer concise, accurate responses over verbose ones.");
    parts.push("- When executing tools, explain what you're doing and why.");
    parts.push("- If a tool call fails, diagnose the error and try an alternative approach.");
    for (const guideline of casteGuidance.guidelines) {
      parts.push(`- ${guideline}`);
    }

    return parts.join("\n");
  }
}

function resolveIdentity(
  registry: IdentityRegistry,
  agentId: string | undefined,
  caste: string,
): AgentIdentity {
  if (agentId) {
    const identity = registry.get(agentId);
    if (identity) return identity;
  }

  try {
    if (caste) {
      return registry.getDefaultForCaste(caste);
    }
  } catch {
    // Fall through to Assist-Ant default.
  }

  return registry.getDefaultForCaste(Caste.ASSIST_ANT);
}
