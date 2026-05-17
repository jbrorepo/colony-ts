import { InProcessMcpClient } from "./client";
import {
  connectTrustedPluginMcpClient,
  pluginMcpSidecarTrustSignature,
  type ManagedTrustedPluginMcpClientSession,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarLifecycle,
  type PluginMcpSidecarTrustApproval,
} from "./plugin-sidecar-config";
import type { McpTransport } from "./transport";

export type PluginMcpSidecarSupervisorState =
  | "running"
  | "backing_off"
  | "failed"
  | "stopped";

export type PluginMcpSidecarSupervisorEventStage =
  | "start_requested"
  | "started"
  | "start_failed"
  | "failure_detected"
  | "backing_off"
  | "restart_denied"
  | "stopped";

export type PluginMcpSidecarSupervisorEventOutcome =
  | "pending"
  | "running"
  | "failed"
  | "backing_off"
  | "denied"
  | "stopped";

export interface PluginMcpSidecarSupervisorStartContext {
  serverId: string;
  restartCount: number;
}

export interface PluginMcpSidecarSupervisorOptions {
  createTransport(
    definition: PluginMcpSidecarDefinition,
    context: PluginMcpSidecarSupervisorStartContext,
  ): McpTransport | Promise<McpTransport>;
  now?: () => Date;
  restartBackoffMs?: number;
  maxRestarts?: number;
}

export interface PluginMcpSidecarSupervisorSnapshot {
  serverId: string;
  signature: string;
  state: PluginMcpSidecarSupervisorState;
  package: {
    name: string;
    version: string;
    source: string;
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
  restartCount: number;
  startedAt?: string;
  stoppedAt?: string;
  failedAt?: string;
  nextRestartAt?: string;
  lifecycle?: PluginMcpSidecarLifecycle;
}

export interface PluginMcpSidecarSupervisorEvent {
  eventType: "mcp_plugin_sidecar_supervisor";
  timestamp: string;
  stage: PluginMcpSidecarSupervisorEventStage;
  outcome: PluginMcpSidecarSupervisorEventOutcome;
  serverId: string;
  signature: string;
  state: PluginMcpSidecarSupervisorState;
  restartCount: number;
  package: {
    name: string;
    version: string;
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
}

interface SupervisorRecord {
  definition: PluginMcpSidecarDefinition;
  approval: PluginMcpSidecarTrustApproval;
  signature: string;
  state: PluginMcpSidecarSupervisorState;
  restartCount: number;
  session?: ManagedTrustedPluginMcpClientSession;
  startedAt?: string;
  stoppedAt?: string;
  failedAt?: string;
  nextRestartAt?: string;
}

const DEFAULT_RESTART_BACKOFF_MS = 1_000;
const DEFAULT_MAX_RESTARTS = 2;

export class PluginMcpSidecarSupervisor {
  private readonly _createTransport: PluginMcpSidecarSupervisorOptions["createTransport"];
  private readonly _now: () => Date;
  private readonly _restartBackoffMs: number;
  private readonly _maxRestarts: number;
  private readonly _records = new Map<string, SupervisorRecord>();
  private readonly _events: PluginMcpSidecarSupervisorEvent[] = [];

  constructor(options: PluginMcpSidecarSupervisorOptions) {
    if (typeof options.createTransport !== "function") {
      throw new Error("MCP plugin sidecar supervisor transport factory required");
    }
    this._createTransport = options.createTransport;
    this._now = options.now ?? (() => new Date());
    this._restartBackoffMs = positiveInteger(options.restartBackoffMs, DEFAULT_RESTART_BACKOFF_MS);
    this._maxRestarts = nonNegativeInteger(options.maxRestarts, DEFAULT_MAX_RESTARTS);
  }

