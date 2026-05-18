import {
  casteDisplayName,
  listCasteCompatibilityRecords,
  normalizeCasteKey,
  tryResolveMethodCaste,
} from "./caste/enums";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayBasicCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: Record<string, unknown>;
}

export const COMMAND_HELP: Record<string, string> = {
  "/swarm":       "Start, inspect, or cancel planner/worker/reviewer swarm runs",
  "/sessions":    "List/search/filter saved sessions by pending/current state",
  "/history":     "Show current, latest, pending, or saved session tail",
  "/artifact":    "list persisted large tool outputs, reopen exact artifacts, or inspect latest under Colony storage",
  "/budget":      "Show current cost/token caps, inspect budget status/spend, or set USD cap",
  "/model":       "Show selected provider/model, set current model, or switch next-run provider/model",
  "/memory":      "Show/set memory recall mode, routing/palace views, preview /memory plan <query> (auto, exact, derived, balanced, prefer-exact, prefer-derived)",
  "/perf":        "Unified performance dashboard across runtime, models, providers, tools, hooks, and compactions",
  "/tools":       "Inspect active tools, approvals, recent activity, artifacts, perf, policy, and exact-call rules",
  "/events":      "Inspect recent runtime events, failures, tools, hooks, compactions, failovers, and perf",
  "/workflow":    "Inspect workflow runs, active/paused checkpoints, retries, and artifacts",
  "/daemon":      "Inspect remote daemon endpoint, auth scopes, and remote sessions",
  "/channels":    "Inspect channel adapters, deliveries, auth, sessions, contract-only fixtures, and external vendor helper state",
  "/browser":     "Inspect descriptor-only browser sidecar boundaries, scopes, and safety contracts",
  "/skills":      "search/inspect/audit/plan/staged SKILL.md catalog entries, approvals, source drift, safe imports, and promotion rollback views",
  "/capabilities": "Inspect GStack-inspired Colony capability tracks and next implementation slices",
  "/github":      "Plan approved GitHub issue, local workspace, push, and PR handoffs",
  "/plugins":     "Inspect and activate trusted local plugins through approval-gated preflight and receipts",
  "/audit":       "Inspect, verify, and export redacted security audit and telemetry projections",
  "/cancel":      "Cancel active run without leaving The Colony",
  "/clear":       "Clear conversation history, preserve system prompt",
  "/compact":     "Trigger standard/micro/reactive/session_memory/cached_micro/context_collapse, smart, or inspect status/recent/handoff pressure and failure",
  "/help":        "Show this help message",
  "/status":      "Show session, runtime, saved, workspace, tools, workflow, operator, and drill-down status",
  "/cost":        "Show cost summary, models, budget, perf, and drill-down views",
  "/caste":       "Show current caste and description",
  "/permissions": "Inspect active schemas, allowed/denied tools, and session rules",
  "/resume":      "Resume a persisted session by ID, prefix, index, latest, or pending",
  "/hooks":       "Inspect registered hooks, recent events, perf, and kinds",
  "/doctor":      "Show diagnostics, first-run, workspace, providers, and failovers",
  "/workspace":   "Inspect workspace packages, dev/verify commands, stack, and globs",
  "/provider":    "Show/switch provider summary, health, failovers, performance, or current provider",
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
    queen: "Supreme authority - full access to all Colony subsystems.",
    develop_ant: "Specialist builders - code creation and software engineering.",
    logist_ant: "Infrastructure specialists - system configuration and services.",
    cogniz_ant: "Knowledge agents - research, summarization, and organization.",
    inform_ant: "Communication specialists - external messaging and reports.",
    account_ant: "Data specialists - analytics, metrics, and structured reports.",
    consult_ant: "Review and observability agents - verification, evidence, and status reporting.",
    vigil_ant: "Security specialists - threat analysis and policy enforcement.",
    eldest: "Technical architects - systems design and engineering standards.",
    command_ant: "Planning coordinators - task routing, sequencing, and execution plans.",
    oper_ant: "Sandboxed workers - constrained execution for isolated tasks.",
  };
  const methodCaste = tryResolveMethodCaste(caste);
  const displayName = formatOperatorCaste(caste);
  const description = methodCaste
    ? descriptions[methodCaste] ?? "Custom caste - no description available."
    : "Custom caste - no description available.";
  const legacyAlias = methodCaste
    ? listCasteCompatibilityRecords().find((record) => record.methodCaste === methodCaste)?.legacyCaste
    : undefined;
  const lines = [`Current Caste: ${displayName}`, "", redactBasicSurfaceText(description)];
  if (legacyAlias && normalizeCasteKey(caste) !== methodCaste) {
    lines.push("", `Compatibility alias: ${redactBasicSurfaceText(legacyAlias)}`);
  }
  return lines.join("\n");
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
  const casteDisplay = formatOperatorCaste(info.caste);
  return [
    "┌─ Session Status ────────────────────────────────────────┐",
    `│  Session:    ${redactBasicSurfaceText(info.sessionId).padEnd(42)}│`,
    `│  Agent:      ${redactBasicSurfaceText(info.agentId).padEnd(42)}│`,
    `│  Caste:      ${casteDisplay.padEnd(42)}│`,
    `│  State:      ${redactBasicSurfaceText(info.state).padEnd(42)}│`,
    `│  Messages:   ${String(info.messageCount).padEnd(42)}│`,
    `│  Iterations: ${String(info.iterations).padEnd(42)}│`,
    `│  Tokens:     ${info.tokensUsed.toLocaleString().padEnd(42)}│`,
    `│  Cost:       $${info.costUsd.toFixed(4).padEnd(41)}│`,
    "└─────────────────────────────────────────────────────────┘",
  ].join("\n");
}

