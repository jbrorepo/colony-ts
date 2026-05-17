import type { ChannelTargetKind } from "./types";

export type ChannelAccessPolicy = "open" | "allowlist" | "pairing" | "disabled";

export interface ChannelAuthConfig {
  webhookSecret?: string;
  dmPolicy?: ChannelAccessPolicy;
  groupPolicy?: ChannelAccessPolicy;
  allowFrom?: string[];
}

export interface ChannelAuthPolicyOptions {
  channels?: Record<string, ChannelAuthConfig>;
}

export interface ChannelWebhookAuthRequest {
  channel: string;
  url: string;
  headers?: Record<string, string | undefined>;
}

export interface ChannelInboundAuthRequest {
  channel: string;
  senderId: string;
  targetKind: ChannelTargetKind;
  targetId?: string;
  pairings?: ChannelPairingStore;
}

export interface ChannelAuthDecision {
  allowed: boolean;
  code: string;
  reason: string;
  policy?: ChannelAccessPolicy;
}

export interface ChannelAuthStatus {
  channels: Array<{
    channelId: string;
    webhookAuthRequired: boolean;
    dmPolicy: ChannelAccessPolicy;
    groupPolicy: ChannelAccessPolicy;
    allowFromCount: number;
  }>;
}

export interface ChannelPairingRequest {
  channel: string;
  senderId: string;
  requestedBy: string;
  expiresAt?: string;
}

export interface ChannelPairingApproval {
  approvedBy: string;
  approvedAt?: string;
}

export interface ChannelPairingIssue {
  code: string;
  channel: string;
  senderId: string;
  requestedBy: string;
  expiresAt?: string;
  status: "pending";
}

export interface ChannelPairingApprovalResult {
  approved: boolean;
  reason?: string;
  binding?: {
    channel: string;
    senderId: string;
    approvedBy: string;
    approvedAt: string;
  };
}

export interface ChannelPairingStatus {
  pendingCount: number;
  approvedCount: number;
  pending: Array<{
    channel: string;
    senderId: string;
    requestedBy: string;
    expiresAt?: string;
  }>;
  approved: Array<{
    channel: string;
    senderId: string;
    approvedBy: string;
    approvedAt: string;
  }>;
}

export class ChannelAuthPolicy {
  private readonly _channels = new Map<string, Required<ChannelAuthConfig>>();

  constructor(options: ChannelAuthPolicyOptions = {}) {
    for (const [channelId, config] of Object.entries(options.channels ?? {})) {
      this._channels.set(normalizeChannelId(channelId), normalizeConfig(config));
    }
  }

  authenticateWebhook(request: ChannelWebhookAuthRequest): ChannelAuthDecision {
    const config = this._channels.get(normalizeChannelId(request.channel));
    if (!config?.webhookSecret) {
      return {
        allowed: true,
        code: "webhook_auth_not_required",
        reason: "No webhook secret configured for channel.",
      };
    }

    const supplied = extractWebhookSecret(request);
    if (supplied === config.webhookSecret) {
      return {
        allowed: true,
        code: "webhook_authenticated",
        reason: "Webhook secret matched configured channel policy.",
      };
    }

    return {
      allowed: false,
      code: "webhook_auth_failed",
      reason: "Webhook secret missing or invalid.",
    };
  }

  authorizeInbound(request: ChannelInboundAuthRequest): ChannelAuthDecision {
    const channel = normalizeChannelId(request.channel);
    const config = this._channels.get(channel);
    if (!config) {
      return {
        allowed: false,
        code: "channel_not_configured",
        reason: `No inbound policy configured for channel '${channel}'.`,
      };
    }

    const policy = request.targetKind === "direct" ? config.dmPolicy : config.groupPolicy;
    if (policy === "open") {
      return {
        allowed: true,
        code: "policy_open",
        reason: "Channel policy allows this inbound target.",
        policy,
      };
    }
    if (policy === "disabled") {
      return {
        allowed: false,
        code: "channel_disabled_for_inbound",
        reason: "Channel policy disables this inbound target.",
        policy,
      };
    }

    const paired = request.pairings?.isPaired(channel, request.senderId) ?? false;
    if (paired) {
      return {
        allowed: true,
        code: "paired_sender",
        reason: "Sender has an approved channel pairing.",
        policy,
      };
    }

    if (policy === "allowlist") {
      const allowed = config.allowFrom.includes(request.senderId);
      return {
        allowed,
        code: allowed ? "allowlisted_sender" : "sender_not_allowlisted",
        reason: allowed
          ? "Sender matched channel allowlist."
          : "Sender is not present in channel allowlist.",
        policy,
      };
    }

    return {
      allowed: false,
      code: "pairing_required",
      reason: "Sender must complete channel pairing before inbound messages are accepted.",
      policy,
    };
  }

