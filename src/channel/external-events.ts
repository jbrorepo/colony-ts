import type { ChannelTargetKind } from "./types";

export type ExternalChannelVendorEventChannel = "slack" | "discord" | "telegram";

export interface ExternalChannelVendorEventNormalizationOptions {
  channelId: string;
  body: unknown;
  receivedAt?: string;
}

export interface ExternalChannelVendorEventBody {
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

export interface ExternalChannelVendorEventNormalizationResult {
  accepted: boolean;
  body?: ExternalChannelVendorEventBody;
  errorCode?: "unsupported_channel" | "unsupported_vendor_event" | "malformed_vendor_event";
  error?: string;
  redactedDiagnostics?: Record<string, unknown>;
}

const SUPPORTED_CHANNELS = ["discord", "slack", "telegram"] as const;
const DISCORD_MESSAGE_CREATE_TYPE = 0;
const DISCORD_APPLICATION_COMMAND_TYPE = 2;
const DISCORD_CHAT_INPUT_COMMAND_TYPE = 1;
const MAX_DISCORD_COMMAND_TEXT_LENGTH = 160;
const MAX_SLACK_MEDIA_ATTACHMENTS = 5;
const MAX_SLACK_MEDIA_FIELD_LENGTH = 160;
const MAX_SLACK_MEDIA_TEXT_LENGTH = 160;
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key)/i;
const SECRET_VALUE_PATTERN = /(xox[abprs]-[a-z0-9_-]+|xapp-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SLACK_URL_PATTERN = /https?:\/\/[^\s"'<>]*(?:slack\.com|files\.slack\.com)[^\s"'<>]*/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;

export function normalizeExternalChannelVendorEvent(
  options: ExternalChannelVendorEventNormalizationOptions,
): ExternalChannelVendorEventNormalizationResult {
  const channelId = String(options.channelId).trim().toLowerCase();
  if (!SUPPORTED_CHANNELS.includes(channelId as ExternalChannelVendorEventChannel)) {
    return reject("unsupported_channel", "Unsupported external channel event source.", options.body);
  }
  if (!isRecord(options.body)) {
    return reject("malformed_vendor_event", "Vendor event body must be an object.", options.body);
  }

  if (channelId === "slack") return normalizeSlackEvent(options.body, options.receivedAt);
  if (channelId === "discord") return normalizeDiscordEvent(options.body, options.receivedAt);
  return normalizeTelegramEvent(options.body, options.receivedAt);
}

function normalizeSlackEvent(
  body: Record<string, unknown>,
  receivedAt?: string,
): ExternalChannelVendorEventNormalizationResult {
  if (readString(body.type) !== "event_callback") {
    return reject("unsupported_vendor_event", "Slack event must be an event_callback.", body);
  }
  const event = body.event;
  if (!isRecord(event)) {
    return reject("unsupported_vendor_event", "Slack event must contain an event object.", body);
  }
  const eventType = readString(event.type);
  if (eventType !== "message" && eventType !== "app_mention") {
    return reject("unsupported_vendor_event", "Slack event must be a message or app_mention event.", body);
  }
  const eventSubtype = readString(event.subtype);
  if ((eventType === "message" || eventType === "app_mention") && eventSubtype && eventSubtype !== "file_share") {
    return reject("unsupported_vendor_event", "Slack bot and system message subtypes are ignored.", body);
  }

  const senderId = readString(event.user);
  const media = normalizeSlackMediaAttachments(event.files);
  const text = readString(event.text) ?? (eventSubtype === "file_share" ? renderSlackFileShareText(media.attachments) : undefined);
  const targetId = readString(event.channel);
  const ts = readString(event.ts);
  if (!senderId || !text || !targetId || !ts) {
    return reject("malformed_vendor_event", "Slack message or app_mention event requires user, text, channel, and ts.", body);
  }

  const threadTs = readString(event.thread_ts);
  const messageId = readString(event.client_msg_id) ?? ts;
  const metadata = cleanMetadata({
    vendor: "slack",
    eventType,
    eventSubtype,
    appId: readString(body.api_app_id),
    teamId: readString(body.team_id),
    receivedAt,
  });
  if (media.count > 0) {
    metadata.mediaAttachmentCount = media.count;
    metadata.mediaAttachmentTruncated = media.truncated;
    if (media.attachments.length > 0) {
      metadata.mediaAttachments = media.attachments;
    }
  }

  return {
    accepted: true,
    body: {
      messageId,
      senderId,
      text,
      targetKind: "channel",
      targetId,
      ...(threadTs && threadTs !== ts ? { threadId: threadTs } : {}),
      metadata,
    },
  };
}

function normalizeDiscordEvent(
  body: Record<string, unknown>,
  receivedAt?: string,
): ExternalChannelVendorEventNormalizationResult {
  if (body.type === DISCORD_MESSAGE_CREATE_TYPE) {
    return normalizeDiscordMessageCreate(body, receivedAt);
  }
  if (body.type === DISCORD_APPLICATION_COMMAND_TYPE) {
    return normalizeDiscordApplicationCommand(body, receivedAt);
  }
  if (typeof body.type !== "number") {
    return reject("malformed_vendor_event", "Discord event requires numeric type.", body);
  }
  return reject("unsupported_vendor_event", "Discord event type is not supported.", body);
}

function normalizeDiscordMessageCreate(
  body: Record<string, unknown>,
  receivedAt?: string,
): ExternalChannelVendorEventNormalizationResult {
  const author = body.author;
  const messageId = readString(body.id);
  const targetId = readString(body.channel_id);
  const text = readString(body.content);
  const senderId = isRecord(author) ? readString(author.id) : undefined;
  if (isRecord(author) && author.bot === true) {
    return reject("unsupported_vendor_event", "Discord bot-authored messages are ignored.", body);
  }
  if (readString(body.webhook_id)) {
    return reject("unsupported_vendor_event", "Discord webhook-origin messages are ignored.", body);
  }
  if (!messageId || !targetId || !text || !senderId) {
    return reject("malformed_vendor_event", "Discord message event requires id, channel_id, content, and author.id.", body);
  }

  const accountId = readString(body.guild_id);
  const threadId = readString(body.thread_id);
  return {
    accepted: true,
    body: {
      messageId,
      senderId,
      ...(isRecord(author) && readString(author.username) ? { senderName: readString(author.username) } : {}),
      text,
      targetKind: "channel",
      targetId,
      ...(accountId ? { accountId } : {}),
      ...(threadId ? { threadId } : {}),
      metadata: cleanMetadata({
        vendor: "discord",
        eventType: "message_create",
        guildId: accountId,
        receivedAt,
      }),
    },
  };
}

function normalizeDiscordApplicationCommand(
  body: Record<string, unknown>,
  receivedAt?: string,
): ExternalChannelVendorEventNormalizationResult {
  const data = body.data;
  const user = readDiscordInteractionUser(body);
  const commandType = isRecord(data) ? data.type ?? DISCORD_CHAT_INPUT_COMMAND_TYPE : undefined;
  const messageId = readString(body.id);
  const targetId = readString(body.channel_id);
  const senderId = user ? readString(user.id) : undefined;
  const commandName = isRecord(data) ? readString(data.name) : undefined;

  if (!messageId || !targetId || !senderId || !isRecord(data) || !commandName) {
    return reject("malformed_vendor_event", "Discord application command requires id, channel_id, sender id, and data.name.", body);
  }
  if (commandType !== DISCORD_CHAT_INPUT_COMMAND_TYPE) {
    return reject("unsupported_vendor_event", "Discord application command only supports chat-input command type 1.", body);
  }

  const guildId = readString(body.guild_id);
  const senderName = user ? readDiscordUserDisplayName(user) : undefined;
  return {
    accepted: true,
    body: {
      messageId,
      senderId,
      ...(senderName ? { senderName } : {}),
      text: renderDiscordCommandText(commandName, isRecord(data) ? data.options : undefined),
      targetKind: "channel",
      targetId,
      ...(guildId ? { accountId: guildId } : {}),
      metadata: cleanMetadata({
        vendor: "discord",
        eventType: "application_command",
        interactionType: "application_command",
        applicationId: readString(body.application_id),
        commandId: readString(data.id),
        commandName,
        guildId,
        receivedAt,
      }),
    },
  };
}

function normalizeTelegramEvent(
  body: Record<string, unknown>,
  receivedAt?: string,
): ExternalChannelVendorEventNormalizationResult {
  const message = body.message;
  if (!isRecord(message)) {
    return reject("unsupported_vendor_event", "Telegram update must contain a message.", body);
  }
  const from = message.from;
  const chat = message.chat;
  const messageId = readScalarString(message.message_id);
  const text = readString(message.text);
  const senderId = isRecord(from) ? readScalarString(from.id) : undefined;
  const targetId = isRecord(chat) ? readScalarString(chat.id) : undefined;
  const chatType = isRecord(chat) ? readString(chat.type) : undefined;
  const targetKind = telegramTargetKind(chatType);
  if (!messageId || !text || !senderId || !targetId || !isRecord(chat) || !targetKind) {
    return reject("malformed_vendor_event", "Telegram message update requires message_id, text, from.id, chat.id, and a supported chat.type.", body);
  }

  return {
    accepted: true,
    body: {
      messageId,
      senderId,
      ...(isRecord(from) && readString(from.username) ? { senderName: readString(from.username) } : {}),
      text,
      targetKind,
      targetId,
      ...(readScalarString(message.message_thread_id) ? { topicId: readScalarString(message.message_thread_id) } : {}),
      metadata: cleanMetadata({
        vendor: "telegram",
        eventType: "message",
        updateId: readScalarString(body.update_id),
        chatType,
        receivedAt,
      }),
    },
  };
}

function reject(
  errorCode: NonNullable<ExternalChannelVendorEventNormalizationResult["errorCode"]>,
  error: string,
  body: unknown,
): ExternalChannelVendorEventNormalizationResult {
  return {
    accepted: false,
    errorCode,
    error,
    redactedDiagnostics: summarizeForDiagnostics(body),
  };
}

function telegramTargetKind(chatType?: string): ChannelTargetKind | undefined {
  if (chatType === "private") return "direct";
  if (chatType === "group" || chatType === "supergroup") return "group";
  if (chatType === "channel") return "channel";
  return undefined;
}

function cleanMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      out[key] = sanitizeText(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

function normalizeSlackMediaAttachments(value: unknown): {
  attachments: Record<string, unknown>[];
  count: number;
  truncated: boolean;
} {
  if (!Array.isArray(value)) {
    return { attachments: [], count: 0, truncated: false };
  }
  const attachments: Record<string, unknown>[] = [];
  for (const item of value.slice(0, MAX_SLACK_MEDIA_ATTACHMENTS)) {
    if (!isRecord(item)) continue;
    const attachment = normalizeSlackMediaAttachment(item);
    if (attachment) attachments.push(attachment);
  }
  return {
    attachments,
    count: value.length,
    truncated: value.length > MAX_SLACK_MEDIA_ATTACHMENTS,
  };
}

function normalizeSlackMediaAttachment(file: Record<string, unknown>): Record<string, unknown> | null {
  const attachment = cleanSlackMediaMetadata({
    source: "slack",
    id: readString(file.id),
    name: readString(file.name),
    title: readString(file.title),
    mimeType: readString(file.mimetype),
    fileType: readString(file.filetype),
    prettyType: readString(file.pretty_type),
    mode: readString(file.mode),
    isPublic: typeof file.is_public === "boolean" ? file.is_public : undefined,
  });
  const sizeBytes = readSafeNonNegativeInteger(file.size);
  if (sizeBytes !== undefined) {
    attachment.sizeBytes = sizeBytes;
  }
  return Object.keys(attachment).length > 1 ? attachment : null;
}

function cleanSlackMediaMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      out[key] = truncateText(sanitizeText(value), MAX_SLACK_MEDIA_FIELD_LENGTH);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

function renderSlackFileShareText(attachments: Record<string, unknown>[]): string | undefined {
  const firstName = attachments
    .map((attachment) => typeof attachment.name === "string" ? attachment.name : undefined)
    .find((name): name is string => typeof name === "string" && name.length > 0);
  const label = firstName ?? (attachments.length > 0 ? `${attachments.length} file${attachments.length === 1 ? "" : "s"}` : undefined);
  return label ? truncateText(`Slack file shared: ${label}`, MAX_SLACK_MEDIA_TEXT_LENGTH) : undefined;
}

function summarizeForDiagnostics(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return { type: typeof value };
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof nested === "string") {
      out[key] = "[string]";
    } else if (typeof nested === "number" || typeof nested === "boolean" || nested === null) {
      out[key] = nested;
    } else if (Array.isArray(nested)) {
      out[key] = `[array:${nested.length}]`;
    } else if (isRecord(nested)) {
      out[key] = `{keys:${Object.keys(nested).filter((nestedKey) => !SECRET_KEY_PATTERN.test(nestedKey)).join(",")}}`;
    }
  }
  return out;
}

function sanitizeText(value: string): string {
  return value
    .replace(SLACK_URL_PATTERN, "[REDACTED_URL]")
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readScalarString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readSafeNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function readDiscordInteractionUser(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const member = body.member;
  if (isRecord(member) && isRecord(member.user)) return member.user;
  return isRecord(body.user) ? body.user : undefined;
}

function readDiscordUserDisplayName(user: Record<string, unknown>): string | undefined {
  return readString(user.global_name) ?? readString(user.username);
}

function renderDiscordCommandText(commandName: string, options: unknown): string {
  const parts = [`/${commandName}`];
  parts.push(...renderDiscordOptionParts(options, 0));
  return truncateText(parts.join(" "), MAX_DISCORD_COMMAND_TEXT_LENGTH);
}

function renderDiscordOptionParts(options: unknown, depth: number): string[] {
  if (!Array.isArray(options) || depth > 3) return [];
  const parts: string[] = [];
  for (const option of options) {
    if (!isRecord(option)) continue;
    const name = readString(option.name);
    if (!name) continue;
    if ("value" in option) {
      parts.push(`${name}=${formatDiscordOptionValue(option.value)}`);
      continue;
    }
    const nested = renderDiscordOptionParts(option.options, depth + 1);
    if (nested.length > 0) {
      parts.push(name, ...nested);
    }
  }
  return parts;
}

function formatDiscordOptionValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(truncateText(value, 96));
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return JSON.stringify("[unsupported]");
}

function truncateText(value: string, maxLength: number): string {
  const suffix = "...[TRUNCATED]";
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