export function formatCaste(caste: string, description?: string): string {
  const displayName = formatOperatorCaste(caste);
  const desc = redactBasicSurfaceText(description ?? `The ${displayName} caste`);
  return [
    `Current Caste: ${displayName}`,
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
  const casteDisplay = formatOperatorCaste(caste);
  const lines = [
    `┌─ Tool Permissions (${casteDisplay}) ${"─".repeat(Math.max(0, 35 - casteDisplay.length))}┐`,
  ];
  if (active.length > 0) {
    lines.push("│  Active tool schemas:");
    for (const tool of active) {
      lines.push(`│    * ${redactBasicSurfaceText(tool)}`);
    }
  } else {
    lines.push("│  Active tool schemas: none.");
  }
  if (allowed.length > 0) {
    lines.push("│  Allowed:");
    for (const tool of allowed) {
      lines.push(`│    + ${redactBasicSurfaceText(tool)}`);
    }
  }
  if (denied.length > 0) {
    lines.push("│  Denied:");
    for (const tool of denied) {
      lines.push(`│    - ${redactBasicSurfaceText(tool)}`);
    }
  }
  if (allowed.length === 0 && denied.length === 0) {
    lines.push("│  Default permissions apply.");
  }
  if (sessionRules.length > 0) {
    lines.push(`│  Exact-signature session rules: ${sessionRules.length}`);
    for (const rule of sessionRules) {
      lines.push(`│    = ${redactBasicSurfaceText(rule)}`);
    }
  } else {
    lines.push("│  Exact-signature session rules: none.");
  }
  lines.push("└─────────────────────────────────────────────────────────┘");
  return lines.join("\n");
}

function formatOperatorCaste(caste: string): string {
  try {
    return redactBasicSurfaceText(casteDisplayName(caste));
  } catch {
    const displayName = redactBasicSurfaceText(caste.trim().toLowerCase())
      .trim()
      .replace(/[-\s]+/g, "_")
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return redactBasicSurfaceText(displayName);
  }
}

function redactBasicSurfaceText(value: string): string {
  return scrubSecrets(value)
    .replace(/(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]");
}

export function buildBudgetCommandPayload(opts: {
  args: string[];
  maxUsd: number | null;
  maxTokens: number | null;
}): GatewayBasicCommandPayload {
  const args = opts.args.filter((arg) => !arg.trim().startsWith("--"));
  if (args.length === 0) {
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

  const cap = Number.parseFloat(args[0] ?? "");
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
