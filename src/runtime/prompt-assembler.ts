/**
 * Prompt assembly pipeline for The Colony agent runtime.
 *
 * Behavioral port of colony/runtime/prompt.py. Builds prompt from
 * prioritized blocks, then converts session history into LLM messages
 * within a context budget.
 */

import type { LLMMessage } from "../llm/models";
import { memoryTruthModeLabel } from "../memory/hybrid-memory";
import { PromptBuilder } from "./prompt-builder";
import type { SerializedMessage } from "./message";
import type {
  RuntimeContextSnapshot,
  RuntimeFailoverSnapshot,
  RuntimeHookEventSnapshot,
  RuntimeProviderHealthSnapshot,
  RuntimeToolActivitySummary,
} from "./runtime-snapshot";
import { TokenEstimationService } from "./token-estimation";

export enum BlockType {
  CONVERSATION_HISTORY = 10,
  TASK_CONTEXT = 20,
  MEMORY = 30,
  SKILL_INSTRUCTIONS = 40,
  TOOL_DECLARATIONS = 50,
  CASTE_IDENTITY = 60,
}

export interface PromptBlock {
  blockType: BlockType;
  content: string;
  priority?: number;
  maxTokens?: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

export interface PromptWorkspaceContext {
  root: string;
  startDir?: string;
  name: string;
  detected: boolean;
  reason?: string;
  markers?: string[];
  projectType?: string;
  packageManager?: string;
  workspaceMode?: string;
  workspaceGlobs?: string[];
  workspacePackageCount?: number;
  workspaceAppCount?: number;
  workspaceLibraryCount?: number;
  workspaceOtherCount?: number;
  workspaceAppPackages?: string[];
  workspaceLibraryPackages?: string[];
  workspaceOtherPackages?: string[];
  workspaceDevCandidates?: string[];
  workspaceVerifyCandidates?: string[];
  workspaceIntent?: string;
  workspacePrimaryTargets?: string[];
  scriptNames?: string[];
  devCommand?: string | null;
  verifyCommand?: string | null;
  stackHints?: string[];
}

export type PromptProviderHealthSnapshot = RuntimeProviderHealthSnapshot;
export type PromptFailoverSnapshot = RuntimeFailoverSnapshot;
export type PromptToolActivitySummary = RuntimeToolActivitySummary;
export type PromptHookEventSnapshot = RuntimeHookEventSnapshot;
export type PromptRuntimeContext = RuntimeContextSnapshot;

export interface PromptSessionContext {
  sessionId?: string;
  agentId?: string;
  caste?: string;
  state?: string;
  messageCount?: number;
  totalIterations?: number;
  totalTokensUsed?: number;
}

export interface PromptStartupCheck {
  name: string;
  passed: boolean;
  severity: string;
  message: string;
  fix?: string;
}

export interface PromptStartupReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  checks?: PromptStartupCheck[];
}

export interface AssembledPrompt {
  messages: LLMMessage[];
  blocksUsed: Array<{
    type: string;
    tokens: number;
    priority: number;
  }>;
  totalTokens: number;
  wasCompacted: boolean;
  droppedBlocks: string[];
}

export class PromptAssembler {
  private readonly caste: string;
  private readonly providerType: string;
  private readonly contextWindowTokens: number;
  private readonly responseReserveTokens: number;
  private readonly estimator: TokenEstimationService;

  constructor(opts: {
    caste?: string;
    providerType?: string;
    contextWindowTokens?: number;
    responseReserveTokens?: number;
    estimator?: TokenEstimationService;
  } = {}) {
    this.caste = opts.caste ?? "";
    this.providerType = opts.providerType ?? "openai_compatible";
    this.contextWindowTokens = opts.contextWindowTokens ?? 128_000;
    this.responseReserveTokens = opts.responseReserveTokens ?? 4096;
    this.estimator = opts.estimator ?? new TokenEstimationService();
  }

