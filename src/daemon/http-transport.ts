import type {
  DaemonControlPlaneCommand,
  DaemonControlPlaneHost,
  DaemonControlPlaneResponse,
  DaemonCreateSessionCommand,
  DaemonListSessionsCommand,
} from "./control-plane";
import {
  DaemonAuthPolicy,
  extractBearerToken,
  type DaemonAuthScope,
} from "./auth";
import type {
  WorkflowAutomationStartTemplateCommand,
} from "../workflow";

export interface DaemonHttpTransportOptions {
  path?: string;
  authToken?: string;
  authPolicy?: DaemonAuthPolicy;
}

export interface DaemonHttpServerOptions extends DaemonHttpTransportOptions {
  host: DaemonControlPlaneHost;
  hostname?: string;
  port?: number;
}

export interface DaemonControlPlaneClientOptions extends DaemonHttpTransportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface DaemonRemoteCreateSessionOptions extends Omit<DaemonCreateSessionCommand, "type" | "requestId"> {
  requestId?: string;
}

export interface DaemonRemoteListSessionsOptions extends Omit<DaemonListSessionsCommand, "type" | "requestId"> {
  requestId?: string;
}

export interface DaemonRemoteStartWorkflowTemplateOptions extends Omit<WorkflowAutomationStartTemplateCommand, "type" | "requestId"> {
  requestId?: string;
  templateRequestId?: string;
}

export interface DaemonRemoteApproveWorkflowOptions {
  requestId?: string;
  approvalRequestId?: string;
  runId: string;
  stepId: string;
  approvedBy: string;
}

const DEFAULT_DAEMON_HTTP_PATH = "/api/daemon";

export async function handleDaemonHttpRequest(
  host: DaemonControlPlaneHost,
  request: Request,
  options: DaemonHttpTransportOptions = {},
): Promise<Response> {
  const path = options.path ?? DEFAULT_DAEMON_HTTP_PATH;
  const url = new URL(request.url);
  if (url.pathname !== path) {
    return jsonResponse(httpError("not_found", "Daemon endpoint not found"), 404);
  }

  if (request.method !== "POST") {
    return jsonResponse(httpError("method_not_allowed", "Daemon endpoint only accepts POST"), 405, {
      allow: "POST",
    });
  }

  const legacyAuthFailure = options.authPolicy ? null : authorizeRequest(request, options.authToken);
  if (legacyAuthFailure) return legacyAuthFailure;

  const command = await readCommand(request);
  if ("error" in command) {
    return jsonResponse(httpError("bad_request", command.error), 400);
  }

  const authGrant = authorizeCommand(request, command.command, options.authPolicy);
  if (authGrant instanceof Response) return authGrant;

  const response = await host.handle(command.command);
  if (command.command.type === "describe" && authGrant) {
    response.authScopes = authGrant.scopes;
  }

  return jsonResponse(response, 200);
}

export class DaemonHttpControlPlaneServer {
  private readonly _host: DaemonControlPlaneHost;
  private readonly _hostname: string;
  private readonly _port: number;
  private readonly _path: string;
  private readonly _authToken?: string;
  private readonly _authPolicy?: DaemonAuthPolicy;
  private _server: ReturnType<typeof Bun.serve> | null = null;

  constructor(options: DaemonHttpServerOptions) {
    this._host = options.host;
    this._hostname = options.hostname ?? "127.0.0.1";
    this._port = options.port ?? 0;
    this._path = options.path ?? DEFAULT_DAEMON_HTTP_PATH;
    this._authToken = options.authToken;
    this._authPolicy = options.authPolicy;
  }

  get url(): string {
    if (!this._server) throw new Error("Daemon HTTP server is not started");
    return `http://${this._server.hostname}:${this._server.port}${this._path}`;
  }

  async start(): Promise<void> {
    if (this._server) return;
    this._server = Bun.serve({
      hostname: this._hostname,
      port: this._port,
      fetch: (request) => handleDaemonHttpRequest(this._host, request, {
        path: this._path,
        authToken: this._authToken,
        authPolicy: this._authPolicy,
      }),
    });
  }

  async stop(): Promise<void> {
    if (!this._server) return;
    this._server.stop(true);
    this._server = null;
  }
}

export class DaemonControlPlaneClient {
  private readonly _baseUrl: string;
  private readonly _authToken?: string;
  private readonly _fetch: typeof fetch;

  constructor(options: DaemonControlPlaneClientOptions) {
    this._baseUrl = options.baseUrl;
    this._authToken = options.authToken;
    this._fetch = options.fetchImpl ?? fetch;
  }

