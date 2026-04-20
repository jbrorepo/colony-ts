export interface GatewayBasicCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: Record<string, unknown>;
}

export const COMMAND_HELP: Record<string, string> = {
  "/swarm":       "Active-agent alias; real multi-agent swarm pending",
  "/sessions":    "List/search/filter saved sessions by pending/current state",
  "/history":     "Show current, latest, pending, or saved session tail",
  "/artifact":    "Inspect or list persisted large tool output under Colony storage",
  "/budget":      "Set cost budget cap in USD (e.g. /budget 1.00)",
  "/model":       "Show or switch model for selected or named provider",
  "/perf":        "Unified performance dashboard across models, providers, tools, hooks, and runtime events",
  "/tools":       "Inspect active, pending, and recent tool activity",
  "/events":      "Inspect recent runtime events across tools, hooks, compaction, and failovers",
  "/cancel":      "Cancel active run without leaving The Colony",
  "/clear":       "Clear conversation history, preserve system prompt",
  "/compact":     "Trigger, inspect, or auto-pick compaction (e.g. /compact status, /compact recent, /compact handoff, /compact smart)",
  "/help":        "Show this help message",
  "/status":      "Show session, runtime, context, and cost status",
  "/cost":        "Show cost summary, model usage, or budget detail",
  "/caste":       "Show current caste and description",
  "/permissions": "List allowed and denied tools",
  "/resume":      "Resume a persisted session by ID, prefix, index, latest, or pending",
  "/hooks":       "Inspect registered and recent runtime hooks",
  "/doctor":      "Show startup diagnostics, filters, and fixes",
  "/workspace":   "Show detected workspace details",
  "/provider":    "Show or switch provider summary, health, failovers, or one provider",
  "/exit":        "Exit The Colony (alias: /quit)",
};

export function commandDescription(command: string): string {
  return COMMAND_HELP[`/${command}`] ?? "(custom command)";
}

export function renderHelpView(commands: string[]): string {
  const lines = ["Available Commands:", ""];
  for (const command of commands) {
    lines.push(`  /${command.padEnd(11)} ${commandDescription(command)}`);
  }
  return lines.join("\n");
}

export function formatHelp(commands: Record<string, string> = COMMAND_HELP): string {
  const lines = ["┌─ Colony Commands ───────────────────────────────────────┐"];
  for (const [cmd, desc] of Object.entries(commands)) {
    lines.push(`│  ${cmd.padEnd(14)} ${desc.padEnd(53)}│`);
  }
  lines.push("└─────────────────────────────────────────────────────────┘");
  lines.push("  Free text input is sent directly to the active agent.");
  return lines.join("\n");
}

export function renderCasteView(caste: string): string {
  const descriptions: Record<string, string> = {
    assist_ant: "General-purpose assistant - The Colony's primary interface agent.",
    root_queen: "Supreme authority - full access to all Colony subsystems.",
    forge_carvers: "Specialist builders - code creation and software engineering.",
    core_shapers: "Infrastructure specialists - system configuration and services.",
    lore_burrow: "Knowledge agents - research, summarization, and organization.",
    liaison_ants: "Communication specialists - external messaging and reports.",
    ledger_ants: "Data specialists - analytics, metrics, and structured reports.",
    watcher_swarm: "Monitoring agents - observation, scanning, and status reporting.",
    shield_generals: "Security specialists - threat analysis and policy enforcement.",
    eldest_architect: "Technical architects - systems design and engineering standards.",
    nameless_swarm: "Sandboxed workers - constrained execution for isolated tasks.",
  };
  return `Current Caste: ${caste}\n\n${descriptions[caste] ?? "Custom caste - no description available."}`;
}