  assemble(opts: {
    conversationHistory?: SerializedMessage[];
    toolSchemas?: Record<string, unknown>[];
    skillInstructions?: string[];
    memoryContext?: string;
    taskContext?: string;
    workspaceContext?: PromptWorkspaceContext | null;
    runtimeContext?: PromptRuntimeContext | null;
    sessionContext?: PromptSessionContext | null;
    startupReport?: PromptStartupReport | null;
    customSystemPrompt?: string;
    agentId?: string;
  } = {}): AssembledPrompt {
    const result: AssembledPrompt = {
      messages: [],
      blocksUsed: [],
      totalTokens: 0,
      wasCompacted: false,
      droppedBlocks: [],
    };

    const blocks: Required<PromptBlock>[] = [];
    const history = opts.conversationHistory ?? [];
    const systemPrefix = splitSystemPrefix(history);

    let identityText = opts.customSystemPrompt ?? joinSystemPrefix(systemPrefix.systemMessages);
    if (!identityText) {
      identityText = PromptBuilder.buildSystemPrompt({
        caste: this.caste,
        agentId: opts.agentId,
        includeManifesto: true,
      });
    }
    blocks.push(withDefaults({
      blockType: BlockType.CASTE_IDENTITY,
      content: identityText,
    }));

    if (opts.toolSchemas?.length) {
      const toolText = this.formatToolDeclarations(opts.toolSchemas);
      if (toolText) {
        blocks.push(withDefaults({
          blockType: BlockType.TOOL_DECLARATIONS,
          content: toolText,
          metadata: { toolCount: opts.toolSchemas.length, providerType: this.providerType },
        }));
      }
    }

    if (opts.skillInstructions?.length) {
      blocks.push(withDefaults({
        blockType: BlockType.SKILL_INSTRUCTIONS,
        content: opts.skillInstructions.join("\n\n---\n\n"),
        metadata: { skillCount: opts.skillInstructions.length },
      }));
    }

    if (opts.memoryContext) {
      blocks.push(withDefaults({
        blockType: BlockType.MEMORY,
        content: `Relevant context from past interactions:\n${opts.memoryContext}`,
      }));
    }

    const structuredTaskContext = this.buildTaskContext(opts);
    if (structuredTaskContext) {
      blocks.push(withDefaults({
        blockType: BlockType.TASK_CONTEXT,
        content: `Current task context:\n${structuredTaskContext}`,
      }));
    }

    for (const block of blocks) {
      block.tokenCount = this.estimateTokens(block.content);
    }

    let systemTokens = blocks.reduce((sum, block) => sum + block.tokenCount, 0);
    const availableForHistory = Math.max(
      this.contextWindowTokens - this.responseReserveTokens - systemTokens,
      0,
    );

    const historyMessages = this.buildHistoryMessages(systemPrefix.bodyMessages, availableForHistory);
    const historyTokens = this.estimator.countMessages(historyMessages as unknown as Array<Record<string, unknown>>);
    const budget = this.contextWindowTokens - this.responseReserveTokens;
    let total = systemTokens + historyTokens;

    if (total > budget) {
      const compacted = this.compactBlocks(blocks, budget - historyTokens);
      result.wasCompacted = compacted.wasCompacted;
      result.droppedBlocks = compacted.droppedBlocks;
      systemTokens = compacted.blocks.reduce((sum, block) => sum + block.tokenCount, 0);
      total = systemTokens + historyTokens;
      blocks.length = 0;
      blocks.push(...compacted.blocks);
    }

    const systemContent = this.assembleSystemPrompt(blocks);
    if (systemContent) {
      result.messages.push({ role: "system", content: systemContent });
    }
    result.messages.push(...historyMessages);
    result.totalTokens = total;

    for (const block of blocks) {
      result.blocksUsed.push({
        type: BlockType[block.blockType],
        tokens: block.tokenCount,
        priority: block.priority,
      });
    }
    result.blocksUsed.push({
      type: "CONVERSATION_HISTORY",
      tokens: historyTokens,
      priority: BlockType.CONVERSATION_HISTORY,
    });

    return result;
  }

