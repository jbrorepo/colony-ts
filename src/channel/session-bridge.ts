import type { ChannelInboundMessage } from "./inbound";
import type { ChannelRegistry } from "./registry";
import type {
  ChannelDeliveryRecord,
  ChannelSendRequest,
  ChannelTarget,
} from "./types";

export type ChannelSessionTurnStatus =
  | "replied"
  | "no_reply"
  | "delivery_failed"
  | "runner_failed"
  | "duplicate";

export interface ChannelSessionRequest {
  sessionId: string;
  route: ChannelSessionRoute;
  message: ChannelInboundMessage;
  createdSession: boolean;
}

export interface ChannelSessionReply {
  text?: string;
  metadata?: Record<string, unknown>;
}

export type ChannelSessionRunner = (request: ChannelSessionRequest) => Promise<ChannelSessionReply>;

export interface ChannelSessionBridgeHandleOptions {
  suppressReply?: boolean;
}

export interface ChannelSessionBridgeAcceptance {
  routeKey: string;
  sessionId: string;
  createdSession: boolean;
  duplicate?: boolean;
}

export interface ChannelSessionBridgeOptions {
  registry: ChannelRegistry;
  sessionRunner: ChannelSessionRunner;
  sessionIdFactory?: (routeKey: string, sequence: number) => string;
  now?: () => string;
}

export interface ChannelSessionRoute {
  routeKey: string;
  sessionId: string;
  channel: string;
  target: ChannelTarget;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastInboundMessageId?: string;
  lastReplyDeliveryId?: string;
  lastError?: string;
}

export interface ChannelSessionTurnRecord {
  turnId: string;
  status: ChannelSessionTurnStatus;
  routeKey: string;
  sessionId: string;
  createdSession: boolean;
  inboundMessageId: string;
  receivedAt: string;
  replyDelivery?: ChannelDeliveryRecord;
  error?: string;
}

export interface ChannelSessionBridgeStatus {
  routeCount: number;
  replyDeliveryCount: number;
  failedTurnCount: number;
  routes: ChannelSessionRoute[];
  recentTurns: ChannelSessionTurnRecord[];
}

const MAX_RECENT_INBOUND_MESSAGE_IDS_PER_ROUTE = 200;

export class ChannelSessionBridge {
  private readonly _registry: ChannelRegistry;
  private readonly _sessionRunner: ChannelSessionRunner;
  private readonly _sessionIdFactory: (routeKey: string, sequence: number) => string;
  private readonly _now: () => string;
  private readonly _routes = new Map<string, ChannelSessionRoute>();
  private readonly _recentInboundMessageIdsByRoute = new Map<string, string[]>();
  private readonly _turns: ChannelSessionTurnRecord[] = [];
  private _sessionSequence = 0;
  private _turnSequence = 0;

  constructor(options: ChannelSessionBridgeOptions) {
    this._registry = options.registry;
    this._sessionRunner = options.sessionRunner;
    this._sessionIdFactory = options.sessionIdFactory ?? defaultSessionIdFactory;
    this._now = options.now ?? (() => new Date().toISOString());
  }

  acceptInbound(
    message: ChannelInboundMessage,
    options: ChannelSessionBridgeHandleOptions = {},
  ): ChannelSessionBridgeAcceptance {
    const { route, createdSession, duplicate } = this._acceptRoute(message);
    if (duplicate) {
      return {
        routeKey: route.routeKey,
        sessionId: route.sessionId,
        createdSession: false,
        duplicate: true,
      };
    }
    const acceptedRoute = cloneRoute(route);
    setTimeout(() => {
      void this._runAcceptedInbound(message, route, createdSession, options, acceptedRoute).catch(() => undefined);
    }, 0);
    return {
      routeKey: route.routeKey,
      sessionId: route.sessionId,
      createdSession,
    };
  }

  async handleInbound(
    message: ChannelInboundMessage,
    options: ChannelSessionBridgeHandleOptions = {},
  ): Promise<ChannelSessionTurnRecord> {
    const { route, createdSession, duplicate } = this._acceptRoute(message);
    if (duplicate) {
      return this._recordTurn({
        status: "duplicate",
        routeKey: route.routeKey,
        sessionId: route.sessionId,
        createdSession: false,
        inboundMessageId: message.messageId,
        receivedAt: message.receivedAt,
      });
    }
    return await this._runAcceptedInbound(message, route, createdSession, options);
  }

