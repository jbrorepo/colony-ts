import type {
  ChannelAdapter,
  ChannelDeliveryRecord,
  ChannelSendRequest,
  ChannelStatus,
  ChannelTarget,
} from "./types";
import {
  createChannelDeliveryRecord,
} from "./types";

export interface ExternalChannelAdapterOptions {
  botToken: string;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

export interface SlackChannelAdapterOptions extends ExternalChannelAdapterOptions {
  workspaceId?: string;
}

export interface DiscordChannelAdapterOptions extends ExternalChannelAdapterOptions {
  apiBaseUrl?: string;
}

export interface TelegramChannelAdapterOptions extends ExternalChannelAdapterOptions {
  apiBaseUrl?: string;
}

type VendorName = "slack" | "discord" | "telegram";

interface VendorSendOutcome {
  ok: boolean;
  vendorMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

const SECRET_VALUE_PATTERN = /(xoxb-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key)/i;
const MAX_TEXT_CHARS = 10_000;

export class SlackChannelAdapter implements ChannelAdapter {
  readonly channelId = "slack";
  private readonly _token: string;
  private readonly _enabled: boolean;
  private readonly _fetch: typeof fetch;
  private readonly _now: () => string;
  private readonly _workspaceId?: string;
  private _sentCount = 0;
  private _lastError?: string;

  constructor(options: SlackChannelAdapterOptions) {
    this._token = options.botToken;
    this._enabled = options.enabled ?? true;
    this._fetch = options.fetchImpl ?? fetch;
    this._now = options.now ?? (() => new Date().toISOString());
    this._workspaceId = options.workspaceId;
  }

  status(): ChannelStatus {
    return channelStatus("slack", "Slack", this._enabled, this._token, [
      "send_text",
      "threads",
      "mentions",
      "external_network",
    ], this._sentCount, this._lastError, {
      token: redactedTokenState(this._token),
      ...(this._workspaceId ? { workspaceId: sanitizeText(this._workspaceId, [this._token]) } : {}),
    });
  }

  async send(request: ChannelSendRequest): Promise<ChannelDeliveryRecord> {
    const validation = validateOutboundRequest("slack", request, this._enabled, this._token);
    if (validation) return this._failure(request, validation);

    const payload: Record<string, unknown> = {
      channel: request.target.targetId,
      text: boundedText(request.text),
    };
    if (request.target.threadId) payload.thread_ts = request.target.threadId;

    const outcome = await postJson({
      fetchImpl: this._fetch,
      url: "https://slack.com/api/chat.postMessage",
      headers: { authorization: `Bearer ${this._token}` },
      body: payload,
      vendor: "slack",
      success: (body) => isRecord(body) && body.ok === true,
      messageId: (body) => isRecord(body) && typeof body.ts === "string" ? body.ts : undefined,
      error: (body) => isRecord(body) && typeof body.error === "string" ? body.error : undefined,
      secrets: [this._token],
    });
    return this._record(request, outcome);
  }

  private _record(request: ChannelSendRequest, outcome: VendorSendOutcome): ChannelDeliveryRecord {
    if (!outcome.ok) return this._failure(request, outcome.error ?? "Slack delivery failed");
    this._sentCount += 1;
    this._lastError = undefined;
    return createChannelDeliveryRecord("chdel_slack_adapter", sanitizedRequest(request, [this._token]), "sent", {
      deliveredAt: this._now(),
    });
  }

  private _failure(request: ChannelSendRequest, error: string): ChannelDeliveryRecord {
    const safeError = sanitizeText(error, [this._token]);
    this._lastError = safeError;
    return createChannelDeliveryRecord("chdel_slack_adapter", sanitizedRequest(request, [this._token]), "failed", {
      error: safeError,
    });
  }
}

export class DiscordChannelAdapter implements ChannelAdapter {
  readonly channelId = "discord";
  private readonly _token: string;
  private readonly _enabled: boolean;
  private readonly _fetch: typeof fetch;
  private readonly _now: () => string;
  private readonly _apiBaseUrl: string;
  private _sentCount = 0;
  private _lastError?: string;

  constructor(options: DiscordChannelAdapterOptions) {
    this._token = options.botToken;
    this._enabled = options.enabled ?? true;
    this._fetch = options.fetchImpl ?? fetch;
    this._now = options.now ?? (() => new Date().toISOString());
    this._apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? "https://discord.com/api/v10");
  }

