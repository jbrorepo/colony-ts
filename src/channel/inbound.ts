import {
  ChannelAuthPolicy,
  ChannelPairingStore,
  type ChannelAuthDecision,
} from "./auth";
import {
  buildChannelRouteKey,
  type ChannelTarget,
  type ChannelTargetKind,
} from "./types";

export interface ChannelInboundWebhookOptions {
  channel: string;
  agentId: string;
  url: string;
  headers?: Record<string, string | undefined>;
  body: unknown;
  authPolicy?: ChannelAuthPolicy;
  pairings?: ChannelPairingStore;
  receivedAt?: string;
}

export interface ChannelInboundMessage {
  messageId: string;
  channel: string;
  routeKey: string;
  target: ChannelTarget;
  senderId: string;
  senderName?: string;
  text: string;
  receivedAt: string;
  authorization: ChannelAuthDecision;
  metadata?: Record<string, unknown>;
}

export interface ChannelInboundNormalizationResult {
  accepted: boolean;
  message?: ChannelInboundMessage;
  errorCode?: string;
  error?: string;
}

export function normalizeChannelInboundWebhook(
  options: ChannelInboundWebhookOptions,
): ChannelInboundNormalizationResult {
  const channel = normalizeChannelId(options.channel);
  const webhookDecision = options.authPolicy?.authenticateWebhook({
    channel,
    url: options.url,
    headers: options.headers,
  }) ?? {
    allowed: true,
    code: "webhook_auth_not_configured",
    reason: "No channel auth policy supplied.",
  };

  if (!webhookDecision.allowed) {
    return {
      accepted: false,
      errorCode: webhookDecision.code,
      error: webhookDecision.reason,
    };
  }

  const parsed = parseInboundBody(options.body);
  if ("error" in parsed) {
    return {
      accepted: false,
      errorCode: "invalid_inbound_payload",
      error: parsed.error,
    };
  }

  const target: ChannelTarget = {
    agentId: options.agentId,
    channel,
    targetKind: parsed.value.targetKind,
    targetId: parsed.value.targetId,
    ...(parsed.value.threadId ? { threadId: parsed.value.threadId } : {}),
    ...(parsed.value.topicId ? { topicId: parsed.value.topicId } : {}),
    ...(parsed.value.accountId ? { accountId: parsed.value.accountId } : {}),
  };

  const inboundDecision = options.authPolicy?.authorizeInbound({
    channel,
    senderId: parsed.value.senderId,
    targetKind: parsed.value.targetKind,
    targetId: parsed.value.targetId,
    pairings: options.pairings,
  }) ?? {
    allowed: true,
    code: "inbound_auth_not_configured",
    reason: "No channel auth policy supplied.",
  };

  if (!inboundDecision.allowed) {
    return {
      accepted: false,
      errorCode: inboundDecision.code,
      error: inboundDecision.reason,
    };
  }

  return {
    accepted: true,
    message: {
      messageId: parsed.value.messageId,
      channel,
      routeKey: buildChannelRouteKey(target),
      target,
      senderId: parsed.value.senderId,
      ...(parsed.value.senderName ? { senderName: parsed.value.senderName } : {}),
      text: parsed.value.text,
      receivedAt: options.receivedAt ?? new Date().toISOString(),
      authorization: inboundDecision,
      ...(parsed.value.metadata ? { metadata: parsed.value.metadata } : {}),
    },
  };
}

interface ParsedInboundBody {
  messageId: string;
  senderId: string;
  senderName?: string;
  text: string;
  targetKind: ChannelTargetKind;
  targetId: string;
  accountId?: string;
  threadId?: string;
  topicId?: string;
  metadata?: Record<string, unknown>;
}

function parseInboundBody(body: unknown): { value: ParsedInboundBody } | { error: string } {
  if (!isRecord(body)) return { error: "Inbound webhook body must be an object." };
  const senderId = readRequiredString(body.senderId, "senderId");
  if ("error" in senderId) return senderId;
  const text = readRequiredString(body.text, "text");
  if ("error" in text) return text;
  const targetKindRaw = readRequiredString(body.targetKind, "targetKind");
  if ("error" in targetKindRaw) return targetKindRaw;
  if (!["direct", "group", "channel"].includes(targetKindRaw.value)) {
    return { error: "targetKind must be direct, group, or channel." };
  }
  const targetId = readRequiredString(body.targetId, "targetId");
  if ("error" in targetId) return targetId;

  return {
    value: {
      messageId: readOptionalString(body.messageId) ?? `chin_${Date.now().toString(36)}`,
      senderId: senderId.value,
      senderName: readOptionalString(body.senderName),
      text: text.value,
      targetKind: targetKindRaw.value as ChannelTargetKind,
      targetId: targetId.value,
      accountId: readOptionalString(body.accountId),
      threadId: readOptionalString(body.threadId),
      topicId: readOptionalString(body.topicId),
      metadata: isRecord(body.metadata) ? { ...body.metadata } : undefined,
    },
  };
}

function readRequiredString(value: unknown, fieldName: string): { value: string } | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${fieldName} is required.` };
  }
  return { value };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeChannelId(channelId: string): string {
  return channelId.trim().toLowerCase();
}
