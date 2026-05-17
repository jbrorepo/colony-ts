import type { ChannelRegistry } from "./registry";
import {
  planExternalChannelAdapterRegistrations,
  registerApprovedExternalChannelAdapters,
  type ExternalChannelAdapterRegistrationCandidate,
  type ExternalChannelAdapterRegistrationPlan,
} from "./external-registration";

export interface ExternalChannelRegistrationHostRequest {
  channelId: string;
  registry?: ChannelRegistry | null;
  candidates?: ExternalChannelAdapterRegistrationCandidate[] | null;
  fetchImpl?: typeof fetch;
}

export interface ExternalChannelRegistrationHostResult {
  handled: boolean;
  command: string;
  output: string;
  isError: boolean;
  data: Record<string, unknown>;
}

const SUPPORTED_CHANNELS = new Set(["discord", "slack", "telegram"]);
const SECRET_VALUE_PATTERN = /(xoxb-[a-z0-9_-]+|discord-token|telegram-token|bot-token|bearer\s+[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;
const APPROVAL_SIGNATURE_PATTERN = /channel-adapter:[a-z0-9_-]+:[a-f0-9]+/gi;

export async function executeExternalChannelRegistrationHostRequest(
  request: ExternalChannelRegistrationHostRequest,
): Promise<ExternalChannelRegistrationHostResult> {
  const channelId = normalizeChannelId(request.channelId);
  if (!SUPPORTED_CHANNELS.has(channelId)) {
    return failure("unsupported", "External channel adapter registration rejected: unsupported external channel.", channelId);
  }
  if (!request.registry) {
    return failure(
      "missing_registry",
      "External channel adapter registration rejected: host-owned channel registry is required.",
      channelId,
    );
  }

  const candidates = request.candidates ?? [];
  const matches = candidates.filter((candidate) => normalizeChannelId(candidate.channelId) === channelId);
  if (matches.length === 0) {
    return failure(
      "missing_candidate",
      `External channel adapter registration rejected: no host-owned ${channelId} candidate is available.`,
      channelId,
    );
  }
  if (matches.length > 1) {
    return failure(
      "ambiguous_candidate",
      `External channel adapter registration rejected: multiple host-owned ${channelId} candidates are available.`,
      channelId,
    );
  }
  if (request.registry.get(channelId)) {
    return failure(
      "already_registered",
      `External channel adapter registration rejected: ${channelId} adapter is already registered.`,
      channelId,
    );
  }

  const [candidate] = matches;
  const [plan] = await planExternalChannelAdapterRegistrations([candidate]);
  if (!plan?.accepted) {
    return failure(
      "approval_required",
      `External channel adapter registration rejected: ${channelId} candidate is not approval accepted.${formatReason(plan)}`,
      channelId,
      plan,
    );
  }

  const registered = await registerApprovedExternalChannelAdapters(request.registry, [candidate], {
    fetchImpl: request.fetchImpl,
  });
  if (registered.registeredCount !== 1) {
    const skipped = registered.skipped[0];
    return failure(
      "registration_skipped",
      `External channel adapter registration rejected: ${channelId} was not registered.${formatReason(skipped)}`,
      channelId,
      skipped,
    );
  }

  return {
    handled: true,
    command: "channels",
    output: [
      "External channel adapter registered by host executor.",
      `Channel: ${channelId}`,
      "Scope: host-owned registry mutation only; no vendor API call, listener startup, subscription setup, package install, or credential echo was performed.",
    ].join("\n"),
    isError: false,
    data: {
      action: "channels_external_registration_executed",
      channelId,
      registeredCount: registered.registeredCount,
    },
  };
}

function failure(
  reasonCode: string,
  output: string,
  channelId: string,
  plan?: ExternalChannelAdapterRegistrationPlan,
): ExternalChannelRegistrationHostResult {
  return {
    handled: true,
    command: "channels",
    output: sanitizeText(output),
    isError: true,
    data: {
      action: "channels_external_registration_rejected",
      channelId,
      reasonCode,
      ...(plan?.reason ? { reason: sanitizeText(plan.reason) } : {}),
    },
  };
}

function formatReason(plan?: ExternalChannelAdapterRegistrationPlan): string {
  return plan?.reason ? ` Reason: ${sanitizeText(plan.reason)}` : "";
}

function sanitizeText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(APPROVAL_SIGNATURE_PATTERN, "channel-adapter:[REDACTED]")
    .replace(SECRET_VALUE_PATTERN, "[REDACTED]");
}

function normalizeChannelId(value: string): string {
  return String(value).trim().toLowerCase();
}