  status(): ChannelStatus {
    return channelStatus("discord", "Discord", this._enabled, this._token, [
      "send_text",
      "threads",
      "mentions",
      "external_network",
    ], this._sentCount, this._lastError, {
      token: redactedTokenState(this._token),
      apiBaseUrl: sanitizeUrl(this._apiBaseUrl, [this._token]),
    });
  }

  async send(request: ChannelSendRequest): Promise<ChannelDeliveryRecord> {
    const validation = validateOutboundRequest("discord", request, this._enabled, this._token);
    if (validation) return this._failure(request, validation);

    const channelId = request.target.threadId || request.target.targetId;
    const outcome = await postJson({
      fetchImpl: this._fetch,
      url: `${this._apiBaseUrl}/channels/${encodeURIComponent(channelId)}/messages`,
      headers: { authorization: `Bot ${this._token}` },
      body: { content: boundedText(request.text) },
      vendor: "discord",
      success: (_body, response) => response.status >= 200 && response.status < 300,
      messageId: (body) => isRecord(body) && typeof body.id === "string" ? body.id : undefined,
      error: (body) => readVendorError(body),
      secrets: [this._token],
    });
    return this._record(request, outcome);
  }

  private _record(request: ChannelSendRequest, outcome: VendorSendOutcome): ChannelDeliveryRecord {
    if (!outcome.ok) return this._failure(request, outcome.error ?? "Discord delivery failed");
    this._sentCount += 1;
    this._lastError = undefined;
    return createChannelDeliveryRecord("chdel_discord_adapter", sanitizedRequest(request, [this._token]), "sent", {
      deliveredAt: this._now(),
    });
  }

  private _failure(request: ChannelSendRequest, error: string): ChannelDeliveryRecord {
    const safeError = sanitizeText(error, [this._token]);
    this._lastError = safeError;
    return createChannelDeliveryRecord("chdel_discord_adapter", sanitizedRequest(request, [this._token]), "failed", {
      error: safeError,
    });
  }
}

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channelId = "telegram";
  private readonly _token: string;
  private readonly _enabled: boolean;
  private readonly _fetch: typeof fetch;
  private readonly _now: () => string;
  private readonly _apiBaseUrl: string;
  private _sentCount = 0;
  private _lastError?: string;

  constructor(options: TelegramChannelAdapterOptions) {
    this._token = options.botToken;
    this._enabled = options.enabled ?? true;
    this._fetch = options.fetchImpl ?? fetch;
    this._now = options.now ?? (() => new Date().toISOString());
    this._apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? "https://api.telegram.org");
  }

  status(): ChannelStatus {
    return channelStatus("telegram", "Telegram", this._enabled, this._token, [
      "send_text",
      "topics",
      "mentions",
      "external_network",
    ], this._sentCount, this._lastError, {
      token: redactedTokenState(this._token),
      apiBaseUrl: sanitizeUrl(this._apiBaseUrl, [this._token]),
    });
  }

  async send(request: ChannelSendRequest): Promise<ChannelDeliveryRecord> {
    const validation = validateOutboundRequest("telegram", request, this._enabled, this._token);
    if (validation) return this._failure(request, validation);

    const payload: Record<string, unknown> = {
      chat_id: request.target.targetId,
      text: boundedText(request.text),
    };
    if (request.target.topicId) payload.message_thread_id = request.target.topicId;

    const outcome = await postJson({
      fetchImpl: this._fetch,
      url: `${this._apiBaseUrl}/bot${this._token}/sendMessage`,
      body: payload,
      vendor: "telegram",
      success: (body) => isRecord(body) && body.ok === true,
      messageId: (body) => {
        if (!isRecord(body) || !isRecord(body.result)) return undefined;
        const id = body.result.message_id;
        return typeof id === "number" || typeof id === "string" ? String(id) : undefined;
      },
      error: (body) => readVendorError(body),
      secrets: [this._token],
    });
    return this._record(request, outcome);
  }

  private _record(request: ChannelSendRequest, outcome: VendorSendOutcome): ChannelDeliveryRecord {
    if (!outcome.ok) return this._failure(request, outcome.error ?? "Telegram delivery failed");
    this._sentCount += 1;
    this._lastError = undefined;
    return createChannelDeliveryRecord("chdel_telegram_adapter", sanitizedRequest(request, [this._token]), "sent", {
      deliveredAt: this._now(),
    });
  }

  private _failure(request: ChannelSendRequest, error: string): ChannelDeliveryRecord {
    const safeError = sanitizeText(error, [this._token]);
    this._lastError = safeError;
    return createChannelDeliveryRecord("chdel_telegram_adapter", sanitizedRequest(request, [this._token]), "failed", {
      error: safeError,
    });
  }
}

