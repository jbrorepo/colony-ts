import type {
  ChannelAuthPolicy,
  ChannelPairingStore,
} from "./auth";
import {
  normalizeChannelInboundWebhook,
  type ChannelInboundMessage,
} from "./inbound";
import type { ExternalChannelWebhookSignatureDecision } from "./external-signatures";

export interface ChannelWebhookSignatureVerificationRequest {
  channelId: string;
  url: string;
  headers: Record<string, string>;
  rawBody: string;
}

export interface ChannelWebhookTransportOptions {
  pathPrefix?: string;
  agentId?: string;
  authPolicy?: ChannelAuthPolicy;
  pairings?: ChannelPairingStore;
  vendorSignatureVerifier?: (
    request: ChannelWebhookSignatureVerificationRequest,
  ) => ExternalChannelWebhookSignatureDecision | Promise<ExternalChannelWebhookSignatureDecision>;
  onMessage?: (message: ChannelInboundMessage) => void | Promise<void>;
}

export interface ChannelWebhookHttpServerOptions extends ChannelWebhookTransportOptions {
  hostname?: string;
  port?: number;
}

const DEFAULT_CHANNEL_WEBHOOK_PREFIX = "/api/channels";

export async function handleChannelWebhookRequest(
  request: Request,
  options: ChannelWebhookTransportOptions = {},
): Promise<Response> {
  const pathPrefix = normalizePrefix(options.pathPrefix ?? DEFAULT_CHANNEL_WEBHOOK_PREFIX);
  const url = new URL(request.url);
  const channel = extractChannelFromPath(url.pathname, pathPrefix);
  if (!channel) {
    return jsonResponse({ ok: false, error: "Channel webhook endpoint not found" }, 404);
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Channel webhook endpoint only accepts POST" }, 405, {
      allow: "POST",
    });
  }

  const rawBody = await readRawBody(request);
  if ("error" in rawBody) {
    return jsonResponse({ ok: false, error: rawBody.error }, 400);
  }

  const headers = requestHeaders(request);
  if (options.vendorSignatureVerifier) {
    let signature: ExternalChannelWebhookSignatureDecision;
    try {
      signature = await options.vendorSignatureVerifier({
        channelId: channel,
        url: request.url,
        headers,
        rawBody: rawBody.value,
      });
    } catch {
      signature = {
        accepted: false,
        code: "signature_verifier_failed",
        reason: "External channel signature verifier failed closed.",
      };
    }
    if (!signature.accepted) {
      return jsonResponse({
        ok: false,
        accepted: false,
        errorCode: signature.code,
        error: sanitizeResponseText(signature.reason),
      }, 401);
    }
  }

  const body = parseJsonBody(rawBody.value);
  if ("error" in body) {
    return jsonResponse({ ok: false, error: body.error }, 400);
  }

  const normalized = normalizeChannelInboundWebhook({
    channel,
    agentId: options.agentId ?? "default",
    url: request.url,
    headers,
    body: body.value,
    authPolicy: options.authPolicy,
    pairings: options.pairings,
  });

  if (!normalized.accepted || !normalized.message) {
    const status = normalized.errorCode === "webhook_auth_failed" ? 403 : 400;
    return jsonResponse({
      ok: false,
      accepted: false,
      errorCode: normalized.errorCode,
      error: normalized.error,
    }, status);
  }

  await options.onMessage?.(normalized.message);

  return jsonResponse({
    ok: true,
    accepted: true,
    channel: normalized.message.channel,
    messageId: normalized.message.messageId,
    routeKey: normalized.message.routeKey,
    receivedAt: normalized.message.receivedAt,
  }, 202);
}

export class ChannelWebhookHttpServer {
  private readonly _hostname: string;
  private readonly _port: number;
  private readonly _pathPrefix: string;
  private readonly _options: ChannelWebhookTransportOptions;
  private _server: ReturnType<typeof Bun.serve> | null = null;

  constructor(options: ChannelWebhookHttpServerOptions = {}) {
    this._hostname = options.hostname ?? "127.0.0.1";
    this._port = options.port ?? 0;
    this._pathPrefix = normalizePrefix(options.pathPrefix ?? DEFAULT_CHANNEL_WEBHOOK_PREFIX);
    this._options = {
      pathPrefix: this._pathPrefix,
      agentId: options.agentId,
      authPolicy: options.authPolicy,
      pairings: options.pairings,
      vendorSignatureVerifier: options.vendorSignatureVerifier,
      onMessage: options.onMessage,
    };
  }

  get url(): string {
    if (!this._server) throw new Error("Channel webhook HTTP server is not started");
    return `http://${this._server.hostname}:${this._server.port}${this._pathPrefix}`;
  }

  async start(): Promise<void> {
    if (this._server) return;
    this._server = Bun.serve({
      hostname: this._hostname,
      port: this._port,
      fetch: (request) => handleChannelWebhookRequest(request, this._options),
    });
  }

  async stop(): Promise<void> {
    if (!this._server) return;
    this._server.stop(true);
    this._server = null;
  }
}

function extractChannelFromPath(pathname: string, pathPrefix: string): string | null {
  const expectedSuffix = "/webhook";
  if (!pathname.startsWith(`${pathPrefix}/`) || !pathname.endsWith(expectedSuffix)) {
    return null;
  }
  const between = pathname.slice(pathPrefix.length + 1, -expectedSuffix.length);
  if (!between || between.includes("/")) return null;
  return decodeURIComponent(between).trim().toLowerCase();
}

async function readRawBody(request: Request): Promise<{ value: string } | { error: string }> {
  try {
    return { value: await request.text() };
  } catch {
    return { error: "Malformed request body" };
  }
}

function parseJsonBody(rawBody: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(rawBody) as unknown };
  } catch {
    return { error: "Malformed JSON body" };
  }
}

function requestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function sanitizeResponseText(value: string): string {
  return value
    .replace(/(xoxb-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi, "[REDACTED]")
    .replace(/([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/([a-z0-9_-]*(?:secret|token|credential|signature|api[_-]?key)[a-z0-9_-]*)/gi, "[REDACTED]");
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}
