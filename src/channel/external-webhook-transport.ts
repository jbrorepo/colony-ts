import type {
  ChannelAuthPolicy,
  ChannelPairingStore,
} from "./auth";
import {
  dispatchExternalChannelVendorEvent,
  type ExternalChannelVendorEventDispatchResult,
} from "./external-dispatch";
import type {
  ExternalChannelApprovedEventBinding,
  ExternalChannelApprovedEventBindingReader,
} from "./external-event-bindings";
import type { ChannelSessionBridge } from "./session-bridge";
import type {
  ChannelWebhookSignatureVerificationRequest,
} from "./http-transport";
import type { ExternalChannelWebhookSignatureDecision } from "./external-signatures";

export interface ExternalChannelVendorWebhookTransportOptions {
  pathPrefix?: string;
  agentId?: string;
  bridge?: ChannelSessionBridge | null;
  authPolicy?: ChannelAuthPolicy;
  pairings?: ChannelPairingStore;
  maxBodyBytes?: number;
  approvedEventBindings?: ExternalChannelApprovedEventBinding[] | null;
  approvedEventBindingStore?: ExternalChannelApprovedEventBindingReader | null;
  vendorSignatureVerifier?: (
    request: ChannelWebhookSignatureVerificationRequest,
  ) => ExternalChannelWebhookSignatureDecision | Promise<ExternalChannelWebhookSignatureDecision>;
}

export interface ExternalChannelVendorWebhookHttpServerOptions extends ExternalChannelVendorWebhookTransportOptions {
  hostname?: string;
  port?: number;
}

