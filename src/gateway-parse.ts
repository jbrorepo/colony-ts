export type CommandType =
  | "swarm"
  | "sessions"
  | "history"
  | "artifact"
  | "budget"
  | "model"
  | "perf"
  | "tools"
  | "events"
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

  const parts = trimmed.slice(1).split(/\s+/);
  const command = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case "swarm":
    case "hive":
      return { type: "swarm", args, raw };
    case "budget":
      return { type: "budget", args, raw };
    case "tools":
      return { type: "tools", args, raw };
    case "events":
      return { type: "events", args, raw };
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
