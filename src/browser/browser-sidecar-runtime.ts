import { createDefaultBrowserSidecarDescriptor } from "./browser-sidecar-contracts";

export interface BrowserSidecarApproval {
  approved?: boolean;
  approvedBy?: string;
  reason?: string;
}

export interface BrowserSidecarSnapshot {
  sidecarId: string;
  status: "available" | "active" | "blocked";
  localOnly: true;
  listenerBound: false;
  browserSpawned: false;
  credentialsPersisted: false;
  tunnelActive: false;
  approvedBy?: string;
  approvalReason?: string;
}

export type BrowserSidecarLifecycleResult =
  | { status: "started"; snapshot: BrowserSidecarSnapshot; reason: string }
  | { status: "stopped"; snapshot: BrowserSidecarSnapshot; reason: string }
  | { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string };

export interface BrowserPageOutputPreview {
  text: string;
  untrusted: true;
  truncated: boolean;
  hiddenChars: number;
}

export class BrowserSidecarRuntime {
  private _active = false;
  private _approvedBy: string | undefined;
  private _approvalReason: string | undefined;

  snapshot(): BrowserSidecarSnapshot {
    return {
      sidecarId: createDefaultBrowserSidecarDescriptor().sidecarId,
      status: this._active ? "active" : "available",
      localOnly: true,
      listenerBound: false,
      browserSpawned: false,
      credentialsPersisted: false,
      tunnelActive: false,
      approvedBy: this._approvedBy,
      approvalReason: this._approvalReason,
    };
  }

  start(approval: BrowserSidecarApproval = {}): BrowserSidecarLifecycleResult {
    if (!approval.approved) {
      return {
        status: "blocked",
        snapshot: this.snapshot(),
        reason: "Explicit approval required before starting the local browser sidecar lifecycle.",
      };
    }
    this._active = true;
    this._approvedBy = approval.approvedBy ?? "unknown";
    this._approvalReason = approval.reason ?? "approved local browser sidecar lifecycle";
    return {
      status: "started",
      snapshot: this.snapshot(),
      reason: "Browser sidecar started as a local-only lifecycle marker. No listener bound and no browser spawned in v1.",
    };
  }

  stop(): BrowserSidecarLifecycleResult {
    this._active = false;
    return {
      status: "stopped",
      snapshot: this.snapshot(),
      reason: "Browser sidecar stopped. No browser process, listener, credential store, or tunnel was active.",
    };
  }
}

export function redactAndBoundBrowserPageOutput(
  text: string,
  options: { maxChars?: number } = {},
): BrowserPageOutputPreview {
  const maxChars = Math.max(40, options.maxChars ?? 4_000);
  const redacted = String(text ?? "")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]");
  const preview = redacted.slice(0, maxChars);
  return {
    text: preview,
    untrusted: true,
    truncated: redacted.length > preview.length,
    hiddenChars: Math.max(0, redacted.length - preview.length),
  };
}