const DEFAULT_CHANNEL_WEBHOOK_PREFIX = "/api/channels";
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const MAX_SLACK_URL_VERIFICATION_CHALLENGE_LENGTH = 2048;
const DISCORD_INTERACTION_PING_TYPE = 1;
const DISCORD_INTERACTION_PONG_TYPE = 1;
const DISCORD_INTERACTION_APPLICATION_COMMAND_TYPE = 2;
const DISCORD_INTERACTION_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE_TYPE = 5;
const SUPPORTED_CHANNELS = new Set(["discord", "slack", "telegram"]);
const SECRET_VALUE_PATTERN = /(xoxb-[a-z0-9_-]+|sk-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;
const SENSITIVE_WORD_PATTERN = /([a-z0-9_-]*(?:secret|token|credential|signature|api[_-]?key)[a-z0-9_-]*)/gi;

export async function handleExternalChannelVendorWebhookRequest(
  request: Request,
  options: ExternalChannelVendorWebhookTransportOptions = {},
): Promise<Response> {
  const pathPrefix = normalizePrefix(options.pathPrefix ?? DEFAULT_CHANNEL_WEBHOOK_PREFIX);
  const url = new URL(request.url);
  const channelId = extractChannelFromPath(url.pathname, pathPrefix);
  if (!channelId) {
    return jsonResponse({ ok: false, error: "External vendor webhook endpoint not found" }, 404);
  }
  if (!SUPPORTED_CHANNELS.has(channelId)) {
    return jsonResponse({ ok: false, errorCode: "unsupported_channel", error: "Unsupported external vendor webhook channel." }, 404);
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "External vendor webhook endpoint only accepts POST" }, 405, {
      allow: "POST",
    });
  }

  if (!options.vendorSignatureVerifier) {
    return jsonResponse({
      ok: false,
      accepted: false,
      errorCode: "missing_vendor_signature_verifier",
      error: "External vendor webhook signature verifier is required.",
    }, 401);
  }

  const headers = requestHeaders(request);
  const rawBody = await readRawBody(request, headers, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  if ("error" in rawBody) {
    return jsonResponse({
      ok: false,
      ...(rawBody.errorCode ? { errorCode: rawBody.errorCode } : {}),
      error: rawBody.error,
    }, rawBody.status);
  }

  let signature: ExternalChannelWebhookSignatureDecision;
  try {
    signature = await options.vendorSignatureVerifier({
      channelId,
      url: request.url,
      headers,
      rawBody: rawBody.value,
    });
  } catch {
    signature = {
      accepted: false,
      code: "signature_verifier_failed",
      reason: "External vendor webhook signature verifier failed closed.",
    };
  }
  if (!signature.accepted) {
    return jsonResponse({
      ok: false,
      accepted: false,
      errorCode: safeErrorCode(signature.code, "external_vendor_signature_rejected"),
      error: sanitizeResponseText(signature.reason),
    }, 401);
  }

  const body = parseJsonBody(rawBody.value);
  if ("error" in body) {
    return jsonResponse({ ok: false, error: body.error }, 400);
  }

  const slackUrlVerification = maybeHandleSlackUrlVerification(channelId, body.value);
  if (slackUrlVerification) {
    return slackUrlVerification;
  }
  const discordInteractionPing = maybeHandleDiscordInteractionPing(channelId, body.value);
  if (discordInteractionPing) {
    return discordInteractionPing;
  }

  const dispatched = await dispatchExternalChannelVendorEvent({
    channelId,
    body: body.value,
    bridge: options.bridge,
    agentId: options.agentId,
    authPolicy: options.authPolicy,
    pairings: options.pairings,
    headers,
    sourceUrl: request.url,
    deferBridgeCompletion: isDiscordApplicationCommand(channelId, body.value) || isSlackEventCallback(channelId, body.value),
    approvedEventBindings: options.approvedEventBindings,
    approvedEventBindingStore: options.approvedEventBindingStore,
  });

  if (dispatched.isError) {
    return jsonResponse({
      ok: false,
      accepted: false,
      errorCode: safeErrorCode(String(dispatched.data.reasonCode ?? ""), "external_vendor_dispatch_rejected"),
      error: sanitizeResponseText(dispatched.output),
    }, statusForDispatchFailure(dispatched));
  }

  if (isDiscordApplicationCommand(channelId, body.value)) {
    return jsonResponse({ type: DISCORD_INTERACTION_DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE_TYPE }, 200);
  }

  return jsonResponse({
    ok: true,
    accepted: true,
    channel: channelId,
    messageId: dispatched.data.messageId,
    routeKey: dispatched.data.routeKey,
    sessionId: dispatched.data.sessionId,
    turnId: dispatched.data.turnId,
    turnStatus: dispatched.data.turnStatus,
    createdSession: dispatched.data.createdSession,
    ...(dispatched.data.duplicate === true ? { duplicate: true } : {}),
    ...(dispatched.data.replyDeliveryStatus ? { replyDeliveryStatus: dispatched.data.replyDeliveryStatus } : {}),
  }, 202);
}

export class ExternalChannelVendorWebhookHttpServer {
  private readonly _hostname: string;
  private readonly _port: number;
  private readonly _pathPrefix: string;
  private readonly _options: ExternalChannelVendorWebhookTransportOptions;
  private _server: ReturnType<typeof Bun.serve> | null = null;

  constructor(options: ExternalChannelVendorWebhookHttpServerOptions = {}) {
    this._hostname = options.hostname ?? "127.0.0.1";
    this._port = options.port ?? 0;
    this._pathPrefix = normalizePrefix(options.pathPrefix ?? DEFAULT_CHANNEL_WEBHOOK_PREFIX);
    this._options = {
      pathPrefix: this._pathPrefix,
      agentId: options.agentId,
      bridge: options.bridge,
      authPolicy: options.authPolicy,
      pairings: options.pairings,
      maxBodyBytes: options.maxBodyBytes,
      approvedEventBindings: options.approvedEventBindings,
      approvedEventBindingStore: options.approvedEventBindingStore,
      vendorSignatureVerifier: options.vendorSignatureVerifier,
    };
  }

  get url(): string {
    if (!this._server) throw new Error("External channel vendor webhook HTTP server is not started");
    return `http://${this._server.hostname}:${this._server.port}${this._pathPrefix}`;
  }

  async start(): Promise<void> {
    if (this._server) return;
    this._server = Bun.serve({
      hostname: this._hostname,
      port: this._port,
      fetch: (request) => handleExternalChannelVendorWebhookRequest(request, this._options),
    });
  }