  async start(
    definition: PluginMcpSidecarDefinition,
    approval: PluginMcpSidecarTrustApproval,
  ): Promise<PluginMcpSidecarSupervisorSnapshot> {
    const serverId = safeId(definition.id);
    const existing = this._records.get(serverId);
    if (existing?.state === "running") {
      const incomingSignature = safeSignature(definition);
      if (
        incomingSignature !== ""
        && incomingSignature === existing.signature
        && approval.approved === true
        && approval.signature === pluginMcpSidecarTrustSignature(definition)
      ) {
        return this._snapshot(existing);
      }
      throw new Error("MCP plugin sidecar supervisor active signature conflict");
    }
    if (existing?.state === "backing_off") {
      const nextMs = existing.nextRestartAt === undefined ? Number.NaN : Date.parse(existing.nextRestartAt);
      if (!Number.isFinite(nextMs) || this._now().getTime() < nextMs) {
        throw new Error("MCP plugin sidecar restart backoff active");
      }
    }
    if (existing?.state === "failed" && existing.restartCount > this._maxRestarts) {
      throw new Error("MCP plugin sidecar restart limit reached");
    }

    const record = this._createRecord(definition, approval, existing?.restartCount ?? 0);
    this._records.set(serverId, record);
    this._emit(record, "start_requested", "pending");

    try {
      this._assertTrusted(definition, approval, record.signature);
      const transport = await this._createTransport(definition, {
        serverId,
        restartCount: record.restartCount,
      });
      const session = await connectTrustedPluginMcpClient(definition, approval, { sidecarTransport: transport });
      record.session = session;
      record.state = "running";
      record.startedAt = this._timestamp();
      record.stoppedAt = undefined;
      record.failedAt = undefined;
      record.nextRestartAt = undefined;
      this._emit(record, "started", "running");
      return this._snapshot(record);
    } catch {
      record.session = undefined;
      record.state = "failed";
      record.failedAt = this._timestamp();
      record.nextRestartAt = undefined;
      this._emit(record, "start_failed", "failed");
      throw new Error("MCP plugin sidecar supervisor start failed");
    }
  }

  list(): PluginMcpSidecarSupervisorSnapshot[] {
    return Array.from(this._records.values()).map((record) => this._snapshot(record));
  }

  inspect(serverId: string): PluginMcpSidecarSupervisorSnapshot | undefined {
    const record = this._records.get(serverId);
    return record ? this._snapshot(record) : undefined;
  }

  client(serverId: string): InProcessMcpClient {
    const record = this._records.get(serverId);
    if (!record?.session || record.state !== "running") {
      throw new Error("MCP plugin sidecar supervisor session is not running");
    }
    return record.session.client;
  }

  async stop(serverId: string): Promise<PluginMcpSidecarSupervisorSnapshot> {
    const record = this._records.get(serverId);
    if (!record) {
      throw new Error("MCP plugin sidecar supervisor session is unknown");
    }
    if (record.state === "stopped") return this._snapshot(record);
    const session = record.session;
    if (session) {
      try {
        await session.close();
      } catch {
        throw new Error("MCP plugin sidecar supervisor stop failed");
      }
    }
    record.session = undefined;
    record.state = "stopped";
    record.stoppedAt = this._timestamp();
    record.nextRestartAt = undefined;
    this._emit(record, "stopped", "stopped");
    return this._snapshot(record);
  }

  async recordFailure(serverId: string, _failure: string): Promise<PluginMcpSidecarSupervisorSnapshot> {
    const record = this._records.get(serverId);
    if (!record) {
      throw new Error("MCP plugin sidecar supervisor session is unknown");
    }
    const session = record.session;
    record.session = undefined;
    if (session) {
      try {
        await session.close();
      } catch {
        // Failure recording is best effort and must preserve generic supervisor state.
      }
    }
    record.failedAt = this._timestamp();
    record.restartCount++;
    record.state = "failed";
    this._emit(record, "failure_detected", "failed");
    if (record.restartCount > this._maxRestarts) {
      record.nextRestartAt = undefined;
      this._emit(record, "restart_denied", "denied");
      return this._snapshot(record);
    }
    record.state = "backing_off";
    record.nextRestartAt = new Date(this._now().getTime() + this._restartBackoffMs * record.restartCount).toISOString();
    this._emit(record, "backing_off", "backing_off");
    return this._snapshot(record);
  }

  async restart(serverId: string): Promise<PluginMcpSidecarSupervisorSnapshot> {
    const record = this._records.get(serverId);
    if (!record) {
      throw new Error("MCP plugin sidecar supervisor session is unknown");
    }
    if (record.restartCount > this._maxRestarts) {
      this._emit(record, "restart_denied", "denied");
      throw new Error("MCP plugin sidecar restart limit reached");
    }
    if (record.state === "backing_off" && record.nextRestartAt !== undefined) {
      const nowMs = this._now().getTime();
      const nextMs = Date.parse(record.nextRestartAt);
      if (Number.isFinite(nextMs) && nowMs < nextMs) {
        this._emit(record, "restart_denied", "denied");
        throw new Error("MCP plugin sidecar restart backoff active");
      }
    }
    return await this.start(record.definition, record.approval);
  }

  events(): PluginMcpSidecarSupervisorEvent[] {
    return this._events.map((event) => ({
      ...event,
      package: { ...event.package },
      sidecar: { ...event.sidecar },
    }));
  }

