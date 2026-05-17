import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  createDefaultBrowserSidecarDescriptor,
  listBrowserSidecarCommandScopes,
  type BrowserSidecarDescriptor,
} from "./browser/browser-sidecar-contracts";

export function buildBrowserCommandPayload(args: string[]): GatewayBasicCommandPayload {
  const command = (args[0] ?? "status").toLowerCase();
  const descriptor = createDefaultBrowserSidecarDescriptor();

  if (args.length === 0 || command === "status") {
    return {
      output: renderBrowserStatus(descriptor),
      data: {
        action: "browser_status",
        status: descriptor.status,
      },
    };
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
    output: "Usage: /browser [status|scopes|contract]",
    isError: true,
    data: { action: "browser_usage" },
  };
}

function renderBrowserStatus(descriptor: BrowserSidecarDescriptor): string {
  return [
    "Browser Sidecar Boundary:",
    "",
    `ID: ${descriptor.sidecarId}`,
    `Title: ${descriptor.title}`,
    `Status: ${descriptor.status}`,
    `Local only: ${yesNo(descriptor.localOnly)}`,
    `Starts listener by default: ${yesNo(descriptor.startsListenerByDefault)}`,
    `Starts browser by default: ${yesNo(descriptor.startsBrowserByDefault)}`,
    `Persists credentials: ${yesNo(descriptor.persistsCredentials)}`,
    `Enables tunnel by default: ${yesNo(descriptor.enablesTunnelByDefault)}`,
    "",
    "Surfaces:",
    ...descriptor.surfaces.map((surface) => `- ${surface.id} | ${surface.title}`),
    "",
    `Next slice: ${descriptor.nextSlice}`,
    "",
    "Inspect: /browser scopes | /browser contract",
  ].join("\n");
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