  status(): ChannelAuthStatus {
    return {
      channels: Array.from(this._channels.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([channelId, config]) => ({
          channelId,
          webhookAuthRequired: config.webhookSecret.length > 0,
          dmPolicy: config.dmPolicy,
          groupPolicy: config.groupPolicy,
          allowFromCount: config.allowFrom.length,
        })),
    };
  }
}

export class ChannelPairingStore {
  private readonly _pending = new Map<string, ChannelPairingIssue>();
  private readonly _approved = new Map<string, {
    channel: string;
    senderId: string;
    approvedBy: string;
    approvedAt: string;
  }>();
  private _sequence = 0;

  issuePairing(request: ChannelPairingRequest): ChannelPairingIssue {
    const channel = normalizeChannelId(request.channel);
    const issue: ChannelPairingIssue = {
      code: this._nextCode(),
      channel,
      senderId: request.senderId,
      requestedBy: request.requestedBy,
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
      status: "pending",
    };
    this._pending.set(issue.code, issue);
    return { ...issue };
  }

  approve(code: string, approval: ChannelPairingApproval): ChannelPairingApprovalResult {
    const pending = this._pending.get(code);
    if (!pending) {
      return {
        approved: false,
        reason: "Pairing code not found or already used.",
      };
    }

    this._pending.delete(code);
    const binding = {
      channel: pending.channel,
      senderId: pending.senderId,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt ?? new Date().toISOString(),
    };
    this._approved.set(pairingKey(binding.channel, binding.senderId), binding);
    return {
      approved: true,
      binding: { ...binding },
    };
  }

  isPaired(channel: string, senderId: string): boolean {
    return this._approved.has(pairingKey(normalizeChannelId(channel), senderId));
  }

  status(): ChannelPairingStatus {
    return {
      pendingCount: this._pending.size,
      approvedCount: this._approved.size,
      pending: Array.from(this._pending.values())
        .sort((a, b) => `${a.channel}:${a.senderId}`.localeCompare(`${b.channel}:${b.senderId}`))
        .map((entry) => ({
          channel: entry.channel,
          senderId: entry.senderId,
          requestedBy: entry.requestedBy,
          ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
        })),
      approved: Array.from(this._approved.values())
        .sort((a, b) => `${a.channel}:${a.senderId}`.localeCompare(`${b.channel}:${b.senderId}`))
        .map((entry) => ({ ...entry })),
    };
  }

  private _nextCode(): string {
    this._sequence += 1;
    return `chpair_${this._sequence.toString(36).padStart(6, "0")}`;
  }
}

function normalizeConfig(config: ChannelAuthConfig): Required<ChannelAuthConfig> {
  return {
    webhookSecret: config.webhookSecret ?? "",
    dmPolicy: config.dmPolicy ?? "pairing",
    groupPolicy: config.groupPolicy ?? "allowlist",
    allowFrom: [...(config.allowFrom ?? [])],
  };
}

function extractWebhookSecret(request: ChannelWebhookAuthRequest): string | null {
  const url = new URL(request.url);
  const querySecret =
    url.searchParams.get("token") ??
    url.searchParams.get("secret") ??
    url.searchParams.get("password") ??
    url.searchParams.get("guid");
  if (querySecret) return querySecret;

  const headers = lowerCaseHeaders(request.headers ?? {});
  const headerSecret =
    headers["x-channel-secret"] ??
    headers["x-webhook-secret"] ??
    headers["x-telegram-bot-api-secret-token"] ??
    headers["x-colony-channel-secret"];
  if (headerSecret) return headerSecret;

  const authorization = headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return null;
}

function lowerCaseHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const lowered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) lowered[key.toLowerCase()] = value;
  }
  return lowered;
}

function normalizeChannelId(channelId: string): string {
  return channelId.trim().toLowerCase();
}

function pairingKey(channel: string, senderId: string): string {
  return `${normalizeChannelId(channel)}:${senderId}`;
}