export function formatStatus(info: {
  sessionId: string;
  agentId: string;
  caste: string;
  messageCount: number;
  iterations: number;
  tokensUsed: number;
  costUsd: number;
  state: string;
}): string {
  return [
    "┌─ Session Status ────────────────────────────────────────┐",
    `│  Session:    ${info.sessionId.padEnd(42)}│`,
    `│  Agent:      ${info.agentId.padEnd(42)}│`,
    `│  Caste:      ${info.caste.padEnd(42)}│`,
    `│  State:      ${info.state.padEnd(42)}│`,
    `│  Messages:   ${String(info.messageCount).padEnd(42)}│`,
    `│  Iterations: ${String(info.iterations).padEnd(42)}│`,
    `│  Tokens:     ${info.tokensUsed.toLocaleString().padEnd(42)}│`,
    `│  Cost:       $${info.costUsd.toFixed(4).padEnd(41)}│`,
    "└─────────────────────────────────────────────────────────┘",
  ].join("\n");
}

export function formatCaste(caste: string, description?: string): string {
  const desc = description ?? `The ${caste} caste`;
  return [
    `Current Caste: ${caste}`,
    `${desc}`,
  ].join("\n");
}

export function formatPermissions(
  caste: string,
  active: string[],
  allowed: string[],
  denied: string[],
  sessionRules: string[],
): string {
  const lines = [
    `┌─ Tool Permissions (${caste}) ${"─".repeat(Math.max(0, 35 - caste.length))}┐`,
  ];
  if (active.length > 0) {
    lines.push("│  Active tool schemas:");
    for (const tool of active) {
      lines.push(`│    * ${tool}`);
    }
  } else {
    lines.push("│  Active tool schemas: none.");
  }
  if (allowed.length > 0) {
    lines.push("│  Allowed:");
    for (const tool of allowed) {
      lines.push(`│    + ${tool}`);
    }
  }
  if (denied.length > 0) {
    lines.push("│  Denied:");
    for (const tool of denied) {
      lines.push(`│    - ${tool}`);
    }
  }
  if (allowed.length === 0 && denied.length === 0) {
    lines.push("│  Default permissions apply.");
  }
  if (sessionRules.length > 0) {
    lines.push(`│  Exact-signature session rules: ${sessionRules.length}`);
    for (const rule of sessionRules) {
      lines.push(`│    = ${rule}`);
    }
  } else {
    lines.push("│  Exact-signature session rules: none.");
  }
  lines.push("└─────────────────────────────────────────────────────────┘");
  return lines.join("\n");
}

export function buildSwarmCommandPayload(message: string): GatewayBasicCommandPayload {
  if (!message) {
    return {
      output: "Usage: /swarm <message>",
      isError: true,
    };
  }
  return {
    output: "/swarm currently routes to the active agent only. Real multi-agent swarm arrives in Phase 4.",
    data: { action: "chat", message, mode: "active-agent-alias" },
    action: { kind: "submit", message },
  };
}

export function buildBudgetCommandPayload(opts: {
  args: string[];
  maxUsd: number | null;
  maxTokens: number | null;
}): GatewayBasicCommandPayload {
  if (opts.args.length === 0) {
    const lines = ["Budget:"];
    if (typeof opts.maxUsd === "number" && Number.isFinite(opts.maxUsd) && opts.maxUsd > 0) {
      lines.push(`Cost cap: $${opts.maxUsd.toFixed(2)}`);
    } else {
      lines.push("Cost cap: none");
    }
    if (typeof opts.maxTokens === "number" && Number.isFinite(opts.maxTokens) && opts.maxTokens > 0) {
      lines.push(`Token cap: ${Math.round(opts.maxTokens).toLocaleString()} tokens`);
    }
    lines.push("Inspect: /status | /cost");
    lines.push("Set: /budget <positive USD cap>");
    return {
      output: lines.join("\n"),
      data: {
        maxUsd: opts.maxUsd,
        maxTokens: opts.maxTokens,
      },
    };
  }

  const cap = Number.parseFloat(opts.args[0] ?? "");
  if (!Number.isFinite(cap) || cap <= 0) {
    return {
      output: "Usage: /budget <positive USD cap>",
      isError: true,
    };
  }
  return {
    output: `Budget cap set to $${cap.toFixed(2)}.`,
    data: { maxUsd: cap },
    action: { kind: "set_budget", maxUsd: cap },
  };
}

export function buildExitCommandPayload(): GatewayBasicCommandPayload {
  return {
    output: "Colony shutting down. Ad Formicae Gloriam.",
    data: { action: "exit" },
    action: { kind: "exit" },
  };
}
