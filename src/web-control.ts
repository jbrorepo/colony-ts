import {
  DaemonAuthPolicy,
  extractBearerToken,
} from "./daemon";

export interface WebControlRequestOptions {
  state: unknown;
  authPolicy?: DaemonAuthPolicy;
  pathPrefix?: string;
  now?: () => string;
  localOnly?: boolean;
  mutation?: {
    enabled?: boolean;
    allowedActions?: string[];
  };
}

export interface WebControlState {
  readOnly: boolean;
  mutationEndpoints: WebControlMutationEndpoint[];
  generatedAt: string;
  daemon?: WebControlDaemonStatus;
  provider?: WebControlProviderStatus;
  workflowRuns: WebControlRunStatus[];
  swarmRuns: WebControlSwarmStatus[];
  channels?: WebControlChannelStatus;
  localActions: string[];
}

export interface WebControlMutationEndpoint {
  path: string;
  method: "POST";
  requiredScope: "web.mutate";
  localOnly: true;
  executesDirectly: false;
}

export interface WebControlDaemonStatus {
  transport?: string;
  endpoint?: string;
  startedAt?: string;
  capabilities: string[];
  auth?: {
    required?: boolean;
    tokenCount?: number;
  };
}

export interface WebControlProviderStatus {
  selected?: string;
  model?: string;
  health?: string;
  candidateCount?: number;
  candidates: WebControlProviderCandidateStatus[];
}

export interface WebControlProviderCandidateStatus {
  provider?: string;
  model?: string;
  health?: string;
}

export interface WebControlRunStatus {
  runId?: string;
  status?: string;
  completedSteps?: number;
  totalSteps?: number;
  artifactCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebControlSwarmStatus {
  runId?: string;
  status?: string;
  workerCount?: number;
  taskCount?: number;
  assignedTaskCount?: number;
  completedTaskCount?: number;
  failedTaskCount?: number;
  cancelledTaskCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebControlChannelStatus {
  enabledCount?: number;
  connectedCount?: number;
  deliveryCount?: number;
  contractCount?: number;
  sessionRouteCount?: number;
}

const DEFAULT_WEB_CONTROL_PATH = "/control";
const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization|credential|signature)/i;
const SECRET_VALUE_PATTERN = /(xoxb-|sk-[a-z0-9_-]+|secret-token|discord-token|telegram-token|bearer\s+[a-z0-9_-]+)/i;
const BODY_KEY_PATTERN = /(transcript|messages?|content|message[_-]?body|tool[_-]?output|raw[_-]?body|content[_-]?body)/i;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#]+/gi;

export async function handleWebControlRequest(
  request: Request,
  options: WebControlRequestOptions,
): Promise<Response> {
  const pathPrefix = normalizePathPrefix(options.pathPrefix ?? DEFAULT_WEB_CONTROL_PATH);
  const url = new URL(request.url);
  const route = routeForPath(url.pathname, pathPrefix);
  if (!route) return jsonResponse({ ok: false, error: "Web control endpoint not found" }, 404);

  if (options.localOnly !== false && !isLocalHost(url.hostname)) {
    return jsonResponse({
      ok: false,
      error: "Web control is local-only by default",
      publicHosting: false,
    }, 403);
  }

  if (route === "action") {
    return handleWebControlActionRequest(request, url, pathPrefix, options);
  }

  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "Web control shell is read-only and only accepts GET" }, 405, {
      allow: "GET",
    });
  }

  const authFailure = authorizeWebControl(request, options.authPolicy);
  if (authFailure) return authFailure;

  const state = serializeWebControlState(options.state, options.now);
  if (options.mutation?.enabled) {
    state.readOnly = false;
    state.mutationEndpoints = [mutationEndpoint(pathPrefix)];
    state.localActions = sanitizeActionList(options.mutation.allowedActions ?? ["resume_swarm", "retry_swarm_stage", "cancel_swarm"]);
  }
  if (route === "state") return jsonResponse(state, 200);
  return htmlResponse(renderWebControlHtml(state), 200);
}

export function serializeWebControlState(
  rawState: unknown,
  now: () => string = () => new Date().toISOString(),
): WebControlState {
  const source = isRecord(rawState) ? rawState : {};
  return {
    readOnly: true,
    mutationEndpoints: [],
    generatedAt: readString(source.generatedAt) ?? now(),
    daemon: projectDaemonStatus(source.daemon),
    provider: projectProviderStatus(source.providers ?? source.provider),
    workflowRuns: Array.isArray(source.workflowRuns)
      ? source.workflowRuns.map((run) => projectWorkflowRunStatus(run))
      : [],
    swarmRuns: Array.isArray(source.swarmRuns)
      ? source.swarmRuns.map((run) => projectSwarmStatus(run))
      : [],
    channels: projectChannelStatus(source.channels),
    localActions: [],
  };
}

