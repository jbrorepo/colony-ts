import {
  buildChannelRouteKey,
  type ChannelTarget,
  type ChannelTargetKind,
} from "./types";

export type ChannelContractAuthScheme =
  | "webhook_secret"
  | "pairing"
  | "allowlist"
  | "operator_configured_secret"
  | "platform_signature";

export interface ChannelContractCapabilities {
  outboundText: boolean;
  inboundWebhook: boolean;
  threading: boolean;
  mentions: boolean;
  reactions: boolean;
  attachments: boolean;
  deliveryRetries: boolean;
}

export interface ChannelContractRouteSemantics {
  targetKind: ChannelTargetKind;
  deliveryAddressField: "senderId" | "targetId" | "channelId";
  supportsThread: boolean;
  supportsTopic: boolean;
  mentionSyntax: "platform_user" | "platform_channel" | "none";
}

export interface ChannelContractRetryPolicy {
  supported: boolean;
  maxAttempts: number;
  backoff: "none" | "linear" | "exponential";
  idempotencyKey: "routeKey" | "routeKey+messageId";
}

export interface ChannelContractAttachmentPolicy {
  supported: boolean;
  maxCount: number;
  maxBytes: number;
  allowedKinds: string[];
}

export interface ChannelContractAuthPolicy {
  inbound: ChannelContractAuthScheme[];
  outbound: ChannelContractAuthScheme[];
  pairingRequiredForDm: boolean;
}

export interface ChannelContractRedactionPolicy {
  redactMetadataKeys: string[];
  forbiddenConfigKeys: string[];
}

export interface ChannelAdapterContract {
  channelId: string;
  displayName: string;
  contractOnly: true;
  adapterImplemented: false;
  externalNetworkEnabled: false;
  capabilities: ChannelContractCapabilities;
  routeSemantics: ChannelContractRouteSemantics[];
  retryPolicy: ChannelContractRetryPolicy;
  attachmentPolicy: ChannelContractAttachmentPolicy;
  auth: ChannelContractAuthPolicy;
  redaction: ChannelContractRedactionPolicy;
  notes: string[];
}

export interface ChannelAdapterContractStatus {
  channelId: string;
  displayName: string;
  contractOnly: true;
  adapterImplemented: false;
  externalNetworkEnabled: false;
  capabilities: ChannelContractCapabilities;
  routeSemantics: ChannelContractRouteSemantics[];
  retryPolicy: ChannelContractRetryPolicy;
  attachmentPolicy: ChannelContractAttachmentPolicy;
  auth: ChannelContractAuthPolicy;
  redaction: ChannelContractRedactionPolicy;
  notes: string[];
}

export interface ChannelAdapterContractNormalizationResult {
  accepted: boolean;
  contract?: ChannelAdapterContract;
  error?: string;
}

export interface ChannelContractRoutePreviewRequest {
  channelId: string;
  agentId: string;
  targetKind: ChannelTargetKind;
  targetId: string;
  accountId?: string;
  threadId?: string;
  topicId?: string;
}

export interface ChannelContractRoutePreview {
  accepted: boolean;
  routeKey?: string;
  error?: string;
}

const SECRET_KEY_PATTERN = /(token|secret|password|apikey|api_key|authorization|credential)/i;
const SECRET_VALUE_PATTERN = /(xoxb-|secret-token|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9])/i;

