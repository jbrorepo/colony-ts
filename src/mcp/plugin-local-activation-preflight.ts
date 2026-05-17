export interface LocalPluginActivationPreflightRequest {
  packageId: string;
  sidecarId: string;
  approved: boolean;
  approvalSignature?: string;
}

export interface LocalPluginActivationPreflight {
  packageId: string;
  sidecarId: string;
  state: "blocked" | "ready_for_host_activation";
  defaultExecution: false;
  registryFetch: false;
  packageCodeExecution: false;
  credentialPersistence: false;
  operatorSummary: string;
}

export function buildLocalPluginActivationPreflight(
  request: LocalPluginActivationPreflightRequest,
): LocalPluginActivationPreflight {
  const ready = request.approved && Boolean(request.approvalSignature);
  return {
    packageId: safeLabel(request.packageId),
    sidecarId: safeLabel(request.sidecarId),
    state: ready ? "ready_for_host_activation" : "blocked",
    defaultExecution: false,
    registryFetch: false,
    packageCodeExecution: false,
    credentialPersistence: false,
    operatorSummary: ready
      ? "Approved local plugin sidecar preflight is ready for host-owned activation; no default execution, registry fetch, package-code execution, or credential persistence occurs here."
      : "Local plugin sidecar activation is blocked until exact approval evidence is supplied; no default execution, registry fetch, package-code execution, or credential persistence occurs here.",
  };
}

function safeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").slice(0, 120) || "unknown";
}
