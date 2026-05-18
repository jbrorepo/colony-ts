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
  browserSpawned: boolean;
  credentialsPersisted: false;
  tunnelActive: false;
  currentUrl?: string;
  title?: string;
  artifactCount?: number;
  writeReceiptCount?: number;
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

export interface BrowserAutomationPageState {
  url: string;
  title?: string;
  text?: string;
}

export interface BrowserArtifactMetadata {
  artifactId: string;
  name: string;
  mimeType: string;
  bytes: number;
  uri: string;
  untrusted: true;
}

export interface BrowserWriteReceipt {
  receiptId: string;
  action: "click" | "type";
  selector: string;
  approvedBy: string;
  summary: string;
  inputPreview?: string;
  credentialsPersisted: false;
  defaultLiveMutation: false;
}

export interface BrowserAutomationDriver {
  open?(url: string): Promise<BrowserAutomationPageState> | BrowserAutomationPageState;
  read?(): Promise<BrowserAutomationPageState> | BrowserAutomationPageState;
  screenshot?(): Promise<Omit<BrowserArtifactMetadata, "untrusted">> | Omit<BrowserArtifactMetadata, "untrusted">;
  click?(selector: string): Promise<{ selector?: string; summary?: string }> | { selector?: string; summary?: string };
  type?(selector: string, text: string): Promise<{ selector?: string; textPreview?: string; summary?: string }> | { selector?: string; textPreview?: string; summary?: string };
  wait?(target: string): Promise<{ target?: string; summary?: string }> | { target?: string; summary?: string };
}

export interface BrowserSidecarRuntimeOptions {
  driver?: BrowserAutomationDriver | null;
}

export class BrowserSidecarRuntime {
  private _active = false;
  private _approvedBy: string | undefined;
  private _approvalReason: string | undefined;
  private _currentPage: BrowserAutomationPageState | null = null;
  private readonly _artifacts: BrowserArtifactMetadata[] = [];
  private readonly _writeReceipts: BrowserWriteReceipt[] = [];
  private readonly _driver?: BrowserAutomationDriver | null;

  constructor(options: BrowserSidecarRuntimeOptions = {}) {
    this._driver = options.driver ?? null;
  }

