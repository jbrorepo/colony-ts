import type { GatewayBasicCommandPayload } from "./gateway-basic";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayDaemonAuthTokenView {
  label?: string;
  scopes?: string[];
  expiresAt?: string;
  expired?: boolean;
}

export interface GatewayDaemonAuthView {
  required?: boolean;
  tokenCount?: number;
  tokens?: GatewayDaemonAuthTokenView[];
}

export interface GatewayDaemonSessionView {
  sessionId?: string;
  agentId?: string;
  caste?: string;
  tenantScope?: string;
  state?: string;
  messageCount?: number;
}

export interface GatewayDaemonContext {
  endpoint?: string;
  transport?: string;
  startedAt?: string;
  capabilities?: string[];
  auth?: GatewayDaemonAuthView | null;
  sessions?: GatewayDaemonSessionView[];
  lastAuthFailure?: {
    code?: string;
    requiredScope?: string;
    message?: string;
  } | null;
}

export function buildDaemonCommandPayload(
  args: string[],
  daemon?: GatewayDaemonContext | null,
): GatewayBasicCommandPayload {
  const normalizedArgs = normalizeDaemonViewArgs(args);
  const view = normalizeDaemonViewInput(normalizedArgs[0] ?? "overview");
  if (normalizedArgs.length > 1) {
    return {
      output: "Usage: /daemon [status|auth|sessions]",
      isError: true,
      data: { action: "daemon_usage" },
    };
  }
  if (!["overview", "status", "auth", "sessions"].includes(view)) {
    return {
      output: `Unknown daemon view '${view}'.\n\nUsage: /daemon [status|auth|sessions]`,
      isError: true,
      data: { action: "daemon_usage" },
    };
  }

  const context = daemon ?? {};
  if (view === "auth") {
    return {
      output: renderDaemonAuthView(context),
      data: { action: "daemon_auth" },
    };
  }

  if (view === "sessions") {
    return {
      output: renderDaemonSessionsView(context),
      data: { action: "daemon_sessions" },
    };
  }

  return {
    output: renderDaemonOverview(context),
    data: { action: "daemon_status" },
  };
}

function renderDaemonOverview(context: GatewayDaemonContext): string {
  const auth = context.auth;
  const lines = ["Daemon Control Plane:", ""];
  lines.push(`Endpoint: ${redactDaemonSurfaceText(context.endpoint ?? "not configured")}`);
  lines.push(`Transport: ${redactDaemonSurfaceText(context.transport ?? "unknown")}`);
  if (context.startedAt) lines.push(`Started: ${redactDaemonSurfaceText(context.startedAt)}`);
  lines.push(`Capabilities: ${formatList(context.capabilities)}`);
  lines.push(`Auth: ${auth?.required ? "required" : "not configured"}`);
  lines.push(`Tokens: ${auth?.tokenCount ?? auth?.tokens?.length ?? 0}`);
  lines.push(`Sessions: ${context.sessions?.length ?? 0}`);
  lines.push("");
  lines.push("Views: /daemon status | /daemon auth | /daemon sessions");
  return lines.join("\n");
}

function renderDaemonAuthView(context: GatewayDaemonContext): string {
  const auth = context.auth;
  const lines = ["Daemon Auth:", ""];
  lines.push(`Required: ${auth?.required ? "yes" : "no"}`);
  lines.push(`Tokens: ${auth?.tokenCount ?? auth?.tokens?.length ?? 0}`);

  const tokens = auth?.tokens ?? [];
  if (tokens.length === 0) {
    lines.push("No scoped tokens configured in this runtime snapshot.");
  } else {
    for (const token of tokens) {
      const expiry = token.expiresAt ? ` | expires ${redactDaemonSurfaceText(token.expiresAt)}${token.expired ? " (expired)" : ""}` : "";
      lines.push(`- ${redactDaemonSurfaceText(token.label ?? "unnamed")} | scopes ${formatList(token.scopes)}${expiry}`);
    }
  }

  if (context.lastAuthFailure) {
    const required = context.lastAuthFailure.requiredScope ? ` | required ${redactDaemonSurfaceText(context.lastAuthFailure.requiredScope)}` : "";
    lines.push(`Last auth failure: ${redactDaemonSurfaceText(context.lastAuthFailure.code ?? "unknown")}${required}`);
    if (context.lastAuthFailure.message) lines.push(`Reason: ${redactDaemonSurfaceText(context.lastAuthFailure.message)}`);
  }

  lines.push("");
  lines.push("Inspect: /daemon | /daemon sessions");
  return lines.join("\n");
}

function renderDaemonSessionsView(context: GatewayDaemonContext): string {
  const sessions = context.sessions ?? [];
  const lines = ["Daemon Sessions:", ""];
  if (sessions.length === 0) {
    lines.push("No remote sessions are visible in this runtime snapshot.");
  } else {
    for (const session of sessions) {
      lines.push(
        [
          session.sessionId ?? "unknown-session",
          session.state ?? "unknown",
          session.caste ?? "unknown-caste",
          session.tenantScope ?? "default",
          `${session.messageCount ?? 0} messages`,
          session.agentId ?? "unknown-agent",
        ].map(redactDaemonSurfaceText).join(" | "),
      );
    }
  }
  lines.push("");
  lines.push("Inspect: /daemon | /daemon auth");
  return lines.join("\n");
}

function formatList(values?: string[]): string {
  return values && values.length > 0 ? values.map(redactDaemonSurfaceText).join(", ") : "none";
}

function redactDaemonSurfaceText(value: string): string {
  return scrubSecrets(value)
    .replace(/(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]");
}

function normalizeDaemonViewArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

function normalizeDaemonViewInput(value: string): string {
  const redacted = scrubSecrets(value.trim())
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}
