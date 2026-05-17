import type { PluginPackageInstallUpdateReceipt } from "./plugin-package-execution";
import type { PluginPackageMarketplaceInstallUpdateHandoff } from "./plugin-package-marketplace-install-handoff";

export type PluginPackageMarketplaceInstallUpdateExecutionState =
  | "not_executed"
  | "blocked"
  | "failed"
  | "completed";

export interface PluginPackageMarketplaceInstallUpdateExecutionStatusRequest {
  handoffs: PluginPackageMarketplaceInstallUpdateHandoff[];
  receipts?: PluginPackageInstallUpdateReceipt[];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceInstallUpdateExecutionStatusEntry {
  entryId: string;
  displayName: string;
  action: PluginPackageMarketplaceInstallUpdateHandoff["action"];
  state: PluginPackageMarketplaceInstallUpdateExecutionState;
  blockedReason?: string;
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
  approval: {
    required: true;
    signature: string;
  };
  receipt: {
    present: boolean;
    status?: PluginPackageInstallUpdateReceipt["status"];
    blockedReason?: string;
    hostActionExecuted: boolean;
    stepCount: number;
    latestStepCode?: number;
  };
  nextActions: string[];
}

export interface PluginPackageMarketplaceInstallUpdateExecutionStatusView {
  recordType: "mcp_plugin_package_install_update_execution_status_view";
  timestamp: string;
  handoffCount: number;
  receiptCount: number;
  entries: PluginPackageMarketplaceInstallUpdateExecutionStatusEntry[];
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  warnings: string[];
}

const STATUS_WARNINGS = [
  "Marketplace install/update execution status is a read-only projection over handoffs and supplied receipts.",
  "The status view does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Receipts attach only when action, approval signature, package identity, digest, and sidecar identity match the handoff.",
];

export function createPluginPackageMarketplaceInstallUpdateExecutionStatus(
  request: PluginPackageMarketplaceInstallUpdateExecutionStatusRequest,
): PluginPackageMarketplaceInstallUpdateExecutionStatusView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const handoffs = Array.isArray(request.handoffs) ? request.handoffs : [];
  const receipts = Array.isArray(request.receipts) ? request.receipts : [];
  return {
    recordType: "mcp_plugin_package_install_update_execution_status_view",
    timestamp,
    handoffCount: handoffs.length,
    receiptCount: receipts.length,
    entries: handoffs.map((handoff) => projectHandoff(handoff, receipts)),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...STATUS_WARNINGS],
  };
}

function projectHandoff(
  handoff: PluginPackageMarketplaceInstallUpdateHandoff,
  receipts: PluginPackageInstallUpdateReceipt[],
): PluginPackageMarketplaceInstallUpdateExecutionStatusEntry {
  const receipt = handoff.status === "ready" ? latestMatchingReceipt(handoff, receipts) : undefined;
  const receiptSummary = summarizeReceipt(receipt);
  const state = executionState(handoff, receipt);
  return {
    entryId: safeId(handoff.entry?.entryId),
    displayName: safeLabel(handoff.entry?.displayName),
    action: handoff.action === "import" || handoff.action === "update" ? handoff.action : "<blocked>",
    state,
    ...(state === "blocked" ? { blockedReason: safeReason(handoff.blockedReason ?? receipt?.blockedReason) } : {}),
    package: {
      name: safeLabel(handoff.package?.name),
      version: safeLabel(handoff.package?.version),
      source: "<redacted>",
      digest: safeDigest(handoff.package?.digest),
    },
    sidecar: {
      id: safeLabel(handoff.sidecar?.id),
      kind: safeLabel(handoff.sidecar?.kind),
    },
    approval: {
      required: true,
      signature: safeSignature(handoff.approval?.signature),
    },
    receipt: receiptSummary,
    nextActions: nextActions(state),
  };
}

function latestMatchingReceipt(
  handoff: PluginPackageMarketplaceInstallUpdateHandoff,
  receipts: PluginPackageInstallUpdateReceipt[],
): PluginPackageInstallUpdateReceipt | undefined {
  return receipts
    .filter((receipt) => matchesHandoff(handoff, receipt))
    .sort((left, right) => timestampMs(right.timestamp) - timestampMs(left.timestamp))[0];
}

function matchesHandoff(
  handoff: PluginPackageMarketplaceInstallUpdateHandoff,
  receipt: PluginPackageInstallUpdateReceipt,
): boolean {
  return isPlainRecord(receipt)
    && receipt.recordType === "mcp_plugin_package_install_update_receipt"
    && (receipt.action === "import" || receipt.action === "update")
    && receipt.action === handoff.action
    && safeSignature(receipt.signature) === safeSignature(handoff.approval?.signature)
    && safeLabel(receipt.package?.name) === safeLabel(handoff.package?.name)
    && safeLabel(receipt.package?.version) === safeLabel(handoff.package?.version)
    && safeDigest(receipt.package?.digest) === safeDigest(handoff.package?.digest)
    && safeLabel(receipt.sidecar?.id) === safeLabel(handoff.sidecar?.id)
    && safeLabel(receipt.sidecar?.kind) === safeLabel(handoff.sidecar?.kind);
}

function summarizeReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageMarketplaceInstallUpdateExecutionStatusEntry["receipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      hostActionExecuted: false,
      stepCount: 0,
    };
  }
  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  const latest = steps[steps.length - 1];
  return {
    present: true,
    status: receipt.status,
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeReason(receipt.blockedReason) }),
    hostActionExecuted: steps.length > 0,
    stepCount: steps.length,
    ...(latest === undefined ? {} : { latestStepCode: safeCode(latest.code) }),
  };
}

function executionState(
  handoff: PluginPackageMarketplaceInstallUpdateHandoff,
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageMarketplaceInstallUpdateExecutionState {
  if (handoff.status === "blocked") return "blocked";
  if (receipt === undefined) return "not_executed";
  if (receipt.status === "completed") return "completed";
  if (receipt.status === "failed") return "failed";
  return "blocked";
}

function nextActions(state: PluginPackageMarketplaceInstallUpdateExecutionState): string[] {
  switch (state) {
    case "completed":
      return ["Inspect installed package receipt and proceed to activation readiness only if policy allows."];
    case "failed":
      return ["Review the failed install/update receipt and retry through a fresh approved host execution if appropriate."];
    case "blocked":
      return ["Resolve the blocked install/update handoff before retrying host execution."];
    case "not_executed":
      return ["Execute the approved install/update handoff through the injected host executor if the operator still approves."];
  }
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
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

function safeSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
}

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:-]{1,80}$/i.test(value) && !looksSecret(value) ? value : "<redacted>";
}

function safeCode(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 255 ? value : 1;
}

function timestampMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function looksSecret(value: unknown): boolean {
  return typeof value === "string" && /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) return new Set(compact).size >= 16;
  return false;
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