export const CHANNEL_ADAPTER_CONTRACT_FIXTURES: ChannelAdapterContract[] = [
  {
    channelId: "discord",
    displayName: "Discord",
    contractOnly: true,
    adapterImplemented: false,
    externalNetworkEnabled: false,
    capabilities: {
      outboundText: true,
      inboundWebhook: true,
      threading: true,
      mentions: true,
      reactions: true,
      attachments: true,
      deliveryRetries: true,
    },
    routeSemantics: [
      {
        targetKind: "direct",
        deliveryAddressField: "senderId",
        supportsThread: false,
        supportsTopic: false,
        mentionSyntax: "platform_user",
      },
      {
        targetKind: "channel",
        deliveryAddressField: "channelId",
        supportsThread: true,
        supportsTopic: false,
        mentionSyntax: "platform_channel",
      },
      {
        targetKind: "group",
        deliveryAddressField: "targetId",
        supportsThread: true,
        supportsTopic: false,
        mentionSyntax: "platform_user",
      },
    ],
    retryPolicy: {
      supported: true,
      maxAttempts: 3,
      backoff: "exponential",
      idempotencyKey: "routeKey+messageId",
    },
    attachmentPolicy: {
      supported: true,
      maxCount: 10,
      maxBytes: 8_000_000,
      allowedKinds: ["image", "text", "document"],
    },
    auth: {
      inbound: ["webhook_secret", "pairing", "allowlist"],
      outbound: ["operator_configured_secret"],
      pairingRequiredForDm: true,
    },
    redaction: {
      redactMetadataKeys: ["authorization", "signature", "webhook_secret", "bot_credential"],
      forbiddenConfigKeys: ["token", "secret", "password", "authorization"],
    },
    notes: [
      "Contract fixture only; no Discord API client is shipped.",
      "Thread routes use ChannelTarget.threadId when supplied.",
    ],
  },
  {
    channelId: "slack",
    displayName: "Slack",
    contractOnly: true,
    adapterImplemented: false,
    externalNetworkEnabled: false,
    capabilities: {
      outboundText: true,
      inboundWebhook: true,
      threading: true,
      mentions: true,
      reactions: true,
      attachments: true,
      deliveryRetries: true,
    },
    routeSemantics: [
      {
        targetKind: "direct",
        deliveryAddressField: "senderId",
        supportsThread: false,
        supportsTopic: false,
        mentionSyntax: "platform_user",
      },
      {
        targetKind: "channel",
        deliveryAddressField: "channelId",
        supportsThread: true,
        supportsTopic: false,
        mentionSyntax: "platform_channel",
      },
    ],
    retryPolicy: {
      supported: true,
      maxAttempts: 3,
      backoff: "exponential",
      idempotencyKey: "routeKey+messageId",
    },
    attachmentPolicy: {
      supported: true,
      maxCount: 10,
      maxBytes: 10_000_000,
      allowedKinds: ["image", "text", "document"],
    },
    auth: {
      inbound: ["platform_signature", "pairing", "allowlist"],
      outbound: ["operator_configured_secret"],
      pairingRequiredForDm: true,
    },
    redaction: {
      redactMetadataKeys: ["authorization", "signature", "webhook_secret", "bot_credential"],
      forbiddenConfigKeys: ["token", "secret", "password", "authorization"],
    },
    notes: [
      "Contract fixture only; no Slack API client is shipped.",
      "Channel routes may carry ChannelTarget.threadId for thread replies.",
    ],
  },
  {
    channelId: "telegram",
    displayName: "Telegram",
    contractOnly: true,
    adapterImplemented: false,
    externalNetworkEnabled: false,
    capabilities: {
      outboundText: true,
      inboundWebhook: true,
      threading: false,
      mentions: true,
      reactions: true,
      attachments: true,
      deliveryRetries: true,
    },
    routeSemantics: [
      {
        targetKind: "direct",
        deliveryAddressField: "senderId",
        supportsThread: false,
        supportsTopic: false,
        mentionSyntax: "platform_user",
      },
      {
        targetKind: "group",
        deliveryAddressField: "targetId",
        supportsThread: false,
        supportsTopic: true,
        mentionSyntax: "platform_user",
      },
      {
        targetKind: "channel",
        deliveryAddressField: "channelId",
        supportsThread: false,
        supportsTopic: true,
        mentionSyntax: "platform_channel",
      },
    ],
    retryPolicy: {
      supported: true,
      maxAttempts: 3,
      backoff: "linear",
      idempotencyKey: "routeKey+messageId",
    },
    attachmentPolicy: {
      supported: true,
      maxCount: 10,
      maxBytes: 20_000_000,
      allowedKinds: ["image", "text", "document", "audio"],
    },
    auth: {
      inbound: ["webhook_secret", "pairing", "allowlist"],
      outbound: ["operator_configured_secret"],
      pairingRequiredForDm: true,
    },
    redaction: {
      redactMetadataKeys: ["authorization", "signature", "webhook_secret", "bot_credential"],
      forbiddenConfigKeys: ["token", "secret", "password", "authorization"],
    },
    notes: [
      "Contract fixture only; no Telegram Bot API client is shipped.",
      "Topic routes use ChannelTarget.topicId when supplied.",
    ],
  },
];

export function listChannelAdapterContractStatus(
  contracts: unknown[] = CHANNEL_ADAPTER_CONTRACT_FIXTURES,
): ChannelAdapterContractStatus[] {
  const normalized: ChannelAdapterContractStatus[] = [];
  for (const candidate of contracts) {
    const result = normalizeChannelAdapterContract(candidate);
    if (result.accepted && result.contract) normalized.push(result.contract);
  }
  return normalized.sort((left, right) => left.channelId.localeCompare(right.channelId));
}

