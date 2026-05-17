import {
  buildSlackApprovedEventBinding,
  type ExternalChannelApprovedEventBindingStore,
} from "./external-event-bindings";

export interface ExternalChannelSubscriptionApproval {
  approvedBy: string;
  signature: string;
  approvedAt?: string;
}

export interface ExternalChannelSubscriptionCandidate {
  channelId: string;
  appId?: string;
  workspaceId?: string;
  callbackUrl: string;
  signingSecretRef?: string;
  appConfigToken?: string;
  manifest?: Record<string, unknown>;
  applicationId?: string;
  guildId?: string;
  publicKeyRef?: string;
  discordBotToken?: string;
  discordApplicationCommands?: ExternalChannelDiscordApplicationCommand[];
  enabled?: boolean;
  eventTypes?: string[];
  approval?: ExternalChannelSubscriptionApproval;
}

export interface ExternalChannelDiscordApplicationCommand {
  name: string;
  description: string;
  type?: 1;
}

export interface ExternalChannelSubscriptionPlan {
  channelId: string;
  displayName: string;
  accepted: boolean;
  approvalRequired: boolean;
  requiredSignature?: string;
  reason?: string;
  redactedConfig: Record<string, unknown>;
}

export interface ExternalChannelSubscriptionSetupHostRequest {
  channelId: string;
  candidates?: ExternalChannelSubscriptionCandidate[] | null;
  fetchImpl?: ExternalChannelSubscriptionFetch;
  slackRetryPolicy?: ExternalChannelSubscriptionSlackRetryPolicy | null;
  discordSetupMode?: "interactions_endpoint" | "application_commands";
  eventBindingStore?: ExternalChannelApprovedEventBindingStore | null;
}

export interface ExternalChannelSubscriptionSetupHostResult {
  handled: boolean;
  command: string;
  output: string;
  isError: boolean;
  data: Record<string, unknown>;
}

export type ExternalChannelSubscriptionFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ExternalChannelSubscriptionSlackRetryPolicy {
  mode: "host_inline_bounded";
  maxAttempts?: number;
}

const CALLBACK_PATHS: Record<string, string> = {
  discord: "/api/channels/discord/external-event",
  slack: "/api/channels/slack/external-event",
};
const DEFAULT_EVENT_TYPES: Record<string, readonly string[]> = {
  discord: ["PING", "APPLICATION_COMMAND"],
  slack: ["message.channels"],
};
const SLACK_ALLOWED_EVENT_TYPE_SETS: readonly (readonly string[])[] = [
  ["message.channels"],
  ["app_mention"],
];
const SLACK_EVENT_REQUIRED_BOT_SCOPES: Record<string, readonly string[]> = {
  "app_mention": ["app_mentions:read"],
  "message.channels": ["channels:history"],
};
const SLACK_MANIFEST_UPDATE_ENDPOINT = "https://slack.com/api/apps.manifest.update";
const DISCORD_CURRENT_APPLICATION_ENDPOINT = "https://discord.com/api/v10/applications/@me";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_SLACK_RESPONSE_BYTES = 32 * 1024;
const MAX_DISCORD_RESPONSE_BYTES = 32 * 1024;
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key)/i;
const SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:token|secret|password|api[_-]?key|authorization|credential|signature)=)[^&#\s]+/gi;
const SUBSCRIPTION_SIGNATURE_PATTERN = /channel-subscription:[a-z0-9_-]+:[a-f0-9]+/gi;
const SECRET_VALUE_TEST_PATTERN = /(xox[baprs]-[a-z0-9-]+|xapp-[a-z0-9-]+|bot\s+[a-z0-9._-]+|bearer\s+[a-z0-9._-]+|token=[^\s]+|api[_-]?key=[^\s]+|credential=[^\s]+|signature=[^\s]+)/i;
const SECRET_VALUE_REDACT_PATTERN = /(xox[baprs]-[a-z0-9-]+|xapp-[a-z0-9-]+|bot\s+[a-z0-9._-]+|bearer\s+[a-z0-9._-]+|token=[^\s]+|api[_-]?key=[^\s]+|credential=[^\s]+|signature=[^\s]+)/gi;

export async function createExternalChannelSubscriptionApprovalSignature(
  candidate: ExternalChannelSubscriptionCandidate,
): Promise<string> {
  const normalized = normalizeCandidate(candidate);
  if (!normalized.accepted || !normalized.candidate) {
    return `channel-subscription:${normalizeChannelId(candidate.channelId)}:invalid`;
  }
  const digest = await sha256Hex(canonicalApprovalPayload(normalized.candidate));
  return `channel-subscription:${normalized.candidate.channelId}:${digest}`;
}

export async function planExternalChannelSubscriptions(
  candidates: ExternalChannelSubscriptionCandidate[],
): Promise<ExternalChannelSubscriptionPlan[]> {
  const plans: ExternalChannelSubscriptionPlan[] = [];
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

    const requiredSignature = await createExternalChannelSubscriptionApprovalSignature(normalized.candidate);
    const approvalAccepted =
      typeof normalized.candidate.approval?.signature === "string" &&
      normalized.candidate.approval.signature === requiredSignature &&
      typeof normalized.candidate.approval.approvedBy === "string" &&
      Boolean(normalized.candidate.approval.approvedBy.trim());

    plans.push({
      channelId: normalized.candidate.channelId,
      displayName: displayNameForChannel(normalized.candidate.channelId),
      accepted: approvalAccepted,
      approvalRequired: true,
      requiredSignature,
      ...(approvalAccepted ? {} : { reason: `Exact operator approval signature is required before ${setupLabelForChannel(normalized.candidate.channelId)}.` }),
      redactedConfig: redactCandidateConfig(normalized.candidate),
    });
  }
  return plans;
}

