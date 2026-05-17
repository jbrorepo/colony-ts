import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  createDefaultBrowserSidecarDescriptor,
  listBrowserSidecarCommandScopes,
  type BrowserSidecarDescriptor,
} from "./browser/browser-sidecar-contracts";
import {
  BrowserSidecarRuntime,
  type BrowserSidecarLifecycleResult,
  type BrowserSidecarSnapshot,
} from "./browser/browser-sidecar-runtime";

export interface GatewayBrowserContext {
  runtime?: BrowserSidecarRuntime | null;
}

export function buildBrowserCommandPayload(
  args: string[],
  context: GatewayBrowserContext = {},
): GatewayBasicCommandPayload {
  const command = (args[0] ?? "status").toLowerCase();
  const descriptor = createDefaultBrowserSidecarDescriptor();
  const runtime = context.runtime ?? new BrowserSidecarRuntime();

  if (args.length === 0 || command === "status") {
    return {
      output: renderBrowserStatus(descriptor, runtime.snapshot()),
      data: {
        action: "browser_status",
        status: runtime.snapshot().status,
      },
    };
  }

  if (command === "start") {
    const approved = args.includes("--approved");
    const result = runtime.start(approved
      ? { approved: true, approvedBy: "operator", reason: "slash-command approval flag" }
      : undefined);
    return renderBrowserLifecycle("start", result);
  }

  if (command === "stop") {
    return renderBrowserLifecycle("stop", runtime.stop());
  }

  if (command === "scopes") {
    const scopes = listBrowserSidecarCommandScopes();
    return {
      output: renderBrowserScopes(scopes),
      data: {
        action: "browser_scopes",
        count: scopes.length,
      },
    };
  }

  if (command === "contract") {
    return {
      output: renderBrowserContract(descriptor),
      data: {
        action: "browser_contract",
        invariantCount: descriptor.invariants.length,
      },
    };
  }

  return {
    output: "Usage: /browser [status|start --approved|stop|scopes|contract]",
    isError: true,
    data: { action: "browser_usage" },
  };
}

function renderBrowserStatus(descriptor: BrowserSidecarDescriptor, snapshot: BrowserSidecarSnapshot): string {
  return [
    "Browser Sidecar Boundary:",
    "",
    `ID: ${descriptor.sidecarId}`,
    `Title: ${descriptor.title}`,
    `Status: ${snapshot.status}`,
    `Local only: ${yesNo(descriptor.localOnly)}`,
    `Starts listener by default: ${yesNo(descriptor.startsListenerByDefault)}`,
    `Starts browser by default: ${yesNo(descriptor.startsBrowserByDefault)}`,
    `Persists credentials: ${yesNo(descriptor.persistsCredentials)}`,
    `Enables tunnel by default: ${yesNo(descriptor.enablesTunnelByDefault)}`,
    `Listener bound: ${yesNo(snapshot.listenerBound)}`,
    `Browser spawned: ${yesNo(snapshot.browserSpawned)}`,
    `Tunnel active: ${yesNo(snapshot.tunnelActive)}`,
    "",
    "Surfaces:",
    ...descriptor.surfaces.map((surface) => `- ${surface.id} | ${surface.title}`),
    "",
    `Next slice: ${descriptor.nextSlice}`,
    "",
    "Inspect: /browser start --approved | /browser stop | /browser scopes | /browser contract",
  ].join("\n");
}

function renderBrowserLifecycle(
  command: "start" | "stop",
  result: BrowserSidecarLifecycleResult,
): GatewayBasicCommandPayload {
  if (result.status === "blocked") {
    return {
      output: [
        "Browser sidecar start blocked.",
        "",
        result.reason,
        "Use /browser start --approved after reviewing local-only sidecar boundaries.",
      ].join("\n"),
      isError: true,
      data: { action: "browser_start_blocked", status: result.snapshot.status },
    };
  }

  return {
    output: [
      result.status === "started" ? "Browser sidecar started." : "Browser sidecar stopped.",
      "",
      result.reason,
      `Status: ${result.snapshot.status}`,
      `No listener bound: ${yesNo(!result.snapshot.listenerBound)}`,
      `No browser spawned: ${yesNo(!result.snapshot.browserSpawned)}`,
      `No credentials persisted: ${yesNo(!result.snapshot.credentialsPersisted)}`,
      `No tunnel active: ${yesNo(!result.snapshot.tunnelActive)}`,
    ].join("\n"),
    data: {
      action: command === "start" ? "browser_start" : "browser_stop",
      status: result.snapshot.status,
    },
  };
}

function renderBrowserScopes(scopes: ReturnType<typeof listBrowserSidecarCommandScopes>): string {
  return [
    "Browser Sidecar Command Scopes:",
    "",
    ...scopes.flatMap((scope) => [
      `- ${scope.id} | approval ${yesNo(scope.requiresApproval)} | ${scope.title}`,
      `  ${scope.description}`,
      `  Examples: ${scope.examples.join(", ")}`,
    ]),
    "",
    "Inspect: /browser | /browser contract",
  ].join("\n");
}

function renderBrowserContract(descriptor: BrowserSidecarDescriptor): string {
  return [
    "Browser Sidecar Safety Contract:",
    "",
    "This view is descriptor-only. It does not spawn Chromium, bind a listener, persist credentials, or expose a tunnel.",
    "",
    "Invariants:",
    ...descriptor.invariants.map((invariant) => `- ${invariant}`),
    "",
    "Inspect: /browser | /browser scopes",
  ].join("\n");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
