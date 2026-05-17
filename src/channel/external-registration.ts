import {
  DiscordChannelAdapter,
  SlackChannelAdapter,
  TelegramChannelAdapter,
} from "./external-adapters";
import type { ChannelRegistry } from "./registry";

export type ExternalChannelAdapterRegistrationChannel = "slack" | "discord" | "telegram";

export interface ExternalChannelAdapterApproval {
  approvedBy: string;
  signature: string;
  approvedAt?: string;
}

export interface ExternalChannelAdapterRegistrationCandidate {
  channelId: ExternalChannelAdapterRegistrationChannel;
  botToken: string;
  enabled?: boolean;
  workspaceId?: string;
  apiBaseUrl?: string;
  approval?: ExternalChannelAdapterApproval;
}

export interface ExternalChannelAdapterRegistrationPlan {
  channelId: string;
  displayName: string;
  accepted: boolean;
  approvalRequired: boolean;
  requiredSignature?: string;
  reason?: string;
  redactedConfig: Record<string, unknown>;
}

export interface ExternalChannelAdapterRegistrationResult {
  registeredCount: number;
  skipped: ExternalChannelAdapterRegistrationPlan[];
  registered: ExternalChannelAdapterRegistrationPlan[];
}

export interface ExternalChannelAdapterRegistrationOptions {
  fetchImpl?: typeof fetch;
}

const SUPPORTED_CHANNELS = ["discord", "slack", "telegram"] as const;
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key)/i;
const SECRET_VALUE_PATTERN = /(xoxb-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;

export async function createExternalChannelAdapterApprovalSignature(
  candidate: ExternalChannelAdapterRegistrationCandidate,
): Promise<string> {
  const normalized = normalizeCandidate(candidate);
  if (!normalized.accepted || !normalized.candidate) {
    return `channel-adapter:${normalizeChannelId(candidate.channelId)}:invalid`;
  }
  const digest = await sha256Hex(canonicalApprovalPayload(normalized.candidate));
  return `channel-adapter:${normalized.candidate.channelId}:${digest}`;
}

export async function planExternalChannelAdapterRegistrations(
  candidates: ExternalChannelAdapterRegistrationCandidate[],
): Promise<ExternalChannelAdapterRegistrationPlan[]> {
  const plans: ExternalChannelAdapterRegistrationPlan[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized.accepted || !normalized.candidate) {
      plans.push({
        channelId: normalizeChannelId(candidate.channelId),
        displayName: displayNameForChannel(candidate.channelId),
        accepted: false,
        approvalRequired: true,
        reason: normalized.reason,
        redactedConfig: redactCandidateConfig(candidate),
      });
      continue;
    }

    const requiredSignature = await createExternalChannelAdapterApprovalSignature(normalized.candidate);
    const approvalAccepted =
      typeof normalized.candidate.approval?.signature === "string" &&
      normalized.candidate.approval.signature === requiredSignature &&
      Boolean(normalized.candidate.approval.approvedBy.trim());
    plans.push({
      channelId: normalized.candidate.channelId,
      displayName: displayNameForChannel(normalized.candidate.channelId),
      accepted: approvalAccepted,
      approvalRequired: true,
      requiredSignature,
      ...(approvalAccepted ? {} : { reason: "Exact operator approval signature is required before adapter registration." }),
      redactedConfig: redactCandidateConfig(normalized.candidate),
    });
  }
  return plans;
}

export async function registerApprovedExternalChannelAdapters(
  registry: ChannelRegistry,
  candidates: ExternalChannelAdapterRegistrationCandidate[],
  options: ExternalChannelAdapterRegistrationOptions = {},
): Promise<ExternalChannelAdapterRegistrationResult> {
  const plans = await planExternalChannelAdapterRegistrations(candidates);
  const registered: ExternalChannelAdapterRegistrationPlan[] = [];
  const skipped: ExternalChannelAdapterRegistrationPlan[] = [];

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const candidate = candidates[index];
    if (!plan?.accepted || !candidate) {
      if (plan) skipped.push(plan);
      continue;
    }
    if (registry.get(plan.channelId)) {
      skipped.push({
        ...plan,
        accepted: false,
        reason: "Channel adapter is already registered.",
      });
      continue;
    }

    registry.register(createAdapter(candidate, options));
    registered.push(plan);
  }

  return {
    registeredCount: registered.length,
    registered,
    skipped,
  };
}