export async function executeExternalChannelSubscriptionSetupHostRequest(
  request: ExternalChannelSubscriptionSetupHostRequest,
): Promise<ExternalChannelSubscriptionSetupHostResult> {
  const channelId = normalizeChannelId(request.channelId);
  if (channelId !== "slack" && channelId !== "discord") {
    return subscriptionFailure("unsupported_channel", "External subscription setup rejected: only Slack subscription mutation or Discord Interactions endpoint mutation is supported in this slice.", channelId);
  }
  if (!request.fetchImpl) {
    return subscriptionFailure("missing_fetch", "External subscription setup rejected: host-owned injected fetch is required.", channelId);
  }

  const candidates = request.candidates ?? [];
  const matches = candidates.filter((candidate) => normalizeChannelId(candidate.channelId) === channelId);
  if (matches.length === 0) {
    return subscriptionFailure("missing_candidate", `External subscription setup rejected: no host-owned ${displayNameForChannel(channelId)} subscription candidate is available.`, channelId);
  }
  if (matches.length > 1) {
    return subscriptionFailure("ambiguous_candidate", `External subscription setup rejected: multiple host-owned ${displayNameForChannel(channelId)} subscription candidates are available.`, channelId);
  }

  const [candidate] = matches;
  const [plan] = await planExternalChannelSubscriptions([candidate]);
  if (!plan?.accepted) {
    return subscriptionFailure(
      "approval_required",
      `External subscription setup rejected: ${displayNameForChannel(channelId)} subscription candidate is not approval accepted.${formatSubscriptionReason(plan)}`,
      channelId,
      plan,
    );
  }

  const normalized = normalizeCandidate(candidate);
  if (channelId === "discord") {
    if (request.discordSetupMode === "application_commands") {
      return executeDiscordApplicationCommandSetup(request, candidate, normalized, plan);
    }
    return executeDiscordInteractionsEndpointSetup(request, candidate, normalized, plan);
  }

  const token = validateSlackAppConfigToken(candidate.appConfigToken);
  const manifest = normalizeSlackManifest(candidate.manifest);
  const scopeReadiness = manifest.value && normalized.candidate
    ? inspectSlackManifestScopeReadiness(manifest.value, normalized.candidate.eventTypes ?? [...DEFAULT_EVENT_TYPES.slack])
    : undefined;
  if (!normalized.accepted || !normalized.candidate || token.reason || manifest.reason || (scopeReadiness && !scopeReadiness.ready)) {
    return subscriptionFailure(
      "approval_required",
      `External subscription setup rejected: Slack subscription candidate is invalid.${token.reason || manifest.reason || scopeReadiness?.reason ? ` Reason: ${token.reason ?? manifest.reason ?? scopeReadiness?.reason}` : ""}`,
      channelId,
      plan,
    );
  }

  const safeCandidate = normalized.candidate;
  const patchedManifest = patchSlackEventSubscriptionManifest(manifest.value!, safeCandidate.callbackUrl, safeCandidate.eventTypes ?? [...DEFAULT_EVENT_TYPES.slack]);
  const retryPolicy = normalizeSlackRetryPolicy(request.slackRetryPolicy);
  let attemptCount = 0;
  let result: ExternalChannelSubscriptionSetupHostResult;
  do {
    attemptCount++;
    result = await executeSlackManifestUpdateAttempt(request, token.value!, safeCandidate, patchedManifest, plan);
  } while (shouldRetrySlackSubscriptionSetup(result, retryPolicy, attemptCount));

  return withSlackInlineRetryMetadata(result, retryPolicy, attemptCount);
}

async function executeSlackManifestUpdateAttempt(
  request: ExternalChannelSubscriptionSetupHostRequest,
  token: string,
  safeCandidate: ExternalChannelSubscriptionCandidate,
  patchedManifest: Record<string, unknown>,
  plan: ExternalChannelSubscriptionPlan,
): Promise<ExternalChannelSubscriptionSetupHostResult> {
  const channelId = "slack";
  let response: Response;
  try {
    response = await request.fetchImpl!(SLACK_MANIFEST_UPDATE_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: safeCandidate.appId,
        manifest: JSON.stringify(patchedManifest),
      }),
    });
  } catch {
    const retryUx = slackManualRetryUx("fetch_rejected");
    return subscriptionFailure(
      "slack_manifest_update_request_failed",
      withSlackManualRetryOutput("Slack subscription setup failed: injected fetch rejected before a bounded response was available."),
      channelId,
      plan,
      { retryable: true, ...retryUx },
    );
  }

  const raw = await readResponseText(response, MAX_SLACK_RESPONSE_BYTES);
  if ("error" in raw) {
    const retryable = isRetryableStatus(response.status);
    return subscriptionFailure(
      raw.reasonCode,
      retryable ? withSlackManualRetryOutput(raw.error) : raw.error,
      channelId,
      plan,
      {
        retryable,
        ...(retryable ? slackManualRetryUx(slackRetryReasonForStatus(response.status), response) : {}),
      },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.value) as unknown;
  } catch {
    const retryable = isRetryableStatus(response.status);
    return subscriptionFailure(
      "slack_manifest_update_response_malformed",
      retryable
        ? withSlackManualRetryOutput("Slack subscription setup failed: Slack returned malformed JSON.")
        : "Slack subscription setup failed: Slack returned malformed JSON.",
      channelId,
      plan,
      {
        retryable,
        ...(retryable ? slackManualRetryUx(slackRetryReasonForStatus(response.status), response) : {}),
      },
    );
  }
  if (!isRecord(parsed)) {
    const retryable = isRetryableStatus(response.status);
    return subscriptionFailure(
      "slack_manifest_update_response_malformed",
      retryable
        ? withSlackManualRetryOutput("Slack subscription setup failed: Slack returned non-object JSON.")
        : "Slack subscription setup failed: Slack returned non-object JSON.",
      channelId,
      plan,
      {
        retryable,
        ...(retryable ? slackManualRetryUx(slackRetryReasonForStatus(response.status), response) : {}),
      },
    );
  }

  const retryable = isRetryableStatus(response.status);
  if (!response.ok || parsed.ok !== true) {
    const detail = typeof parsed.error === "string" ? ` Reason: ${sanitizeText(parsed.error)}` : "";
    return subscriptionFailure(
      "slack_manifest_update_response_rejected",
      retryable
        ? withSlackManualRetryOutput(`Slack subscription setup rejected by Slack API.${detail}`)
        : `Slack subscription setup rejected by Slack API.${detail}`,
      channelId,
      plan,
      {
        retryable,
        ...(retryable ? slackManualRetryUx(slackRetryReasonForStatus(response.status), response) : {}),
      },
    );
  }

  const identity = validateSlackManifestUpdateResponseIdentity(parsed, safeCandidate);
  if (!identity.accepted) {
    return subscriptionFailure(
      "slack_manifest_update_response_identity_mismatch",
      "Slack subscription setup rejected: Slack API response identity did not match the approved app/workspace candidate.",
      channelId,
      plan,
      { retryable: false },
    );
  }
  const manifestEcho = validateSlackManifestUpdateResponseManifestEcho(parsed, patchedManifest);
  if (!manifestEcho.accepted) {
    return subscriptionFailure(
      "slack_manifest_update_response_manifest_mismatch",
      "Slack subscription setup rejected: Slack API response manifest echo did not match the approved Events API request URL and bot events.",
      channelId,
      plan,
      { retryable: false },
    );
  }
  const eventBinding = await buildSlackApprovedEventBinding(safeCandidate);
  if (request.eventBindingStore) {
    try {
      await request.eventBindingStore.appendApprovedEventBindings([eventBinding]);
    } catch {
      return subscriptionFailure(
        "external_event_binding_persistence_failed",
        "Slack subscription setup rejected: approved event binding could not be persisted after host mutation confirmation.",
        channelId,
        plan,
        { retryable: false },
      );
    }
  }

  return {
    handled: true,
    command: "channels",
    output: [
      "Slack subscription direct mutation executed by host executor.",
      "Channel: slack",
      "Scope: one injected Slack apps.manifest.update call only.",
      "Activation readiness: manifest mutation confirmed; live inbound delivery, public hosting, credential persistence, and listener startup remain host-owned and disabled by default.",
      `Remaining operator steps: ${slackActivationRemainingOperatorSteps().join(", ")}`,
      "No Slack app creation, credential persistence, listener startup, public hosting, upload/media handling, retry worker, Discord setup, and no default live inbound delivery was performed.",
    ].join("\n"),
    isError: false,
    data: {
      action: "channels_external_subscription_setup_executed",
      channelId,
      mutatedSubscription: true,
      eventTypes: safeCandidate.eventTypes ?? [...DEFAULT_EVENT_TYPES.slack],
      eventBinding: summarizeEventBinding(eventBinding),
      eventBindingPersisted: Boolean(request.eventBindingStore),
      ...identity.data,
      ...manifestEcho.data,
      activationReadiness: buildSlackActivationReadiness(identity.data, manifestEcho.data),
      retryable: false,
    },
  };
}

