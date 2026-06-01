/**
 * Colony Daemon — Local Web UI & REST API v1
 *
 * Provides a lightweight browser-accessible dashboard and a documented REST
 * API served on the same port as the control-plane API.  No separate build
 * step is required; the HTML/CSS/JS is embedded as a template literal.
 *
 * Routes:
 *   GET  /                         → HTML dashboard (always served, no auth)
 *   GET  /api/v1/health            → daemon health + capabilities
 *   GET  /api/v1/sessions          → list all sessions
 *   POST /api/v1/sessions          → create a session
 *   GET  /api/v1/sessions/:id      → inspect a session
 *   DELETE /api/v1/sessions/:id    → close a session
 *   GET  /api/v1/sessions/:id/events → SSE stream (subscribe to session events)
 *   GET  /api/v1/swarm/runs        → list swarm runs (live + persisted)
 *   POST /api/v1/swarm/runs        → start a swarm run (detached by default)
 *   GET  /api/v1/swarm/runs/:id    → inspect a swarm run
 *   POST /api/v1/swarm/runs/:id/cancel → cancel an in-flight run
 *   POST /api/v1/diffs/preview     → render a unified diff (oldText/newText → hunks)
 *   GET  /api/v1/mcp/servers       → list registered MCP servers
 *   POST /api/v1/mcp/servers       → add/upsert an MCP server
 *   GET  /api/v1/mcp/servers/:id   → inspect one MCP server
 *   DELETE /api/v1/mcp/servers/:id → remove an MCP server
 *   POST /api/v1/mcp/servers/:id/trust   → grant trust
 *   DELETE /api/v1/mcp/servers/:id/trust → revoke trust
 *
 * Auth (when authPolicy is provided):
 *   GET routes → require `web.read` scope
 *   POST / DELETE routes → require `web.mutate` scope
 *   GET / and /index.html → always served (browser loads the dashboard first)
 *
 * The existing POST /api/daemon control-plane endpoint is handled by
 * http-transport.ts and is NOT touched by this module.
 */

import type { DaemonControlPlaneHost } from "./control-plane";
import { type DaemonAuthPolicy, extractBearerToken } from "./auth";
import { generateUnifiedDiff } from "../diff/unified-diff";

export interface WebUIHandlerOptions {
  /**
   * When provided, GET /api/v1/* REST endpoints require the bearer token to
   * hold the `web.read` scope.  The HTML dashboard (GET /) is always served
   * without auth so the browser can load the page; auth errors then appear
   * in the dashboard's API responses.
   */
  authPolicy?: DaemonAuthPolicy;
}

// ---------------------------------------------------------------------------
// REST handlers — read
// ---------------------------------------------------------------------------

async function handleHealthRequest(
  host: DaemonControlPlaneHost,
): Promise<Response> {
  const result = await host.handle({ type: "describe", requestId: "web_health" });
  return jsonResponse({
    ok: result.ok,
    startedAt: result.startedAt ?? null,
    capabilities: result.capabilities ?? [],
  });
}

async function handleListSessionsRequest(
  host: DaemonControlPlaneHost,
): Promise<Response> {
  const result = await host.handle({ type: "list_sessions", requestId: "web_sessions" });
  return jsonResponse({
    ok: result.ok,
    sessions: result.sessions ?? [],
    error: result.error,
  });
}

async function handleInspectSessionRequest(
  host: DaemonControlPlaneHost,
  sessionId: string,
): Promise<Response> {
  const result = await host.handle({
    type: "inspect_session",
    requestId: "web_inspect_session",
    sessionId,
  });
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 404);
  }
  return jsonResponse({ ok: true, session: result.session });
}

// ---------------------------------------------------------------------------
// REST handlers — write
// ---------------------------------------------------------------------------

async function handleCreateSessionRequest(
  host: DaemonControlPlaneHost,
  request: Request,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const agentId = String(body.agentId ?? "").trim();
  const caste = String(body.caste ?? "").trim();
  if (!agentId) return jsonResponse({ ok: false, error: "agentId is required" }, 400);
  if (!caste) return jsonResponse({ ok: false, error: "caste is required" }, 400);

  const result = await host.handle({
    type: "create_session",
    requestId: "web_create_session",
    agentId,
    caste,
    tenantScope: body.tenantScope ? String(body.tenantScope) : undefined,
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : undefined,
  });

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400);
  }
  return jsonResponse({ ok: true, session: result.session }, 201);
}