  snapshot(): BrowserSidecarSnapshot {
    return {
      sidecarId: createDefaultBrowserSidecarDescriptor().sidecarId,
      status: this._active ? "active" : "available",
      localOnly: true,
      listenerBound: false,
      browserSpawned: Boolean(this._currentPage),
      credentialsPersisted: false,
      tunnelActive: false,
      currentUrl: this._currentPage?.url,
      title: this._currentPage?.title,
      artifactCount: this._artifacts.length,
      writeReceiptCount: this._writeReceipts.length,
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
    this._currentPage = null;
    return {
      status: "stopped",
      snapshot: this.snapshot(),
      reason: "Browser sidecar stopped. No browser process, listener, credential store, or tunnel was active.",
    };
  }

  async open(
    url: string,
    approval: BrowserSidecarApproval = {},
  ): Promise<
    | { status: "opened"; snapshot: BrowserSidecarSnapshot; preview: BrowserPageOutputPreview }
    | { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string }
  > {
    const blocked = this._requireAutomationApproval("open", approval);
    if (blocked) return blocked;
    const policy = validateBrowserAutomationUrl(url);
    if (!policy.ok) return { status: "blocked", snapshot: this.snapshot(), reason: policy.reason };
    const page = this._driver?.open
      ? await Promise.resolve(this._driver.open(policy.url))
      : { url: policy.url, title: "Approved local browser session", text: "" };
    this._currentPage = {
      url: policy.url,
      title: page.title,
      text: page.text,
    };
    return {
      status: "opened",
      snapshot: this.snapshot(),
      preview: redactAndBoundBrowserPageOutput(page.text ?? ""),
    };
  }

  async read(): Promise<
    | { status: "read"; snapshot: BrowserSidecarSnapshot; preview: BrowserPageOutputPreview }
    | { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string }
  > {
    if (!this._active) {
      return { status: "blocked", snapshot: this.snapshot(), reason: "Browser sidecar must be started before reading page state." };
    }
    const page = this._driver?.read
      ? await Promise.resolve(this._driver.read())
      : this._currentPage;
    if (!page) {
      return { status: "blocked", snapshot: this.snapshot(), reason: "No browser page is open." };
    }
    this._currentPage = { ...page };
    return {
      status: "read",
      snapshot: this.snapshot(),
      preview: redactAndBoundBrowserPageOutput(page.text ?? ""),
    };
  }

  async screenshot(
    approval: BrowserSidecarApproval = {},
  ): Promise<
    | { status: "screenshot"; artifact: BrowserArtifactMetadata; snapshot: BrowserSidecarSnapshot }
    | { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string }
  > {
    const blocked = this._requireAutomationApproval("screenshot", approval);
    if (blocked) return blocked;
    const raw = this._driver?.screenshot
      ? await Promise.resolve(this._driver.screenshot())
      : {
          artifactId: `browser_artifact_${this._artifacts.length + 1}`,
          name: "browser-screenshot.png",
          mimeType: "image/png",
          bytes: 0,
          uri: "colony://artifacts/browser-screenshot.png",
        };
    const artifact: BrowserArtifactMetadata = {
      artifactId: redactBrowserText(raw.artifactId),
      name: redactBrowserText(raw.name),
      mimeType: redactBrowserText(raw.mimeType),
      bytes: Math.max(0, Number(raw.bytes) || 0),
      uri: redactBrowserText(raw.uri),
      untrusted: true,
    };
    this._artifacts.push(artifact);
    return { status: "screenshot", artifact, snapshot: this.snapshot() };
  }

  async click(
    selector: string,
    approval: BrowserSidecarApproval = {},
  ): Promise<
    | { status: "clicked"; receipt: BrowserWriteReceipt; snapshot: BrowserSidecarSnapshot }
    | { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string }
  > {
    const blocked = this._requireAutomationApproval("click", approval);
    if (blocked) return blocked;
    const clicked = this._driver?.click
      ? await Promise.resolve(this._driver.click(selector))
      : { selector, summary: "click accepted by injected browser runtime boundary" };
    const receipt = this._writeReceipt("click", clicked.selector ?? selector, approval, clicked.summary ?? "clicked");
    return { status: "clicked", receipt, snapshot: this.snapshot() };
  }

  async type(
    selector: string,
    text: string,
    approval: BrowserSidecarApproval = {},
  ): Promise<
    | { status: "typed"; receipt: BrowserWriteReceipt; snapshot: BrowserSidecarSnapshot }
    | { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string }
  > {
    const blocked = this._requireAutomationApproval("type", approval);
    if (blocked) return blocked;
    const typed = this._driver?.type
      ? await Promise.resolve(this._driver.type(selector, text))
      : { selector, textPreview: text, summary: "typed by injected browser runtime boundary" };
    const receipt = this._writeReceipt(
      "type",
      typed.selector ?? selector,
      approval,
      typed.summary ?? "typed",
      typed.textPreview ?? text,
    );
    return { status: "typed", receipt, snapshot: this.snapshot() };
  }

  async wait(target: string): Promise<{ status: "waited"; target: string; summary: string; snapshot: BrowserSidecarSnapshot }> {
    const waited = this._driver?.wait ? await Promise.resolve(this._driver.wait(target)) : { target, summary: "wait boundary recorded" };
    return {
      status: "waited",
      target: redactBrowserText(waited.target ?? target),
      summary: redactBrowserText(waited.summary ?? "waited"),
      snapshot: this.snapshot(),
    };
  }

  artifacts(): BrowserArtifactMetadata[] {
    return this._artifacts.map((artifact) => ({ ...artifact }));
  }

  writeReceipts(): BrowserWriteReceipt[] {
    return this._writeReceipts.map((receipt) => ({ ...receipt }));
  }

  lastPagePreview(): BrowserPageOutputPreview | null {
    if (!this._currentPage) return null;
    return redactAndBoundBrowserPageOutput(this._currentPage.text ?? "");
  }

  private _requireAutomationApproval(
    action: string,
    approval: BrowserSidecarApproval,
  ): { status: "blocked"; snapshot: BrowserSidecarSnapshot; reason: string } | null {
    if (!this._active) {
      return { status: "blocked", snapshot: this.snapshot(), reason: `Browser sidecar must be started before ${action}.` };
    }
    if (!approval.approved) {
      return { status: "blocked", snapshot: this.snapshot(), reason: `Explicit approval required before browser ${action}.` };
    }
    return null;
  }

  private _writeReceipt(
    action: BrowserWriteReceipt["action"],
    selector: string,
    approval: BrowserSidecarApproval,
    summary: string,
    inputPreview?: string,
  ): BrowserWriteReceipt {
    const receipt: BrowserWriteReceipt = {
      receiptId: `browser_write_${this._writeReceipts.length + 1}`,
      action,
      selector: redactBrowserText(selector).slice(0, 200),
      approvedBy: redactBrowserText(approval.approvedBy ?? "unknown").slice(0, 80),
      summary: redactBrowserText(summary).slice(0, 300),
      inputPreview: inputPreview == null ? undefined : redactBrowserText(inputPreview).slice(0, 200),
      credentialsPersisted: false,
      defaultLiveMutation: false,
    };
    this._writeReceipts.push(receipt);
    return { ...receipt };
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

export function validateBrowserAutomationUrl(url: string): { ok: true; url: string } | { ok: false; reason: string } {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    const https = parsed.protocol === "https:";
    const local = localHosts.has(host);
    if (!https && !local) {
      return { ok: false, reason: "Browser navigation allows only HTTPS or localhost URLs by default." };
    }
    if (isPrivateHost(host) && !local) {
      return { ok: false, reason: "Private-network browser navigation is blocked by default." };
    }
    parsed.username = "";
    parsed.password = "";
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, reason: "Browser navigation requires a valid URL." };
  }
}

function isPrivateHost(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
}

function redactBrowserText(text: string): string {
  return String(text ?? "")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED_SECRET]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED_SECRET]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/([?&](?:token|api[_-]?key|secret|password|authorization)=)[^&#\s]+/gi, "$1[REDACTED]");
}