function buildSlackActivationReadiness(
  identityData: Record<string, unknown>,
  manifestEchoData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    manifestMutationConfirmed: true,
    subscriptionHostMutation: "slack_apps_manifest_update",
    liveInboundDeliveryEnabled: false,
    defaultPublicHostingEnabled: false,
    credentialPersistenceCreated: false,
    listenerStarted: false,
    remainingOperatorSteps: slackActivationRemainingOperatorSteps(),
    integrityChecks: {
      appIdMatched: identityData.responseAppIdMatched === true,
      workspaceMatched: identityData.responseWorkspaceMatched === true,
      manifestEchoStatus: manifestEchoData.responseManifestEventSubscriptionMatched === true ? "matched" : "not_returned",
    },
  };
}

function summarizeEventBinding(binding: Awaited<ReturnType<typeof buildSlackApprovedEventBinding>>): Record<string, unknown> {
  return {
    channelId: binding.channelId,
    appId: binding.appId,
    accountId: binding.accountId,
    eventTypes: binding.eventTypes,
    callbackUrlFingerprint: binding.callbackUrlFingerprint,
    callbackHost: binding.callbackHost,
    signingSecretRef: binding.signingSecretRef,
    approvalSignatureFingerprint: binding.approvalSignatureFingerprint,
    active: binding.active,
    enabled: binding.enabled,
  };
}

function slackActivationRemainingOperatorSteps(): string[] {
  return [
    "host_public_callback_route",
    "slack_url_verification_challenge",
    "host_auth_policy_binding",
    "channel_adapter_registration",
    "bridge_session_runner_wiring",
  ];
}

function validateSlackManifestUpdateResponseIdentity(
  response: Record<string, unknown>,
  candidate: ExternalChannelSubscriptionCandidate,
): { accepted: boolean; data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  if (typeof response.app_id !== "string" || response.app_id !== candidate.appId) {
    return { accepted: false, data: {} };
  }
  data.responseAppIdMatched = true;

  const responseWorkspaceId =
    typeof response.team_id === "string"
      ? response.team_id
      : typeof response.workspace_id === "string"
        ? response.workspace_id
        : typeof response.team === "string"
          ? response.team
          : isRecord(response.team) && typeof response.team.id === "string"
            ? response.team.id
            : undefined;
  if (responseWorkspaceId) {
    if (responseWorkspaceId !== candidate.workspaceId) {
      return { accepted: false, data: {} };
    }
    data.responseWorkspaceMatched = true;
  }

  return { accepted: true, data };
}

function validateSlackManifestUpdateResponseManifestEcho(
  response: Record<string, unknown>,
  patchedManifest: Record<string, unknown>,
): { accepted: boolean; data: Record<string, unknown> } {
  if (!("manifest" in response)) {
    return { accepted: true, data: {} };
  }
  if (!isRecord(response.manifest)) {
    return { accepted: false, data: {} };
  }

  const echoedSettings = isRecord(response.manifest.settings) ? response.manifest.settings : undefined;
  const echoedEvents = echoedSettings && isRecord(echoedSettings.event_subscriptions)
    ? echoedSettings.event_subscriptions
    : undefined;
  const patchedSettings = isRecord(patchedManifest.settings) ? patchedManifest.settings : undefined;
  const patchedEvents = patchedSettings && isRecord(patchedSettings.event_subscriptions)
    ? patchedSettings.event_subscriptions
    : undefined;

  if (!echoedEvents || !patchedEvents) {
    return { accepted: false, data: {} };
  }
  if (echoedEvents.request_url !== patchedEvents.request_url) {
    return { accepted: false, data: {} };
  }
  if (!arrayOfStringsEqual(echoedEvents.bot_events, patchedEvents.bot_events)) {
    return { accepted: false, data: {} };
  }

  return { accepted: true, data: { responseManifestEventSubscriptionMatched: true } };
}

function arrayOfStringsEqual(left: unknown, right: unknown): boolean {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => typeof item === "string" && item === right[index]);
}

function normalizeSlackRetryPolicy(
  value: ExternalChannelSubscriptionSlackRetryPolicy | null | undefined,
): { enabled: boolean; maxAttempts: number } {
  if (!value || value.mode !== "host_inline_bounded") {
    return { enabled: false, maxAttempts: 1 };
  }
  const raw = Number.isFinite(value.maxAttempts) ? Number(value.maxAttempts) : 2;
  return { enabled: true, maxAttempts: Math.max(1, Math.min(2, Math.floor(raw))) };
}

function shouldRetrySlackSubscriptionSetup(
  result: ExternalChannelSubscriptionSetupHostResult,
  retryPolicy: { enabled: boolean; maxAttempts: number },
  attemptCount: number,
): boolean {
  return retryPolicy.enabled &&
    attemptCount < retryPolicy.maxAttempts &&
    result.isError === true &&
    result.data.retryable === true;
}

function withSlackInlineRetryMetadata(
  result: ExternalChannelSubscriptionSetupHostResult,
  retryPolicy: { enabled: boolean; maxAttempts: number },
  attemptCount: number,
): ExternalChannelSubscriptionSetupHostResult {
  if (!retryPolicy.enabled || attemptCount <= 1) {
    return result;
  }
  const retryAttemptCount = attemptCount - 1;
  const retryData = {
    automaticRetryMode: "bounded_foreground_retry",
    attemptCount,
    retryAttemptCount,
    maxAttemptCount: retryPolicy.maxAttempts,
  };
  if (!result.isError) {
    return {
      ...result,
      output: sanitizeText([
        result.output,
        `Automatic retry: host inline bounded retry recovered after ${retryAttemptCount} retry attempt${retryAttemptCount === 1 ? "" : "s"}.`,
        "No background retry worker, retry schedule, credential persistence, manifest persistence, approval-signature persistence, or default live inbound delivery was created.",
      ].join("\n")),
      data: {
        ...result.data,
        ...retryData,
        automaticRetryRecovered: true,
      },
    };
  }

  return {
    ...result,
    output: sanitizeText([
      stripNoAutomaticRetryCopy(result.output),
      `Automatic retry: host inline bounded retry exhausted after ${retryAttemptCount} retry attempt${retryAttemptCount === 1 ? "" : "s"}.`,
      "No background retry worker was created. No retry schedule, credential persistence, manifest persistence, approval-signature persistence, or default live inbound delivery was created.",
      "Next operator action: Re-run the approved Slack subscription setup after checking host-owned credentials and Slack availability.",
    ].join("\n")),
    data: {
      ...result.data,
      ...retryData,
      automaticRetryExhausted: true,
    },
  };
}

