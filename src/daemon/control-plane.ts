import type { Caste } from "../caste/enums";
import {
  type AgentSession,
  type SessionConfig,
  SessionManager,
} from "../runtime/session";
import type {
  WorkflowAutomationCommand,
  WorkflowAutomationController,
  WorkflowAutomationResponse,
} from "../workflow";
import type { ColonySwarmRuntime } from "../orchestrator/swarm";
import type { McpServerRegistry } from "../mcp/server-registry";
import type { DaemonAuthScope } from "./auth";

export type DaemonControlPlaneCommand =
  | DaemonDescribeCommand
  | DaemonCreateSessionCommand
  | DaemonListSessionsCommand
  | DaemonInspectSessionCommand
  | DaemonCloseSessionCommand
  | DaemonWorkflowCommand;

export interface DaemonDescribeCommand {
  type: "describe";
  requestId: string;
}

export interface DaemonCreateSessionCommand {
  type: "create_session";
  requestId: string;
  agentId: string;
  caste: Caste | string;
  tenantScope?: string;
  config?: Partial<SessionConfig>;
  metadata?: Record<string, unknown>;
}

export interface DaemonListSessionsCommand {
  type: "list_sessions";
  requestId: string;
  agentId?: string;
}

export interface DaemonInspectSessionCommand {
  type: "inspect_session";
  requestId: string;
  sessionId: string;
}

export interface DaemonCloseSessionCommand {
  type: "close_session";
  requestId: string;
  sessionId: string;
}

export interface DaemonWorkflowCommand {
  type: "workflow";
  requestId: string;
  command: WorkflowAutomationCommand;
}

export interface DaemonSessionSnapshot {
  sessionId: string;
  agentId: string;
  caste: string;
  tenantScope: string;
  state: string;
  createdAt: string;
  lastActive: string;
  messageCount: number;
  totalIterations: number;
  totalTokensUsed: number;
  metadata: Record<string, unknown>;
}

export interface DaemonControlPlaneResponse {
  ok: boolean;
  requestId: string;
  type: DaemonControlPlaneCommand["type"];
  capabilities?: string[];
  startedAt?: string;
  session?: DaemonSessionSnapshot;
  sessions?: DaemonSessionSnapshot[];
  workflow?: WorkflowAutomationResponse;
  authScopes?: DaemonAuthScope[];
  error?: string;
}

export interface DaemonControlPlaneHostOptions {
  sessionManager?: SessionManager;
  workflowController?: WorkflowAutomationController;
  swarmRuntime?: ColonySwarmRuntime;
  mcpServerRegistry?: McpServerRegistry;
  startedAt?: string;
}

export class DaemonControlPlaneHost {
  private readonly _sessionManager: SessionManager;
  private readonly _workflowController?: WorkflowAutomationController;
  private readonly _swarmRuntime?: ColonySwarmRuntime;
  private readonly _mcpServerRegistry?: McpServerRegistry;
  private readonly _startedAt: string;

  constructor(options: DaemonControlPlaneHostOptions = {}) {
    this._sessionManager = options.sessionManager ?? new SessionManager();
    this._workflowController = options.workflowController;
    this._swarmRuntime = options.swarmRuntime;
    this._mcpServerRegistry = options.mcpServerRegistry;
    this._startedAt = options.startedAt ?? new Date().toISOString();
  }

  /** Accessor for the REST layer — returns null if swarm runtime is unconfigured. */
  get swarmRuntime(): ColonySwarmRuntime | null {
    return this._swarmRuntime ?? null;
  }

  /** Accessor for the MCP server registry — returns null if unconfigured. */
  get mcpServerRegistry(): McpServerRegistry | null {
    return this._mcpServerRegistry ?? null;
  }

  async handle(command: DaemonControlPlaneCommand): Promise<DaemonControlPlaneResponse> {
    try {
      switch (command.type) {
        case "describe":
          return this._describe(command);
        case "create_session":
          return await this._createSession(command);
        case "list_sessions":
          return await this._listSessions(command);
        case "inspect_session":
          return await this._inspectSession(command);
        case "close_session":
          return await this._closeSession(command);
        case "workflow":
          return await this._workflow(command);
      }
    } catch (error) {
      return {
        ok: false,
        requestId: command.requestId,
        type: command.type,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private _describe(command: DaemonDescribeCommand): DaemonControlPlaneResponse {
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      startedAt: this._startedAt,
      capabilities: this._capabilities(),
    };
  }

  private async _createSession(command: DaemonCreateSessionCommand): Promise<DaemonControlPlaneResponse> {
    if (!command.agentId.trim()) throw new Error("agentId is required");
    if (!String(command.caste).trim()) throw new Error("caste is required");

    const session = await this._sessionManager.createSession({
      agentId: command.agentId,
      caste: command.caste,
      tenantScope: command.tenantScope,
      config: command.config,
      metadata: command.metadata,
    });

    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      session: snapshotSession(session),
    };
  }

  private async _listSessions(command: DaemonListSessionsCommand): Promise<DaemonControlPlaneResponse> {
    const sessions = await this._sessionManager.listSessions(command.agentId);
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      sessions: sessions.map(snapshotSession),
    };
  }

  private async _inspectSession(command: DaemonInspectSessionCommand): Promise<DaemonControlPlaneResponse> {
    const session = await this._loadSession(command.sessionId);
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      session: snapshotSession(session),
    };
  }

  private async _closeSession(command: DaemonCloseSessionCommand): Promise<DaemonControlPlaneResponse> {
    await this._loadSession(command.sessionId);
    await this._sessionManager.closeSessionById(command.sessionId);
    const closed = await this._loadSession(command.sessionId);
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      session: snapshotSession(closed),
    };
  }

  private async _workflow(command: DaemonWorkflowCommand): Promise<DaemonControlPlaneResponse> {
    if (!this._workflowController) {
      throw new Error("Workflow automation controller is not configured");
    }

    const workflow = await this._workflowController.handle(command.command);
    return {
      ok: workflow.ok,
      requestId: command.requestId,
      type: command.type,
      workflow,
      error: workflow.ok ? undefined : workflow.error,
    };
  }

  private async _loadSession(sessionId: string): Promise<AgentSession> {
    if (!sessionId.trim()) throw new Error("sessionId is required");
    const session = await this._sessionManager.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session;
  }

  private _capabilities(): string[] {
    const capabilities = [
      "sessions.create",
      "sessions.list",
      "sessions.inspect",
      "sessions.close",
    ];
    if (this._workflowController) capabilities.push("workflow.automation");
    if (this._swarmRuntime) capabilities.push("swarm.runs", "swarm.detached");
    if (this._mcpServerRegistry) capabilities.push("mcp.servers");
    return capabilities;
  }
}

export function snapshotSession(session: AgentSession): DaemonSessionSnapshot {
  return {
    sessionId: session.sessionId,
    agentId: session.agentId,
    caste: String(session.caste),
    tenantScope: session.tenantScope,
    state: String(session.state),
    createdAt: session.createdAt,
    lastActive: session.lastActive,
    messageCount: session.history.length,
    totalIterations: session.totalIterations,
    totalTokensUsed: session.totalTokensUsed,
    metadata: { ...session.metadata },
  };
}
