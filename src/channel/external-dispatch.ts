import type {
  ChannelAuthPolicy,
  ChannelPairingStore,
} from "./auth";
import {
  normalizeChannelInboundWebhook,
} from "./inbound";
import type { ChannelSessionBridge } from "./session-bridge";
import {
  normalizeExternalChannelVendorEvent,
} from "./external-events";
import type {
  ExternalChannelApprovedEventBinding,
  ExternalChannelApprovedEventBindingReader,
} from "./external-event-bindings";
import {
  normalizeExternalChannelApprovedEventBinding,
} from "./external-event-bindings";

export interface ExternalChannelVendorEventDispatchRequest {
  channelId: string;
  body: unknown;
  bridge?: ChannelSessionBridge | null;
  agentId?: string;
  authPolicy?: ChannelAuthPolicy;
  pairings?: ChannelPairingStore;
  headers?: Record<string, string | undefined>;
  sourceUrl?: string;
  receivedAt?: string;
  deferBridgeCompletion?: boolean;
  approvedEventBindings?: ExternalChannelApprovedEventBinding[] | null;
  approvedEventBindingStore?: ExternalChannelApprovedEventBindingReader | null;
}

export interface ExternalChannelVendorEventDispatchResult {
  handled: boolean;
  command: string;
  output: string;
  isError: boolean;
  data: Record<string, unknown>;
}