  async stop(): Promise<void> {
    if (!this._server) return;
    this._server.stop(true);
    this._server = null;
  }
}

function statusForDispatchFailure(result: ExternalChannelVendorEventDispatchResult): number {
  const reasonCode = String(result.data.reasonCode ?? "");
  if (
    reasonCode === "webhook_auth_failed" ||
    reasonCode === "missing_host_verification_proof" ||
    reasonCode === "external_event_binding_rejected"
  ) return 403;
  if (reasonCode === "missing_bridge" || reasonCode === "missing_host_auth_policy" || reasonCode === "bridge_dispatch_failed") return 500;
  return 400;
}

function extractChannelFromPath(pathname: string, pathPrefix: string): string | null {
  const expectedSuffix = "/external-event";
  if (!pathname.startsWith(`${pathPrefix}/`) || !pathname.endsWith(expectedSuffix)) {
    return null;
  }
  const between = pathname.slice(pathPrefix.length + 1, -expectedSuffix.length);
  if (!between || between.includes("/")) return null;
  try {
    return decodeURIComponent(between).trim().toLowerCase();
  } catch {
    return null;
  }
}

async function readRawBody(
  request: Request,
  headers: Record<string, string>,
  maxBodyBytes: number,
): Promise<{ value: string } | { error: string; status: number; errorCode?: string }> {
  const declaredLength = headers["content-length"];
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Invalid content-length header", status: 400, errorCode: "invalid_content_length" };
    }
    if (parsed > maxBodyBytes) {
      return { error: "External vendor webhook body is too large", status: 413, errorCode: "request_body_too_large" };
    }
  }

  try {
    if (!request.body) return { value: "" };
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel().catch(() => undefined);
        return { error: "External vendor webhook body is too large", status: 413, errorCode: "request_body_too_large" };
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { value: new TextDecoder().decode(merged) };
  } catch {
    return { error: "Malformed request body", status: 400 };
  }
}

function parseJsonBody(rawBody: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(rawBody) as unknown };
  } catch {
    return { error: "Malformed JSON body" };
  }
}

function maybeHandleSlackUrlVerification(channelId: string, body: unknown): Response | null {
  if (channelId !== "slack" || !isRecord(body) || body.type !== "url_verification") return null;

  const challenge = body.challenge;
  if (
    typeof challenge !== "string" ||
    challenge.trim().length === 0 ||
    challenge.length > MAX_SLACK_URL_VERIFICATION_CHALLENGE_LENGTH
  ) {
    return jsonResponse({
      ok: false,
      accepted: false,
      errorCode: "slack_url_verification_invalid",
      error: "Slack URL verification challenge is invalid.",
    }, 400);
  }

  return slackChallengeResponse(challenge);
}

function maybeHandleDiscordInteractionPing(channelId: string, body: unknown): Response | null {
  if (channelId !== "discord" || !isRecord(body) || body.type !== DISCORD_INTERACTION_PING_TYPE) return null;
  return jsonResponse({ type: DISCORD_INTERACTION_PONG_TYPE }, 200);
}

function isDiscordApplicationCommand(channelId: string, body: unknown): boolean {
  return channelId === "discord" &&
    isRecord(body) &&
    body.type === DISCORD_INTERACTION_APPLICATION_COMMAND_TYPE;
}

function isSlackEventCallback(channelId: string, body: unknown): boolean {
  return channelId === "slack" &&
    isRecord(body) &&
    body.type === "event_callback";
}

function requestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(sanitizeBody(body)), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function slackChallengeResponse(challenge: string): Response {
  return new Response(JSON.stringify({ challenge }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    out[key] = typeof value === "string" && key !== "errorCode" ? sanitizeResponseText(value) : value;
  }
  return out;
}

function safeErrorCode(value: string, fallback: string): string {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9_:-]{0,79}$/i.test(trimmed) && !SECRET_VALUE_PATTERN.test(trimmed)
    ? trimmed
    : fallback;
}

function sanitizeResponseText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]")
    .replace(SENSITIVE_WORD_PATTERN, "[REDACTED]");
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}