async function handleWebControlActionRequest(
  request: Request,
  url: URL,
  pathPrefix: string,
  options: WebControlRequestOptions,
): Promise<Response> {
  if (!options.mutation?.enabled) {
    return jsonResponse({ ok: false, error: "Web control mutation handoff is not enabled" }, 404);
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Web control action handoff only accepts POST" }, 405, {
      allow: "POST",
    });
  }
  if (!isLocalHost(url.hostname)) {
    return jsonResponse({
      ok: false,
      error: "Web control mutation handoff is local-only",
      publicHosting: false,
    }, 403);
  }
  const authFailure = authorizeWebControlMutation(request, options.authPolicy);
  if (authFailure) return authFailure;
  const payload = await readBoundedJson(request);
  if (!payload.ok) {
    return jsonResponse({ ok: false, error: payload.error }, 400);
  }
  const action = typeof payload.body.action === "string" ? sanitizeString(payload.body.action) : "";
  const approved = payload.body.approved === true;
  const allowedActions = options.mutation.allowedActions ?? ["resume_swarm", "retry_swarm_stage", "cancel_swarm"];
  if (!action || !allowedActions.includes(action)) {
    return jsonResponse({ ok: false, error: "Web control action is not allowed" }, 403);
  }
  if (!approved) {
    return jsonResponse({ ok: false, error: "Explicit approval flag is required for web control action handoff" }, 403);
  }
  return jsonResponse({
    ok: true,
    accepted: true,
    executed: false,
    publicHosting: false,
    endpoint: `${pathPrefix}/action`,
    action,
    runId: typeof payload.body.runId === "string" ? sanitizeString(payload.body.runId) : undefined,
    stage: typeof payload.body.stage === "string" ? sanitizeString(payload.body.stage) : undefined,
    execution: "host-mediated",
    boundaries: [
      "The web control shell does not execute mutations directly.",
      "The host runtime must re-check approvals before dispatching this action.",
      "This endpoint is local-only and requires web.mutate scope.",
    ],
  }, 202);
}

function authorizeWebControlMutation(
  request: Request,
  authPolicy?: DaemonAuthPolicy,
): Response | null {
  if (!authPolicy) {
    return jsonResponse({
      ok: false,
      error: "Web control authorization policy is required",
      requiredScope: "web.mutate",
    }, 401);
  }
  const decision = authPolicy.authorize(extractBearerToken(request), "web.mutate");
  if (decision.ok) return null;
  const status = decision.code === "missing_token" ? 401 : 403;
  return jsonResponse({
    ok: false,
    error: decision.message ?? "Web control mutation authorization failed",
    requiredScope: decision.requiredScope,
  }, status);
}

function authorizeWebControl(
  request: Request,
  authPolicy?: DaemonAuthPolicy,
): Response | null {
  if (!authPolicy) {
    return jsonResponse({
      ok: false,
      error: "Web control authorization policy is required",
      requiredScope: "web.read",
    }, 401);
  }
  const decision = authPolicy.authorize(extractBearerToken(request), "web.read");
  if (decision.ok) return null;
  const status = decision.code === "missing_token" ? 401 : 403;
  return jsonResponse({
    ok: false,
    error: decision.message ?? "Web control authorization failed",
    requiredScope: decision.requiredScope,
  }, status);
}