function createAdapter(
  candidate: ExternalChannelAdapterRegistrationCandidate,
  options: ExternalChannelAdapterRegistrationOptions,
): SlackChannelAdapter | DiscordChannelAdapter | TelegramChannelAdapter {
  const channelId = normalizeChannelId(candidate.channelId);
  if (channelId === "slack") {
    return new SlackChannelAdapter({
      botToken: candidate.botToken,
      enabled: candidate.enabled,
      workspaceId: candidate.workspaceId,
      fetchImpl: options.fetchImpl,
    });
  }
  if (channelId === "discord") {
    return new DiscordChannelAdapter({
      botToken: candidate.botToken,
      enabled: candidate.enabled,
      apiBaseUrl: candidate.apiBaseUrl,
      fetchImpl: options.fetchImpl,
    });
  }
  return new TelegramChannelAdapter({
    botToken: candidate.botToken,
    enabled: candidate.enabled,
    apiBaseUrl: candidate.apiBaseUrl,
    fetchImpl: options.fetchImpl,
  });
}

function normalizeCandidate(candidate: ExternalChannelAdapterRegistrationCandidate): {
  accepted: boolean;
  candidate?: ExternalChannelAdapterRegistrationCandidate;
  reason?: string;
} {
  const channelId = normalizeChannelId(candidate.channelId);
  if (!SUPPORTED_CHANNELS.includes(channelId as ExternalChannelAdapterRegistrationChannel)) {
    return { accepted: false, reason: "Unsupported external channel adapter." };
  }
  if (!candidate.botToken.trim()) {
    return { accepted: false, reason: "External channel adapter credential is missing." };
  }
  if (candidate.enabled !== true) {
    return { accepted: false, reason: "External channel adapter must be explicitly enabled before approval." };
  }
  const safeApiBaseUrl = candidate.apiBaseUrl ? validateApiBaseUrl(channelId, candidate.apiBaseUrl) : null;
  if (safeApiBaseUrl?.reason) {
    return { accepted: false, reason: safeApiBaseUrl.reason };
  }
  return {
    accepted: true,
    candidate: {
      ...candidate,
      channelId: channelId as ExternalChannelAdapterRegistrationChannel,
      botToken: candidate.botToken,
      ...(safeApiBaseUrl?.value ? { apiBaseUrl: safeApiBaseUrl.value } : {}),
    },
  };
}

function validateApiBaseUrl(channelId: string, value: string): { value?: string; reason?: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { reason: "External channel API base URL is invalid." };
  }
  if (url.protocol !== "https:") {
    return { reason: "External channel API base URL must use HTTPS." };
  }
  if (url.username || url.password || url.search) {
    return { reason: "External channel API base URL must not contain credentials or query parameters." };
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    return { reason: "External channel API base URL must not target local or private hosts." };
  }
  if (channelId === "discord" && hostname !== "discord.com") {
    return { reason: "Discord API base URL must target discord.com." };
  }
  if (channelId === "telegram" && hostname !== "api.telegram.org") {
    return { reason: "Telegram API base URL must target api.telegram.org." };
  }
  return { value: trimTrailingSlash(url.toString()) };
}

function canonicalApprovalPayload(candidate: ExternalChannelAdapterRegistrationCandidate): string {
  return JSON.stringify({
    apiBaseUrl: candidate.apiBaseUrl ?? "",
    botToken: candidate.botToken,
    channelId: normalizeChannelId(candidate.channelId),
    enabled: candidate.enabled ?? true,
    workspaceId: candidate.workspaceId ?? "",
  });
}

function redactCandidateConfig(candidate: ExternalChannelAdapterRegistrationCandidate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (key === "approval") {
      out.approval = candidate.approval
        ? {
            approvedBy: sanitizeText(candidate.approval.approvedBy),
            approvedAt: candidate.approval.approvedAt,
            signature: "[REDACTED]",
          }
        : undefined;
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = value ? "[REDACTED]" : "missing";
    } else if (typeof value === "string") {
      out[key] = sanitizeText(value, [candidate.botToken]);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeText(value: string, secrets: string[] = []): string {
  let result = value;
  for (const secret of secrets) {
    if (!secret.trim()) continue;
    result = result.split(secret).join("[REDACTED]");
  }
  return result
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function displayNameForChannel(channelId: string): string {
  const normalized = normalizeChannelId(channelId);
  if (normalized === "slack") return "Slack";
  if (normalized === "discord") return "Discord";
  if (normalized === "telegram") return "Telegram";
  return normalized || "Unknown";
}

function normalizeChannelId(channelId: string): string {
  return String(channelId).trim().toLowerCase();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}