export function normalizeChannelAdapterContract(
  candidate: unknown,
): ChannelAdapterContractNormalizationResult {
  try {
    const contract = readContract(candidate);
    return { accepted: true, contract };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid channel contract";
    return {
      accepted: false,
      error: safeContractError(message),
    };
  }
}

export function buildChannelContractRouteKeyPreview(
  request: ChannelContractRoutePreviewRequest,
  contracts: unknown[] = CHANNEL_ADAPTER_CONTRACT_FIXTURES,
): ChannelContractRoutePreview {
  const contract = listChannelAdapterContractStatus(contracts)
    .find((entry) => entry.channelId === normalizeChannelId(request.channelId));
  if (!contract) {
    return { accepted: false, error: "Channel contract is not registered." };
  }

  const route = contract.routeSemantics.find((entry) => entry.targetKind === request.targetKind);
  if (!route) {
    return { accepted: false, error: `Channel contract does not support ${request.targetKind} routes.` };
  }
  if (request.threadId && !route.supportsThread) {
    return { accepted: false, error: "Channel contract does not support thread routes for this target kind." };
  }
  if (request.topicId && !route.supportsTopic) {
    return { accepted: false, error: "Channel contract does not support topic routes for this target kind." };
  }

  const target: ChannelTarget = {
    agentId: request.agentId,
    channel: contract.channelId,
    targetKind: request.targetKind,
    targetId: request.targetId,
    ...(request.accountId ? { accountId: request.accountId } : {}),
    ...(request.threadId ? { threadId: request.threadId } : {}),
    ...(request.topicId ? { topicId: request.topicId } : {}),
  };
  return {
    accepted: true,
    routeKey: buildChannelRouteKey(target),
  };
}

function readContract(candidate: unknown): ChannelAdapterContract {
  if (!isRecord(candidate)) throw new Error("invalid channel contract");
  if (hasSecretBearingField(candidate)) throw new Error("channel contract contains redacted or forbidden secret fields");
  const contractOnly = candidate.contractOnly;
  const adapterImplemented = candidate.adapterImplemented;
  const externalNetworkEnabled = candidate.externalNetworkEnabled;
  if (contractOnly !== true || adapterImplemented !== false || externalNetworkEnabled !== false) {
    throw new Error("channel contracts must stay contract-only with no implemented adapter or network delivery");
  }

  const capabilities = readCapabilities(candidate.capabilities);
  const routeSemantics = readRouteSemantics(candidate.routeSemantics);
  const retryPolicy = readRetryPolicy(candidate.retryPolicy, capabilities);
  const attachmentPolicy = readAttachmentPolicy(candidate.attachmentPolicy, capabilities);
  const auth = readAuthPolicy(candidate.auth);
  const redaction = readRedactionPolicy(candidate.redaction);

  return {
    channelId: readChannelId(candidate.channelId),
    displayName: readText(candidate.displayName, 80),
    contractOnly: true,
    adapterImplemented: false,
    externalNetworkEnabled: false,
    capabilities,
    routeSemantics,
    retryPolicy,
    attachmentPolicy,
    auth,
    redaction,
    notes: readTextArray(candidate.notes, 1, 8, 240),
  };
}

function readCapabilities(value: unknown): ChannelContractCapabilities {
  if (!isRecord(value)) throw new Error("invalid channel capabilities");
  return {
    outboundText: readBoolean(value.outboundText),
    inboundWebhook: readBoolean(value.inboundWebhook),
    threading: readBoolean(value.threading),
    mentions: readBoolean(value.mentions),
    reactions: readBoolean(value.reactions),
    attachments: readBoolean(value.attachments),
    deliveryRetries: readBoolean(value.deliveryRetries),
  };
}

function readRouteSemantics(value: unknown): ChannelContractRouteSemantics[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) {
    throw new Error("channel contracts require route semantics");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error("invalid route semantics");
    const targetKind = readTargetKind(entry.targetKind);
    if (seen.has(targetKind)) throw new Error("duplicate route semantics");
    seen.add(targetKind);
    return {
      targetKind,
      deliveryAddressField: readEnum(entry.deliveryAddressField, ["senderId", "targetId", "channelId"]),
      supportsThread: readBoolean(entry.supportsThread),
      supportsTopic: readBoolean(entry.supportsTopic),
      mentionSyntax: readEnum(entry.mentionSyntax, ["platform_user", "platform_channel", "none"]),
    };
  });
}