function renderWebControlHtml(state: WebControlState): string {
  const daemon = state.daemon ?? { capabilities: [] };
  const provider = state.provider;
  const channels = state.channels ?? {};
  const workflowRuns = state.workflowRuns;
  const swarmRuns = state.swarmRuns;

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>Colony Local Control</title>",
    "<style>",
    ":root{color-scheme:light dark;font-family:ui-monospace,Menlo,Consolas,monospace;background:#101714;color:#e4f5df}",
    "body{margin:0;padding:28px;background:radial-gradient(circle at top left,#274534,#101714 48%,#070b09)}",
    "main{max-width:1080px;margin:0 auto;display:grid;gap:16px}",
    "section{border:1px solid #3d604e;background:rgba(9,18,13,.82);border-radius:16px;padding:16px;box-shadow:0 18px 44px rgba(0,0,0,.28)}",
    "h1,h2{margin:0 0 10px} .badge{display:inline-block;border:1px solid #8ecf9d;border-radius:999px;padding:4px 10px;color:#b8ffc6}",
    "ul{margin:8px 0 0;padding-left:20px} code{color:#cdeccf}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<header>",
    "<h1>Colony Local Control</h1>",
    "<p>Colony Control Shell</p>",
    `<p class=\"badge\">${state.readOnly ? "Read-only" : "Local action handoff enabled"}</p>`,
    state.mutationEndpoints.length === 0
      ? "<p>No remote mutation endpoints are exposed by this shell.</p>"
      : "<p>Mutation handoffs are local-only, scoped, and host-mediated.</p>",
    "</header>",
    sectionHtml("Daemon", [
      `Transport: ${escapeHtml(readString(daemon.transport) ?? "unknown")}`,
      `Endpoint: ${escapeHtml(readString(daemon.endpoint) ?? "not configured")}`,
      `Capabilities: ${escapeHtml(readStringArray(daemon.capabilities).join(", ") || "none")}`,
    ]),
    sectionHtml("Provider", provider
      ? [
          `Selected: ${escapeHtml(provider.selected ?? "unknown")}`,
          `Model: ${escapeHtml(provider.model ?? "unknown")}`,
          `Health: ${escapeHtml(provider.health ?? "unknown")}`,
          `Candidates: ${escapeHtml(String(provider.candidateCount ?? provider.candidates.length))}`,
        ]
      : ["No provider status visible."]),
    sectionHtml("Workflow", workflowRuns.length > 0
      ? workflowRuns.map((run) => `${escapeHtml(run.runId ?? "workflow")} | ${escapeHtml(run.status ?? "unknown")} | steps ${escapeHtml(formatProgress(run.completedSteps, run.totalSteps))} | artifacts ${escapeHtml(String(run.artifactCount ?? 0))}`)
      : ["No workflow runs visible."]),
    sectionHtml("Swarm", swarmRuns.length > 0
      ? swarmRuns.map((run) => `${escapeHtml(run.runId ?? "swarm")} | ${escapeHtml(run.status ?? "unknown")} | workers ${escapeHtml(String(run.workerCount ?? 0))}`)
      : ["No swarm runs visible."]),
    sectionHtml("Channels", [
      `Configured: ${escapeHtml(String(channels.enabledCount ?? 0))} enabled, ${escapeHtml(String(channels.connectedCount ?? 0))} connected`,
      `Deliveries: ${escapeHtml(String(channels.deliveryCount ?? 0))}`,
      `Contracts: ${escapeHtml(String(channels.contractCount ?? 0))}`,
      `Session routes: ${escapeHtml(String(channels.sessionRouteCount ?? 0))}`,
    ]),
    state.readOnly ? "" : actionControlsHtml(state.localActions, state.mutationEndpoints[0]?.path ?? "/control/action"),
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

function projectDaemonStatus(value: unknown): WebControlDaemonStatus | undefined {
  if (!isRecord(value)) return undefined;
  const auth = isRecord(value.auth)
    ? {
        required: readBoolean(value.auth.required) ?? undefined,
        tokenCount: readNumber(value.auth.tokenCount) ?? undefined,
      }
    : undefined;
  return {
    transport: sanitizeStatusString(readString(value.transport)),
    endpoint: sanitizeStatusString(readString(value.endpoint)),
    startedAt: sanitizeStatusString(readString(value.startedAt)),
    capabilities: readStringArray(value.capabilities).map((entry) => sanitizeString(entry)),
    auth,
  };
}

function projectProviderStatus(value: unknown): WebControlProviderStatus | undefined {
  if (!isRecord(value)) return undefined;
  const candidates = Array.isArray(value.candidates)
    ? value.candidates.map((candidate) => projectProviderCandidateStatus(candidate))
    : [];
  return {
    selected: sanitizeStatusString(readString(value.selected ?? value.provider)),
    model: sanitizeStatusString(readString(value.model ?? value.selectedModel)),
    health: sanitizeStatusString(readString(value.health ?? value.status)),
    candidateCount: readNumber(value.candidateCount) ?? candidates.length,
    candidates,
  };
}

function projectProviderCandidateStatus(value: unknown): WebControlProviderCandidateStatus {
  const candidate = isRecord(value) ? value : {};
  return {
    provider: sanitizeStatusString(readString(candidate.provider ?? candidate.name)),
    model: sanitizeStatusString(readString(candidate.model)),
    health: sanitizeStatusString(readString(candidate.health ?? candidate.status)),
  };
}

function projectWorkflowRunStatus(value: unknown): WebControlRunStatus {
  const run = isRecord(value) ? value : {};
  return {
    runId: sanitizeStatusString(readString(run.runId)),
    status: sanitizeStatusString(readString(run.status)),
    completedSteps: readNumber(run.completedSteps) ?? undefined,
    totalSteps: readNumber(run.totalSteps) ?? undefined,
    artifactCount: readNumber(run.artifactCount) ?? undefined,
    createdAt: sanitizeStatusString(readString(run.createdAt)),
    updatedAt: sanitizeStatusString(readString(run.updatedAt)),
  };
}

function projectSwarmStatus(value: unknown): WebControlSwarmStatus {
  const run = isRecord(value) ? value : {};
  return {
    runId: sanitizeStatusString(readString(run.runId)),
    status: sanitizeStatusString(readString(run.status)),
    workerCount: readNumber(run.workerCount) ?? undefined,
    taskCount: readNumber(run.taskCount) ?? undefined,
    assignedTaskCount: readNumber(run.assignedTaskCount) ?? undefined,
    completedTaskCount: readNumber(run.completedTaskCount) ?? undefined,
    failedTaskCount: readNumber(run.failedTaskCount) ?? undefined,
    cancelledTaskCount: readNumber(run.cancelledTaskCount) ?? undefined,
    createdAt: sanitizeStatusString(readString(run.createdAt)),
    updatedAt: sanitizeStatusString(readString(run.updatedAt)),
  };
}

function projectChannelStatus(value: unknown): WebControlChannelStatus | undefined {
  if (!isRecord(value)) return undefined;
  const status = isRecord(value.status) ? value.status : {};
  return {
    enabledCount: readNumber(status.enabledCount) ?? undefined,
    connectedCount: readNumber(status.connectedCount) ?? undefined,
    deliveryCount: readNumber(status.deliveryCount) ?? undefined,
    contractCount: readNumber(value.contractCount) ?? undefined,
    sessionRouteCount: readNumber(value.sessionRouteCount) ?? undefined,
  };
}

function formatProgress(done: number | undefined, total: number | undefined): string {
  return `${done ?? 0}/${total ?? 0}`;
}

function sectionHtml(title: string, rows: string[]): string {
  return `<section><h2>${escapeHtml(title)}</h2><ul>${rows.map((row) => `<li>${row}</li>`).join("")}</ul></section>`;
}

function actionControlsHtml(actions: string[], endpoint: string): string {
  if (actions.length === 0) return "";
  return `<section><h2>Local Actions</h2><div>${actions.map((action) => (
    `<form method=\"post\" action=\"${escapeHtml(endpoint)}\" data-action=\"${escapeHtml(action)}\"><input type=\"hidden\" name=\"action\" value=\"${escapeHtml(action)}\"><button type=\"submit\">${escapeHtml(action)}</button></form>`
  )).join("")}</div></section>`;
}

function routeForPath(pathname: string, pathPrefix: string): "shell" | "state" | "action" | null {
  if (pathname === pathPrefix || pathname === `${pathPrefix}/`) return "shell";
  if (pathname === `${pathPrefix}/state`) return "state";
  if (pathname === `${pathPrefix}/action`) return "action";
  return null;
}

function mutationEndpoint(pathPrefix: string): WebControlMutationEndpoint {
  return {
    path: `${pathPrefix}/action`,
    method: "POST",
    requiredScope: "web.mutate",
    localOnly: true,
    executesDirectly: false,
  };
}

function sanitizeActionList(actions: string[]): string[] {
  return actions
    .map((action) => sanitizeString(action.trim()))
    .filter((action) => action.length > 0 && /^[a-z0-9_:-]{1,64}$/i.test(action));
}

async function readBoundedJson(request: Request): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const text = await request.text();
  if (text.length > 4_096) return { ok: false, error: "Web control action body is too large" };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return { ok: false, error: "Web control action body must be a JSON object" };
    return { ok: true, body: sanitizeValue(parsed) as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Web control action body must be valid JSON" };
  }
}

function isLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower === "[::1]";
}

function normalizePathPrefix(path: string): string {
  const trimmed = path.trim() || DEFAULT_WEB_CONTROL_PATH;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.endsWith("/") && withSlash.length > 1 ? withSlash.slice(0, -1) : withSlash;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[REDACTED]";
  if (value === null || value === undefined || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[REDACTED]";
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, depth + 1));
  if (!isRecord(value)) return "[REDACTED]";
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) || BODY_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = sanitizeValue(entry, depth + 1);
    }
  }
  return out;
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeString(value: string): string {
  const queryRedacted = value.replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]");
  return SECRET_VALUE_PATTERN.test(queryRedacted) ? "[REDACTED]" : queryRedacted;
}

function sanitizeStatusString(value: string | null): string | undefined {
  return value === null ? undefined : sanitizeString(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