async function postJson(options: {
  fetchImpl: typeof fetch;
  url: string;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
  vendor: VendorName;
  success: (body: unknown, response: Response) => boolean;
  messageId: (body: unknown) => string | undefined;
  error: (body: unknown) => string | undefined;
  secrets?: string[];
}): Promise<VendorSendOutcome> {
  try {
    const response = await options.fetchImpl(options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(options.body),
    });
    const body = await readJsonBody(response);
    const ok = options.success(body, response);
    if (!ok) {
      return {
        ok: false,
        error: sanitizeText(options.error(body) ?? `${options.vendor} delivery failed with HTTP ${response.status}`, options.secrets),
      };
    }
    return {
      ok: true,
      vendorMessageId: options.messageId(body),
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeText(error instanceof Error ? error.message : String(error), options.secrets),
    };
  }
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: "invalid_json_response" };
  }
}

function channelStatus(
  channelId: string,
  displayName: string,
  enabled: boolean,
  token: string,
  capabilities: string[],
  sentCount: number,
  lastError: string | undefined,
  redactedConfig: Record<string, unknown>,
): ChannelStatus {
  return {
    channelId,
    displayName,
    enabled,
    connected: enabled && token.trim().length > 0,
    capabilities,
    redactedConfig,
    ...(lastError ? { lastError: sanitizeText(lastError) } : {}),
    sentCount,
  };
}

function validateOutboundRequest(
  vendor: VendorName,
  request: ChannelSendRequest,
  enabled: boolean,
  token: string,
): string | null {
  if (!enabled) return `${vendor} channel adapter is disabled`;
  if (!token.trim()) return `${vendor} channel adapter is missing operator-configured credential`;
  if (request.channel !== vendor || request.target.channel !== vendor) {
    return `${vendor} channel adapter received mismatched channel request`;
  }
  if (!request.target.targetId.trim()) return `${vendor} target id is required`;
  if (!request.text.trim()) return `${vendor} message text is required`;
  if (request.text.length > MAX_TEXT_CHARS) return `${vendor} message text exceeds ${MAX_TEXT_CHARS} characters`;
  if (vendor === "slack" && request.target.topicId) return "Slack routes do not support topic ids";
  if (vendor === "discord" && request.target.topicId) return "Discord routes do not support topic ids";
  if (vendor === "telegram" && request.target.threadId) return "Telegram routes do not support thread ids";
  return null;
}

function sanitizedRequest(request: ChannelSendRequest, secrets: string[] = []): ChannelSendRequest {
  return {
    ...request,
    text: request.text,
    target: sanitizeTarget(request.target, secrets),
    metadata: request.metadata ? sanitizeRecord(request.metadata, secrets) : undefined,
  };
}

function sanitizeTarget(target: ChannelTarget, secrets: string[] = []): ChannelTarget {
  return {
    ...target,
    agentId: sanitizeText(target.agentId, secrets),
    channel: sanitizeText(target.channel, secrets),
    targetKind: target.targetKind,
    targetId: sanitizeText(target.targetId, secrets),
    ...(target.accountId ? { accountId: sanitizeText(target.accountId, secrets) } : {}),
    ...(target.threadId ? { threadId: sanitizeText(target.threadId, secrets) } : {}),
    ...(target.topicId ? { topicId: sanitizeText(target.topicId, secrets) } : {}),
  };
}

function sanitizeRecord(record: Record<string, unknown>, secrets: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      out[key] = sanitizeText(value, secrets);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else {
      out[key] = "[REDACTED]";
    }
  }
  return out;
}

function sanitizeText(value: string, secrets: string[] = []): string {
  let result = value;
  for (const secret of secrets) {
    if (!secret.trim()) continue;
    result = result.split(secret).join("[REDACTED]");
  }
  return result
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function sanitizeUrl(value: string, secrets: string[] = []): string {
  return sanitizeText(value, secrets)
    .replace(/(bot)[^/]+/gi, "$1[REDACTED]");
}

function redactedTokenState(token: string): string {
  return token.trim() ? "[REDACTED]" : "missing";
}

function boundedText(value: string): string {
  return value.length > MAX_TEXT_CHARS ? value.slice(0, MAX_TEXT_CHARS) : value;
}

function readVendorError(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  if (typeof body.error === "string") return body.error;
  if (typeof body.description === "string") return body.description;
  if (typeof body.message === "string") return body.message;
  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
