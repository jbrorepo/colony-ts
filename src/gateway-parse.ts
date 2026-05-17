export type CommandType =
  | "swarm"
  | "sessions"
  | "history"
  | "artifact"
  | "budget"
  | "model"
  | "memory"
  | "perf"
  | "tools"
  | "events"
  | "workflow"
  | "daemon"
  | "channels"
  | "browser"
  | "skills"
  | "capabilities"
  | "cancel"
  | "clear"
  | "compact"
  | "help"
  | "status"
  | "cost"
  | "caste"
  | "permissions"
  | "resume"
  | "hooks"
  | "doctor"
  | "workspace"
  | "provider"
  | "exit"
  | "quit"
  | "chat";

export interface CommandIntent {
  type: CommandType;
  args: string[];
  raw: string;
}

export function shellSplit(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === "\\" && quote === null) {
      escaping = true;
      continue;
    }

    if ((ch === "'" || ch === '"') && quote === null) {
      quote = ch;
      continue;
    }

    if (ch === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(ch) && quote === null) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (quote !== null) return input.split(/\s+/).filter(Boolean);
  if (escaping) current += "\\";
  if (current) parts.push(current);
  return parts;
}

export function parseCommand(input: string): CommandIntent {
  const trimmed = input.trim();
  const raw = trimmed;

  if (!trimmed.startsWith("/")) {
    return { type: "chat", args: [trimmed], raw };
  }

  const parts = shellSplit(trimmed);
  const commandToken = parts[0] ?? "";
  const command = (commandToken.startsWith("/") ? commandToken.slice(1) : commandToken).toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case "swarm":
    case "hive":
      return { type: "swarm", args, raw };
    case "budget":
      return { type: "budget", args, raw };
    case "tools":
      return { type: "tools", args, raw };
    case "memory":
      return { type: "memory", args, raw };
    case "events":
      return { type: "events", args, raw };
    case "workflow":
    case "workflows":
      return { type: "workflow", args, raw };
    case "daemon":
      return { type: "daemon", args, raw };
    case "channels":
    case "channel":
      return { type: "channels", args, raw };
    case "browser":
      return { type: "browser", args, raw };
    case "skills":
    case "skill":
      return { type: "skills", args, raw };
    case "capabilities":
    case "capability":
      return { type: "capabilities", args, raw };
    case "cancel":
      return { type: "cancel", args, raw };
    case "sessions":
      return { type: "sessions", args, raw };
    case "history":
    case "transcript":
      return { type: "history", args, raw };
    case "artifact":
      return { type: "artifact", args, raw };
    case "clear":
      return { type: "clear", args, raw };
    case "compact":
      return { type: "compact", args, raw };
    case "help":
    case "?":
      return { type: "help", args, raw };
    case "status":
      return { type: "status", args, raw };
    case "cost":
      return { type: "cost", args, raw };
    case "caste":
      return { type: "caste", args, raw };
    case "permissions":
    case "perms":
      return { type: "permissions", args, raw };
    case "resume":
      return { type: "resume", args, raw };
    case "hooks":
      return { type: "hooks", args, raw };
    case "doctor":
    case "diag":
      return { type: "doctor", args, raw };
    case "workspace":
    case "ws":
      return { type: "workspace", args, raw };
    case "provider":
      return { type: "provider", args, raw };
    case "model":
      return { type: "model", args, raw };
    case "perf":
      return { type: "perf", args, raw };
    case "exit":
    case "quit":
      return { type: "exit", args, raw };
    default:
      return { type: "chat", args: [trimmed], raw };
  }
}
