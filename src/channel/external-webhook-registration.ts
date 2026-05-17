export interface ExternalChannelWebhookRegistrationApproval {
  approvedBy: string;
  signature: string;
  approvedAt?: string;
}

export interface ExternalChannelWebhookRegistrationCandidate {
  channelId: string;
  botToken: string;
  secretToken: string;
  webhookUrl: string;
  enabled?: boolean;
  apiBaseUrl?: string;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
  approval?: ExternalChannelWebhookRegistrationApproval;
}

export interface ExternalChannelWebhookRegistrationPlan {
  channelId: string;
  displayName: string;
  accepted: boolean;
  approvalRequired: boolean;
  requiredSignature?: string;
  reason?: string;
  redactedConfig: Record<string, unknown>;
}

export interface ExternalChannelWebhookRegistrationHostRequest {
  channelId: string;
  candidates?: ExternalChannelWebhookRegistrationCandidate[] | null;
  fetchImpl?: typeof fetch;
}

export interface ExternalChannelWebhookRegistrationHostResult {
  handled: boolean;
  command: string;
  output: string;
  isError: boolean;
  data: Record<string, unknown>;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_ALLOWED_UPDATES = ["message"] as const;
const TELEGRAM_WEBHOOK_PATH = "/api/channels/telegram/external-event";
const MAX_TELEGRAM_RESPONSE_BYTES = 32 * 1024;
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key)/i;
const SECRET_VALUE_PATTERN = /(telegram-token-[a-z0-9_-]+|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;
const WEBHOOK_SIGNATURE_PATTERN = /channel-webhook:[a-z0-9_-]+:[a-f0-9]+/gi;

export async function createExternalChannelWebhookRegistrationApprovalSignature(
  candidate: ExternalChannelWebhookRegistrationCandidate,
): Promise<string> {
  const normalized = normalizeCandidate(candidate);
  if (!normalized.accepted || !normalized.candidate) {
    return `channel-webhook:${normalizeChannelId(candidate.channelId)}:invalid`;
  }
  const digest = await sha256Hex(canonicalApprovalPayload(normalized.candidate));
  return `channel-webhook:${normalized.candidate.channelId}:${digest}`;
}

export async function planExternalChannelWebhookRegistrations(
  candidates: ExternalChannelWebhookRegistrationCandidate[],
): Promise<ExternalChannelWebhookRegistrationPlan[]> {
  const plans: ExternalChannelWebhookRegistrationPlan[] = [];
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

    const requiredSignature = await createExternalChannelWebhookRegistrationApprovalSignature(normalized.candidate);
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
      ...(approvalAccepted ? {} : { reason: "Exact operator approval signature is required before Telegram webhook setup." }),
      redactedConfig: redactCandidateConfig(normalized.candidate),
    });
  }
  return plans;
}

export async function executeExternalChannelWebhookRegistrationHostRequest(
  request: ExternalChannelWebhookRegistrationHostRequest,
): Promise<ExternalChannelWebhookRegistrationHostResult> {
  const channelId = normalizeChannelId(request.channelId);
  if (channelId !== "telegram") {
    return failure("unsupported_channel", "External webhook setup rejected: only Telegram webhook setup is supported in this slice.", channelId);
  }
  if (!request.fetchImpl) {
    return failure("missing_fetch", "External webhook setup rejected: host-owned injected fetch is required.", channelId);
  }

  const candidates = request.candidates ?? [];
  const matches = candidates.filter((candidate) => normalizeChannelId(candidate.channelId) === channelId);
  if (matches.length === 0) {
    return failure("missing_candidate", "External webhook setup rejected: no host-owned Telegram webhook candidate is available.", channelId);
  }
  if (matches.length > 1) {
    return failure("ambiguous_candidate", "External webhook setup rejected: multiple host-owned Telegram webhook candidates are available.", channelId);
  }

  const [candidate] = matches;
  const [plan] = await planExternalChannelWebhookRegistrations([candidate]);
  if (!plan?.accepted) {
    return failure(
      "approval_required",
      `External webhook setup rejected: Telegram webhook candidate is not approval accepted.${formatReason(plan)}`,
      channelId,
      plan,
    );
  }

  const normalized = normalizeCandidate(candidate);
  if (!normalized.accepted || !normalized.candidate) {
    return failure(
      "approval_required",
      `External webhook setup rejected: Telegram webhook candidate is invalid.${normalized.reason ? ` Reason: ${normalized.reason}` : ""}`,
      channelId,
      plan,
    );
  }

  const safeCandidate = normalized.candidate;
  const endpoint = `${safeCandidate.apiBaseUrl ?? TELEGRAM_API_BASE}/bot${safeCandidate.botToken}/setWebhook`;
  let response: Response;
  try {
    response = await request.fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: safeCandidate.webhookUrl,
        secret_token: safeCandidate.secretToken,
        allowed_updates: safeCandidate.allowedUpdates ?? [...DEFAULT_ALLOWED_UPDATES],
        ...(safeCandidate.dropPendingUpdates === true ? { drop_pending_updates: true } : {}),
      }),
    });
  } catch {
    return failure(
      "telegram_webhook_request_failed",
      "Telegram webhook setup failed: injected fetch rejected before a bounded response was available.",
      channelId,
      plan,
      { retryable: true },
    );
  }

  const raw = await readResponseText(response, MAX_TELEGRAM_RESPONSE_BYTES);
  if ("error" in raw) {
    return failure(raw.reasonCode, raw.error, channelId, plan, { retryable: response.status === 429 || response.status >= 500 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.value) as Record<string, unknown>;
  } catch {
    return failure(
      "telegram_webhook_response_malformed",
      "Telegram webhook setup failed: Telegram returned malformed JSON.",
      channelId,
      plan,
      { retryable: false },
    );
  }

  const retryable = response.status === 429 || response.status >= 500;
  if (!response.ok || parsed.ok !== true) {
    const description = typeof parsed.description === "string" ? ` Reason: ${sanitizeText(parsed.description, candidateSecrets(candidate))}` : "";
    return failure(
      "telegram_webhook_response_rejected",
      `Telegram webhook setup rejected by Telegram API.${description}`,
      channelId,
      plan,
      { retryable },
    );
  }

  return {
    handled: true,
    command: "channels",
    output: [
      "Telegram webhook registration executed by host executor.",
      "Channel: telegram",
      "Scope: one injected Telegram setWebhook call only.",
      "No default public hosting, listener startup, adapter registration, auth-policy mutation, retry worker, credential persistence, media upload, Slack setup, or Discord setup was performed.",
    ].join("\n"),
    isError: false,
    data: {
      action: "channels_external_webhook_registration_executed",
      channelId,
      registeredWebhook: true,
      allowedUpdates: safeCandidate.allowedUpdates ?? [...DEFAULT_ALLOWED_UPDATES],
      retryable: false,
    },
  };
}