  private assembleSystemPrompt(blocks: Required<PromptBlock>[]): string {
    return [...blocks]
      .sort((a, b) => b.priority - a.priority)
      .map((block) => block.content.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  private formatToolDeclarations(toolSchemas: Record<string, unknown>[]): string {
    if (toolSchemas.length === 0) return "";

    const lines = ["Available tools:"];
    for (const schema of toolSchemas) {
      const fn = isRecord(schema.function) ? schema.function : schema;
      const name = String(fn.name ?? "unknown");
      const description = String(fn.description ?? "");
      lines.push(description ? `  - ${name}: ${description}` : `  - ${name}`);
    }
    return lines.join("\n");
  }

  private buildHistoryMessages(
    history: SerializedMessage[],
    maxTokens: number,
  ): LLMMessage[] {
    const messages: LLMMessage[] = [];

    for (const entry of history) {
      if (entry.type === "user") {
        messages.push({ role: "user", content: entry.content ?? "" });
      } else if (entry.type === "assistant") {
        messages.push({
          role: "assistant",
          content: entry.content ?? "",
          toolCalls: Array.isArray(entry.toolCalls) ? entry.toolCalls : undefined,
        });
      } else if (entry.type === "tool_result") {
        messages.push({
          role: "tool",
          content: entry.content ?? "",
          toolCallId: entry.toolCallId,
          name: entry.name,
        });
      } else if (entry.type === "system") {
        // Preserve non-prefix system summaries generated by compaction.
        messages.push({ role: "system", content: entry.content ?? "" });
      }
    }

    if (maxTokens > 0) {
      let total = this.estimator.countMessages(messages as unknown as Array<Record<string, unknown>>);
      while (total > maxTokens && messages.length > 1) {
        const removed = messages.shift()!;
        total -= this.estimateTokens(removed.content ?? "");
      }
    }

    return messages;
  }

  private compactBlocks(
    blocks: Required<PromptBlock>[],
    budget: number,
  ): {
    blocks: Required<PromptBlock>[];
    droppedBlocks: string[];
    wasCompacted: boolean;
  } {
    const ordered = [...blocks].sort((a, b) => a.priority - b.priority);
    let total = blocks.reduce((sum, block) => sum + block.tokenCount, 0);
    const droppedBlocks: string[] = [];
    const survivors = [...blocks];

    while (total > budget && ordered.length > 0) {
      const victim = ordered.shift()!;
      const index = survivors.indexOf(victim);
      if (index === -1) continue;
      survivors.splice(index, 1);
      total -= victim.tokenCount;
      droppedBlocks.push(BlockType[victim.blockType]);
    }

    return {
      blocks: survivors,
      droppedBlocks,
      wasCompacted: droppedBlocks.length > 0,
    };
  }

  private estimateTokens(text: string): number {
    return this.estimator.count(text).tokenCount;
  }

  private buildTaskContext(opts: {
    taskContext?: string;
    workspaceContext?: PromptWorkspaceContext | null;
    runtimeContext?: PromptRuntimeContext | null;
    sessionContext?: PromptSessionContext | null;
    startupReport?: PromptStartupReport | null;
  }): string {
    const sections: string[] = [];

    const taskText = opts.taskContext?.trim();
    if (taskText) {
      sections.push(`User task:\n${taskText}`);
    }

    const workspace = opts.workspaceContext;
    if (workspace) {
      const lines = [
        "Workspace:",
        `- Detected: ${workspace.detected ? "yes" : "no"}`,
        `- Name: ${workspace.name}`,
        `- Root: ${workspace.root}`,
      ];
      if (workspace.startDir) lines.push(`- Start dir: ${workspace.startDir}`);
      if (workspace.projectType) lines.push(`- Type: ${workspace.projectType}`);
      if (workspace.packageManager) lines.push(`- Package manager: ${workspace.packageManager}`);
      if (workspace.workspaceMode) lines.push(`- Mode: ${workspace.workspaceMode}`);
      if (workspace.workspaceIntent) lines.push(`- Intent: ${workspace.workspaceIntent}`);
      if (workspace.workspacePrimaryTargets?.length) lines.push(`- Primary targets: ${workspace.workspacePrimaryTargets.slice(0, 4).join(", ")}`);
      if (workspace.workspacePackageCount && workspace.workspacePackageCount > 0) {
        lines.push(
          `- Workspace packages: ${workspace.workspacePackageCount} total (${workspace.workspaceAppCount ?? 0} app, ${workspace.workspaceLibraryCount ?? 0} library, ${workspace.workspaceOtherCount ?? 0} other)`,
        );
      }
      if (workspace.workspaceAppPackages?.length) lines.push(`- Workspace apps: ${workspace.workspaceAppPackages.slice(0, 4).join(", ")}`);
      if (workspace.workspaceLibraryPackages?.length) lines.push(`- Workspace libraries: ${workspace.workspaceLibraryPackages.slice(0, 4).join(", ")}`);
      if (workspace.workspaceOtherPackages?.length) lines.push(`- Workspace other packages: ${workspace.workspaceOtherPackages.slice(0, 4).join(", ")}`);
      if (workspace.workspaceDevCandidates?.length) lines.push(`- Workspace dev candidates: ${workspace.workspaceDevCandidates.slice(0, 3).join(" | ")}`);
      if (workspace.workspaceVerifyCandidates?.length) lines.push(`- Workspace verify candidates: ${workspace.workspaceVerifyCandidates.slice(0, 3).join(" | ")}`);
      if (workspace.workspaceGlobs?.length) lines.push(`- Workspace globs: ${workspace.workspaceGlobs.join(", ")}`);
      if (workspace.stackHints?.length) lines.push(`- Stack: ${workspace.stackHints.join(", ")}`);
      if (workspace.scriptNames?.length) lines.push(`- Scripts: ${workspace.scriptNames.join(", ")}`);
      if (workspace.devCommand) lines.push(`- Dev command: ${workspace.devCommand}`);
      if (workspace.verifyCommand) lines.push(`- Verify command: ${workspace.verifyCommand}`);
      if (workspace.reason) lines.push(`- Reason: ${workspace.reason}`);
      if (workspace.markers?.length) lines.push(`- Markers: ${workspace.markers.join(", ")}`);
      sections.push(lines.join("\n"));
    }

    const session = opts.sessionContext;
    if (session) {
      const lines = [
        "Session state:",
        `- Session ID: ${session.sessionId ?? "unknown"}`,
        `- Agent ID: ${session.agentId ?? "unknown"}`,
        `- Caste: ${session.caste ?? "unknown"}`,
      ];
      if (session.state) lines.push(`- State: ${session.state}`);
      if (typeof session.messageCount === "number") lines.push(`- Messages: ${session.messageCount}`);
      if (typeof session.totalIterations === "number") lines.push(`- Iterations: ${session.totalIterations}`);
      if (typeof session.totalTokensUsed === "number") lines.push(`- Session tokens used: ${session.totalTokensUsed}`);
      sections.push(lines.join("\n"));
    }

    const runtime = opts.runtimeContext;
    if (runtime) {
      const lines = [
        "Runtime state:",
        `- Provider: ${runtime.provider ?? "unknown"}`,
        `- Model: ${runtime.model ?? "unknown"}`,
      ];
      if (
        runtime.selectedProvider
        && runtime.selectedModel
        && (
          runtime.selectedProvider !== runtime.provider
          || runtime.selectedModel !== runtime.model
        )
      ) {
        lines.push(`- Next run LLM: ${runtime.selectedProvider}:${runtime.selectedModel}`);
      }
      if (runtime.circuitState) {
        lines.push(`- Circuit: ${runtime.circuitState}`);
      }
      lines.push(`- Memory recall mode: ${memoryTruthModeLabel(runtime.memoryTruthModeOverride ?? null)}`);
      if (runtime.availableProviders?.length) {
        lines.push(`- Available providers: ${runtime.availableProviders.join(", ")}`);
      }
      const failoverEntries = Object.entries(runtime.failover ?? {});
      if (failoverEntries.length > 0) {
        lines.push("- Failover:");
        for (const [provider, chain] of failoverEntries) {
          lines.push(`  - ${provider}: ${chain.join(", ") || "(none)"}`);
        }
      }
      const providerHealthEntries = Object.entries(runtime.providerHealth ?? {}).sort(([a], [b]) => a.localeCompare(b));
      if (providerHealthEntries.length > 0) {
        lines.push("- Provider health:");
        for (const [provider, health] of providerHealthEntries.slice(0, 6)) {
          const state = health?.state ?? "unknown";
          const failures = typeof health?.failureCount === "number" ? health.failureCount : 0;
          lines.push(`  - ${provider}: ${state} (failures: ${failures})`);
        }
      }
      const recentFailovers = (runtime.recentFailovers ?? []).slice(-3);
      if (recentFailovers.length > 0) {
        lines.push("- Recent failovers:");
        for (const event of recentFailovers) {
          lines.push(`  - ${formatPromptFailover(event)}`);
        }
      }
      if (runtime.activeToolIds?.length) {
        lines.push(`- Active tools: ${runtime.activeToolIds.join(", ")}`);
      }
      if (runtime.permittedToolIds?.length) {
        lines.push(`- Permitted tools: ${runtime.permittedToolIds.join(", ")}`);
      }
      if (
        typeof runtime.activeToolCount === "number"
        || typeof runtime.permittedToolCount === "number"
      ) {
        lines.push(
          `- Tool access: ${runtime.activeToolCount ?? runtime.activeToolIds?.length ?? 0} active / ${runtime.permittedToolCount ?? runtime.permittedToolIds?.length ?? 0} permitted`,
        );
      }
      if (typeof runtime.sessionRuleCount === "number") {
        lines.push(`- Exact-signature session rules: ${runtime.sessionRuleCount}`);
      }
      if (runtime.sessionRules?.length) {
        lines.push("- Exact-signature rule list:");
        for (const rule of runtime.sessionRules.slice(0, 8)) {
          lines.push(`  - ${rule}`);
        }
        if (runtime.sessionRules.length > 8) {
          lines.push(`  - ... ${runtime.sessionRules.length - 8} more`);
        }
      }
      if (typeof runtime.pendingApproval === "boolean") {
        lines.push(`- Pending approval: ${runtime.pendingApproval ? "yes" : "no"}`);
        if (runtime.pendingApproval) {
          if (runtime.pendingApprovalToolName) {
            lines.push(`- Pending approval tool: ${runtime.pendingApprovalToolName}`);
          }
          const approvalBits = [
            runtime.pendingApprovalRiskLevel ? `risk:${runtime.pendingApprovalRiskLevel}` : null,
            runtime.pendingApprovalCategory ? `category:${runtime.pendingApprovalCategory}` : null,
          ].filter(Boolean);
          if (approvalBits.length > 0) {
            lines.push(`- Pending approval detail: ${approvalBits.join(" | ")}`);
          }
          if (runtime.pendingApprovalSummary) {
            lines.push(`- Pending approval summary: ${runtime.pendingApprovalSummary}`);
          }
          if (runtime.pendingApprovalSignature) {
            lines.push(`- Pending approval signature: ${runtime.pendingApprovalSignature}`);
          }
          if (runtime.pendingApprovalReason) {
            lines.push(`- Pending approval reason: ${runtime.pendingApprovalReason}`);
          }
          if (typeof runtime.pendingApprovalWarningCount === "number") {
            lines.push(`- Pending approval warnings: ${runtime.pendingApprovalWarningCount}`);
          }
        }
      }
      const recentToolActivity = runtime.recentToolActivity?.slice(-3) ?? [];
      if (recentToolActivity.length > 0) {
        lines.push(`- Recent tools: ${recentToolActivity.length}`);
        for (const activity of recentToolActivity) {
          const detail = activity.detail ? ` | ${activity.detail}` : "";
          lines.push(`  - ${activity.toolName} | ${activity.status}${detail}`);
          if (activity.artifactPath) {
            lines.push(`    artifact: ${activity.artifactPath}`);
          }
        }
      }
      const recentHookEvents = runtime.recentHookEvents?.slice(-3) ?? [];
      if (recentHookEvents.length > 0) {
        lines.push(`- Recent hooks: ${recentHookEvents.length}`);
        for (const event of recentHookEvents) {
          const detail = event.detail ? ` | ${event.detail}` : "";
          const duration = typeof event.durationMs === "number" ? ` | ${event.durationMs}ms` : "";
          lines.push(`  - ${event.kind}${detail}${duration}`);
        }
      }
      if (typeof runtime.budgetUsd === "number") {
        lines.push(`- Budget cap: $${runtime.budgetUsd.toFixed(2)}`);
      }
      if (typeof runtime.budgetSpentUsd === "number") {
        const capLabel = typeof runtime.budgetUsd === "number" ? ` / $${runtime.budgetUsd.toFixed(2)}` : "";
        const remainingLabel = typeof runtime.budgetRemainingUsd === "number"
          ? ` (remaining: $${runtime.budgetRemainingUsd.toFixed(4)})`
          : "";
        lines.push(`- Budget spend: $${runtime.budgetSpentUsd.toFixed(4)}${capLabel}${remainingLabel}`);
      }
      if (
        typeof runtime.contextUsedTokens === "number" ||
        typeof runtime.contextMaxTokens === "number" ||
        typeof runtime.contextPercentUsed === "number"
      ) {
        lines.push(
          `- Context window: ${Math.round(runtime.contextUsedTokens ?? 0).toLocaleString()} / ${Math.round(runtime.contextMaxTokens ?? 0).toLocaleString()} tokens (${(runtime.contextPercentUsed ?? 0).toFixed(1)}%)`,
        );
      }
      if (
        runtime.contextPressure
        || typeof runtime.contextRemainingTokens === "number"
      ) {
        const remainingLabel = typeof runtime.contextRemainingTokens === "number"
          ? ` | remaining tokens: ${Math.round(runtime.contextRemainingTokens).toLocaleString()}`
          : "";
        lines.push(`- Context pressure: ${runtime.contextPressure ?? "unknown"}${remainingLabel}`);
      }
      if (typeof runtime.compactionFailureCount === "number") {
        lines.push(`- Compaction failures: ${runtime.compactionFailureCount}`);
      }
      if (runtime.lastCompactionFailureMessage) {
        const strategyLabel = runtime.lastCompactionFailureStrategy
          ? `${runtime.lastCompactionFailureStrategy} `
          : "";
        lines.push(`- Last compaction failure: ${strategyLabel}${runtime.lastCompactionFailureMessage}`.trim());
      }
      if (runtime.pendingCompactionStrategy) {
        const pressureSuffix = runtime.contextPressure ? ` (pressure: ${runtime.contextPressure})` : "";
        lines.push(`- Queued compaction: ${runtime.pendingCompactionStrategy}${pressureSuffix}`);
      }
      if (runtime.lastCompactionStrategy) {
        const details: string[] = [];
        if (typeof runtime.lastCompactionSavedTokens === "number") {
          details.push(`saved ~${runtime.lastCompactionSavedTokens} tokens`);
        }
        if (typeof runtime.lastCompactionSummarizedMessages === "number") {
          details.push(
            runtime.lastCompactionStrategy === "micro" || runtime.lastCompactionStrategy === "cached_micro"
              ? `trimmed ${runtime.lastCompactionSummarizedMessages} tool results`
              : `summarized ${runtime.lastCompactionSummarizedMessages}`,
          );
        }
        if (
          typeof runtime.lastCompactionPreservedSystemCount === "number"
          || typeof runtime.lastCompactionPreservedRecentCount === "number"
        ) {
          details.push(
            `kept ${runtime.lastCompactionPreservedSystemCount ?? 0} system + ${runtime.lastCompactionPreservedRecentCount ?? 0} recent`,
          );
        }
        if (typeof runtime.lastCompactionSummaryLineCount === "number") {
          details.push(`lines ${runtime.lastCompactionSummaryLineCount}`);
        }
        const triggerLabel = runtime.lastCompactionTrigger ? ` via ${runtime.lastCompactionTrigger}` : "";
        const detailLabel = details.length > 0 ? ` (${details.join(", ")})` : "";
        lines.push(`- Last compaction: ${runtime.lastCompactionStrategy}${triggerLabel}${detailLabel}`);
      }
      if (
        typeof runtime.startupErrors === "number" ||
        typeof runtime.startupWarnings === "number"
      ) {
        lines.push(
          `- Startup checks: ${runtime.startupErrors ?? 0} error(s), ${runtime.startupWarnings ?? 0} warning(s)`,
        );
      }
      sections.push(lines.join("\n"));
    }

    const startup = opts.startupReport;
    if (startup && (startup.errorCount > 0 || startup.warningCount > 0)) {
      const lines = [
        "Startup diagnostics:",
        `- Passed: ${startup.passed ? "yes" : "no"}`,
        `- Errors: ${startup.errorCount}`,
        `- Warnings: ${startup.warningCount}`,
      ];
      for (const check of (startup.checks ?? []).filter((item) => !item.passed).slice(0, 5)) {
        lines.push(`- ${check.severity.toUpperCase()} ${check.name}: ${check.message}`);
        if (check.fix) lines.push(`  Fix: ${check.fix}`);
      }
      sections.push(lines.join("\n"));
    }

    return sections.join("\n\n").trim();
  }
}

function withDefaults(block: PromptBlock): Required<PromptBlock> {
  return {
    blockType: block.blockType,
    content: block.content,
    priority: block.priority ?? block.blockType,
    maxTokens: block.maxTokens ?? 0,
    tokenCount: block.tokenCount ?? 0,
    metadata: block.metadata ?? {},
  };
}

function splitSystemPrefix(history: SerializedMessage[]): {
  systemMessages: SerializedMessage[];
  bodyMessages: SerializedMessage[];
} {
  const systemMessages: SerializedMessage[] = [];
  const bodyMessages = [...history];
  while (bodyMessages[0]?.type === "system") {
    systemMessages.push(bodyMessages.shift()!);
  }
  return { systemMessages, bodyMessages };
}

function joinSystemPrefix(messages: SerializedMessage[]): string {
  return messages
    .map((message) => String(message.content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPromptFailover(event: PromptFailoverSnapshot): string {
  const route =
    `${event.fromProvider ?? "unknown"}:${event.fromModel ?? "unknown"} -> ` +
    `${event.toProvider ?? "unknown"}:${event.toModel ?? "unknown"}`;
  if (event.errorMessage) {
    return `${route} (${event.errorType ?? "error"} | ${event.errorMessage})`;
  }
  if (event.errorType) {
    return `${route} (${event.errorType})`;
  }
  return route;
}
