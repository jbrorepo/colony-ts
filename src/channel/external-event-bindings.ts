import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";

import type { ExternalChannelSubscriptionCandidate } from "./external-subscription-registration";

export interface ExternalChannelApprovedEventBinding {
  recordType?: "external_channel_approved_event_binding";
  channelId: string;
  accountId?: string;
  appId?: string;
  eventTypes: string[];
  callbackUrlFingerprint?: string;
  callbackHost?: string;
  signingSecretRef?: string;
  approvalSignatureFingerprint?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt?: string;
  active?: boolean;
  enabled?: boolean;
}

export interface ExternalChannelApprovedEventBindingReader {
  loadApprovedEventBindings(): Promise<ExternalChannelApprovedEventBinding[]>;
}

export interface ExternalChannelApprovedEventBindingStore extends ExternalChannelApprovedEventBindingReader {
  appendApprovedEventBindings(bindings: ExternalChannelApprovedEventBinding[]): Promise<void>;
}

export interface JsonExternalChannelApprovedEventBindingStoreOptions {
  rootDir: string;
}

const BINDINGS_FILE = "external-channel-event-bindings.jsonl";
const BINDING_RECORDS = new WeakSet<ExternalChannelApprovedEventBinding>();
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key|manifest|raw|body)/i;

export async function buildSlackApprovedEventBinding(
  candidate: ExternalChannelSubscriptionCandidate,
  createdAt: string | Date = new Date(),
): Promise<ExternalChannelApprovedEventBinding> {
  if (normalizeChannelId(candidate.channelId) !== "slack") {
    throw new Error("external event binding only supports Slack in this slice");
  }
  const callback = safeCallback(candidate.callbackUrl);
  const approvalSignature = candidate.approval?.signature;
  const binding: ExternalChannelApprovedEventBinding = {
    recordType: "external_channel_approved_event_binding",
    channelId: "slack",
    appId: safeId(candidate.appId),
    accountId: safeId(candidate.workspaceId),
    eventTypes: safeEventTypes(candidate.eventTypes),
    callbackUrlFingerprint: await shortSha256(callback.href),
    callbackHost: callback.host,
    signingSecretRef: candidate.signingSecretRef ? "[REDACTED_REF]" : undefined,
    approvalSignatureFingerprint: typeof approvalSignature === "string" ? await shortSha256(approvalSignature) : undefined,
    approvedBy: safeLabel(candidate.approval?.approvedBy),
    approvedAt: candidate.approval?.approvedAt ? toIso(candidate.approval.approvedAt) : undefined,
    createdAt: toIso(createdAt),
    active: true,
    enabled: true,
  };
  return markBinding(normalizeBinding(binding));
}

export class JsonExternalChannelApprovedEventBindingStore implements ExternalChannelApprovedEventBindingStore {
  private readonly _filePath: string;

  constructor(options: JsonExternalChannelApprovedEventBindingStoreOptions) {
    this._filePath = join(options.rootDir, BINDINGS_FILE);
  }

  async appendApprovedEventBindings(bindings: ExternalChannelApprovedEventBinding[]): Promise<void> {
    if (!Array.isArray(bindings) || bindings.some((binding) => !BINDING_RECORDS.has(binding))) {
      throw new Error("External channel event binding append rejected");
    }
    const lines = bindings.map((binding) => JSON.stringify(normalizeBinding(binding)));
    await mkdir(dirname(this._filePath), { recursive: true });
    if (lines.length > 0) {
      await appendFile(this._filePath, `${lines.join("\n")}\n`, "utf8");
    }
  }

  async loadApprovedEventBindings(): Promise<ExternalChannelApprovedEventBinding[]> {
    let content: string;
    try {
      content = await readFile(this._filePath, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw new Error("External channel event binding journal is invalid");
    }
    const bindings: ExternalChannelApprovedEventBinding[] = [];
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        bindings.push(markBinding(normalizeBinding(JSON.parse(line) as ExternalChannelApprovedEventBinding)));
      } catch {
        throw new Error("External channel event binding journal is invalid");
      }
    }
    return bindings;
  }
}

export function normalizeExternalChannelApprovedEventBinding(binding: ExternalChannelApprovedEventBinding): ExternalChannelApprovedEventBinding {
  return markBinding(normalizeBinding(binding));
}

function normalizeBinding(binding: ExternalChannelApprovedEventBinding): ExternalChannelApprovedEventBinding {
  if (!isPlainRecord(binding)) throw new Error("invalid event binding");
  rejectForbiddenFields(binding);
  const channelId = normalizeChannelId(binding.channelId);
  if (channelId !== "slack") throw new Error("invalid event binding channel");
  const eventTypes = safeEventTypes(binding.eventTypes);
  if (eventTypes.length === 0) throw new Error("invalid event binding events");
  const accountId = safeId(binding.accountId);
  if (!accountId) throw new Error("invalid event binding account");
  return {
    recordType: "external_channel_approved_event_binding",
    channelId,
    ...(safeId(binding.appId) ? { appId: safeId(binding.appId) } : {}),
    accountId,
    eventTypes,
    ...(safeFingerprint(binding.callbackUrlFingerprint) ? { callbackUrlFingerprint: safeFingerprint(binding.callbackUrlFingerprint) } : {}),
    ...(safeHost(binding.callbackHost) ? { callbackHost: safeHost(binding.callbackHost) } : {}),
    ...(binding.signingSecretRef ? { signingSecretRef: "[REDACTED_REF]" } : {}),
    ...(safeFingerprint(binding.approvalSignatureFingerprint) ? { approvalSignatureFingerprint: safeFingerprint(binding.approvalSignatureFingerprint) } : {}),
    ...(safeLabel(binding.approvedBy) ? { approvedBy: safeLabel(binding.approvedBy) } : {}),
    ...(binding.approvedAt ? { approvedAt: toIso(binding.approvedAt) } : {}),
    ...(binding.createdAt ? { createdAt: toIso(binding.createdAt) } : {}),
    active: binding.active !== false,
    enabled: binding.enabled !== false,
  };
}

function markBinding(binding: ExternalChannelApprovedEventBinding): ExternalChannelApprovedEventBinding {
  Object.freeze(binding.eventTypes);
  Object.freeze(binding);
  BINDING_RECORDS.add(binding);
  return binding;
}

function safeCallback(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("invalid event binding callback");
  return url;
}

function safeEventTypes(values: unknown): string[] {
  const eventTypes = Array.isArray(values) ? values : [];
  return Array.from(new Set(eventTypes
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value === "message.channels" || value === "app_mention")))
    .sort();
}

function safeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,120}$/.test(trimmed) && !looksSecret(trimmed) ? trimmed : undefined;
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\0\r\n]/g, "").trim();
  return clean.length > 0 && clean.length <= 120 && !looksSecret(clean) ? clean : undefined;
}

function safeHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().toLowerCase();
  return /^[a-z0-9.-]{1,253}(?::[0-9]{1,5})?$/.test(clean) && !looksSecret(clean) ? clean : undefined;
}

function safeFingerprint(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value) ? value.toLowerCase() : undefined;
}

async function shortSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid event binding timestamp");
  return date.toISOString();
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key|xox|xapp)/i.test(value);
}

function rejectForbiddenFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenFields(item);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) && key !== "approvalSignatureFingerprint" && key !== "signingSecretRef") {
      throw new Error("forbidden event binding field");
    }
    rejectForbiddenFields(entry);
  }
}

function normalizeChannelId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