  private async _runAcceptedInbound(
    message: ChannelInboundMessage,
    route: ChannelSessionRoute,
    createdSession: boolean,
    options: ChannelSessionBridgeHandleOptions,
    acceptedRoute?: ChannelSessionRoute,
  ): Promise<ChannelSessionTurnRecord> {
    let reply: ChannelSessionReply;
    try {
      reply = await this._sessionRunner({
        sessionId: route.sessionId,
        route: cloneRoute(acceptedRoute ?? route),
        message: cloneInboundMessage(message),
        createdSession,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      route.lastError = messageText;
      return this._recordTurn({
        status: "runner_failed",
        routeKey: route.routeKey,
        sessionId: route.sessionId,
        createdSession,
        inboundMessageId: message.messageId,
        receivedAt: message.receivedAt,
        error: messageText,
      });
    }

    const text = reply.text?.trim();
    if (!text) {
      return this._recordTurn({
        status: "no_reply",
        routeKey: route.routeKey,
        sessionId: route.sessionId,
        createdSession,
        inboundMessageId: message.messageId,
        receivedAt: message.receivedAt,
      });
    }
    if (options.suppressReply === true) {
      return this._recordTurn({
        status: "no_reply",
        routeKey: route.routeKey,
        sessionId: route.sessionId,
        createdSession,
        inboundMessageId: message.messageId,
        receivedAt: message.receivedAt,
      });
    }

    const delivery = await this._registry.send(this._buildReplyRequest(message, route, text, reply.metadata));
    route.lastReplyDeliveryId = delivery.deliveryId;
    route.lastError = delivery.status === "failed" ? delivery.error : undefined;

    return this._recordTurn({
      status: delivery.status === "sent" ? "replied" : "delivery_failed",
      routeKey: route.routeKey,
      sessionId: route.sessionId,
      createdSession,
      inboundMessageId: message.messageId,
      receivedAt: message.receivedAt,
      replyDelivery: delivery,
      error: delivery.error,
    });
  }

  inspectRoute(routeKey: string): ChannelSessionRoute | null {
    const route = this._routes.get(routeKey);
    return route ? cloneRoute(route) : null;
  }

  status(limit = 10): ChannelSessionBridgeStatus {
    const recentTurns = this._turns.slice(-limit).reverse().map(cloneTurn);
    return {
      routeCount: this._routes.size,
      replyDeliveryCount: this._turns.filter((turn) => Boolean(turn.replyDelivery)).length,
      failedTurnCount: this._turns.filter((turn) => turn.status === "runner_failed" || turn.status === "delivery_failed").length,
      routes: Array.from(this._routes.values())
        .sort((left, right) => left.routeKey.localeCompare(right.routeKey))
        .map(cloneRoute),
      recentTurns,
    };
  }

  private _acceptRoute(message: ChannelInboundMessage): {
    route: ChannelSessionRoute;
    createdSession: boolean;
    duplicate: boolean;
  } {
    const existing = this._routes.get(message.routeKey);
    if (existing) {
      if (this._hasSeenInboundMessage(existing.routeKey, message.messageId)) {
        return { route: existing, createdSession: false, duplicate: true };
      }
      this._rememberInboundMessage(existing.routeKey, message.messageId);
      existing.updatedAt = this._now();
      existing.messageCount += 1;
      existing.lastInboundMessageId = message.messageId;
      existing.lastError = undefined;
      return { route: existing, createdSession: false, duplicate: false };
    }

    this._sessionSequence += 1;
    const now = this._now();
    const route: ChannelSessionRoute = {
      routeKey: message.routeKey,
      sessionId: this._sessionIdFactory(message.routeKey, this._sessionSequence),
      channel: message.channel,
      target: { ...message.target },
      createdAt: now,
      updatedAt: now,
      messageCount: 1,
      lastInboundMessageId: message.messageId,
    };
    this._routes.set(route.routeKey, route);
    this._rememberInboundMessage(route.routeKey, message.messageId);
    return { route, createdSession: true, duplicate: false };
  }

  private _hasSeenInboundMessage(routeKey: string, messageId: string): boolean {
    return (this._recentInboundMessageIdsByRoute.get(routeKey) ?? []).includes(messageId);
  }

  private _rememberInboundMessage(routeKey: string, messageId: string): void {
    const ids = this._recentInboundMessageIdsByRoute.get(routeKey) ?? [];
    ids.push(messageId);
    if (ids.length > MAX_RECENT_INBOUND_MESSAGE_IDS_PER_ROUTE) {
      ids.splice(0, ids.length - MAX_RECENT_INBOUND_MESSAGE_IDS_PER_ROUTE);
    }
    this._recentInboundMessageIdsByRoute.set(routeKey, ids);
  }

  private _buildReplyRequest(
    message: ChannelInboundMessage,
    route: ChannelSessionRoute,
    text: string,
    metadata?: Record<string, unknown>,
  ): ChannelSendRequest {
    return {
      channel: message.channel,
      target: { ...message.target },
      text,
      metadata: {
        ...(metadata ?? {}),
        sessionId: route.sessionId,
        routeKey: route.routeKey,
        inboundMessageId: message.messageId,
      },
    };
  }

  private _recordTurn(record: Omit<ChannelSessionTurnRecord, "turnId">): ChannelSessionTurnRecord {
    this._turnSequence += 1;
    const turn: ChannelSessionTurnRecord = {
      turnId: `chturn_${this._turnSequence.toString(36).padStart(6, "0")}`,
      ...record,
      replyDelivery: record.replyDelivery ? cloneDelivery(record.replyDelivery) : undefined,
    };
    this._turns.push(turn);
    return cloneTurn(turn);
  }
}

function defaultSessionIdFactory(_routeKey: string, sequence: number): string {
  return `chsess_${sequence.toString(36).padStart(6, "0")}`;
}

function cloneInboundMessage(message: ChannelInboundMessage): ChannelInboundMessage {
  return {
    ...message,
    target: { ...message.target },
    authorization: { ...message.authorization },
    metadata: message.metadata ? { ...message.metadata } : undefined,
  };
}

function cloneRoute(route: ChannelSessionRoute): ChannelSessionRoute {
  return {
    ...route,
    target: { ...route.target },
  };
}

function cloneTurn(turn: ChannelSessionTurnRecord): ChannelSessionTurnRecord {
  return {
    ...turn,
    replyDelivery: turn.replyDelivery ? cloneDelivery(turn.replyDelivery) : undefined,
  };
}

function cloneDelivery(delivery: ChannelDeliveryRecord): ChannelDeliveryRecord {
  return {
    ...delivery,
    target: { ...delivery.target },
    metadata: delivery.metadata ? { ...delivery.metadata } : undefined,
  };
}
