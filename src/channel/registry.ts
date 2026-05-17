import type {
  ChannelAdapter,
  ChannelDeliveryRecord,
  ChannelRegistryStatus,
  ChannelSendRequest,
} from "./types";
import { createChannelDeliveryRecord } from "./types";

export class ChannelRegistry {
  private readonly _adapters = new Map<string, ChannelAdapter>();
  private readonly _deliveries: ChannelDeliveryRecord[] = [];
  private _deliverySequence = 0;

  register(adapter: ChannelAdapter): void {
    const channelId = normalizeChannelId(adapter.channelId);
    if (this._adapters.has(channelId)) {
      throw new Error(`Channel already registered: ${channelId}`);
    }
    this._adapters.set(channelId, adapter);
  }

  get(channelId: string): ChannelAdapter | undefined {
    return this._adapters.get(normalizeChannelId(channelId));
  }

  list(): ChannelAdapter[] {
    return Array.from(this._adapters.values()).sort((a, b) => a.channelId.localeCompare(b.channelId));
  }

  status(): ChannelRegistryStatus {
    const channels = this.list().map((adapter) => adapter.status());
    return {
      channels,
      enabledCount: channels.filter((channel) => channel.enabled).length,
      connectedCount: channels.filter((channel) => channel.connected).length,
      deliveryCount: this._deliveries.length,
    };
  }

  recentDeliveries(limit = 10): ChannelDeliveryRecord[] {
    return this._deliveries.slice(-limit).reverse().map((delivery) => cloneDelivery(delivery));
  }

  async send(request: ChannelSendRequest): Promise<ChannelDeliveryRecord> {
    const channelId = normalizeChannelId(request.channel);
    const normalizedRequest: ChannelSendRequest = {
      ...request,
      channel: channelId,
      target: {
        ...request.target,
        channel: normalizeChannelId(request.target.channel),
      },
      metadata: request.metadata ? { ...request.metadata } : undefined,
    };

    const adapter = this._adapters.get(channelId);
    if (!adapter) {
      return this._recordFailure(normalizedRequest, `Channel not registered: ${channelId}`);
    }

    const status = adapter.status();
    if (!status.enabled) {
      return this._recordFailure(normalizedRequest, `Channel disabled: ${channelId}`);
    }
    if (!status.connected) {
      return this._recordFailure(normalizedRequest, `Channel disconnected: ${channelId}`);
    }

    const sent = await adapter.send(normalizedRequest);
    const record: ChannelDeliveryRecord = {
      ...sent,
      deliveryId: this._nextDeliveryId(),
      channel: channelId,
      metadata: sent.metadata ? { ...sent.metadata } : undefined,
      target: { ...sent.target },
    };
    this._deliveries.push(record);
    return cloneDelivery(record);
  }

  private _recordFailure(request: ChannelSendRequest, error: string): ChannelDeliveryRecord {
    const record = createChannelDeliveryRecord(this._nextDeliveryId(), request, "failed", { error });
    this._deliveries.push(record);
    return cloneDelivery(record);
  }

  private _nextDeliveryId(): string {
    this._deliverySequence += 1;
    return `chdel_${this._deliverySequence.toString(36).padStart(6, "0")}`;
  }
}

function normalizeChannelId(channelId: string): string {
  return channelId.trim().toLowerCase();
}

function cloneDelivery(delivery: ChannelDeliveryRecord): ChannelDeliveryRecord {
  return {
    ...delivery,
    target: { ...delivery.target },
    metadata: delivery.metadata ? { ...delivery.metadata } : undefined,
  };
}