  private _createRecord(
    definition: PluginMcpSidecarDefinition,
    approval: PluginMcpSidecarTrustApproval,
    restartCount: number,
  ): SupervisorRecord {
    return {
      definition: { ...definition },
      approval: { ...approval },
      signature: safeSignature(definition),
      state: "failed",
      restartCount,
    };
  }

  private _assertTrusted(
    definition: PluginMcpSidecarDefinition,
    approval: PluginMcpSidecarTrustApproval,
    signature: string,
  ): void {
    if (signature === "" || approval.approved !== true || approval.signature !== pluginMcpSidecarTrustSignature(definition)) {
      throw new Error("MCP plugin sidecar supervisor trust rejected");
    }
  }

  private _snapshot(record: SupervisorRecord): PluginMcpSidecarSupervisorSnapshot {
    return {
      serverId: safeId(record.definition.id),
      signature: record.signature,
      state: record.state,
      package: {
        name: safeAuditLabel(record.definition.packageName),
        version: safeAuditLabel(record.definition.packageVersion),
        source: safeAuditLabel(record.definition.packageSource),
        digest: safeDigestLabel(record.definition.packageDigest),
      },
      sidecar: {
        id: safeAuditLabel(record.definition.sidecarId),
        kind: safeAuditLabel(record.definition.sidecarKind ?? "unknown"),
      },
      restartCount: record.restartCount,
      ...(record.startedAt === undefined ? {} : { startedAt: record.startedAt }),
      ...(record.stoppedAt === undefined ? {} : { stoppedAt: record.stoppedAt }),
      ...(record.failedAt === undefined ? {} : { failedAt: record.failedAt }),
      ...(record.nextRestartAt === undefined ? {} : { nextRestartAt: record.nextRestartAt }),
      ...(record.session === undefined ? {} : { lifecycle: cloneLifecycle(record.session.lifecycle) }),
    };
  }

  private _emit(
    record: SupervisorRecord,
    stage: PluginMcpSidecarSupervisorEventStage,
    outcome: PluginMcpSidecarSupervisorEventOutcome,
  ): void {
    this._events.push({
      eventType: "mcp_plugin_sidecar_supervisor",
      timestamp: this._timestamp(),
      stage,
      outcome,
      serverId: safeId(record.definition.id),
      signature: record.signature,
      state: record.state,
      restartCount: record.restartCount,
      package: {
        name: safeAuditLabel(record.definition.packageName),
        version: safeAuditLabel(record.definition.packageVersion),
        digest: safeDigestLabel(record.definition.packageDigest),
      },
      sidecar: {
        id: safeAuditLabel(record.definition.sidecarId),
        kind: safeAuditLabel(record.definition.sidecarKind ?? "unknown"),
      },
    });
  }

  private _timestamp(): string {
    return this._now().toISOString();
  }
}

function safeSignature(definition: PluginMcpSidecarDefinition): string {
  try {
    return pluginMcpSidecarTrustSignature(definition);
  } catch {
    return "";
  }
}

function cloneLifecycle(lifecycle: PluginMcpSidecarLifecycle): PluginMcpSidecarLifecycle {
  return {
    ...lifecycle,
    protocolVersion: safeAuditLabel(lifecycle.protocolVersion),
    serverInfo: {
      name: safeAuditLabel(lifecycle.serverInfo.name),
      version: safeAuditLabel(lifecycle.serverInfo.version),
    },
    expectations: {
      ...(lifecycle.expectations.protocolVersion === undefined ? {} : { protocolVersion: safeAuditLabel(lifecycle.expectations.protocolVersion) }),
      ...(lifecycle.expectations.serverName === undefined ? {} : { serverName: safeAuditLabel(lifecycle.expectations.serverName) }),
      ...(lifecycle.expectations.serverVersion === undefined ? {} : { serverVersion: safeAuditLabel(lifecycle.expectations.serverVersion) }),
    },
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value >= 0 ? value : fallback;
}

function safeId(value: string): string {
  return safeAuditLabel(typeof value === "string" && value.length > 0 ? value : "<invalid>");
}

function safeDigestLabel(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/i.test(value)) return "<redacted>";
  return `${value.slice(0, 18)}...${value.slice(-8)}`;
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value);
}

function safeAuditLabel(value: string): string {
  const clean = typeof value === "string" ? value.replace(/[\0\r\n]/g, "") : "<invalid>";
  return looksSecret(clean) ? "<redacted>" : clean.slice(0, 80);
}