function readRetryPolicy(
  value: unknown,
  capabilities: ChannelContractCapabilities,
): ChannelContractRetryPolicy {
  if (!isRecord(value)) throw new Error("invalid retry policy");
  const supported = readBoolean(value.supported);
  if (supported !== capabilities.deliveryRetries) {
    throw new Error("retry policy must match delivery retry capability");
  }
  return {
    supported,
    maxAttempts: supported ? readBoundedInteger(value.maxAttempts, 1, 10) : 0,
    backoff: readEnum(value.backoff, ["none", "linear", "exponential"]),
    idempotencyKey: readEnum(value.idempotencyKey, ["routeKey", "routeKey+messageId"]),
  };
}

function readAttachmentPolicy(
  value: unknown,
  capabilities: ChannelContractCapabilities,
): ChannelContractAttachmentPolicy {
  if (!isRecord(value)) throw new Error("invalid attachment policy");
  const supported = readBoolean(value.supported);
  if (supported !== capabilities.attachments) {
    throw new Error("attachment policy must match attachment capability");
  }
  return {
    supported,
    maxCount: supported ? readBoundedInteger(value.maxCount, 1, 20) : 0,
    maxBytes: supported ? readBoundedInteger(value.maxBytes, 1, 50_000_000) : 0,
    allowedKinds: readTextArray(value.allowedKinds, supported ? 1 : 0, 12, 40),
  };
}

function readAuthPolicy(value: unknown): ChannelContractAuthPolicy {
  if (!isRecord(value)) throw new Error("invalid auth policy");
  const inbound = readAuthSchemes(value.inbound, 1);
  const outbound = readAuthSchemes(value.outbound, 1);
  return {
    inbound,
    outbound,
    pairingRequiredForDm: readBoolean(value.pairingRequiredForDm),
  };
}

function readRedactionPolicy(value: unknown): ChannelContractRedactionPolicy {
  if (!isRecord(value)) throw new Error("invalid redaction policy");
  return {
    redactMetadataKeys: readTextArray(value.redactMetadataKeys, 1, 20, 80),
    forbiddenConfigKeys: readTextArray(value.forbiddenConfigKeys, 1, 20, 80),
  };
}

function readAuthSchemes(value: unknown, min: number): ChannelContractAuthScheme[] {
  return readTextArray(value, min, 8, 80)
    .map((entry) => readEnum(entry, [
      "webhook_secret",
      "pairing",
      "allowlist",
      "operator_configured_secret",
      "platform_signature",
    ]));
}

function readTextArray(value: unknown, min: number, max: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error("invalid text array");
  }
  return value.map((entry) => readText(entry, maxLength));
}

function readTargetKind(value: unknown): ChannelTargetKind {
  return readEnum(value, ["direct", "group", "channel"]);
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error("invalid enum value");
}

function readChannelId(value: unknown): string {
  if (typeof value === "string" && /^[a-z0-9_-]{2,40}$/.test(value)) return normalizeChannelId(value);
  throw new Error("invalid channel id");
}

function readText(value: unknown, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength || /[\0]/.test(value)) {
    throw new Error("invalid text");
  }
  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  throw new Error("invalid boolean");
}

function readBoundedInteger(value: unknown, min: number, max: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) return value;
  throw new Error("invalid integer");
}

function hasSecretBearingField(value: unknown, depth = 0): boolean {
  if (depth > 10) throw new Error("channel contract is too deep");
  if (typeof value === "string") return SECRET_VALUE_PATTERN.test(value);
  if (value === null || typeof value === "boolean") return false;
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some((entry) => hasSecretBearingField(entry, depth + 1));
  if (!isRecord(value)) return true;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "redactedConfig" && isRecord(entry)) return true;
    if (SECRET_KEY_PATTERN.test(key) && !isContractPolicyField(key)) return true;
    if (hasSecretBearingField(entry, depth + 1)) return true;
  }
  return false;
}

function isContractPolicyField(key: string): boolean {
  return [
    "webhook_secret",
    "operator_configured_secret",
    "redactMetadataKeys",
    "forbiddenConfigKeys",
  ].includes(key);
}

function safeContractError(message: string): string {
  return message.replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function normalizeChannelId(channelId: string): string {
  return channelId.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