  async send(command: DaemonControlPlaneCommand): Promise<DaemonControlPlaneResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this._authToken) {
      headers.authorization = `Bearer ${this._authToken}`;
    }

    const response = await this._fetch(this._baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(command),
    });
    return await response.json() as DaemonControlPlaneResponse;
  }

  async describe(requestId = "req_describe"): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "describe",
      requestId,
    });
  }

  async createSession(options: DaemonRemoteCreateSessionOptions): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "create_session",
      requestId: options.requestId ?? "req_create_session",
      agentId: options.agentId,
      caste: options.caste,
      tenantScope: options.tenantScope,
      config: options.config,
      metadata: options.metadata,
    });
  }

  async listSessions(options: DaemonRemoteListSessionsOptions = {}): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "list_sessions",
      requestId: options.requestId ?? "req_list_sessions",
      agentId: options.agentId,
    });
  }

  async inspectSession(sessionId: string, requestId = "req_inspect_session"): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "inspect_session",
      requestId,
      sessionId,
    });
  }

  async closeSession(sessionId: string, requestId = "req_close_session"): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "close_session",
      requestId,
      sessionId,
    });
  }

  async listWorkflowTemplates(
    requestId = "req_list_workflow_templates",
    templateRequestId = "wf_list_templates",
  ): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "workflow",
      requestId,
      command: {
        type: "list_templates",
        requestId: templateRequestId,
      },
    });
  }

  async startWorkflowTemplate(options: DaemonRemoteStartWorkflowTemplateOptions): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "workflow",
      requestId: options.requestId ?? "req_start_workflow_template",
      command: {
        type: "start_template",
        requestId: options.templateRequestId ?? "wf_start_template",
        templateId: options.templateId,
        workflowId: options.workflowId,
        title: options.title,
        objective: options.objective,
        requiredApprover: options.requiredApprover,
        tasks: options.tasks,
      },
    });
  }

  async inspectWorkflow(
    runId: string,
    requestId = "req_inspect_workflow",
    workflowRequestId = "wf_inspect_workflow",
  ): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "workflow",
      requestId,
      command: {
        type: "inspect",
        requestId: workflowRequestId,
        runId,
      },
    });
  }

  async approveWorkflow(options: DaemonRemoteApproveWorkflowOptions): Promise<DaemonControlPlaneResponse> {
    return await this.send({
      type: "workflow",
      requestId: options.requestId ?? "req_approve_workflow",
      command: {
        type: "approve",
        requestId: options.approvalRequestId ?? "wf_approve_workflow",
        runId: options.runId,
        stepId: options.stepId,
        approvedBy: options.approvedBy,
      },
    });
  }
}

function authorizeRequest(request: Request, authToken?: string): Response | null {
  if (!authToken) return null;
  const rawHeader = request.headers.get("authorization");
  if (!rawHeader) {
    return jsonResponse(httpError("unauthorized", "Missing bearer token"), 401);
  }
  if (rawHeader !== `Bearer ${authToken}`) {
    return jsonResponse(httpError("forbidden", "Invalid bearer token"), 403);
  }
  return null;
}

function authorizeCommand(
  request: Request,
  command: DaemonControlPlaneCommand,
  authPolicy?: DaemonAuthPolicy,
): { label: string; scopes: DaemonAuthScope[] } | null | Response {
  if (!authPolicy) return null;
  const requiredScope = requiredScopeForCommand(command);
  const decision = authPolicy.authorize(extractBearerToken(request), requiredScope);
  if (decision.ok) return decision.grant ?? null;

  const status = decision.code === "missing_token" ? 401 : 403;
  const detail = decision.requiredScope ? `${decision.message}; requiredScope=${decision.requiredScope}` : decision.message;
  return jsonResponse(httpError(decision.code ?? "forbidden", detail ?? "Daemon authorization failed"), status);
}

function requiredScopeForCommand(command: DaemonControlPlaneCommand): DaemonAuthScope {
  switch (command.type) {
    case "describe":
      return "daemon.describe";
    case "list_sessions":
    case "inspect_session":
      return "sessions.read";
    case "create_session":
    case "close_session":
      return "sessions.write";
    case "workflow":
      return requiredScopeForWorkflowCommand(command.command);
  }
}

function requiredScopeForWorkflowCommand(command: { type: string }): DaemonAuthScope {
  switch (command.type) {
    case "list_templates":
    case "inspect":
      return "workflow.read";
    case "start_template":
    case "approve":
      return "workflow.write";
    default:
      return "workflow.write";
  }
}

async function readCommand(request: Request): Promise<
  | { command: DaemonControlPlaneCommand }
  | { error: string }
> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: "Invalid JSON command envelope" };
    }
    const record = body as Record<string, unknown>;
    if (typeof record.type !== "string" || typeof record.requestId !== "string") {
      return { error: "Invalid daemon command envelope" };
    }
    return { command: body as DaemonControlPlaneCommand };
  } catch {
    return { error: "Invalid JSON command envelope" };
  }
}

function httpError(code: string, message: string): DaemonControlPlaneResponse {
  return {
    ok: false,
    requestId: "http",
    type: "describe",
    error: `${code}: ${message}`,
  };
}

function jsonResponse(
  body: DaemonControlPlaneResponse,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}