function stripNoAutomaticRetryCopy(output: string): string {
  return output
    .replace("No automatic retry was attempted. No background retry worker, retry schedule, credential persistence, manifest persistence, or approval-signature persistence was created.", "")
    .replace("Next operator action: Re-run the approved Slack subscription setup after checking host-owned credentials and Slack availability.", "")
    .trim();
}

function withSlackManualRetryOutput(output: string): string {
  return [
    output,
    "No automatic retry was attempted. No background retry worker, retry schedule, credential persistence, manifest persistence, or approval-signature persistence was created.",
    "Next operator action: Re-run the approved Slack subscription setup after checking host-owned credentials and Slack availability.",
  ].join("\n");
}

function slackManualRetryUx(
  retryReason: "fetch_rejected" | "rate_limited" | "server_error",
  response?: Response,
): Record<string, unknown> {
  return {
    retryMode: "manual_operator_reinvoke",
    retryReason,
    nextOperatorAction: "Re-run the approved Slack subscription setup after checking host-owned credentials and Slack availability.",
    ...readRetryAfterSeconds(response),
  };
}

function slackRetryReasonForStatus(status: number): "rate_limited" | "server_error" {
  return status === 429 ? "rate_limited" : "server_error";
}

function readRetryAfterSeconds(response?: Response): { retryAfterSeconds?: number } {
  const raw = response?.headers.get("retry-after")?.trim();
  if (!raw) return {};
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric)) {
    return { retryAfterSeconds: clampRetryAfterSeconds(numeric) };
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return {};
  return { retryAfterSeconds: clampRetryAfterSeconds(Math.ceil((timestamp - Date.now()) / 1000)) };
}

function clampRetryAfterSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), 86_400);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function executeDiscordInteractionsEndpointSetup(
  request: ExternalChannelSubscriptionSetupHostRequest,
  candidate: ExternalChannelSubscriptionCandidate,
  normalized: { accepted: boolean; candidate?: ExternalChannelSubscriptionCandidate; reason?: string },
  plan: ExternalChannelSubscriptionPlan,
): Promise<ExternalChannelSubscriptionSetupHostResult> {
  const channelId = "discord";
  const token = validateDiscordBotToken(candidate.discordBotToken);
  if (!normalized.accepted || !normalized.candidate || token.reason) {
    return subscriptionFailure(
      "approval_required",
      `External subscription setup rejected: Discord subscription candidate is invalid.${token.reason ? ` Reason: ${token.reason}` : ""}`,
      channelId,
      plan,
    );
  }

  const safeCandidate = normalized.candidate;
  let response: Response;
  try {
    response = await request.fetchImpl!(DISCORD_CURRENT_APPLICATION_ENDPOINT, {
      method: "PATCH",
      headers: {
        authorization: token.value!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        interactions_endpoint_url: safeCandidate.callbackUrl,
      }),
    });
  } catch {
    return subscriptionFailure(
      "discord_endpoint_update_request_failed",
      "Discord Interactions endpoint setup failed: injected fetch rejected before a bounded response was available.",
      channelId,
      plan,
      { retryable: true },
    );
  }

  const raw = await readResponseText(response, MAX_DISCORD_RESPONSE_BYTES, "Discord Interactions endpoint setup", "discord_endpoint_update");
  if ("error" in raw) {
    return subscriptionFailure(raw.reasonCode, raw.error, channelId, plan, { retryable: response.status === 429 || response.status >= 500 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.value) as unknown;
  } catch {
    return subscriptionFailure(
      "discord_endpoint_update_response_malformed",
      "Discord Interactions endpoint setup failed: Discord returned malformed JSON.",
      channelId,
      plan,
      { retryable: false },
    );
  }

  const retryable = response.status === 429 || response.status >= 500;
  if (!isRecord(parsed)) {
    return subscriptionFailure(
      "discord_endpoint_update_response_malformed",
      "Discord Interactions endpoint setup failed: Discord returned non-object JSON.",
      channelId,
      plan,
      { retryable: false },
    );
  }
  if (
    !response.ok ||
    parsed.id !== safeCandidate.applicationId ||
    parsed.interactions_endpoint_url !== safeCandidate.callbackUrl
  ) {
    const detail = typeof parsed.message === "string" ? ` Reason: ${sanitizeText(parsed.message)}` : "";
    return subscriptionFailure(
      "discord_endpoint_update_response_rejected",
      `Discord Interactions endpoint setup rejected by Discord API.${detail}`,
      channelId,
      plan,
      { retryable },
    );
  }

  return {
    handled: true,
    command: "channels",
    output: [
      "Discord Interactions endpoint direct mutation executed by host executor.",
      "Channel: discord",
      "Scope: one injected Discord Edit Current Application call only, mutating interactions_endpoint_url.",
      "No Discord app creation, credential persistence, listener startup, public hosting, upload/media handling, retry worker, slash-command registration, privileged Gateway intents, Slack setup, and no default live inbound delivery was performed.",
    ].join("\n"),
    isError: false,
    data: {
      action: "channels_external_subscription_setup_executed",
      channelId,
      mutatedInteractionsEndpoint: true,
      retryable: false,
    },
  };
}