async function handleCloseSessionRequest(
  host: DaemonControlPlaneHost,
  sessionId: string,
): Promise<Response> {
  const result = await host.handle({
    type: "close_session",
    requestId: "web_close_session",
    sessionId,
  });
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 404);
  }
  return jsonResponse({ ok: true, session: result.session });
}

// ---------------------------------------------------------------------------
// REST handlers — swarm runs (C3: async detached mode)
// ---------------------------------------------------------------------------

function handleListSwarmRunsRequest(host: DaemonControlPlaneHost): Response {
  const runtime = host.swarmRuntime;
  if (!runtime) {
    return jsonResponse({ ok: false, error: "Swarm runtime not configured" }, 503);
  }
  return jsonResponse({ ok: true, runs: runtime.listRuns() });
}

function handleInspectSwarmRunRequest(
  host: DaemonControlPlaneHost,
  runId: string,
): Response {
  const runtime = host.swarmRuntime;
  if (!runtime) {
    return jsonResponse({ ok: false, error: "Swarm runtime not configured" }, 503);
  }
  const snapshot = runtime.inspectRun(runId);
  if (!snapshot) {
    return jsonResponse({ ok: false, error: `Swarm run not found: ${runId}` }, 404);
  }
  return jsonResponse({ ok: true, run: snapshot });
}

