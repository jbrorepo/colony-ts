import type {
  ChannelAdapter,
  ChannelDeliveryRecord,
  ChannelSendRequest,
  ChannelStatus,
} from "./types";
import { createChannelDeliveryRecord } from "./types";

export interface InMemoryChannelAdapterOptions {
  channelId: string;
  displayName?: string;
  enabled?: boolean;
  connected?: boolean;
  capabilities?: string[];
  redactedConfig?: Record<string, unknown>;
}

export class InMemoryChannelAdapter implements ChannelAdapter {
  readonly channelId: string;
  readonly sentMessages: ChannelDeliveryRecord[] = [];
  private readonly _displayName: string;
  private readonly _enabled: boolean;
  private readonly _connected: boolean;
  private readonly _capabilities: string[];
  private readonly _redactedConfig: Record<string, unknown>;

  constructor(options: InMemoryChannelAdapterOptions) {
    this.channelId = normalizeChannelId(options.channelId);
    this._displayName = options.displayName ?? this.channelId;
    this._enabled = options.enabled ?? true;
    this._connected = options.connected ?? this._enabled;
    this._capabilities = [...(options.capabilities ?? ["send_text"])];
    this._redactedConfig = { ...(options.redactedConfig ?? {}) };
  }

  status(): ChannelStatus {
    return {
      channelId: this.channelId,
      displayName: this._displayName,
      enabled: this._enabled,
      connected: this._connected,
      capabilities: [...this._capabilities],
      redactedConfig: { ...this._redactedConfig },
      sentCount: this.sentMessages.length,
    };
  }

  async send(request: ChannelSendRequest): Promise<ChannelDeliveryRecord> {
    const record = createChannelDeliveryRecord(nextAdapterDeliveryId(), request, "sent", {
      deliveredAt: new Date().toISOString(),
    });
    this.sentMessages.push(record);
    return record;
  }
}

let adapterDeliverySequence = 0;

function nextAdapterDeliveryId(): string {
  adapterDeliverySequence += 1;
  return `chdel_adapter_${adapterDeliverySequence.toString(36).padStart(4, "0")}`;
}

function normalizeChannelId(channelId: string): string {
  return channelId.trim().toLowerCase();
}
