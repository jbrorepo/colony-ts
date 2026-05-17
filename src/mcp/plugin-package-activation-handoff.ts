import type {
  PluginPackageMarketplaceActivationEntryReadiness,
  PluginPackageMarketplaceActivationReadinessView,
  PluginPackageMarketplaceActivationSidecarReadiness,
} from "./plugin-package-activation-readiness";

export type PluginPackageMarketplaceActivationHandoffStatus = "ready" | "blocked";

export type PluginPackageMarketplaceActivationHandoffBlockedReason =
  | "invalid_selector"
  | "entry_not_found"
  | "sidecar_not_found"
  | "approval_signature_mismatch"
  | "already_active"
  | "readiness_not_ready";

export interface PluginPackageMarketplaceActivationHandoffRequest {
  readinessView: PluginPackageMarketplaceActivationReadinessView;
  entryId: string;
  sidecarSignature: string;
  approvalSignature: string;
  approvedBy?: string;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceActivationHostAction {
  kind: "start_plugin_package_sidecar" | "<blocked>";
  entryId: string;
  sidecarSignature: string;
  approvalSignature: string;
  supervisorPath: "executeApprovedPluginPackageSidecarActivation" | "<blocked>";
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
}

export interface PluginPackageMarketplaceActivationHandoff {
  recordType: "mcp_plugin_package_activation_handoff";
  timestamp: string;
  status: PluginPackageMarketplaceActivationHandoffStatus;
  blockedReason?: PluginPackageMarketplaceActivationHandoffBlockedReason;
  catalogId: string;
  entryId: string;
  sidecarSignature: string;
  approvalRequired: true;
  approval: {
    present: boolean;
    approvedBy?: string;
  };
  hostActionRequired: boolean;
  requiresInjectedSupervisor: boolean;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
  hostAction: PluginPackageMarketplaceActivationHostAction;
  warnings: string[];
}

const HANDOFF_WARNINGS = [
  "Activation handoff is a redacted operator descriptor and performs no sidecar start by itself.",
  "A host must call the approved injected supervisor activation path with the matching package action and completed install/update receipt.",
  "The handoff never stores credentials, registry responses, package source URLs, transport internals, or approval request bodies.",
];

export function createPluginPackageMarketplaceActivationHandoff(
  request: PluginPackageMarketplaceActivationHandoffRequest,
): PluginPackageMarketplaceActivationHandoff {
  const timestamp = toIso(request.timestamp ?? new Date());
  const entryId = safeId(request.entryId);
  const sidecarSignature = safeSignature(request.sidecarSignature);
  const approvalSignature = safeSignature(request.approvalSignature);
  const catalogId = safeId(request.readinessView?.catalogId);
  const selected = selectReadiness(request.readinessView, entryId, sidecarSignature);
  const base = handoffBase(timestamp, catalogId, entryId, sidecarSignature, approvalSignature, selected);

  if (entryId === "<redacted>" || sidecarSignature === "<redacted>" || approvalSignature === "<redacted>") {
    return block(base, "invalid_selector");
  }
  if (selected.entry === undefined) {
    return block(base, "entry_not_found");
  }
  if (selected.sidecar === undefined) {
    return block(base, "sidecar_not_found");
  }
  if (approvalSignature !== sidecarSignature) {
    return block(base, "approval_signature_mismatch");
  }
  if (selected.sidecar.state === "active") {
    return block(base, "already_active");
  }
  if (selected.sidecar.state !== "ready_for_operator_handoff") {
    return block(base, "readiness_not_ready");
  }

  return freezeHandoff({
    ...handoffBase(timestamp, catalogId, entryId, sidecarSignature, approvalSignature, selected, request.approvedBy),
    status: "ready",
    hostActionRequired: true,
    requiresInjectedSupervisor: true,
    hostAction: readyHostAction(entryId, sidecarSignature, approvalSignature, selected),
  });
}

function selectReadiness(
  view: PluginPackageMarketplaceActivationReadinessView,
  entryId: string,
  signature: string,
): {
  entry?: PluginPackageMarketplaceActivationEntryReadiness;
  sidecar?: PluginPackageMarketplaceActivationSidecarReadiness;
} {
  if (entryId === "<redacted>" || signature === "<redacted>" || !Array.isArray(view?.entries)) return {};
  const entry = view.entries.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return {};
  const sidecar = entry.sidecars.find((candidate) => candidate.signature === signature);
  return { entry, sidecar };
}

function handoffBase(
  timestamp: string,
  catalogId: string,
  entryId: string,
  sidecarSignature: string,
  approvalSignature: string,
  selected: {
    entry?: PluginPackageMarketplaceActivationEntryReadiness;
    sidecar?: PluginPackageMarketplaceActivationSidecarReadiness;
  },
  approvedBy?: string,
): PluginPackageMarketplaceActivationHandoff {
  const packageSummary = selected.entry?.package ?? {
    name: "<redacted>",
    version: "<redacted>",
    source: "<redacted>",
    digest: "<redacted>",
  };
  const sidecarSummary = selected.sidecar ?? {
    sidecarId: "<redacted>",
    kind: "<redacted>",
  };
  return freezeHandoff({
    recordType: "mcp_plugin_package_activation_handoff",
    timestamp,
    status: "blocked",
    catalogId,
    entryId,
    sidecarSignature,
    approvalRequired: true,
    approval: {
      present: approvalSignature !== "<redacted>" && approvalSignature === sidecarSignature,
      ...(approvedBy === undefined ? {} : { approvedBy: safeLabel(approvedBy) }),
    },
    hostActionRequired: false,
    requiresInjectedSupervisor: false,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    package: {
      name: safeLabel(packageSummary.name),
      version: safeLabel(packageSummary.version),
      source: "<redacted>",
      digest: safeDigest(packageSummary.digest),
    },
    sidecar: {
      id: safeLabel(sidecarSummary.sidecarId),
      kind: safeLabel(sidecarSummary.kind),
    },
    hostAction: {
      kind: "<blocked>",
      entryId,
      sidecarSignature,
      approvalSignature: approvalSignature === sidecarSignature ? approvalSignature : "<redacted>",
      supervisorPath: "<blocked>",
      package: {
        name: safeLabel(packageSummary.name),
        version: safeLabel(packageSummary.version),
        source: "<redacted>",
        digest: safeDigest(packageSummary.digest),
      },
      sidecar: {
        id: safeLabel(sidecarSummary.sidecarId),
        kind: safeLabel(sidecarSummary.kind),
      },
    },
    warnings: [...HANDOFF_WARNINGS],
  });
}

function readyHostAction(
  entryId: string,
  sidecarSignature: string,
  approvalSignature: string,
  selected: {
    entry?: PluginPackageMarketplaceActivationEntryReadiness;
    sidecar?: PluginPackageMarketplaceActivationSidecarReadiness;
  },
): PluginPackageMarketplaceActivationHostAction {
  return {
    kind: "start_plugin_package_sidecar",
    entryId,
    sidecarSignature,
    approvalSignature,
    supervisorPath: "executeApprovedPluginPackageSidecarActivation",
    package: {
      name: safeLabel(selected.entry?.package.name),
      version: safeLabel(selected.entry?.package.version),
      source: "<redacted>",
      digest: safeDigest(selected.entry?.package.digest),
    },
    sidecar: {
      id: safeLabel(selected.sidecar?.sidecarId),
      kind: safeLabel(selected.sidecar?.kind),
    },
  };
}

function block(
  base: PluginPackageMarketplaceActivationHandoff,
  reason: PluginPackageMarketplaceActivationHandoffBlockedReason,
): PluginPackageMarketplaceActivationHandoff {
  return freezeHandoff({
    ...base,
    status: "blocked",
    blockedReason: reason,
    hostActionRequired: false,
    requiresInjectedSupervisor: false,
    activation: false,
    sidecarStarted: false,
    hostAction: {
      ...base.hostAction,
      kind: "<blocked>",
      supervisorPath: "<blocked>",
    },
  });
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function safeSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
}

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
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

function looksSecret(value: unknown): boolean {
  return typeof value === "string" && /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) {
    return new Set(compact).size >= 16;
  }
  return false;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function freezeHandoff(
  handoff: PluginPackageMarketplaceActivationHandoff,
): PluginPackageMarketplaceActivationHandoff {
  deepFreeze(handoff);
  return handoff;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
