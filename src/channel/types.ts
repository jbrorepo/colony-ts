export type ChannelTargetKind = "direct" | "group" | "channel";
export type ChannelDeliveryStatus = "sent" | "failed";

export interface ChannelTarget {
  agentId: string;
  channel: string;
  targetKind: ChannelTargetKind;
  targetId: string;
  accountId?: string;
  threadId?: string;
  topicId?: string;
}

export interface ChannelSendRequest {
  channel: string;
  target: ChannelTarget;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelDeliveryRecord {
  deliveryId: string;
  channel: string;
  routeKey: string;
  target: ChannelTarget;
  textLength: number;
  status: ChannelDeliveryStatus;
  createdAt: string;
  deliveredAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelStatus {
  channelId: string;
  displayName: string;
  enabled: boolean;
  connected: boolean;
  capabilities: string[];
  redactedConfig?: Record<string, unknown>;
  lastError?: string;
  sentCount?: number;
}

export interface ChannelRegistryStatus {
  channels: ChannelStatus[];
  enabledCount: number;
  connectedCount: number;
  deliveryCount: number;
}

export interface ChannelAdapter {
  readonly channelId: string;
  status(): ChannelStatus;
  send(request: ChannelSendRequest): Promise<ChannelDeliveryRecord>;
}

export function buildChannelRouteKey(target: ChannelTarget): string {
  const parts = [
    "agent",
    cleanSegment(target.agentId),
    cleanSegment(target.channel),
    cleanSegment(target.targetKind),
    cleanSegment(target.targetId),
  ];
  if (target.accountId) {
    parts.push("account", cleanSegment(target.accountId));
  }
  if (target.topicId) {
    parts.push("topic", cleanSegment(target.topicId));
  }
  if (target.threadId) {
    parts.push("thread", cleanSegment(target.threadId));
  }
  return parts.join(":");
}

export function createChannelDeliveryRecord(
  deliveryId: string,
  request: ChannelSendRequest,
  status: ChannelDeliveryStatus,
  opts: {
    createdAt?: string;
    deliveredAt?: string;
    error?: string;
  } = {},
): ChannelDeliveryRecord {
  const createdAt = opts.createdAt ?? new Date().toISOString();
  return {
    deliveryId,
    channel: request.channel,
    routeKey: buildChannelRouteKey(request.target),
    target: { ...request.target },
    textLength: request.text.length,
    status,
    createdAt,
    ...(opts.deliveredAt ? { deliveredAt: opts.deliveredAt } : {}),
    ...(opts.error ? { error: opts.error } : {}),
    ...(request.metadata ? { metadata: { ...request.metadata } } : {}),
  };
}

function cleanSegment(value: string): string {
  return String(value).trim().replace(/\s+/g, "_");
}