function normalizeCandidate(candidate: ExternalChannelWebhookRegistrationCandidate): {
  accepted: boolean;
  candidate?: ExternalChannelWebhookRegistrationCandidate;
  reason?: string;
} {
  const channelId = normalizeChannelId(candidate.channelId);
  if (channelId !== "telegram") {
    return { accepted: false, reason: "Only Telegram webhook setup is supported in this slice." };
  }
  if (!candidate.botToken.trim()) {
    return { accepted: false, reason: "Telegram bot token is missing." };
  }
  if (!candidate.secretToken.trim()) {
    return { accepted: false, reason: "Telegram webhook secret token is missing." };
  }
  if (!isValidTelegramSecretToken(candidate.secretToken.trim())) {
    return { accepted: false, reason: "Telegram webhook secret token must be 1-256 characters using only letters, numbers, underscore, and hyphen." };
  }
  if (candidate.enabled !== true) {
    return { accepted: false, reason: "Telegram webhook setup must be explicitly enabled before approval." };
  }

  const safeWebhookUrl = validateWebhookUrl(candidate.webhookUrl);
  if (safeWebhookUrl.reason) {
    return { accepted: false, reason: safeWebhookUrl.reason };
  }
  const safeApiBaseUrl = candidate.apiBaseUrl ? validateTelegramApiBaseUrl(candidate.apiBaseUrl) : { value: TELEGRAM_API_BASE };
  if (safeApiBaseUrl.reason) {
    return { accepted: false, reason: safeApiBaseUrl.reason };
  }
  const allowedUpdates = normalizeAllowedUpdates(candidate.allowedUpdates);
  if (allowedUpdates.reason) {
    return { accepted: false, reason: allowedUpdates.reason };
  }

  return {
    accepted: true,
    candidate: {
      ...candidate,
      channelId: "telegram",
      botToken: candidate.botToken.trim(),
      secretToken: candidate.secretToken.trim(),
      webhookUrl: safeWebhookUrl.value!,
      apiBaseUrl: safeApiBaseUrl.value,
      allowedUpdates: allowedUpdates.value,
      dropPendingUpdates: candidate.dropPendingUpdates === true,
    },
  };
}

function validateWebhookUrl(value: string): { value?: string; reason?: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { reason: "Telegram webhook URL is invalid." };
  }
  if (url.protocol !== "https:") {
    return { reason: "Telegram webhook URL must use HTTPS." };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { reason: "Telegram webhook URL must not contain credentials, query parameters, or fragments." };
  }
  if (isLocalOrPrivateHost(url.hostname)) {
    return { reason: "Telegram webhook URL must not target local or private hosts." };
  }
  if (url.port && !["443", "80", "88", "8443"].includes(url.port)) {
    return { reason: "Telegram webhook URL port must be one of Telegram's supported ports: 443, 80, 88, or 8443." };
  }
  if (url.pathname !== TELEGRAM_WEBHOOK_PATH) {
    return { reason: `Telegram webhook URL must end with ${TELEGRAM_WEBHOOK_PATH}.` };
  }
  return { value: url.toString() };
}