async function executeDiscordApplicationCommandSetup(
  request: ExternalChannelSubscriptionSetupHostRequest,
  candidate: ExternalChannelSubscriptionCandidate,
  normalized: { accepted: boolean; candidate?: ExternalChannelSubscriptionCandidate; reason?: string },
  plan: ExternalChannelSubscriptionPlan,
): Promise<ExternalChannelSubscriptionSetupHostResult> {
  const channelId = "discord";
  const token = validateDiscordBotToken(candidate.discordBotToken);
  const commands = normalizeDiscordApplicationCommands(candidate.discordApplicationCommands);
  if (!normalized.accepted || !normalized.candidate || token.reason || commands.reason) {
    return subscriptionFailure(
      "approval_required",
      `External subscription setup rejected: Discord application command candidate is invalid.${token.reason || commands.reason ? ` Reason: ${token.reason ?? commands.reason}` : ""}`,
      channelId,
      plan,
    );
  }

  const safeCandidate = normalized.candidate;
  const endpoint = `${DISCORD_API_BASE}/applications/${safeCandidate.applicationId}/guilds/${safeCandidate.guildId}/commands`;
  let response: Response;
  try {
    response = await request.fetchImpl!(endpoint, {
      method: "PUT",
      headers: {
        authorization: token.value!,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands.value),
    });
  } catch {
    return subscriptionFailure(
      "discord_command_update_request_failed",
      "Discord application command setup failed: injected fetch rejected before a bounded response was available.",
      channelId,
      plan,
      { retryable: true },
    );
  }

  const raw = await readResponseText(response, MAX_DISCORD_RESPONSE_BYTES, "Discord application command setup", "discord_command_update");
  if ("error" in raw) {
    return subscriptionFailure(raw.reasonCode, raw.error, channelId, plan, { retryable: response.status === 429 || response.status >= 500 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.value) as unknown;
  } catch {
    return subscriptionFailure(
      "discord_command_update_response_malformed",
      "Discord application command setup failed: Discord returned malformed JSON.",
      channelId,
      plan,
      { retryable: false },
    );
  }

  const retryable = response.status === 429 || response.status >= 500;
  if (!response.ok || !Array.isArray(parsed)) {
    const detail = isRecord(parsed) && typeof parsed.message === "string" ? ` Reason: ${sanitizeText(parsed.message)}` : "";
    return subscriptionFailure(
      "discord_command_update_response_rejected",
      `Discord application command setup rejected by Discord API.${detail}`,
      channelId,
      plan,
      { retryable },
    );
  }
  if (!discordCommandResponseMatches(parsed, commands.value!)) {
    return subscriptionFailure(
      "discord_command_update_response_command_mismatch",
      "Discord application command setup rejected: Discord API response did not match the approved command definitions.",
      channelId,
      plan,
      { retryable: false },
    );
  }

  return {
    handled: true,
    command: "channels",
    output: [
      "Discord guild application command registration executed by host executor.",
      "Channel: discord",
      "Scope: one injected Discord Bulk Overwrite Guild Application Commands call only.",
      "No Discord app creation, credential persistence, listener startup, public hosting, upload/media handling, retry worker, privileged Gateway intents, Slack setup, endpoint mutation, and no default live inbound delivery was performed.",
    ].join("\n"),
    isError: false,
    data: {
      action: "channels_external_subscription_setup_executed",
      channelId,
      mutatedApplicationCommands: true,
      commandScope: "guild",
      commandCount: commands.value!.length,
      responseCommandDefinitionsMatched: true,
      retryable: false,
    },
  };
}

function normalizeCandidate(candidate: ExternalChannelSubscriptionCandidate): {
  accepted: boolean;
  candidate?: ExternalChannelSubscriptionCandidate;
  reason?: string;
} {
  const channelId = normalizeChannelId(candidate.channelId);
  if (!isSupportedSubscriptionChannel(channelId)) {
    return { accepted: false, reason: "Only Slack subscription setup or Discord Interactions setup is supported in this slice." };
  }
  const safeAppId = validateAppId(channelId, candidate);
  if (safeAppId.reason) {
    return { accepted: false, reason: safeAppId.reason };
  }
  const safeWorkspaceId = validateWorkspaceId(channelId, candidate);
  if (safeWorkspaceId.reason) {
    return { accepted: false, reason: safeWorkspaceId.reason };
  }
  if (candidate.enabled !== true) {
    return { accepted: false, reason: `${setupLabelForChannel(channelId)} must be explicitly enabled before approval.` };
  }
  const safeCallbackUrl = validateCallbackUrl(channelId, candidate.callbackUrl);
  if (safeCallbackUrl.reason) {
    return { accepted: false, reason: safeCallbackUrl.reason };
  }
  const safeSecretRef = validateSigningSecretRef(channelId, candidate);
  if (safeSecretRef.reason) {
    return { accepted: false, reason: safeSecretRef.reason };
  }
  const safeEventTypes = normalizeEventTypes(channelId, candidate.eventTypes);
  if (safeEventTypes.reason) {
    return { accepted: false, reason: safeEventTypes.reason };
  }
  const safeManifest = validateOptionalSlackManifestForApproval(channelId, safeEventTypes.value, candidate.manifest);
  if (safeManifest.reason) {
    return { accepted: false, reason: safeManifest.reason };
  }
  const safeDiscordCommands = validateOptionalDiscordApplicationCommandsForApproval(channelId, candidate.discordApplicationCommands);
  if (safeDiscordCommands.reason) {
    return { accepted: false, reason: safeDiscordCommands.reason };
  }

  return {
    accepted: true,
    candidate: {
      ...candidate,
      channelId,
      appId: safeAppId.value!,
      workspaceId: safeWorkspaceId.value!,
      ...(channelId === "discord" ? { applicationId: safeAppId.value!, guildId: safeWorkspaceId.value!, publicKeyRef: safeSecretRef.value! } : {}),
      callbackUrl: safeCallbackUrl.value!,
      signingSecretRef: safeSecretRef.value!,
      eventTypes: safeEventTypes.value,
      ...(safeDiscordCommands.value ? { discordApplicationCommands: safeDiscordCommands.value } : {}),
      enabled: true,
    },
  };
}

function validateAppId(channelId: string, candidate: ExternalChannelSubscriptionCandidate): { value?: string; reason?: string } {
  const raw = channelId === "discord" ? candidate.applicationId : candidate.appId;
  const trimmed = raw?.trim() ?? "";
  if (channelId === "slack") {
    return isSafeSlackIdentifier(trimmed, "A")
      ? { value: trimmed }
      : { reason: "Slack app id is missing or malformed." };
  }
  return isDiscordSnowflake(trimmed)
    ? { value: trimmed }
    : { reason: "Discord application id is missing or malformed." };
}

function validateWorkspaceId(channelId: string, candidate: ExternalChannelSubscriptionCandidate): { value?: string; reason?: string } {
  const raw = channelId === "discord" ? candidate.guildId : candidate.workspaceId;
  const trimmed = raw?.trim() ?? "";
  if (channelId === "slack") {
    return isSafeSlackIdentifier(trimmed, "T")
      ? { value: trimmed }
      : { reason: "Slack workspace id is missing or malformed." };
  }
  return isDiscordSnowflake(trimmed)
    ? { value: trimmed }
    : { reason: "Discord guild id is missing or malformed." };
}

function validateCallbackUrl(channelId: string, value: string): { value?: string; reason?: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { reason: `${displayNameForChannel(channelId)} callback URL is invalid.` };
  }
  if (url.protocol !== "https:") {
    return { reason: `${displayNameForChannel(channelId)} callback URL must use HTTPS.` };
  }
  if (url.username || url.password) {
    return { reason: `${displayNameForChannel(channelId)} callback URL must not contain credentials.` };
  }
  if (url.search) {
    return { reason: `${displayNameForChannel(channelId)} callback URL must not contain query parameters.` };
  }
  if (url.hash) {
    return { reason: `${displayNameForChannel(channelId)} callback URL must not contain fragments.` };
  }
  if (isLocalOrPrivateHost(url.hostname)) {
    return { reason: `${displayNameForChannel(channelId)} callback URL must not target local or private hosts.` };
  }
  const expectedPath = CALLBACK_PATHS[channelId];
  if (url.pathname !== expectedPath) {
    return { reason: `${displayNameForChannel(channelId)} callback URL must use the expected external event endpoint.` };
  }
  return { value: url.toString() };
}

