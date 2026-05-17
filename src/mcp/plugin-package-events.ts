import { mkdir, readFile, appendFile } from "fs/promises";
import { dirname, join } from "path";

import type {
  PluginPackageImportPlan,
  PluginPackagePlanAction,
  PluginPackagePlanActionRecord,
} from "./plugin-package-discovery";
import type { PluginMcpSidecarKind } from "./plugin-sidecar-config";

export interface PluginPackagePlanEventBuildOptions {
  planId: string;
  timestamp?: string | Date;
  actor?: string;
}

export interface PluginPackagePlanEvent {
  eventType: "mcp_plugin_package_plan";
  planId: string;
  sequence: number;
  timestamp: string;
  action: PluginPackagePlanAction;
  dryRun: true;
  approvalRequired: true;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind | "unknown";
  };
  reasons: string[];
  warnings: string[];
  signature?: string;
  actor?: string;
}

export interface JsonPluginPackagePlanEventStoreOptions {
  rootDir: string;
}

const EVENT_FILE = "plugin-package-plan-events.jsonl";
const EVENT_WARNINGS = [
  "Durable event is audit-only and cannot install packages, execute code, fetch registries, or start sidecars.",
  "Package source, approval request details, and trusted sidecar config bodies are intentionally omitted.",
];
const EVENT_ACTIONS = new Set<PluginPackagePlanAction>(["import", "update", "keep", "review", "reject"]);
const SIDECAR_KINDS = new Set<PluginMcpSidecarKind | "unknown">(["local-sidecar", "daemon-bridge", "app-bridge", "unknown"]);

export function buildPluginPackagePlanEvents(
  plan: PluginPackageImportPlan,
  options: PluginPackagePlanEventBuildOptions,
): PluginPackagePlanEvent[] {
  const timestamp = toIso(options.timestamp ?? new Date());
  const planId = safeId(options.planId);
  const actor = safeOptionalLabel(options.actor);
  return plan.actions.map((action, sequence) => projectPlanAction(action, {
    planId,
    timestamp,
    sequence,
    actor,
  }));
}

export class JsonPluginPackagePlanEventStore {
  private readonly _eventsPath: string;

  constructor(options: JsonPluginPackagePlanEventStoreOptions) {
    this._eventsPath = join(options.rootDir, EVENT_FILE);
  }

  async append(events: PluginPackagePlanEvent[]): Promise<void> {
    if (!Array.isArray(events)) {
      throw new Error("Plugin package plan event journal append rejected");
    }
    const lines = events.map((event) => {
      const normalized = normalizeEvent(event);
      return JSON.stringify(normalized);
    });
    await mkdir(dirname(this._eventsPath), { recursive: true });
    if (lines.length > 0) {
      await appendFile(this._eventsPath, `${lines.join("\n")}\n`, "utf8");
    }
  }

  async load(): Promise<PluginPackagePlanEvent[]> {
    let content: string;
    try {
      content = await readFile(this._eventsPath, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw new Error("Plugin package plan event journal is invalid");
    }
    const events: PluginPackagePlanEvent[] = [];
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        events.push(normalizeEvent(JSON.parse(line) as PluginPackagePlanEvent));
      } catch {
        throw new Error("Plugin package plan event journal is invalid");
      }
    }
    return events;
  }
}