function validateTelegramApiBaseUrl(value: string): { value?: string; reason?: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { reason: "Telegram API base URL is invalid." };
  }
  if (url.protocol !== "https:") {
    return { reason: "Telegram API base URL must use HTTPS." };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { reason: "Telegram API base URL must not contain credentials, query parameters, or fragments." };
  }
  if (isLocalOrPrivateHost(url.hostname)) {
    return { reason: "Telegram API base URL must not target local or private hosts." };
  }
  if (url.hostname.toLowerCase() !== "api.telegram.org") {
    return { reason: "Telegram API base URL must target api.telegram.org." };
  }
  return { value: trimTrailingSlash(url.toString()) };
}

function normalizeAllowedUpdates(value: string[] | undefined): { value?: string[]; reason?: string } {
  const updates = value?.length ? value.map((item) => item.trim()).filter(Boolean) : [...DEFAULT_ALLOWED_UPDATES];
  const unique = Array.from(new Set(updates));
  if (unique.length !== 1 || unique[0] !== "message") {
    return { reason: "Telegram webhook setup only supports allowed_updates [\"message\"] in this slice." };
  }
  return { value: unique };
}

async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<{ value: string } | { error: string; reasonCode: string }> {
  if (!response.body) return { value: "" };
  try {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          error: "Telegram webhook setup failed: Telegram response was too large.",
          reasonCode: "telegram_webhook_response_too_large",
        };
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { value: new TextDecoder().decode(merged) };
  } catch {
    return {
      error: "Telegram webhook setup failed: Telegram response could not be read.",
      reasonCode: "telegram_webhook_response_malformed",
    };
  }
}

function canonicalApprovalPayload(candidate: ExternalChannelWebhookRegistrationCandidate): string {
  return JSON.stringify({
    allowedUpdates: candidate.allowedUpdates ?? [...DEFAULT_ALLOWED_UPDATES],
    apiBaseUrl: candidate.apiBaseUrl ?? TELEGRAM_API_BASE,
    botToken: candidate.botToken,
    channelId: normalizeChannelId(candidate.channelId),
    dropPendingUpdates: candidate.dropPendingUpdates === true,
    enabled: candidate.enabled === true,
    secretToken: candidate.secretToken,
    webhookUrl: candidate.webhookUrl,
  });
}

function redactCandidateConfig(candidate: ExternalChannelWebhookRegistrationCandidate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const secrets = candidateSecrets(candidate);
  for (const [key, value] of Object.entries(candidate)) {
    if (key === "approval") {
      out.approval = candidate.approval
        ? {
            approvedBy: sanitizeText(candidate.approval.approvedBy, secrets),
            approvedAt: candidate.approval.approvedAt,
            signature: "[REDACTED]",
          }
        : undefined;
      continue;
    }
    if ((key === "webhookUrl" || key === "apiBaseUrl") && typeof value === "string") {
      out[key] = redactWebhookUrl(value);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = value ? "[REDACTED]" : "missing";
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => typeof item === "string" ? sanitizeText(item, secrets) : item);
    } else if (typeof value === "string") {
      out[key] = sanitizeText(value, secrets);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

function redactWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}/[REDACTED_PATH]`;
  } catch {
    return sanitizeText(value);
  }
}

function failure(
  reasonCode: string,
  output: string,
  channelId: string,
  plan?: ExternalChannelWebhookRegistrationPlan,
  data: Record<string, unknown> = {},
): ExternalChannelWebhookRegistrationHostResult {
  return {
    handled: true,
    command: "channels",
    output: sanitizeText(output, []),
    isError: true,
    data: {
      action: "channels_external_webhook_registration_rejected",
      channelId,
      reasonCode,
      ...(plan?.reason ? { reason: sanitizeText(plan.reason) } : {}),
      ...data,
    },
  };
}

function formatReason(plan?: ExternalChannelWebhookRegistrationPlan): string {
  return plan?.reason ? ` Reason: ${sanitizeText(plan.reason)}` : "";
}

function candidateSecrets(candidate: Partial<ExternalChannelWebhookRegistrationCandidate>): string[] {
  return [candidate.botToken, candidate.secretToken].filter((value): value is string => Boolean(value?.trim()));
}

function isValidTelegramSecretToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function sanitizeText(value: string, secrets: string[] = []): string {
  let result = value;
  for (const secret of secrets) {
    if (!secret.trim()) continue;
    result = result.split(secret).join("[REDACTED]");
  }
  return result
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(WEBHOOK_SIGNATURE_PATTERN, "channel-webhook:[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function isLocalOrPrivateHost(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (hostname.includes(":")) {
    const firstHextet = Number.parseInt(hostname.split(":")[0] ?? "", 16);
    return hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      (Number.isFinite(firstHextet) && firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
      hostname.startsWith("::ffff:");
  }
  return hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function displayNameForChannel(channelId: string): string {
  return normalizeChannelId(channelId) === "telegram" ? "Telegram" : normalizeChannelId(channelId) || "Unknown";
}

function normalizeChannelId(value: string): string {
  return String(value).trim().toLowerCase();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}