async function handleStartSwarmRunRequest(
  host: DaemonControlPlaneHost,
  request: Request,
): Promise<Response> {
  const runtime = host.swarmRuntime;
  if (!runtime) {
    return jsonResponse({ ok: false, error: "Swarm runtime not configured" }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  if (!objective) {
    return jsonResponse({ ok: false, error: "objective is required" }, 400);
  }

  // Default to detached=true for the REST surface — clients that want the
  // blocking contract can pass `detached: false` explicitly. This matches
  // the Devin/Cognition mental model: "submit a task, poll for status."
  const detached = body.detached !== false;

  const executionMode = body.executionMode === "coordinator_only" ? "coordinator_only" : "llm";
  const title = typeof body.title === "string" ? body.title : undefined;
  const requiredApprover = typeof body.requiredApprover === "string" ? body.requiredApprover : undefined;
  const approvalRequired = body.approvalRequired === true;
  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  try {
    const snapshot = await runtime.startObjective({
      objective,
      title,
      executionMode,
      detached,
      approvalRequired,
      requiredApprover,
      metadata,
    });
    return jsonResponse({ ok: true, run: snapshot, detached }, 202);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}

async function handleCancelSwarmRunRequest(
  host: DaemonControlPlaneHost,
  runId: string,
  request: Request,
): Promise<Response> {
  const runtime = host.swarmRuntime;
  if (!runtime) {
    return jsonResponse({ ok: false, error: "Swarm runtime not configured" }, 503);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body is acceptable for cancel
  }
  const reason = typeof body.reason === "string" ? body.reason : "Cancelled via REST API";

  const snapshot = await runtime.cancelRun(runId, reason);
  if (!snapshot) {
    return jsonResponse({ ok: false, error: `Swarm run not found: ${runId}` }, 404);
  }
  return jsonResponse({ ok: true, run: snapshot });
}

// ---------------------------------------------------------------------------
// REST handlers — MCP server registry (C6)
// ---------------------------------------------------------------------------

function handleListMcpServersRequest(host: DaemonControlPlaneHost): Response {
  const registry = host.mcpServerRegistry;
  if (!registry) {
    return jsonResponse({ ok: false, error: "MCP server registry not configured" }, 503);
  }
  return jsonResponse({ ok: true, ...registry.snapshot() });
}

function handleInspectMcpServerRequest(
  host: DaemonControlPlaneHost,
  serverId: string,
): Response {
  const registry = host.mcpServerRegistry;
  if (!registry) {
    return jsonResponse({ ok: false, error: "MCP server registry not configured" }, 503);
  }
  const entry = registry.get(serverId);
  if (!entry) {
    return jsonResponse({ ok: false, error: `MCP server not found: ${serverId}` }, 404);
  }
  return jsonResponse({ ok: true, server: entry });
}

async function handleAddMcpServerRequest(
  host: DaemonControlPlaneHost,
  request: Request,
): Promise<Response> {
  const registry = host.mcpServerRegistry;
  if (!registry) {
    return jsonResponse({ ok: false, error: "MCP server registry not configured" }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const kind = body.kind === "stdio" ? "stdio" : "http";
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const description = typeof body.description === "string" ? body.description : "";
  const allowedTools = Array.isArray(body.allowedTools)
    ? body.allowedTools.filter((t): t is string => typeof t === "string")
    : [];
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : [];
  const trusted = body.trusted === true;
  const replace = body.replace === true;

  try {
    const entry = await registry.upsert(
      { id, kind, endpoint, description, allowedTools, tags, trusted },
      { replace },
    );
    return jsonResponse({ ok: true, server: entry }, 201);
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
}

async function handleRemoveMcpServerRequest(
  host: DaemonControlPlaneHost,
  serverId: string,
): Promise<Response> {
  const registry = host.mcpServerRegistry;
  if (!registry) {
    return jsonResponse({ ok: false, error: "MCP server registry not configured" }, 503);
  }
  const removed = await registry.remove(serverId);
  if (!removed) {
    return jsonResponse({ ok: false, error: `MCP server not found: ${serverId}` }, 404);
  }
  return jsonResponse({ ok: true, removed: true, serverId });
}

async function handleTrustMcpServerRequest(
  host: DaemonControlPlaneHost,
  serverId: string,
  trusted: boolean,
): Promise<Response> {
  const registry = host.mcpServerRegistry;
  if (!registry) {
    return jsonResponse({ ok: false, error: "MCP server registry not configured" }, 503);
  }
  const entry = await registry.setTrust(serverId, trusted);
  if (!entry) {
    return jsonResponse({ ok: false, error: `MCP server not found: ${serverId}` }, 404);
  }
  return jsonResponse({ ok: true, server: entry });
}

// ---------------------------------------------------------------------------
// REST handlers — diff preview (C5)
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/diffs/preview
 *
 * Accepts `{ oldText, newText, filename?, contextLines? }` and returns a
 * structured UnifiedDiff. Used by the web dashboard's inline-diff component
 * and by external integrations that want to render diffs in their own UI
 * without re-implementing the algorithm.
 */
async function handleDiffPreviewRequest(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const oldText = typeof body.oldText === "string" ? body.oldText : "";
  const newText = typeof body.newText === "string" ? body.newText : "";
  const filename = typeof body.filename === "string" ? body.filename : "file";
  const contextLines =
    typeof body.contextLines === "number" && body.contextLines >= 0
      ? Math.min(20, Math.floor(body.contextLines))
      : 3;

  try {
    const diff = generateUnifiedDiff(oldText, newText, { filename, contextLines });
    return jsonResponse({ ok: true, diff });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
}

// ---------------------------------------------------------------------------
// SSE — session event stream
// ---------------------------------------------------------------------------

/**
 * Stubbed SSE endpoint — sends a single "connected" event then holds the
 * connection open.  Full event streaming requires integration with the
 * AgentLoop runtime (P3-2 follow-up work).
 */
function handleSessionEventsRequest(sessionId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      send("connected", { sessionId, timestamp: new Date().toISOString() });
      // Stream stays open until client disconnects or server shuts down.
      // Future: pipe AgentLoop events here.
    },
    cancel() {
      // Client disconnected — nothing to clean up in the stub.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function authorizeWebRequest(
  request: Request,
  authPolicy: DaemonAuthPolicy,
  scope: "web.read" | "web.mutate",
): Response | null {
  const token = extractBearerToken(request);
  const decision = authPolicy.authorize(token, scope);
  if (decision.ok) return null;

  const status = decision.code === "missing_token" ? 401 : 403;
  return new Response(
    JSON.stringify({ ok: false, error: decision.message }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(status === 401 ? { "www-authenticate": 'Bearer realm="colony-daemon"' } : {}),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Path matching helpers
// ---------------------------------------------------------------------------

/** Match /api/v1/mcp/servers/:id/trust → returns id or null */
function matchMcpServerTrust(path: string): string | null {
  const match = /^\/api\/v1\/mcp\/servers\/([A-Za-z0-9._-]+)\/trust$/.exec(path);
  return match ? match[1] : null;
}

/** Match /api/v1/mcp/servers/:id → returns id or null */
function matchMcpServerId(path: string): string | null {
  const match = /^\/api\/v1\/mcp\/servers\/([A-Za-z0-9._-]+)$/.exec(path);
  return match ? match[1] : null;
}

/** Match /api/v1/swarm/runs/:id  →  returns id or null */
function matchSwarmRunId(path: string): string | null {
  const match = /^\/api\/v1\/swarm\/runs\/([A-Za-z0-9_-]+)$/.exec(path);
  return match ? match[1] : null;
}

/** Match /api/v1/swarm/runs/:id/cancel  →  returns id or null */
function matchSwarmRunCancel(path: string): string | null {
  const match = /^\/api\/v1\/swarm\/runs\/([A-Za-z0-9_-]+)\/cancel$/.exec(path);
  return match ? match[1] : null;
}

/** Match /api/v1/sessions/:id  →  returns id or null */
function matchSessionId(path: string): string | null {
  const match = /^\/api\/v1\/sessions\/([^/]+)$/.exec(path);
  return match?.[1] ?? null;
}

/** Match /api/v1/sessions/:id/events */
function matchSessionEvents(path: string): string | null {
  const match = /^\/api\/v1\/sessions\/([^/]+)\/events$/.exec(path);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Main request dispatcher
// ---------------------------------------------------------------------------

/**
 * Attempt to handle `request` as a web-UI or REST v1 request.
 * Returns `null` if the path is not a web-UI route — the caller falls through
 * to the daemon control-plane handler.
 *
 * Auth behaviour (when `options.authPolicy` is set):
 * - `GET /` and `/index.html` — always served (browser loads the dashboard)
 * - `GET /api/v1/*` — requires `web.read` scope
 * - `POST /api/v1/*` and `DELETE /api/v1/*` — requires `web.mutate` scope
 */
export async function handleWebUIRequest(
  host: DaemonControlPlaneHost,
  request: Request,
  options: WebUIHandlerOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname: path, } = url;
  const method = request.method.toUpperCase();

  // ── Dashboard HTML — always served, no auth ──────────────────────────────
  if (method === "GET" && (path === "/" || path === "/index.html")) {
    return htmlResponse(buildDashboardHtml());
  }

  // ── REST API v1 — only handle paths under /api/v1/ ───────────────────────
  if (!path.startsWith("/api/v1/")) return null;

  // Auth: read scope for GET, mutate scope for write methods
  if (options.authPolicy) {
    const requiredScope = method === "GET" ? "web.read" : "web.mutate";
    const authError = authorizeWebRequest(request, options.authPolicy, requiredScope);
    if (authError) return authError;
  }

  // GET /api/v1/health
  if (method === "GET" && path === "/api/v1/health") {
    return handleHealthRequest(host);
  }

  // GET /api/v1/sessions
  if (method === "GET" && path === "/api/v1/sessions") {
    return handleListSessionsRequest(host);
  }

  // POST /api/v1/sessions
  if (method === "POST" && path === "/api/v1/sessions") {
    return handleCreateSessionRequest(host, request);
  }

  // /api/v1/sessions/:id/events
  const eventsSessionId = matchSessionEvents(path);
  if (eventsSessionId !== null) {
    if (method === "GET") return handleSessionEventsRequest(eventsSessionId);
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // /api/v1/sessions/:id
  const singleSessionId = matchSessionId(path);
  if (singleSessionId !== null) {
    if (method === "GET") return handleInspectSessionRequest(host, singleSessionId);
    if (method === "DELETE") return handleCloseSessionRequest(host, singleSessionId);
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // ── Diff preview (C5) ───────────────────────────────────────────────────
  if (method === "POST" && path === "/api/v1/diffs/preview") {
    return handleDiffPreviewRequest(request);
  }

  // ── MCP server registry (C6) ────────────────────────────────────────────
  if (method === "GET" && path === "/api/v1/mcp/servers") {
    return handleListMcpServersRequest(host);
  }
  if (method === "POST" && path === "/api/v1/mcp/servers") {
    return handleAddMcpServerRequest(host, request);
  }
  const mcpTrustId = matchMcpServerTrust(path);
  if (mcpTrustId !== null) {
    if (method === "POST") return handleTrustMcpServerRequest(host, mcpTrustId, true);
    if (method === "DELETE") return handleTrustMcpServerRequest(host, mcpTrustId, false);
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }
  const mcpServerId = matchMcpServerId(path);
  if (mcpServerId !== null) {
    if (method === "GET") return handleInspectMcpServerRequest(host, mcpServerId);
    if (method === "DELETE") return handleRemoveMcpServerRequest(host, mcpServerId);
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // ── Swarm runs (C3) ─────────────────────────────────────────────────────
  // GET /api/v1/swarm/runs
  if (method === "GET" && path === "/api/v1/swarm/runs") {
    return handleListSwarmRunsRequest(host);
  }
  // POST /api/v1/swarm/runs
  if (method === "POST" && path === "/api/v1/swarm/runs") {
    return handleStartSwarmRunRequest(host, request);
  }
  // POST /api/v1/swarm/runs/:id/cancel
  const cancelRunId = matchSwarmRunCancel(path);
  if (cancelRunId !== null) {
    if (method === "POST") return handleCancelSwarmRunRequest(host, cancelRunId, request);
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }
  // GET /api/v1/swarm/runs/:id
  const singleRunId = matchSwarmRunId(path);
  if (singleRunId !== null) {
    if (method === "GET") return handleInspectSwarmRunRequest(host, singleRunId);
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // Unknown /api/v1/* path
  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard HTML (self-contained, no external dependencies)
// ---------------------------------------------------------------------------

function buildDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>The Colony — Daemon Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d0f14;
      --surface: #161a22;
      --border: #2a2f3d;
      --accent: #4ade80;
      --accent-dim: #166534;
      --text: #e2e8f0;
      --text-muted: #64748b;
      --error: #f87171;
      --warning: #fbbf24;
      --radius: 8px;
      --font: 'Courier New', Courier, monospace;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.6;
      min-height: 100vh;
    }

    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    header .logo {
      font-size: 20px;
      font-weight: bold;
      color: var(--accent);
      letter-spacing: 2px;
    }

    header .subtitle {
      color: var(--text-muted);
      font-size: 12px;
    }

    header .refresh-btn {
      margin-left: auto;
      background: none;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: var(--radius);
      cursor: pointer;
      font-family: var(--font);
      font-size: 12px;
      transition: border-color 0.2s, color 0.2s;
    }
    header .refresh-btn:hover { border-color: var(--accent); color: var(--accent); }

    main { padding: 24px; max-width: 1100px; margin: 0 auto; }

    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 28px; }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
    }
    .card-label { color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .card-value { font-size: 22px; font-weight: bold; }
    .card-value.ok { color: var(--accent); }
    .card-value.error { color: var(--error); }
    .card-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

    section h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      padding: 8px 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      vertical-align: middle;
    }
    tr:hover td { background: rgba(255,255,255,0.02); }
    tr:last-child td { border-bottom: none; }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: bold;
    }
    .badge-active   { background: var(--accent-dim); color: var(--accent); }
    .badge-closed   { background: #1e293b; color: var(--text-muted); }
    .badge-expired  { background: #3b1f1f; color: var(--error); }

    .mono { font-family: var(--font); font-size: 11px; color: var(--text-muted); }

    .empty-state { text-align: center; padding: 40px; color: var(--text-muted); }
    .empty-state .icon { font-size: 36px; margin-bottom: 10px; }

    .section-hint { color: var(--text-muted); font-size: 12px; margin-bottom: 12px; line-height: 1.5; }

    /* ── Diff component (C5) ─────────────────────────────────── */
    .diff-editor { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .diff-editor-side label { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .diff-editor-side textarea {
      width: 100%;
      min-height: 160px;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px;
      font-family: var(--font);
      font-size: 12px;
      resize: vertical;
    }
    .diff-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
    .diff-controls label { font-size: 11px; color: var(--text-muted); }
    .diff-controls input[type="text"], .diff-controls input[type="number"] {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-family: var(--font);
      font-size: 12px;
      margin-left: 4px;
    }
    .diff-controls input[type="number"] { width: 60px; }
    .diff-controls button {
      background: var(--accent);
      color: var(--bg);
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      font-family: var(--font);
    }
    .diff-controls button:hover { background: #6ee79b; }
    .diff-stats { font-size: 12px; color: var(--text-muted); margin-left: auto; }
    .diff-stats .added { color: var(--accent); }
    .diff-stats .removed { color: var(--error); }

    .diff-output {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      font-family: var(--font);
    }
    .diff-hunk { border-top: 1px solid var(--border); }
    .diff-hunk:first-child { border-top: none; }
    .diff-hunk-header {
      background: var(--surface);
      color: var(--text-muted);
      padding: 4px 12px;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .diff-hunk-actions { display: flex; gap: 6px; }
    .diff-hunk-actions button {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      font-family: var(--font);
    }
    .diff-hunk-actions button.accept:hover { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
    .diff-hunk-actions button.reject:hover { background: #471010; color: var(--error); border-color: var(--error); }
    .diff-line { display: grid; grid-template-columns: 44px 44px 1fr; }
    .diff-line .ln { text-align: right; padding-right: 8px; color: var(--text-muted); user-select: none; font-size: 11px; }
    .diff-line .content { padding-left: 8px; white-space: pre; }
    .diff-line.context .content::before { content: " "; color: var(--text-muted); }
    .diff-line.added { background: rgba(74, 222, 128, 0.08); }
    .diff-line.added .content::before { content: "+"; color: var(--accent); }
    .diff-line.removed { background: rgba(248, 113, 113, 0.08); }
    .diff-line.removed .content::before { content: "-"; color: var(--error); }
    .diff-unchanged { padding: 20px; text-align: center; color: var(--text-muted); font-style: italic; }

    .last-updated { text-align: right; font-size: 11px; color: var(--text-muted); margin-top: 16px; }

    .capabilities { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .cap-tag {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      color: var(--text-muted);
    }

    #error-banner {
      display: none;
      background: #3b1f1f;
      border: 1px solid var(--error);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 20px;
      color: var(--error);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <span class="logo">&#9670; THE COLONY</span>
    <span class="subtitle">Daemon Dashboard</span>
    <button class="refresh-btn" onclick="loadAll()">&#8635; Refresh</button>
  </header>

  <main>
    <div id="error-banner"></div>

    <div class="cards">
      <div class="card">
        <div class="card-label">Daemon Status</div>
        <div class="card-value" id="daemon-status">&#8230;</div>
        <div class="card-sub" id="daemon-started">Loading…</div>
      </div>
      <div class="card">
        <div class="card-label">Active Sessions</div>
        <div class="card-value" id="session-count">&#8230;</div>
        <div class="card-sub" id="session-sub">Loading…</div>
      </div>
      <div class="card">
        <div class="card-label">Capabilities</div>
        <div class="capabilities" id="capabilities">Loading…</div>
      </div>
    </div>

    <section>
      <h2>Sessions</h2>
      <div id="sessions-table">
        <div class="empty-state"><div class="icon">&#9650;</div>Loading sessions…</div>
      </div>
    </section>

    <section>
      <h2>Diff Preview</h2>
      <p class="section-hint">
        Paste an "before" and "after" version of a file to see the unified diff
        the way Colony's approval flow will present it. Hunks render with the
        same color coding used in the terminal UI.
      </p>
      <div class="diff-editor">
        <div class="diff-editor-side">
          <label for="diff-old">Before</label>
          <textarea id="diff-old" spellcheck="false" placeholder="// original content here"></textarea>
        </div>
        <div class="diff-editor-side">
          <label for="diff-new">After</label>
          <textarea id="diff-new" spellcheck="false" placeholder="// modified content here"></textarea>
        </div>
      </div>
      <div class="diff-controls">
        <label>
          Filename
          <input type="text" id="diff-filename" placeholder="src/example.ts" />
        </label>
        <label>
          Context
          <input type="number" id="diff-context" min="0" max="20" value="3" />
        </label>
        <button id="diff-render-btn" type="button">Render diff</button>
        <span id="diff-stats" class="diff-stats"></span>
      </div>
      <div id="diff-output" class="diff-output">
        <div class="empty-state"><div class="icon">&#9650;</div>Run "Render diff" to see hunks here.</div>
      </div>
    </section>

    <p class="last-updated" id="last-updated"></p>
  </main>

  <script>
    const API_ROOT = window.location.origin;
    const TOKEN_KEY = 'colony_daemon_token';

    // ── Auth token management ────────────────────────────────────────────────

    function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
    function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

    function apiFetch(path, opts = {}) {
      const token = getToken();
      const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
      if (token) headers['authorization'] = 'Bearer ' + token;
      return fetch(API_ROOT + path, { ...opts, headers });
    }

    // ── Error / status banners ───────────────────────────────────────────────

    function showError(msg) {
      const banner = document.getElementById('error-banner');
      banner.textContent = '⚠ ' + msg;
      banner.style.display = 'block';
    }
    function clearError() {
      document.getElementById('error-banner').style.display = 'none';
    }

    // ── Health card ──────────────────────────────────────────────────────────

    async function loadHealth() {
      const res = await apiFetch('/api/v1/health');
      const data = await res.json();
      const statusEl = document.getElementById('daemon-status');
      const startedEl = document.getElementById('daemon-started');
      const capsEl = document.getElementById('capabilities');

      if (res.status === 401 || res.status === 403) {
        statusEl.textContent = '⚠ Auth required';
        statusEl.className = 'card-value error';
        startedEl.textContent = 'Set a bearer token above';
        capsEl.innerHTML = '';
        return;
      }

      statusEl.textContent = data.ok ? '● Online' : '✖ Error';
      statusEl.className = 'card-value ' + (data.ok ? 'ok' : 'error');

      if (data.startedAt) {
        const d = new Date(data.startedAt);
        const ago = Math.round((Date.now() - d.getTime()) / 1000);
        startedEl.textContent = 'Started ' + formatAgo(ago) + ' ago';
      } else {
        startedEl.textContent = '';
      }

      if (Array.isArray(data.capabilities) && data.capabilities.length) {
        capsEl.innerHTML = data.capabilities
          .map(c => '<span class="cap-tag">' + esc(c) + '</span>')
          .join('');
      } else {
        capsEl.innerHTML = '<span class="cap-tag">none</span>';
      }
    }

    // ── Sessions table ───────────────────────────────────────────────────────

    async function loadSessions() {
      const res = await apiFetch('/api/v1/sessions');
      const data = await res.json();
      const countEl = document.getElementById('session-count');
      const subEl = document.getElementById('session-sub');
      const tableEl = document.getElementById('sessions-table');

      if (res.status === 401 || res.status === 403) {
        countEl.textContent = '—';
        subEl.textContent = 'Auth required';
        tableEl.innerHTML = '<div class="empty-state"><div class="icon">🔒</div>Set a bearer token to view sessions</div>';
        return;
      }

      const sessions = data.sessions ?? [];
      const active = sessions.filter(s => s.state === 'active' || s.state === 'created');

      countEl.textContent = sessions.length.toString();
      countEl.className = 'card-value' + (active.length ? ' ok' : '');
      subEl.textContent = active.length + ' active';

      if (sessions.length === 0) {
        tableEl.innerHTML = '<div class="empty-state"><div class="icon">&#9651;</div>No sessions yet</div>';
        return;
      }

      const rows = sessions.map(s => {
        const stateClass = s.state === 'active' ? 'badge-active' : s.state === 'expired' ? 'badge-expired' : 'badge-closed';
        return '<tr>'
          + '<td class="mono">' + esc(s.sessionId.slice(0, 20)) + '…</td>'
          + '<td>' + esc(s.agentId) + '</td>'
          + '<td>' + esc(s.caste) + '</td>'
          + '<td><span class="badge ' + stateClass + '">' + esc(s.state) + '</span></td>'
          + '<td>' + esc(s.messageCount.toString()) + '</td>'
          + '<td>' + esc(s.totalIterations.toString()) + '</td>'
          + '<td class="mono">' + fmtDate(s.lastActive) + '</td>'
          + '<td><button onclick="closeSession(' + "'" + esc(s.sessionId) + "'" + ')">✕</button></td>'
          + '</tr>';
      }).join('');

      tableEl.innerHTML = '<table>'
        + '<thead><tr><th>Session ID</th><th>Agent</th><th>Caste</th><th>State</th><th>Messages</th><th>Iterations</th><th>Last Active</th><th></th></tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table>';
    }

    // ── Session actions ──────────────────────────────────────────────────────

    async function closeSession(sessionId) {
      if (!confirm('Close session ' + sessionId + '?')) return;
      try {
        const res = await apiFetch('/api/v1/sessions/' + sessionId, { method: 'DELETE' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Failed to close session');
        await loadSessions();
      } catch (err) {
        showError('Close session failed: ' + err.message);
      }
    }

    // ── Diff preview (C5) ────────────────────────────────────────────────────

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function renderDiff(diff) {
      const output = document.getElementById('diff-output');
      const stats = document.getElementById('diff-stats');

      if (diff.unchanged) {
        output.innerHTML = '<div class="diff-unchanged">No changes between the two versions.</div>';
        stats.innerHTML = '';
        return;
      }

      stats.innerHTML =
        '<span class="added">+' + diff.stats.added + '</span> ' +
        '<span class="removed">-' + diff.stats.removed + '</span> ' +
        'across ' + diff.stats.hunkCount + ' hunk' + (diff.stats.hunkCount === 1 ? '' : 's');

      const parts = [];
      diff.hunks.forEach(function (hunk, hunkIdx) {
        parts.push('<div class="diff-hunk" data-hunk-index="' + hunkIdx + '">');
        parts.push(
          '<div class="diff-hunk-header">' +
            '<span>Hunk ' + (hunkIdx + 1) + ' &middot; ' +
            '@@ -' + hunk.oldStart + ',' + hunk.oldLines +
            ' +' + hunk.newStart + ',' + hunk.newLines + ' @@</span>' +
            '<span class="diff-hunk-actions">' +
              '<button class="accept" data-action="accept" data-hunk="' + hunkIdx + '">Accept</button>' +
              '<button class="reject" data-action="reject" data-hunk="' + hunkIdx + '">Reject</button>' +
            '</span>' +
          '</div>'
        );
        hunk.lines.forEach(function (line) {
          parts.push(
            '<div class="diff-line ' + line.kind + '">' +
              '<span class="ln">' + (line.oldLineNo ?? '') + '</span>' +
              '<span class="ln">' + (line.newLineNo ?? '') + '</span>' +
              '<span class="content">' + escapeHtml(line.text) + '</span>' +
            '</div>'
          );
        });
        parts.push('</div>');
      });

      output.innerHTML = parts.join('');

      // Wire hunk-level accept/reject buttons. For now they just hide the
      // hunk locally — the wiring to a real approval REST flow lands in
      // the next iteration alongside the pending-edit queue.
      output.querySelectorAll('button[data-action]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const hunkEl = btn.closest('.diff-hunk');
          if (!hunkEl) return;
          hunkEl.style.opacity = '0.4';
          hunkEl.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
          btn.textContent = btn.dataset.action === 'accept' ? 'Accepted' : 'Rejected';
        });
      });
    }

    async function renderDiffFromInputs() {
      const oldText = document.getElementById('diff-old').value;
      const newText = document.getElementById('diff-new').value;
      const filename = document.getElementById('diff-filename').value || 'file';
      const contextLines = parseInt(document.getElementById('diff-context').value, 10) || 3;

      try {
        const res = await apiFetch('/api/v1/diffs/preview', {
          method: 'POST',
          body: JSON.stringify({ oldText, newText, filename, contextLines }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          showError('Diff render failed: ' + (data.error || res.statusText));
          return;
        }
        clearError();
        renderDiff(data.diff);
      } catch (err) {
        showError('Diff request failed: ' + err.message);
      }
    }

    // ── Refresh ──────────────────────────────────────────────────────────────

    async function loadAll() {
      clearError();
      try {
        await Promise.all([loadHealth(), loadSessions()]);
        document.getElementById('last-updated').textContent =
          'Last updated: ' + new Date().toLocaleTimeString();
      } catch (err) {
        showError('Failed to fetch daemon data: ' + err.message);
      }
    }

    // ── Auth token form (injected if needed) ─────────────────────────────────

    function renderTokenForm() {
      const existing = document.getElementById('token-form');
      if (existing) return; // only once
      const form = document.createElement('div');
      form.id = 'token-form';
      form.style.cssText = 'background:#161a22;border:1px solid #2a2f3d;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:flex;gap:10px;align-items:center;';
      form.innerHTML = '<label style="color:#64748b;font-size:12px;white-space:nowrap">Bearer token:</label>'
        + '<input id="token-input" type="password" placeholder="Paste token here…" value="' + esc(getToken()) + '"'
        + ' style="flex:1;background:#0d0f14;border:1px solid #2a2f3d;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-family:inherit;font-size:12px;" />'
        + '<button onclick="saveToken()" style="background:none;border:1px solid #2a2f3d;color:#64748b;padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:12px;">Save</button>';
      document.querySelector('main').prepend(form);
    }

    function saveToken() {
      const val = document.getElementById('token-input').value.trim();
      setToken(val);
      loadAll();
    }

    // ── Utility ──────────────────────────────────────────────────────────────

    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function fmtDate(iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString(); } catch { return iso; }
    }

    function formatAgo(secs) {
      if (secs < 60) return secs + 's';
      if (secs < 3600) return Math.floor(secs / 60) + 'm';
      return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    renderTokenForm();
    loadAll();
    setInterval(loadAll, 10000);

    // Diff preview button (C5)
    document.getElementById('diff-render-btn').addEventListener('click', renderDiffFromInputs);
  </script>
</body>
</html>`;
}
