import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  createDefaultBrowserSidecarDescriptor,
  listBrowserSidecarCommandScopes,
  type BrowserSidecarDescriptor,
} from "./browser/browser-sidecar-contracts";
import {
  BrowserSidecarRuntime,
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
    const snapshot = runtime.snapshot();
    if (!approved) {
      return {
        output: [
          "Browser sidecar start blocked.",
          "",
          "Explicit approval required before starting the local browser sidecar lifecycle.",
          "Use /browser start --approved after reviewing local-only sidecar boundaries.",
        ].join("\n"),
        isError: true,
        data: { action: "browser_start_blocked", status: snapshot.status },
      };
    }
    return {
      output: [
        "Browser sidecar started.",
        "",
        "Start request accepted for execution by the local browser runtime handler.",
        `Status: ${snapshot.status}`,
        `No listener bound: ${yesNo(!snapshot.listenerBound)}`,
        `No browser spawned: ${yesNo(!snapshot.browserSpawned)}`,
        `No credentials persisted: ${yesNo(!snapshot.credentialsPersisted)}`,
        `No tunnel active: ${yesNo(!snapshot.tunnelActive)}`,
      ].join("\n"),
      data: {
        action: "browser_start",
        status: snapshot.status,
      },
      action: { kind: "browser_start", approved: true },
    };
  }

  if (command === "stop") {
    const snapshot = runtime.snapshot();
    return {
      output: [
        "Browser sidecar stopped.",
        "",
        "Stop request accepted for execution by the local browser runtime handler.",
        `Status: ${snapshot.status}`,
        `No listener bound: ${yesNo(!snapshot.listenerBound)}`,
        `No browser spawned: ${yesNo(!snapshot.browserSpawned)}`,
        `No credentials persisted: ${yesNo(!snapshot.credentialsPersisted)}`,
        `No tunnel active: ${yesNo(!snapshot.tunnelActive)}`,
      ].join("\n"),
      data: {
        action: "browser_stop",
        status: snapshot.status,
      },
      action: { kind: "browser_stop" },
    };
  }

  if (command === "open") {
    const url = args.find((arg, index) => index > 0 && !arg.startsWith("--")) ?? "";
    const approved = args.includes("--approved");
    return {
      output: [
        approved ? "Browser open approved." : "Browser open blocked.",
        "",
        approved
          ? `Open request accepted for local injected browser runtime: ${url}`
          : "Explicit approval required before browser navigation.",
        "Execution path: injected browser driver only; no default browser spawn, listener, tunnel, or credential persistence.",
        "Next valid command: /browser read | /browser screenshot --approved | /browser stop",
      ].join("\n"),
      isError: !approved,
      data: { action: approved ? "browser_open" : "browser_open_blocked", url },
      action: approved ? { kind: "browser_open", url, approved: true } : { kind: "display" },
    };
  }

  if (command === "read") {
    const snapshot = runtime.snapshot();
    const preview = runtime.lastPagePreview();
    return {
      output: [
        "Browser Page:",
        "",
        `Status: ${snapshot.status}`,
        `URL: ${snapshot.currentUrl ?? "none"}`,
        "Untrusted: yes",
        preview ? preview.text : "(No open page preview available)",
        preview?.truncated ? `Hidden chars: ${preview.hiddenChars}` : "",
        "",
        "Next valid command: /browser screenshot --approved | /browser click <selector> --approved | /browser stop",
      ].filter(Boolean).join("\n"),
      data: { action: "browser_read", untrusted: true },
    };
  }

  if (command === "screenshot") {
    const approved = args.includes("--approved");
    return {
      output: [
        approved ? "Browser screenshot approved." : "Browser screenshot blocked.",
        "",
        approved
          ? "Screenshot request accepted for the injected local browser driver."
          : "Explicit approval required before creating browser artifacts.",
        "Artifact output is bounded, redacted, and marked untrusted.",
        "Next valid command: /browser artifacts | /browser read",
      ].join("\n"),
      isError: !approved,
      data: { action: approved ? "browser_screenshot" : "browser_screenshot_blocked" },
      action: approved ? { kind: "browser_screenshot", approved: true } : { kind: "display" },
    };
  }

  if (command === "click" || command === "type") {
    const approved = args.includes("--approved");
    return {
      output: [
        approved ? `Browser ${command} approved.` : `Browser ${command} blocked.`,
        "",
        approved
          ? "Write request accepted for the injected local browser driver and must produce a receipt."
          : "Explicit approval required before browser write actions.",
        "Credentials persisted: no",
        "Default live mutation: no",
        "Next valid command: /browser read | /browser artifacts | /browser stop",
      ].join("\n"),
      isError: !approved,
      data: { action: approved ? `browser_${command}` : `browser_${command}_blocked` },
      action: approved
        ? command === "click"
          ? { kind: "browser_click", selector: args[1] ?? "", approved: true }
          : { kind: "browser_type", selector: args[1] ?? "", text: args.slice(2).filter((arg) => arg !== "--approved").join(" "), approved: true }
        : { kind: "display" },
    };
  }

  if (command === "wait") {
    return {
      output: [
        "Browser wait boundary recorded.",
        "",
        `Target: ${args.slice(1).join(" ") || "unspecified"}`,
        "Next valid command: /browser read | /browser stop",
      ].join("\n"),
      data: { action: "browser_wait" },
      action: { kind: "browser_wait", target: args.slice(1).join(" ") || "unspecified" },
    };
  }

  if (command === "artifacts") {
    const artifacts = runtime.artifacts();
    return {
      output: [
        "Browser Artifacts:",
        "",
        ...(artifacts.length === 0
          ? ["(No browser artifacts recorded)"]
          : artifacts.map((artifact) => `- ${artifact.artifactId} | ${artifact.name} | ${artifact.mimeType} | ${artifact.bytes} bytes | untrusted yes`)),
        "",
        "Next valid command: /browser read | /browser screenshot --approved",
      ].join("\n"),
      data: { action: "browser_artifacts", count: artifacts.length },
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
    output: "Usage: /browser [status|start --approved|open <url> --approved|read|screenshot --approved|click <selector> --approved|type <selector> <text> --approved|wait <selector|ms>|artifacts|stop|scopes|contract]",
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
    "Next valid command: /browser start --approved | /browser open <url> --approved | /browser read",
    "Inspect: /browser stop | /browser scopes | /browser contract",
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