function validateSigningSecretRef(channelId: string, candidate: ExternalChannelSubscriptionCandidate): { value?: string; reason?: string } {
  const displayName = displayNameForChannel(channelId);
  const raw = channelId === "discord" ? candidate.publicKeyRef : candidate.signingSecretRef;
  const ref = raw?.trim() ?? "";
  if (!ref || ref.length > 160 || /\s/.test(ref)) {
    return { reason: `${displayName} signing/public-key reference is missing or malformed.` };
  }
  if (!/^(vault|secret-ref):[A-Za-z0-9_.:/-]+$/.test(ref)) {
    return { reason: `${displayName} signing/public-key reference must use a vault: or secret-ref: reference, not a raw secret.` };
  }
  if (SECRET_VALUE_TEST_PATTERN.test(ref)) {
    return { reason: `${displayName} signing/public-key reference must not contain raw credential material.` };
  }
  return { value: ref };
}

function normalizeEventTypes(channelId: string, value: string[] | undefined): { value?: string[]; reason?: string } {
  const allowed = DEFAULT_EVENT_TYPES[channelId] ?? [];
  const eventTypes = value?.length ? value.map((item) => item.trim()).filter(Boolean) : [...allowed];
  const unique = Array.from(new Set(eventTypes));
  if (channelId === "slack") {
    const exactSlackSet = SLACK_ALLOWED_EVENT_TYPE_SETS.some((set) =>
      unique.length === set.length && unique.every((entry, index) => entry === set[index])
    );
    if (!exactSlackSet) {
      return { reason: `${setupLabelForChannel(channelId)} only supports eventTypes ${JSON.stringify(SLACK_ALLOWED_EVENT_TYPE_SETS)} in this slice.` };
    }
    return { value: unique };
  }
  const exactAllowed = unique.length === allowed.length && unique.every((entry, index) => entry === allowed[index]);
  if (!exactAllowed) {
    return { reason: `${setupLabelForChannel(channelId)} only supports eventTypes ${JSON.stringify(allowed)} in this slice.` };
  }
  return { value: unique };
}

function canonicalApprovalPayload(candidate: ExternalChannelSubscriptionCandidate): string {
  return JSON.stringify({
    appId: readCanonicalAppId(candidate),
    appConfigToken: normalizeChannelId(candidate.channelId) === "slack" && typeof candidate.appConfigToken === "string" ? candidate.appConfigToken.trim() : undefined,
    callbackUrl: candidate.callbackUrl,
    channelId: normalizeChannelId(candidate.channelId),
    discordBotToken: normalizeChannelId(candidate.channelId) === "discord" && typeof candidate.discordBotToken === "string" ? candidate.discordBotToken.trim() : undefined,
    discordApplicationCommands: normalizeChannelId(candidate.channelId) === "discord" && candidate.discordApplicationCommands ? stableJson(candidate.discordApplicationCommands) : undefined,
    enabled: candidate.enabled === true,
    eventTypes: candidate.eventTypes ?? [...(DEFAULT_EVENT_TYPES[normalizeChannelId(candidate.channelId)] ?? [])],
    manifest: normalizeChannelId(candidate.channelId) === "slack" && candidate.manifest ? stableJson(candidate.manifest) : undefined,
    signingSecretRef: readCanonicalSigningRef(candidate),
    workspaceId: readCanonicalWorkspaceId(candidate),
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateOptionalSlackManifestForApproval(
  channelId: string,
  eventTypes: string[] | undefined,
  value: Record<string, unknown> | undefined,
): { reason?: string } {
  if (channelId !== "slack" || value === undefined) {
    return {};
  }
  const normalized = normalizeSlackManifest(value);
  if (normalized.reason || !normalized.value) {
    return { reason: normalized.reason };
  }
  const scopeReadiness = inspectSlackManifestScopeReadiness(normalized.value, eventTypes ?? [...DEFAULT_EVENT_TYPES.slack]);
  return scopeReadiness.ready ? {} : { reason: scopeReadiness.reason };
}

function validateSlackAppConfigToken(value: string | undefined): { value?: string; reason?: string } {
  const token = value?.trim() ?? "";
  if (!/^xapp-[A-Za-z0-9-]{8,}$/.test(token)) {
    return { reason: "Slack app configuration token is missing or malformed." };
  }
  return { value: token };
}

function validateDiscordBotToken(value: string | undefined): { value?: string; reason?: string } {
  const token = value?.trim() ?? "";
  if (!/^Bot\s+[A-Za-z0-9._-]{12,}$/.test(token)) {
    return { reason: "Discord bot token is missing or malformed." };
  }
  return { value: token };
}

function validateOptionalDiscordApplicationCommandsForApproval(
  channelId: string,
  value: ExternalChannelDiscordApplicationCommand[] | undefined,
): { value?: ExternalChannelDiscordApplicationCommand[]; reason?: string } {
  if (channelId !== "discord" || value === undefined) {
    return {};
  }
  return normalizeDiscordApplicationCommands(value);
}

function normalizeDiscordApplicationCommands(
  value: ExternalChannelDiscordApplicationCommand[] | undefined,
): { value?: ExternalChannelDiscordApplicationCommand[]; reason?: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { reason: "Discord application command setup requires one to five approved command definitions." };
  }
  if (value.length > 5) {
    return { reason: "Discord application command setup supports at most five command definitions in this slice." };
  }

  const seen = new Set<string>();
  const normalized: ExternalChannelDiscordApplicationCommand[] = [];
  for (const command of value) {
    if (!isRecord(command)) {
      return { reason: "Discord application command definitions must be JSON objects." };
    }
    const name = typeof command.name === "string" ? command.name.trim() : "";
    const description = typeof command.description === "string" ? command.description.trim() : "";
    const type = command.type ?? 1;
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
      return { reason: "Discord application command names must be 1-32 lowercase letters, numbers, underscores, or hyphens." };
    }
    if (seen.has(name)) {
      return { reason: "Discord application command names must be unique." };
    }
    if (description.length < 1 || description.length > 100) {
      return { reason: "Discord application command descriptions must be 1-100 characters." };
    }
    if (type !== 1) {
      return { reason: "Discord application command setup only supports chat-input command type 1 in this slice." };
    }
    seen.add(name);
    normalized.push({ name, description, type: 1 });
  }
  return { value: normalized };
}

function discordCommandResponseMatches(
  response: unknown[],
  commands: ExternalChannelDiscordApplicationCommand[],
): boolean {
  const commandRecords = response.filter(isRecord);
  if (commandRecords.length !== response.length || commandRecords.length !== commands.length) {
    return false;
  }
  const approved = new Map(commands.map((command) => [command.name, command]));
  const seen = new Set<string>();
  for (const entry of commandRecords) {
    const name = typeof entry.name === "string" ? entry.name : "";
    const description = typeof entry.description === "string" ? entry.description : "";
    const type = entry.type;
    const command = approved.get(name);
    if (!command || seen.has(name)) return false;
    if (description !== command.description || type !== command.type) return false;
    seen.add(name);
  }
  return seen.size === commands.length;
}

function normalizeSlackManifest(value: Record<string, unknown> | undefined): { value?: Record<string, unknown>; reason?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { reason: "Slack full app manifest is required before direct subscription mutation." };
  }
  const cloned = structuredCloneJson(value);
  if (cloned.reason || !cloned.value) {
    return { reason: cloned.reason ?? "Slack full app manifest must be JSON serializable." };
  }
  return { value: cloned.value };
}

