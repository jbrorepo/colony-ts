export type ExternalChannelSignatureChannel = "slack" | "discord" | "telegram";

export interface DiscordSignatureVerifierRequest {
  body: string;
  timestamp: string;
  signature: string;
  publicKey: string;
}

export interface ExternalChannelWebhookSignatureRequest {
  channelId: ExternalChannelSignatureChannel;
  body: string;
  headers?: Record<string, string | undefined>;
  signingSecret: string;
  nowEpochSeconds?: number;
  maxSlackSkewSeconds?: number;
  discordVerifier?: (request: DiscordSignatureVerifierRequest) => boolean | Promise<boolean>;
}

export interface ExternalChannelWebhookSignatureDecision {
  accepted: boolean;
  code: string;
  reason: string;
  redactedDiagnostics?: Record<string, unknown>;
}

const SLACK_VERSION = "v0";
const DEFAULT_SLACK_MAX_SKEW_SECONDS = 300;
const SECRET_VALUE_PATTERN = /(xoxb-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;

export async function verifyExternalChannelWebhookSignature(
  request: ExternalChannelWebhookSignatureRequest,
): Promise<ExternalChannelWebhookSignatureDecision> {
  const channelId = normalizeChannelId(request.channelId);
  if (!request.signingSecret.trim()) {
    return reject("missing_signing_secret", "External channel signing secret is missing.");
  }
  if (channelId === "slack") return verifySlackSignature(request);
  if (channelId === "telegram") return verifyTelegramSecretToken(request);
  if (channelId === "discord") return verifyDiscordSignature(request);
  return reject("unsupported_signature_channel", "Unsupported external channel signature type.");
}

async function verifySlackSignature(
  request: ExternalChannelWebhookSignatureRequest,
): Promise<ExternalChannelWebhookSignatureDecision> {
  const headers = lowerCaseHeaders(request.headers ?? {});
  const timestamp = headers["x-slack-request-timestamp"];
  const suppliedSignature = headers["x-slack-signature"];
  if (!timestamp || !suppliedSignature) {
    return reject("missing_signature_headers", "Slack signature headers are required.");
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds)) {
    return reject("invalid_signature_timestamp", "Slack signature timestamp is invalid.");
  }
  const now = request.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  const maxSkew = request.maxSlackSkewSeconds ?? DEFAULT_SLACK_MAX_SKEW_SECONDS;
  if (Math.abs(now - timestampSeconds) > maxSkew) {
    return reject("stale_signature_timestamp", "Slack signature timestamp is outside the allowed skew window.", {
      ageSeconds: Math.abs(now - timestampSeconds),
      maxSkewSeconds: maxSkew,
    });
  }
  const expected = await slackSignature(request.signingSecret, timestamp, request.body);
  if (!constantTimeEqual(expected, suppliedSignature)) {
    return reject("signature_mismatch", "Slack signature did not match expected HMAC.");
  }
  return accept("signature_verified", "Slack signature verified.");
}

async function verifyTelegramSecretToken(
  request: ExternalChannelWebhookSignatureRequest,
): Promise<ExternalChannelWebhookSignatureDecision> {
  const headers = lowerCaseHeaders(request.headers ?? {});
  const supplied = headers["x-telegram-bot-api-secret-token"];
  if (!supplied) {
    return reject("missing_signature_headers", "Telegram webhook secret-token header is required.");
  }
  if (!constantTimeEqual(request.signingSecret, supplied)) {
    return reject("signature_mismatch", "Telegram webhook secret-token did not match.");
  }
  return accept("signature_verified", "Telegram webhook secret-token verified.");
}

async function verifyDiscordSignature(
  request: ExternalChannelWebhookSignatureRequest,
): Promise<ExternalChannelWebhookSignatureDecision> {
  const headers = lowerCaseHeaders(request.headers ?? {});
  const timestamp = headers["x-signature-timestamp"];
  const signature = headers["x-signature-ed25519"];
  if (!timestamp || !signature) {
    return reject("missing_signature_headers", "Discord signature timestamp and Ed25519 signature headers are required.");
  }
  if (!request.discordVerifier) {
    return reject("discord_verifier_required", "Discord Ed25519 verification requires an explicit verifier.");
  }
  let accepted = false;
  try {
    accepted = await request.discordVerifier({
      body: request.body,
      timestamp,
      signature,
      publicKey: request.signingSecret,
    });
  } catch {
    return reject("signature_verifier_failed", "Discord signature verifier failed closed.");
  }
  if (!accepted) {
    return reject("signature_mismatch", "Discord signature verifier rejected the request.");
  }
  return accept("signature_verified", "Discord signature verified by injected verifier.");
}

async function slackSignature(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${SLACK_VERSION}:${timestamp}:${body}`),
  );
  return `${SLACK_VERSION}=${Array.from(new Uint8Array(signed)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function accept(code: string, reason: string): ExternalChannelWebhookSignatureDecision {
  return { accepted: true, code, reason };
}

function reject(
  code: string,
  reason: string,
  redactedDiagnostics: Record<string, unknown> = {},
): ExternalChannelWebhookSignatureDecision {
  return {
    accepted: false,
    code,
    reason: sanitizeText(reason),
    redactedDiagnostics: sanitizeDiagnostics(redactedDiagnostics),
  };
}

function sanitizeDiagnostics(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      out[key] = sanitizeText(entry);
    } else if (typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      out[key] = entry;
    } else {
      out[key] = "[REDACTED]";
    }
  }
  return out;
}

function sanitizeText(value: string): string {
  return value.replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}

function lowerCaseHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) lowered[key.toLowerCase()] = value;
  }
  return lowered;
}

function normalizeChannelId(channelId: string): string {
  return String(channelId).trim().toLowerCase();
}
