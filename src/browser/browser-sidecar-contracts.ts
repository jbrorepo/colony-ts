export type BrowserSidecarStatus =
  | "planned"
  | "descriptor_only"
  | "available"
  | "active"
  | "blocked";

export type BrowserSidecarInvariant =
  | "local_only"
  | "no_default_listener"
  | "no_default_browser_spawn"
  | "no_credential_persistence"
  | "no_default_tunnel"
  | "page_content_is_untrusted"
  | "approval_required_for_write"
  | "approval_required_for_tunnel"
  | "bounded_output_required";

export interface BrowserSidecarSurface {
  id: string;
  title: string;
  description: string;
}

export interface BrowserSidecarCommandScope {
  id: string;
  title: string;
  requiresApproval: boolean;
  description: string;
  examples: string[];
}

export interface BrowserSidecarDescriptor {
  sidecarId: string;
  title: string;
  status: BrowserSidecarStatus;
  localOnly: boolean;
  startsListenerByDefault: boolean;
  startsBrowserByDefault: boolean;
  persistsCredentials: boolean;
  enablesTunnelByDefault: boolean;
  invariants: BrowserSidecarInvariant[];
  surfaces: BrowserSidecarSurface[];
  commandScopes: BrowserSidecarCommandScope[];
  nextSlice: string;
}

const COMMAND_SCOPES: BrowserSidecarCommandScope[] = [
  {
    id: "read",
    title: "Read Page State",
    requiresApproval: false,
    description: "Read bounded page text, accessibility snapshots, URL, console summaries, network summaries, and structured metadata.",
    examples: ["text", "snapshot", "url", "console"],
  },
  {
    id: "write",
    title: "Mutate Page State",
    requiresApproval: true,
    description: "Navigate, click, fill, upload, change viewport, or alter browser/session state.",
    examples: ["goto", "click", "fill", "upload"],
  },
  {
    id: "artifact",
    title: "Create Visual Artifacts",
    requiresApproval: true,
    description: "Create screenshots, PDFs, archives, or durable page-derived artifacts through bounded output storage.",
    examples: ["screenshot", "pdf", "archive"],
  },
  {
    id: "tunnel",
    title: "Expose Remote Pairing Surface",
    requiresApproval: true,
    description: "Open any remote-accessible tunnel or paired-agent surface. This is always high risk and never default live behavior.",
    examples: ["pair", "tunnel"],
  },
];

const SURFACES: BrowserSidecarSurface[] = [
  {
    id: "refs",
    title: "Element References",
    description: "Stable operator-facing element handles derived from accessibility snapshots, not DOM mutation.",
  },
  {
    id: "screenshots",
    title: "Screenshots",
    description: "Bounded visual artifacts routed through Colony artifact storage and redaction policy.",
  },
  {
    id: "logs",
    title: "Console And Network Logs",
    description: "Bounded summaries for debugging, with sensitive values redacted before transcript persistence.",
  },
  {
    id: "handoff",
    title: "Human Handoff",
    description: "Explicit operator handoff for authentication, MFA, CAPTCHA, or other browser actions Colony should not automate.",
  },
];

export function createDefaultBrowserSidecarDescriptor(): BrowserSidecarDescriptor {
  return {
    sidecarId: "browser-sidecar",
    title: "Persistent Browser Sidecar",
    status: "planned",
    localOnly: true,
    startsListenerByDefault: false,
    startsBrowserByDefault: false,
    persistsCredentials: false,
    enablesTunnelByDefault: false,
    invariants: [
      "local_only",
      "no_default_listener",
      "no_default_browser_spawn",
      "no_credential_persistence",
      "no_default_tunnel",
      "page_content_is_untrusted",
      "approval_required_for_write",
      "approval_required_for_tunnel",
      "bounded_output_required",
    ],
    surfaces: SURFACES.map((surface) => ({ ...surface })),
    commandScopes: listBrowserSidecarCommandScopes(),
    nextSlice:
      "Implement a host-owned sidecar handoff descriptor that can be approved before any real daemon spawn, listener bind, browser launch, or tunnel exposure.",
  };
}

export function listBrowserSidecarCommandScopes(): BrowserSidecarCommandScope[] {
  return COMMAND_SCOPES.map((scope) => ({
    ...scope,
    examples: [...scope.examples],
  }));
}