function projectPlanAction(
  action: PluginPackagePlanActionRecord,
  context: { planId: string; timestamp: string; sequence: number; actor?: string },
): PluginPackagePlanEvent {
  return normalizeEvent({
    eventType: "mcp_plugin_package_plan",
    planId: context.planId,
    sequence: context.sequence,
    timestamp: context.timestamp,
    action: action.action,
    dryRun: true,
    approvalRequired: true,
    package: {
      name: safeLabel(action.package.name),
      version: action.action === "reject" ? "<redacted>" : safeLabel(action.package.version),
      source: "<redacted>",
      digest: action.action === "reject" ? "<redacted>" : safeDigest(action.package.digest),
    },
    sidecar: {
      id: safeLabel(action.sidecar.id),
      kind: SIDECAR_KINDS.has(action.sidecar.kind) ? action.sidecar.kind : "unknown",
    },
    reasons: safeLabels(action.reasons),
    warnings: [...EVENT_WARNINGS, ...safeLabels(action.warnings)],
    ...(action.signature === undefined ? {} : { signature: safeSignature(action.signature) }),
    ...(context.actor === undefined ? {} : { actor: context.actor }),
  });
}

function normalizeEvent(event: PluginPackagePlanEvent): PluginPackagePlanEvent {
  if (!isPlainRecord(event)) throw new Error("invalid event");
  rejectForbiddenDurableFields(event);
  const action = typeof event.action === "string" && EVENT_ACTIONS.has(event.action as PluginPackagePlanAction)
    ? event.action as PluginPackagePlanAction
    : undefined;
  if (action === undefined) throw new Error("invalid action");
  if (event.eventType !== "mcp_plugin_package_plan") throw new Error("invalid event type");
  if (event.dryRun !== true || event.approvalRequired !== true) throw new Error("invalid event boundary");
  if (!isPlainRecord(event.package) || !isPlainRecord(event.sidecar)) throw new Error("invalid event shape");
  if (event.package.source !== "<redacted>") throw new Error("invalid package source");
  const signature = safeOptionalSignature(event.signature);
  return {
    eventType: "mcp_plugin_package_plan",
    planId: safeId(event.planId),
    sequence: safeSequence(event.sequence),
    timestamp: toIso(event.timestamp),
    action,
    dryRun: true,
    approvalRequired: true,
    package: {
      name: safeLabel(event.package.name),
      version: action === "reject" ? "<redacted>" : safeLabel(event.package.version),
      source: "<redacted>",
      digest: action === "reject" ? "<redacted>" : safeDigest(event.package.digest),
    },
    sidecar: {
      id: safeLabel(event.sidecar.id),
      kind: safeSidecarKind(event.sidecar.kind),
    },
    reasons: safeLabels(event.reasons),
    warnings: safeLabels(event.warnings),
    ...(signature === undefined ? {} : { signature }),
    ...(event.actor === undefined ? {} : { actor: safeLabel(event.actor) }),
  };
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function safeSequence(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : 0;
}

function safeSidecarKind(value: unknown): PluginMcpSidecarKind | "unknown" {
  return typeof value === "string" && SIDECAR_KINDS.has(value as PluginMcpSidecarKind | "unknown")
    ? value as PluginMcpSidecarKind | "unknown"
    : "unknown";
}

function safeOptionalLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return safeLabel(value);
}

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function safeLabels(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(safeLabel))).sort();
}

function safeOptionalSignature(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return safeSignature(value);
}

function safeSignature(value: unknown): string {
  if (typeof value !== "string" || !/^mcp-plugin:[a-f0-9]{24}$/i.test(value)) return "<redacted>";
  return value;
}

function safeDigest(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  if (/^sha256:[a-f0-9]{64}$/i.test(value)) {
    return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
  }
  if (/^sha256:[a-f0-9]{11}\.\.\.[a-f0-9]{8}$/i.test(value)) {
    return value.toLowerCase();
  }
  return "<redacted>";
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) {
    const unique = new Set(compact).size;
    return unique >= 16;
  }
  return false;
}

function rejectForbiddenDurableFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenDurableFields(item);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (isForbiddenDurableKey(key)) throw new Error("forbidden durable field");
    rejectForbiddenDurableFields(entry);
  }
}

function isForbiddenDurableKey(key: string): boolean {
  return /^(approvalRequest|definition|transport|client|sidecarTransport|installCommand|startSidecar|postinstall|env|cwd|args|command)$/i.test(key);
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