function patchSlackEventSubscriptionManifest(
  manifest: Record<string, unknown>,
  callbackUrl: string,
  eventTypes: readonly string[],
): Record<string, unknown> {
  const settings = isRecord(manifest.settings) ? { ...manifest.settings } : {};
  settings.event_subscriptions = {
    ...(isRecord(settings.event_subscriptions) ? settings.event_subscriptions : {}),
    request_url: callbackUrl,
    bot_events: [...eventTypes],
  };
  return { ...manifest, settings };
}

async function readResponseText(
  response: Response,
  maxBytes: number,
  failureLabel = "Slack subscription setup",
  reasonPrefix = "slack_manifest_update",
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
          error: `${failureLabel} failed: response was too large.`,
          reasonCode: `${reasonPrefix}_response_too_large`,
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
      error: `${failureLabel} failed: response could not be read.`,
      reasonCode: `${reasonPrefix}_response_malformed`,
    };
  }
}

function subscriptionFailure(
  reasonCode: string,
  output: string,
  channelId: string,
  plan?: ExternalChannelSubscriptionPlan,
  data: Record<string, unknown> = {},
): ExternalChannelSubscriptionSetupHostResult {
  return {
    handled: true,
    command: "channels",
    output: sanitizeText(output),
    isError: true,
    data: {
      action: "channels_external_subscription_setup_rejected",
      channelId,
      reasonCode,
      ...(plan?.reason ? { reason: sanitizeText(plan.reason) } : {}),
      ...data,
    },
  };
}

function formatSubscriptionReason(plan?: ExternalChannelSubscriptionPlan): string {
  return plan?.reason ? ` Reason: ${sanitizeText(plan.reason)}` : "";
}

function structuredCloneJson(value: Record<string, unknown>): { value?: Record<string, unknown>; reason?: string } {
  try {
    const compatibility = validateJsonCompatible(value, new Set());
    if (compatibility.reason) {
      return { reason: compatibility.reason };
    }
    const text = JSON.stringify(value);
    if (typeof text !== "string") {
      return { reason: "Slack full app manifest must be JSON serializable." };
    }
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      return { reason: "Slack full app manifest must serialize to a JSON object." };
    }
    return { value: parsed };
  } catch {
    return { reason: "Slack full app manifest must be JSON serializable." };
  }
}

