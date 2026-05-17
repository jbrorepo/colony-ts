import type {
  PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
  PluginPackageMarketplaceMetadataBoundActivationReadinessView,
} from "./plugin-package-marketplace-metadata-bound-activation-readiness";

export type PluginPackageMarketplaceMetadataBoundActivationHandoffStatus = "ready" | "blocked";

export type PluginPackageMarketplaceMetadataBoundActivationHandoffBlockedReason =
  | "invalid_selector"
  | "entry_not_found"
  | "approval_signature_mismatch"
  | "already_active"
  | "readiness_not_ready";

export interface PluginPackageMarketplaceMetadataBoundActivationHandoffRequest {
  readinessView: PluginPackageMarketplaceMetadataBoundActivationReadinessView;
  entryId: string;
  sidecarSignature: string;
  approvalSignature: string;
  approvedBy?: string;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceMetadataBoundActivationHostAction {
  kind: "start_metadata_bound_plugin_package_sidecar" | "<blocked>";
  entryId: string;
  sidecarSignature: string;
  approvalSignature: string;
  supervisorPath: "executeApprovedPluginPackageMarketplaceActivationHandoff" | "<blocked>";
  metadataBoundActivationReadinessRecordType:
    | "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
    | "<blocked>";
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

export interface PluginPackageMarketplaceMetadataBoundActivationHandoff {
  recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_handoff";
  timestamp: string;
  status: PluginPackageMarketplaceMetadataBoundActivationHandoffStatus;
  blockedReason?: PluginPackageMarketplaceMetadataBoundActivationHandoffBlockedReason;
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
  metadataBoundInstallRequired: true;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  installExecution: {
    state: string;
    receiptPresent: boolean;
    packageInstalled: boolean;
    metadataGate: {
      required: true;
      state: string;
      registryMetadataApplied: boolean;
      registryMetadataVerified: boolean;
    };
  };
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
  hostAction: PluginPackageMarketplaceMetadataBoundActivationHostAction;
  warnings: string[];
}

const HANDOFF_WARNINGS = [
  "Metadata-bound activation handoff is a redacted operator descriptor and performs no sidecar start by itself.",
  "A completed metadata-bound install/update status and exact activation approval are required before a host can use the injected supervisor path.",
  "The handoff never fetches registries, installs packages, executes package code, mutates catalogs, stores credentials, or persists approval request bodies.",
];

export function createPluginPackageMarketplaceMetadataBoundActivationHandoff(
  request: PluginPackageMarketplaceMetadataBoundActivationHandoffRequest,
): PluginPackageMarketplaceMetadataBoundActivationHandoff {
  const timestamp = toIso(request.timestamp ?? new Date());
  const entryId = safeId(request.entryId);
  const sidecarSignature = safeSignature(request.sidecarSignature);
  const approvalSignature = safeSignature(request.approvalSignature);
  const catalogId = safeId(request.readinessView?.catalogId);
  const readinessRecordType = request.readinessView?.recordType === "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
    ? request.readinessView.recordType
    : "<blocked>";
  const selected = selectReadinessEntry(request.readinessView, entryId, sidecarSignature);
  const base = handoffBase(
    timestamp,
    catalogId,
    entryId,
    sidecarSignature,
    approvalSignature,
    readinessRecordType,
    selected,
    request.approvedBy,
  );

  if (entryId === "<redacted>" || sidecarSignature === "<redacted>" || approvalSignature === "<redacted>") {
    return block(base, "invalid_selector");
  }
  if (selected === undefined) {
    return block(base, "entry_not_found");
  }
  if (approvalSignature !== sidecarSignature) {
    return block(base, "approval_signature_mismatch");
  }
  if (selected.state === "active") {
    return block(base, "already_active");
  }
  if (selected.state !== "ready_for_activation_handoff") {
    return block(base, "readiness_not_ready");
  }

  return freezeHandoff({
    ...handoffBase(
      timestamp,
      catalogId,
      entryId,
      sidecarSignature,
      approvalSignature,
      readinessRecordType,
      selected,
      request.approvedBy,
    ),
    status: "ready",
    hostActionRequired: true,
    requiresInjectedSupervisor: true,
    hostAction: readyHostAction(entryId, sidecarSignature, approvalSignature, readinessRecordType, selected),
  });
}

function selectReadinessEntry(
  view: PluginPackageMarketplaceMetadataBoundActivationReadinessView,
  entryId: string,
  signature: string,
): PluginPackageMarketplaceMetadataBoundActivationReadinessEntry | undefined {
  if (entryId === "<redacted>" || signature === "<redacted>" || !Array.isArray(view?.entries)) return undefined;
  return view.entries.find((candidate) => candidate.entryId === entryId && candidate.signature === signature);
}

function handoffBase(
  timestamp: string,
  catalogId: string,
  entryId: string,
  sidecarSignature: string,
  approvalSignature: string,
  readinessRecordType:
    | "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
    | "<blocked>",
  selected: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry | undefined,
  approvedBy?: string,
): PluginPackageMarketplaceMetadataBoundActivationHandoff {
  const packageSummary = selected?.package ?? {
    name: "<redacted>",
    version: "<redacted>",
    source: "<redacted>",
    digest: "<redacted>",
  };
  const sidecarSummary = selected?.sidecar ?? {
    id: "<redacted>",
    kind: "<redacted>",
  };
  const installExecution = selected?.installExecution ?? {
    state: "<missing>",
    receiptPresent: false,
    packageInstalled: false,
    metadataGate: {
      required: true as const,
      state: "<missing>",
      registryMetadataApplied: false,
      registryMetadataVerified: false,
    },
  };
  return freezeHandoff({
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_handoff",
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
    metadataBoundInstallRequired: true,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    installExecution: {
      state: safeLabel(installExecution.state),
      receiptPresent: installExecution.receiptPresent === true,
      packageInstalled: installExecution.packageInstalled === true,
      metadataGate: {
        required: true,
        state: safeLabel(installExecution.metadataGate?.state),
        registryMetadataApplied: installExecution.metadataGate?.registryMetadataApplied === true,
        registryMetadataVerified: installExecution.metadataGate?.registryMetadataVerified === true,
      },
    },
    package: {
      name: safeLabel(packageSummary.name),
      version: safeLabel(packageSummary.version),
      source: "<redacted>",
      digest: safeDigest(packageSummary.digest),
    },
    sidecar: {
      id: safeLabel(sidecarSummary.id),
      kind: safeLabel(sidecarSummary.kind),
    },
    hostAction: {
      kind: "<blocked>",
      entryId,
      sidecarSignature,
      approvalSignature: approvalSignature === sidecarSignature ? approvalSignature : "<redacted>",
      supervisorPath: "<blocked>",
      metadataBoundActivationReadinessRecordType: readinessRecordType === "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
        ? readinessRecordType
        : "<blocked>",
      package: {
        name: safeLabel(packageSummary.name),
        version: safeLabel(packageSummary.version),
        source: "<redacted>",
        digest: safeDigest(packageSummary.digest),
      },
      sidecar: {
        id: safeLabel(sidecarSummary.id),
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
  readinessRecordType:
    | "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
    | "<blocked>",
  selected: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
): PluginPackageMarketplaceMetadataBoundActivationHostAction {
  return {
    kind: "start_metadata_bound_plugin_package_sidecar",
    entryId,
    sidecarSignature,
    approvalSignature,
    supervisorPath: "executeApprovedPluginPackageMarketplaceActivationHandoff",
    metadataBoundActivationReadinessRecordType: readinessRecordType === "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
      ? readinessRecordType
      : "<blocked>",
    package: {
      name: safeLabel(selected.package.name),
      version: safeLabel(selected.package.version),
      source: "<redacted>",
      digest: safeDigest(selected.package.digest),
    },
    sidecar: {
      id: safeLabel(selected.sidecar.id),
      kind: safeLabel(selected.sidecar.kind),
    },
  };
}

function block(
  base: PluginPackageMarketplaceMetadataBoundActivationHandoff,
  reason: PluginPackageMarketplaceMetadataBoundActivationHandoffBlockedReason,
): PluginPackageMarketplaceMetadataBoundActivationHandoff {
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
      metadataBoundActivationReadinessRecordType: "<blocked>",
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
  handoff: PluginPackageMarketplaceMetadataBoundActivationHandoff,
): PluginPackageMarketplaceMetadataBoundActivationHandoff {
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
