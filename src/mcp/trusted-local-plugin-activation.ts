export interface TrustedLocalPluginEntry {
  id: string;
  source: "bundled" | "installed";
  installed: boolean;
  trusted: boolean;
}

export interface TrustedPluginPreflight {
  pluginId: string;
  ready: boolean;
  reason?: string;
  activationSignature: string;
  registryFetchExecuted: false;
  packageCodeExecuted: false;
  credentialsPersisted: false;
  defaultExecution: false;
}

export interface TrustedPluginApproval {
  approved?: boolean;
  approvedBy?: string;
  signature?: string;
}

export interface TrustedPluginActivationReceipt {
  ok: boolean;
  pluginId: string;
  receiptId: string;
  active: boolean;
  reason?: string;
  approvedBy?: string;
  registryFetchExecuted: false;
  packageCodeExecuted: false;
  credentialsPersisted: false;
  defaultExecution: false;
}

export function buildTrustedPluginPreflight(entry: TrustedLocalPluginEntry): TrustedPluginPreflight {
  const ready = Boolean(entry.installed && entry.trusted && (entry.source === "bundled" || entry.source === "installed"));
  return {
    pluginId: sanitizeId(entry.id),
    ready,
    reason: ready ? undefined : "Trusted local plugin activation requires an installed bundled/local descriptor and trust.",
    activationSignature: `plugin-activate:${sanitizeId(entry.id)}`,
    registryFetchExecuted: false,
    packageCodeExecuted: false,
    credentialsPersisted: false,
    defaultExecution: false,
  };
}

export async function activateTrustedLocalPlugin(opts: {
  entry: TrustedLocalPluginEntry;
  approval: TrustedPluginApproval;
  supervisor: (entry: TrustedLocalPluginEntry) => Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string };
}): Promise<TrustedPluginActivationReceipt> {
  const preflight = buildTrustedPluginPreflight(opts.entry);
  if (!preflight.ready) return receipt(opts.entry.id, false, false, preflight.reason);
  if (!opts.approval.approved || opts.approval.signature !== preflight.activationSignature) {
    return receipt(opts.entry.id, false, false, "Exact plugin activation approval is required.");
  }
  const result = await Promise.resolve(opts.supervisor(opts.entry));
  return receipt(opts.entry.id, result.ok, result.ok, result.reason, opts.approval.approvedBy);
}

export async function deactivateTrustedLocalPlugin(opts: {
  receipt: TrustedPluginActivationReceipt;
  approval: TrustedPluginApproval;
  supervisor: (receipt: TrustedPluginActivationReceipt) => Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string };
}): Promise<TrustedPluginActivationReceipt> {
  const pluginId = sanitizeId(opts.receipt.pluginId);
  if (!opts.approval.approved || opts.approval.signature !== `plugin-deactivate:${pluginId}`) {
    return receipt(pluginId, false, opts.receipt.active, "Exact plugin deactivation approval is required.");
  }
  const result = await Promise.resolve(opts.supervisor(opts.receipt));
  return receipt(pluginId, result.ok, result.ok ? false : opts.receipt.active, result.reason, opts.approval.approvedBy);
}

export function renderTrustedPluginPreflight(preflight: TrustedPluginPreflight): string {
  return [
    "Trusted Plugin Preflight:",
    "",
    `Plugin: ${preflight.pluginId}`,
    `Ready: ${preflight.ready ? "yes" : "no"}`,
    preflight.reason ? `Reason: ${preflight.reason}` : "",
    `Activation signature: ${preflight.activationSignature}`,
    "Registry fetch executed: no",
    "Package code executed: no",
    "Credentials persisted: no",
    "Default execution: no",
    "Next valid command: /plugins activate <id> --approved",
  ].filter(Boolean).join("\n");
}

function receipt(
  pluginId: string,
  ok: boolean,
  active: boolean,
  reason?: string,
  approvedBy?: string,
): TrustedPluginActivationReceipt {
  const id = sanitizeId(pluginId);
  return {
    ok,
    pluginId: id,
    receiptId: `plugin_${active ? "active" : "inactive"}_${id}`,
    active,
    reason,
    approvedBy: approvedBy ? sanitizeId(approvedBy) : undefined,
    registryFetchExecuted: false,
    packageCodeExecuted: false,
    credentialsPersisted: false,
    defaultExecution: false,
  };
}

function sanitizeId(value: string): string {
  return String(value ?? "plugin").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "plugin";
}