function validateJsonCompatible(value: unknown, seen: Set<object>): { reason?: string } {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return {};
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? {} : { reason: "Slack full app manifest must contain only finite JSON numbers." };
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return { reason: "Slack full app manifest must contain only JSON-compatible values." };
  }
  if (!value || typeof value !== "object") {
    return { reason: "Slack full app manifest must contain only JSON-compatible values." };
  }
  if (seen.has(value)) {
    return { reason: "Slack full app manifest must be acyclic JSON." };
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = validateJsonCompatible(item, seen);
      if (nested.reason) return nested;
    }
    seen.delete(value);
    return {};
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    return { reason: "Slack full app manifest must contain only plain JSON objects." };
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    const nested = validateJsonCompatible(item, seen);
    if (nested.reason) return nested;
  }
  seen.delete(value);
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactCandidateConfig(candidate: ExternalChannelSubscriptionCandidate): Record<string, unknown> {
  const out: Record<string, unknown> = {
    subscriptionCredentialReadiness: buildSubscriptionCredentialReadiness(candidate),
  };
  for (const [key, value] of Object.entries(candidate)) {
    if (key === "approval") {
      out.approval = candidate.approval
        ? {
            approvedBy: typeof candidate.approval.approvedBy === "string" ? sanitizeText(candidate.approval.approvedBy) : "missing",
            approvedAt: typeof candidate.approval.approvedAt === "string" ? sanitizeText(candidate.approval.approvedAt) : undefined,
            signature: "[REDACTED]",
          }
        : undefined;
      continue;
    }
    if (key === "callbackUrl" && typeof value === "string") {
      out.callbackUrl = redactUrl(value);
      continue;
    }
    if (key === "signingSecretRef" || key === "publicKeyRef") {
      out[key] = value ? "[REDACTED_REF]" : "missing";
      continue;
    }
    if (key === "manifest" && normalizeChannelId(candidate.channelId) === "slack") {
      out.slackManifestInspection = summarizeSlackManifestForApproval(candidate);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = value ? "[REDACTED]" : "missing";
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => typeof item === "string" ? sanitizeText(item) : item);
    } else if (typeof value === "string") {
      out[key] = sanitizeText(value);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

function buildSubscriptionCredentialReadiness(candidate: ExternalChannelSubscriptionCandidate): Record<string, unknown> {
  const channelId = normalizeChannelId(candidate.channelId);
  const credentialRefLabel = channelId === "discord" ? "discord_public_key_ref" : "slack_signing_secret_ref";
  const requiredCredentialRefs = [credentialRefLabel];
  const refStatus = inspectSubscriptionCredentialRef(channelId, candidate, credentialRefLabel);
  const hostSuppliedRuntimeSecrets = channelId === "discord"
    ? ["discord_bot_token"]
    : ["slack_app_configuration_token"];
  const hostSuppliedRuntimeConfig = channelId === "discord"
    ? []
    : ["slack_full_app_manifest"];
  const missingCredentialRefs = refStatus.status === "missing" ? [credentialRefLabel] : [];
  const invalidCredentialRefs = refStatus.status === "invalid" ? [credentialRefLabel] : [];
  const presentCredentialRefs = refStatus.status === "present" ? [credentialRefLabel] : [];

  return {
    channelId: channelId === "discord" ? "discord" : "slack",
    status: invalidCredentialRefs.length > 0
      ? "invalid_credential_refs"
      : missingCredentialRefs.length > 0
        ? "missing_credential_refs"
        : "ready_for_host_credential_setup",
    requiredCredentialRefs,
    presentCredentialRefs,
    missingCredentialRefs,
    invalidCredentialRefs,
    hostSuppliedRuntimeSecrets,
    hostSuppliedRuntimeConfig,
    credentialPersistenceCreated: false,
    credentialValuesPersisted: false,
    defaultLiveInboundDeliveryEnabled: false,
    handoffChecklist: [
      "exact_operator_approval_signature",
      "operator_supplies_credentials_to_host_executor_outside_durable_colony_state",
      "host_executor_uses_credentials_for_one_approved_vendor_mutation",
      "no_colony_credential_persistence_or_default_live_delivery",
    ],
  };
}

function inspectSubscriptionCredentialRef(
  channelId: string,
  candidate: ExternalChannelSubscriptionCandidate,
  _label: string,
): { status: "present" | "missing" | "invalid" } {
  const raw = channelId === "discord" ? candidate.publicKeyRef : candidate.signingSecretRef;
  if (!raw?.trim()) {
    return { status: "missing" };
  }
  const validated = validateSigningSecretRef(channelId, candidate);
  return validated.reason ? { status: "invalid" } : { status: "present" };
}

function summarizeSlackManifestForApproval(candidate: ExternalChannelSubscriptionCandidate): Record<string, unknown> {
  const normalized = normalizeSlackManifest(candidate.manifest);
  if (normalized.reason || !normalized.value) {
    return {
      present: Boolean(candidate.manifest),
      serializable: false,
      reason: normalized.reason ?? "Slack manifest unavailable.",
    };
  }
  const manifest = normalized.value;
  const settings = isRecord(manifest.settings) ? manifest.settings : {};
  const features = isRecord(manifest.features) ? manifest.features : {};
  const oauthConfig = isRecord(manifest.oauth_config) ? manifest.oauth_config : {};
  const scopes = isRecord(oauthConfig.scopes) && Array.isArray(oauthConfig.scopes.bot)
    ? oauthConfig.scopes.bot.filter((scope): scope is string => typeof scope === "string").map((scope) => sanitizeText(scope)).sort()
    : [];
  const scopeReadiness = inspectSlackManifestScopeReadiness(manifest, candidate.eventTypes ?? [...DEFAULT_EVENT_TYPES.slack]);
  const eventSubscriptions = isRecord(settings.event_subscriptions) ? settings.event_subscriptions : {};
  return {
    present: true,
    serializable: true,
    fullManifestBoundInApproval: true,
    plannedHostManifestUpdateSubmission: true,
    mutationScope: [
      "settings.event_subscriptions.request_url",
      "settings.event_subscriptions.bot_events",
    ],
    handoffChecklist: [
      "exact_operator_approval_signature",
      "host_supplies_app_configuration_token",
      "host_supplies_full_slack_manifest",
      "one_injected_apps_manifest_update_call",
      "no_credential_persistence_or_background_retry_worker",
    ],
    defaultRetryMode: "manual_operator_reinvoke",
    optionalRetryMode: "host_inline_bounded",
    maxForegroundAttempts: 2,
    plannedBotEvents: (candidate.eventTypes ?? [...DEFAULT_EVENT_TYPES.slack]).map((eventType) => sanitizeText(eventType)),
    scopeCompatibility: scopeReadiness.ready ? "ready" : "missing_required_scope",
    requiredBotScopes: scopeReadiness.requiredBotScopes,
    missingBotScopes: scopeReadiness.missingBotScopes,
    topLevelKeys: summarizeKeyList(manifest),
    settingsKeys: summarizeKeyList(settings),
    featureKeys: summarizeKeyList(features),
    oauthBotScopes: scopes,
    existingEventSubscriptionKeys: summarizeKeyList(eventSubscriptions),
  };
}

function inspectSlackManifestScopeReadiness(
  manifest: Record<string, unknown>,
  eventTypes: readonly string[],
): { ready: boolean; requiredBotScopes: string[]; missingBotScopes: string[]; reason?: string } {
  const oauthConfig = isRecord(manifest.oauth_config) ? manifest.oauth_config : {};
  const declaredScopes = isRecord(oauthConfig.scopes) && Array.isArray(oauthConfig.scopes.bot)
    ? oauthConfig.scopes.bot.filter((scope): scope is string => typeof scope === "string").map((scope) => scope.trim()).filter(Boolean)
    : [];
  const declared = new Set(declaredScopes);
  const requiredBotScopes = Array.from(new Set(eventTypes.flatMap((eventType) => SLACK_EVENT_REQUIRED_BOT_SCOPES[eventType] ?? []))).sort();
  const missingBotScopes = requiredBotScopes.filter((scope) => !declared.has(scope));
  if (missingBotScopes.length > 0) {
    return {
      ready: false,
      requiredBotScopes,
      missingBotScopes,
      reason: `Slack manifest is missing required bot scope${missingBotScopes.length === 1 ? "" : "s"} for approved Events API subscriptions: ${missingBotScopes.join(", ")}.`,
    };
  }
  return { ready: true, requiredBotScopes, missingBotScopes: [] };
}

function summarizeKeyList(record: Record<string, unknown>): string[] {
  return Object.keys(record).map((key) => sanitizeManifestKey(key)).sort();
}

function sanitizeManifestKey(key: string): string {
  const sanitized = sanitizeText(key);
  return SECRET_KEY_PATTERN.test(sanitized) ? "[REDACTED_KEY]" : sanitized;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}/[REDACTED_PATH]`;
  } catch {
    return sanitizeText(value);
  }
}

function sanitizeText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]")
    .replace(SUBSCRIPTION_SIGNATURE_PATTERN, "channel-subscription:[REDACTED]")
    .replace(SECRET_VALUE_REDACT_PATTERN, "[REDACTED]");
}

function isLocalOrPrivateHost(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.+$/g, "");
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
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("169.254.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function isSupportedSubscriptionChannel(value: string): boolean {
  return value === "slack" || value === "discord";
}

function isSafeSlackIdentifier(value: string, prefix: string): boolean {
  return value.startsWith(prefix) && /^[A-Za-z0-9_-]{3,40}$/.test(value);
}

function isDiscordSnowflake(value: string): boolean {
  return /^[0-9]{17,20}$/.test(value);
}

function readCanonicalAppId(candidate: ExternalChannelSubscriptionCandidate): string | undefined {
  return normalizeChannelId(candidate.channelId) === "discord" ? candidate.applicationId ?? candidate.appId : candidate.appId;
}

function readCanonicalWorkspaceId(candidate: ExternalChannelSubscriptionCandidate): string | undefined {
  return normalizeChannelId(candidate.channelId) === "discord" ? candidate.guildId ?? candidate.workspaceId : candidate.workspaceId;
}

function readCanonicalSigningRef(candidate: ExternalChannelSubscriptionCandidate): string | undefined {
  return normalizeChannelId(candidate.channelId) === "discord" ? candidate.publicKeyRef ?? candidate.signingSecretRef : candidate.signingSecretRef;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function displayNameForChannel(channelId: string): string {
  const normalized = normalizeChannelId(channelId);
  if (normalized === "discord") return "Discord";
  if (normalized === "slack") return "Slack";
  return normalized || "Unknown";
}

function setupLabelForChannel(channelId: string): string {
  const normalized = normalizeChannelId(channelId);
  if (normalized === "discord") return "Discord Interactions setup";
  if (normalized === "slack") return "Slack subscription setup";
  return `${displayNameForChannel(channelId)} subscription setup`;
}

function normalizeChannelId(value: string): string {
  return String(value).trim().toLowerCase();
}