const SUPPORTED_CHANNELS = new Set(["discord", "slack", "telegram"]);
const SECRET_VALUE_PATTERN = /(xoxb-[a-z0-9_-]+|sk-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;
const SENSITIVE_WORD_PATTERN = /([a-z0-9_-]*(?:secret|token|credential|signature|api[_-]?key)[a-z0-9_-]*)/gi;

export async function dispatchExternalChannelVendorEvent(
  request: ExternalChannelVendorEventDispatchRequest,
): Promise<ExternalChannelVendorEventDispatchResult> {
  const channelId = normalizeChannelId(request.channelId);
  if (!SUPPORTED_CHANNELS.has(channelId)) {
    return rejected("unsupported_channel", "External vendor event dispatch rejected: unsupported channel.", channelId);
  }
  if (!request.bridge) {
    return rejected(
      "missing_bridge",
      "External vendor event dispatch rejected: host-owned channel session bridge is required.",
      channelId,
    );
  }
  if (!request.authPolicy) {
    return rejected(
      "missing_host_auth_policy",
      "External vendor event dispatch rejected: host-owned channel auth policy is required.",
      channelId,
    );
  }
  const sourceUrl = request.sourceUrl ?? defaultSourceUrl(channelId);
  const hostVerification = request.authPolicy.authenticateWebhook({
    channel: channelId,
    url: sourceUrl,
    headers: request.headers,
  });
  if (!hostVerification.allowed) {
    return rejected(
      hostVerification.code,
      `External vendor event dispatch rejected: ${hostVerification.reason}`,
      channelId,
    );
  }
  if (hostVerification.code === "webhook_auth_not_required") {
    return rejected(
      "missing_host_verification_proof",
      "External vendor event dispatch rejected: explicit host verification proof is required.",
      channelId,
    );
  }

  const normalized = normalizeExternalChannelVendorEvent({
    channelId,
    body: request.body,
    receivedAt: request.receivedAt,
  });
  if (!normalized.accepted || !normalized.body) {
    return rejected(
      normalized.errorCode ?? "vendor_event_rejected",
      `External vendor event dispatch rejected: ${normalized.error ?? "vendor event was not accepted."}`,
      channelId,
    );
  }
  const bindingDecision = await checkApprovedEventBinding(channelId, normalized.body, request.approvedEventBindings, request.approvedEventBindingStore);
  if (!bindingDecision.allowed) {
    return rejected(
      "external_event_binding_rejected",
      `External vendor event dispatch rejected: ${bindingDecision.reason}`,
      channelId,
    );
  }

  const inbound = normalizeChannelInboundWebhook({
    channel: channelId,
    agentId: request.agentId ?? "default",
    url: sourceUrl,
    headers: request.headers,
    body: normalized.body,
    authPolicy: request.authPolicy,
    pairings: request.pairings,
    receivedAt: request.receivedAt,
  });
  if (!inbound.accepted || !inbound.message) {
    return rejected(
      inbound.errorCode ?? "inbound_rejected",
      `External vendor event dispatch rejected: ${inbound.error ?? "inbound channel policy rejected the event."}`,
      channelId,
    );
  }

  if (request.deferBridgeCompletion) {
    let accepted;
    try {
      accepted = request.bridge.acceptInbound(inbound.message, { suppressReply: channelId === "discord" });
    } catch {
      return rejected(
        "bridge_dispatch_failed",
        "External vendor event dispatch rejected: host-owned channel session bridge failed closed.",
        channelId,
      );
    }
    return {
      handled: true,
      command: "channels",
      output: [
        "External vendor event accepted by host executor.",
        `Channel: ${channelId}`,
        `Message: ${fingerprintId("msg", inbound.message.messageId)}`,
        "Turn: deferred | accepted",
        "Scope: host-owned bridge acceptance only; dispatcher performs no listener startup, subscription setup, credential setup, adapter registration, webhook registration, upload, retry worker, or direct vendor API call.",
      ].join("\n"),
      isError: false,
      data: {
        action: "channels_external_event_accepted",
        channelId,
        messageId: fingerprintId("msg", inbound.message.messageId),
        routeKey: fingerprintId("route", accepted.routeKey),
        sessionId: safeResultText(accepted.sessionId),
        accepted: true,
        turnStatus: accepted.duplicate === true ? "duplicate" : "deferred",
        createdSession: accepted.createdSession,
        ...(accepted.duplicate === true ? { duplicate: true } : {}),
      },
    };
  }

  let turn;
  try {
    turn = await request.bridge.handleInbound(inbound.message);
  } catch {
    return rejected(
      "bridge_dispatch_failed",
      "External vendor event dispatch rejected: host-owned channel session bridge failed closed.",
      channelId,
    );
  }

  return {
    handled: true,
    command: "channels",
    output: [
      "External vendor event dispatched by host executor.",
      `Channel: ${channelId}`,
      `Message: ${fingerprintId("msg", inbound.message.messageId)}`,
      `Turn: ${safeResultText(turn.turnId)} | ${turn.status}`,
      "Scope: host-owned bridge dispatch only; dispatcher performs no listener startup, subscription setup, credential setup, adapter registration, webhook registration, upload, retry worker, or direct vendor API call.",
    ].join("\n"),
    isError: false,
    data: {
      action: "channels_external_event_dispatched",
      channelId,
      messageId: fingerprintId("msg", inbound.message.messageId),
      routeKey: fingerprintId("route", inbound.message.routeKey),
      sessionId: safeResultText(turn.sessionId),
      turnId: safeResultText(turn.turnId),
      turnStatus: turn.status,
      createdSession: turn.createdSession,
      ...(turn.replyDelivery ? { replyDeliveryStatus: turn.replyDelivery.status } : {}),
    },
  };
}

function rejected(
  reasonCode: string,
  output: string,
  channelId: string,
): ExternalChannelVendorEventDispatchResult {
  return {
    handled: true,
    command: "channels",
    output: sanitizeText(output),
    isError: true,
    data: {
      action: "channels_external_event_rejected",
      channelId,
      reasonCode,
    },
  };
}

async function checkApprovedEventBinding(
  channelId: string,
  body: { accountId?: string; metadata?: Record<string, unknown> },
  bindings: ExternalChannelApprovedEventBinding[] | null | undefined,
  bindingStore: ExternalChannelApprovedEventBindingReader | null | undefined,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if ((bindings === undefined || bindings === null) && !bindingStore) {
    return { allowed: true };
  }
  let loadedBindings: ExternalChannelApprovedEventBinding[] = [];
  if (bindingStore) {
    try {
      loadedBindings = await bindingStore.loadApprovedEventBindings();
    } catch {
      return { allowed: false, reason: "host-approved event binding store failed closed." };
    }
  }
  let allBindings: ExternalChannelApprovedEventBinding[];
  try {
    allBindings = [...(bindings ?? []), ...loadedBindings].map(normalizeExternalChannelApprovedEventBinding);
  } catch {
    return { allowed: false, reason: "host-approved event binding was malformed." };
  }

  const eventType = readMetadataString(body.metadata, "eventType");
  const eventAccountId = readEventAccountId(channelId, body);
  const eventAppId = readEventAppId(channelId, body);
  if (!eventType) {
    return { allowed: false, reason: "host-approved event binding requires a normalized vendor event type." };
  }
  if (channelId === "slack" && !eventAccountId) {
    return { allowed: false, reason: "Slack event binding requires a normalized workspace id." };
  }

  for (const binding of allBindings) {
    if (!isUsableBinding(binding)) continue;
    if (normalizeChannelId(binding.channelId) !== channelId) continue;
    const bindingEventTypes = new Set(binding.eventTypes.flatMap(slackDispatchEventTypesForBinding).filter(Boolean));
    if (!bindingEventTypes.has(eventType)) continue;
    const bindingAccountId = binding.accountId?.trim();
    if (channelId === "slack" && !bindingAccountId) continue;
    if (bindingAccountId && bindingAccountId !== eventAccountId) continue;
    if (channelId === "slack" && eventAppId && binding.appId !== eventAppId) continue;
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "no host-approved binding matched the normalized channel, account, and event type.",
  };
}

function isUsableBinding(binding: ExternalChannelApprovedEventBinding): boolean {
  return binding.enabled !== false &&
    binding.active !== false &&
    typeof binding.channelId === "string" &&
    Array.isArray(binding.eventTypes) &&
    binding.eventTypes.some((item) => typeof item === "string" && item.trim().length > 0) &&
    typeof binding.approvedBy === "string" &&
    binding.approvedBy.trim().length > 0;
}

function slackDispatchEventTypesForBinding(value: string): string[] {
  const normalized = value.trim();
  if (normalized === "message.channels") return ["message"];
  if (normalized === "app_mention") return ["app_mention"];
  return [normalized];
}

function readEventAccountId(
  channelId: string,
  body: { accountId?: string; metadata?: Record<string, unknown> },
): string | undefined {
  if (typeof body.accountId === "string" && body.accountId.trim().length > 0) {
    return body.accountId.trim();
  }
  if (channelId === "slack") return readMetadataString(body.metadata, "teamId");
  if (channelId === "discord") return readMetadataString(body.metadata, "guildId");
  return undefined;
}

function readEventAppId(
  channelId: string,
  body: { metadata?: Record<string, unknown> },
): string | undefined {
  if (channelId === "slack") return readMetadataString(body.metadata, "appId");
  if (channelId === "discord") return readMetadataString(body.metadata, "applicationId");
  return undefined;
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function defaultSourceUrl(channelId: string): string {
  return `https://colony.local.invalid/api/channels/${encodeURIComponent(channelId)}/external-event`;
}

function sanitizeText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]")
    .replace(SENSITIVE_WORD_PATTERN, "[REDACTED]");
}

function safeResultText(value: string): string {
  return sanitizeText(value.slice(0, 200));
}

function fingerprintId(prefix: string, value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeChannelId(value: string): string {
  return String(value).trim().toLowerCase();
}
