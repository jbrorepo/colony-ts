import type { GatewayBasicCommandPayload } from "./gateway-basic";
import type {
  ChannelAuthStatus,
  ChannelAdapterContractStatus,
  ChannelDeliveryRecord,
  ChannelPairingStatus,
  ChannelRegistry,
  ChannelRegistryStatus,
  ChannelSessionBridgeStatus,
  ExternalChannelAdapterRegistrationPlan,
  ExternalChannelSubscriptionPlan,
  ExternalChannelWebhookRegistrationPlan,
} from "./channel";
import { listChannelAdapterContractStatus } from "./channel";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayChannelsContext {
  registry?: ChannelRegistry | null;
  status?: ChannelRegistryStatus | null;
  recentDeliveries?: ChannelDeliveryRecord[];
  auth?: ChannelAuthStatus | null;
  pairings?: ChannelPairingStatus | null;
  sessions?: ChannelSessionBridgeStatus | null;
  contracts?: ChannelAdapterContractStatus[] | null;
  externalAdapters?: ExternalChannelAdapterRegistrationPlan[] | null;
  externalWebhooks?: ExternalChannelWebhookRegistrationPlan[] | null;
  externalSubscriptions?: ExternalChannelSubscriptionPlan[] | null;
}

export function buildChannelsCommandPayload(
  args: string[],
  channels?: GatewayChannelsContext | null,
): GatewayBasicCommandPayload {
  const normalizedArgs = normalizeChannelViewArgs(args);
  const view = normalizeChannelViewInput(normalizedArgs[0] ?? "overview");
  if (!["overview", "status", "deliveries", "auth", "sessions", "contracts", "external"].includes(view)) {
    return {
      output: `Unknown channels view '${view}'.\n\nUsage: /channels [status|deliveries|auth|sessions|contracts|external]`,
      isError: true,
      data: { action: "channels_usage" },
    };
  }
  if (view !== "external" && normalizedArgs.length > 1) {
    return {
      output: "Usage: /channels [status|deliveries|auth|sessions|contracts|external]",
      isError: true,
      data: { action: "channels_usage" },
    };
  }

  const status = channels?.status ?? channels?.registry?.status() ?? emptyStatus();
  const recentDeliveries = channels?.recentDeliveries ?? channels?.registry?.recentDeliveries(10) ?? [];

  if (view === "auth") {
    return {
      output: renderChannelAuth(channels?.auth ?? null, channels?.pairings ?? null),
      data: {
        action: "channels_auth",
        channelCount: channels?.auth?.channels.length ?? 0,
        approvedPairingCount: channels?.pairings?.approvedCount ?? 0,
      },
    };
  }

  if (view === "deliveries") {
    return {
      output: renderChannelDeliveries(recentDeliveries),
      data: { action: "channels_deliveries", deliveryCount: recentDeliveries.length },
    };
  }

  if (view === "sessions") {
    const sessions = channels?.sessions ?? emptySessionStatus();
    return {
      output: renderChannelSessions(sessions),
      data: {
        action: "channels_sessions",
        routeCount: sessions.routeCount,
        replyDeliveryCount: sessions.replyDeliveryCount,
        failedTurnCount: sessions.failedTurnCount,
      },
    };
  }

  if (view === "contracts") {
    const contracts = channels?.contracts ?? listChannelAdapterContractStatus();
    return {
      output: renderChannelContracts(contracts),
      data: {
        action: "channels_contracts",
        contractCount: contracts.length,
        implementedCount: contracts.filter((contract) => contract.adapterImplemented).length,
      },
    };
  }

  if (view === "external") {
    const externalAdapters = channels?.externalAdapters ?? [];
    const externalWebhooks = channels?.externalWebhooks ?? [];
    const externalSubscriptions = channels?.externalSubscriptions ?? [];
    const subcommand = normalizeChannelViewInput(normalizedArgs[1] ?? "");
    if (subcommand) {
      return buildExternalSubcommand(normalizedArgs.slice(1), externalAdapters, externalWebhooks, externalSubscriptions);
    }
    return {
      output: renderExternalAdapters(externalAdapters, externalWebhooks, externalSubscriptions),
      data: {
        action: "channels_external",
        candidateCount: externalAdapters.length,
        acceptedCount: externalAdapters.filter((adapter) => adapter.accepted).length,
        webhookCandidateCount: externalWebhooks.length,
        webhookAcceptedCount: externalWebhooks.filter((webhook) => webhook.accepted).length,
        subscriptionCandidateCount: externalSubscriptions.length,
        subscriptionAcceptedCount: externalSubscriptions.filter((subscription) => subscription.accepted).length,
      },
    };
  }

  return {
    output: renderChannelsOverview(status),
    data: {
      action: "channels_status",
      channelCount: status.channels.length,
      enabledCount: status.enabledCount,
      connectedCount: status.connectedCount,
    },
  };
}

function renderChannelsOverview(status: ChannelRegistryStatus): string {
  const lines = ["Channels:", ""];
  lines.push(`Configured: ${status.channels.length}`);
  lines.push(`Enabled: ${status.enabledCount}`);
  lines.push(`Connected: ${status.connectedCount}`);
  lines.push(`Deliveries tracked: ${status.deliveryCount}`);
  lines.push("");

  if (status.channels.length === 0) {
    lines.push("No channel adapters are configured in this runtime snapshot.");
  } else {
    for (const channel of status.channels) {
      const enabled = channel.enabled ? "enabled" : "disabled";
      const connected = channel.connected ? "connected" : "disconnected";
      lines.push(
        `- ${channel.channelId} (${channel.displayName}) | ${enabled} | ${connected} | capabilities ${formatList(channel.capabilities)} | sent ${channel.sentCount ?? 0}`,
      );
    }
  }

  lines.push("");
  lines.push("Views: /channels status | /channels deliveries | /channels auth | /channels sessions | /channels contracts | /channels external");
  return lines.join("\n");
}

function renderChannelDeliveries(deliveries: ChannelDeliveryRecord[]): string {
  const lines = ["Channel Deliveries:", ""];
  if (deliveries.length === 0) {
    lines.push("No channel deliveries are visible in this runtime snapshot.");
  } else {
    for (const delivery of deliveries) {
      const delivered = delivery.deliveredAt ? ` | delivered ${delivery.deliveredAt}` : "";
      const error = delivery.error ? ` | error ${delivery.error}` : "";
      lines.push(
        `${delivery.deliveryId} | ${delivery.status} | ${delivery.channel} | ${delivery.routeKey} | ${delivery.textLength} chars | created ${delivery.createdAt}${delivered}${error}`,
      );
    }
  }
  lines.push("");
  lines.push("Inspect: /channels");
  return lines.join("\n");
}

function renderChannelAuth(
  auth: ChannelAuthStatus | null,
  pairings: ChannelPairingStatus | null,
): string {
  const lines = ["Channel Auth:", ""];
  const channels = auth?.channels ?? [];
  lines.push(`Configured auth channels: ${channels.length}`);
  lines.push(`Pairings: ${pairings?.approvedCount ?? 0} approved | ${pairings?.pendingCount ?? 0} pending`);
  lines.push("");

  if (channels.length === 0) {
    lines.push("No channel auth policies are visible in this runtime snapshot.");
  } else {
    for (const channel of channels) {
      lines.push(
        [
          `- ${channel.channelId}`,
          `webhook auth: ${channel.webhookAuthRequired ? "required" : "not configured"}`,
          `DM policy: ${channel.dmPolicy}`,
          `group policy: ${channel.groupPolicy}`,
          `allowlist entries: ${channel.allowFromCount}`,
        ].join(" | "),
      );
    }
  }

  if ((pairings?.approved.length ?? 0) > 0) {
    lines.push("");
    lines.push("Approved pairings:");
    for (const pairing of pairings?.approved ?? []) {
      lines.push(`- ${pairing.channel} | ${pairing.senderId} | approved by ${pairing.approvedBy} at ${pairing.approvedAt}`);
    }
  }

  if ((pairings?.pending.length ?? 0) > 0) {
    lines.push("");
    lines.push("Pending pairings:");
    for (const pairing of pairings?.pending ?? []) {
      const expiry = pairing.expiresAt ? ` | expires ${pairing.expiresAt}` : "";
      lines.push(`- ${pairing.channel} | ${pairing.senderId} | requested by ${pairing.requestedBy}${expiry}`);
    }
  }

  lines.push("");
  lines.push("Inspect: /channels | /channels deliveries");
  return lines.join("\n");
}

function renderChannelSessions(status: ChannelSessionBridgeStatus): string {
  const lines = ["Channel Sessions:", ""];
  lines.push(`Routes: ${status.routeCount}`);
  lines.push(`Reply deliveries: ${status.replyDeliveryCount}`);
  lines.push(`Failed turns: ${status.failedTurnCount}`);
  lines.push("");

  if (status.routes.length === 0) {
    lines.push("No channel sessions are visible in this runtime snapshot.");
  } else {
    lines.push("Routes:");
    for (const route of status.routes) {
      const lastReply = route.lastReplyDeliveryId ? ` | last reply ${route.lastReplyDeliveryId}` : "";
      const lastError = route.lastError ? ` | last error ${route.lastError}` : "";
      lines.push(
        `- ${route.sessionId} | ${route.channel} | ${route.routeKey} | messages ${route.messageCount} | updated ${route.updatedAt}${lastReply}${lastError}`,
      );
    }
  }

  if (status.recentTurns.length > 0) {
    lines.push("");
    lines.push("Recent turns:");
    for (const turn of status.recentTurns) {
      const delivery = turn.replyDelivery ? ` | delivery ${turn.replyDelivery.deliveryId}:${turn.replyDelivery.status}` : "";
      const error = turn.error ? ` | error ${turn.error}` : "";
      lines.push(
        `- ${turn.turnId} | ${turn.status} | ${turn.sessionId} | inbound ${turn.inboundMessageId}${delivery}${error}`,
      );
    }
  }

  lines.push("");
  lines.push("Inspect: /channels | /channels deliveries | /channels auth");
  return lines.join("\n");
}

function renderChannelContracts(contracts: ChannelAdapterContractStatus[]): string {
  const lines = ["Channel Contracts:", ""];
  lines.push("No real external channel adapters are enabled by these fixtures.");
  lines.push("These are contract-only Slack/Discord/Telegram-style semantics for future adapters.");
  lines.push("");

  if (contracts.length === 0) {
    lines.push("No channel adapter contracts are visible in this runtime snapshot.");
  } else {
    for (const contract of contracts) {
      const capabilities = contractCapabilities(contract);
      const routes = contract.routeSemantics
        .map((route) => {
          const extras = [
            route.supportsThread ? "thread" : "",
            route.supportsTopic ? "topic" : "",
          ].filter(Boolean).join("+");
          return `${route.targetKind}:${route.deliveryAddressField}${extras ? `:${extras}` : ""}`;
        })
        .join(", ");
      lines.push(
        `- ${contract.channelId} (${contract.displayName}) | contract-only | adapter shipped: no | network: no | ${capabilities} | routes ${routes} | auth in ${contract.auth.inbound.join(", ")} | retries ${contract.retryPolicy.supported ? contract.retryPolicy.maxAttempts : 0}`,
      );
    }
  }

  lines.push("");
  lines.push("Inspect: /channels | /channels auth | /channels sessions");
  return lines.join("\n");
}

function renderExternalAdapters(
  plans: ExternalChannelAdapterRegistrationPlan[],
  webhookPlans: ExternalChannelWebhookRegistrationPlan[] = [],
  subscriptionPlans: ExternalChannelSubscriptionPlan[] = [],
): string {
  const lines = ["External Channel Adapter Gates:", ""];
  lines.push("Read-only view. Adapter registration still requires exact operator approval and does not mutate runtime state.");
  lines.push("No package install, sidecar startup, registry fetch, listener startup, or live credential setup is performed by this view.");
  lines.push("");

  if (plans.length === 0) {
    lines.push("No external adapter registration plans are visible in this runtime snapshot.");
  } else {
    for (const plan of plans) {
      const approval = plan.accepted ? "approval accepted" : "approval required";
      const reason = plan.reason ? ` | reason ${sanitizeLine(plan.reason)}` : "";
      lines.push(`- ${plan.channelId} (${plan.displayName}) | ${approval}${reason}`);
      lines.push(`  config ${formatRedactedRecord(plan.redactedConfig)}`);
      if (plan.requiredSignature) {
        lines.push(`  required signature: ${redactApprovalSignature(plan.requiredSignature)}`);
      }
    }
  }

  lines.push("");
  lines.push("External Webhook Setup Gates:");
  if (webhookPlans.length === 0) {
    lines.push("No external webhook setup plans are visible in this runtime snapshot.");
  } else {
    for (const plan of webhookPlans) {
      const approval = plan.accepted ? "approval accepted" : "approval required";
      const reason = plan.reason ? ` | reason ${sanitizeLine(plan.reason)}` : "";
      lines.push(`- ${plan.channelId} (${plan.displayName}) | ${approval}${reason}`);
      lines.push(`  config ${formatRedactedRecord(plan.redactedConfig)}`);
      if (plan.requiredSignature) {
        lines.push(`  required signature: ${redactApprovalSignature(plan.requiredSignature)}`);
      }
    }
  }

  lines.push("");
  lines.push("External Subscription Setup Gates:");
  if (subscriptionPlans.length === 0) {
    lines.push("No external subscription setup plans are visible in this runtime snapshot.");
  } else {
    for (const plan of subscriptionPlans) {
      const approval = plan.accepted ? "approval accepted" : "approval required";
      const reason = plan.reason ? ` | reason ${sanitizeLine(plan.reason)}` : "";
      lines.push(`- ${plan.channelId} (${plan.displayName}) | ${approval}${reason}`);
      lines.push(`  config ${formatRedactedRecord(plan.redactedConfig)}`);
      if (plan.requiredSignature) {
        lines.push(`  required signature: ${redactApprovalSignature(plan.requiredSignature)}`);
      }
    }
  }

  lines.push("");
  lines.push("Request Telegram webhook setup: /channels external webhook telegram <approval-signature>");
  lines.push("Request Slack subscription setup: /channels external subscribe slack <approval-signature>");
  lines.push("Request Discord Interactions setup: /channels external subscribe discord <approval-signature>");
  lines.push("Inspect: /channels contracts | /channels auth | /channels sessions");
  return lines.join("\n");
}

function buildExternalSubcommand(
  args: string[],
  adapterPlans: ExternalChannelAdapterRegistrationPlan[],
  webhookPlans: ExternalChannelWebhookRegistrationPlan[],
  subscriptionPlans: ExternalChannelSubscriptionPlan[],
): GatewayBasicCommandPayload {
  const subcommand = (args[0] ?? "").toLowerCase();
  if (subcommand === "register") {
    return buildExternalAdapterSubcommand(args, adapterPlans);
  }
  if (subcommand === "webhook") {
    return buildExternalWebhookSubcommand(args, webhookPlans);
  }
  if (subcommand === "subscribe") {
    return buildExternalSubscriptionSubcommand(args, subscriptionPlans);
  }
  return {
      output: "Usage: /channels external register <channel> <approval-signature> | /channels external webhook telegram <approval-signature> | /channels external subscribe slack <approval-signature> | /channels external subscribe discord <approval-signature>",
    isError: true,
    data: { action: "channels_external_usage" },
  };
}

function buildExternalAdapterSubcommand(
  args: string[],
  plans: ExternalChannelAdapterRegistrationPlan[],
): GatewayBasicCommandPayload {
  const subcommand = (args[0] ?? "").toLowerCase();
  if (subcommand !== "register" || args.length !== 3) {
    return {
      output: "Usage: /channels external register <channel> <approval-signature>",
      isError: true,
      data: { action: "channels_external_usage" },
    };
  }

  const channelId = normalizeChannelId(args[1] ?? "");
  const approvalSignature = args[2] ?? "";
  if (!isSupportedExternalChannel(channelId)) {
    return {
      output: "External adapter registration request rejected: unsupported external channel.",
      isError: true,
      data: { action: "channels_external_register_rejected" },
    };
  }
  if (!channelId || !approvalSignature.startsWith(`channel-adapter:${channelId}:`)) {
    return {
      output: "External adapter registration request rejected: channel id and approval signature do not match.",
      isError: true,
      data: { action: "channels_external_register_rejected", channelId },
    };
  }

  const matchingPlans = plans.filter((plan) => normalizeChannelId(plan.channelId) === channelId);
  const acceptedPlan = matchingPlans.find((plan) => plan.accepted);
  if (matchingPlans.filter((plan) => plan.accepted).length > 1) {
    return {
      output: `External adapter registration request rejected: multiple accepted ${channelId} plans are visible in this runtime snapshot.`,
      isError: true,
      data: { action: "channels_external_register_rejected", channelId },
    };
  }
  if (!acceptedPlan) {
    return {
      output: matchingPlans.length > 0
        ? `External adapter registration request rejected: ${channelId} plan is not approval accepted.`
        : `External adapter registration request rejected: no accepted ${channelId} plan is visible in this runtime snapshot.`,
      isError: true,
      data: { action: "channels_external_register_rejected", channelId },
    };
  }

  if (acceptedPlan.requiredSignature !== approvalSignature) {
    return {
      output: `External adapter registration request rejected: ${channelId} approval signature does not match the accepted plan.`,
      isError: true,
      data: { action: "channels_external_register_rejected", channelId },
    };
  }

  return {
    output: [
      "External adapter registration request staged.",
      `Channel: ${channelId}`,
      `Approval signature: ${redactApprovalSignature(approvalSignature)}`,
      "Execution: host-mediated; this gateway command does not register adapters, enable credentials, start listeners, or contact vendor APIs.",
    ].join("\n"),
    data: {
      action: "channels_external_register_request",
      channelId,
      approvalSignatureRedacted: redactApprovalSignature(approvalSignature),
    },
    action: {
      kind: "register_external_channel_adapter",
      channelId,
    },
  };
}

function buildExternalWebhookSubcommand(
  args: string[],
  plans: ExternalChannelWebhookRegistrationPlan[],
): GatewayBasicCommandPayload {
  if (args.length !== 3) {
    return {
      output: "Usage: /channels external webhook telegram <approval-signature>",
      isError: true,
      data: { action: "channels_external_webhook_usage" },
    };
  }

  const channelId = normalizeChannelId(args[1] ?? "");
  const approvalSignature = args[2] ?? "";
  if (channelId !== "telegram") {
    return {
      output: "External webhook setup request rejected: only Telegram webhook setup is supported in this slice.",
      isError: true,
      data: {
        action: "channels_external_webhook_rejected",
        ...(safeChannelIdForData(channelId) ? { channelId } : {}),
      },
    };
  }
  if (!approvalSignature.startsWith("channel-webhook:telegram:")) {
    return {
      output: "External webhook setup request rejected: channel id and approval signature do not match.",
      isError: true,
      data: { action: "channels_external_webhook_rejected", channelId },
    };
  }

  const matchingPlans = plans.filter((plan) => normalizeChannelId(plan.channelId) === channelId);
  const acceptedPlans = matchingPlans.filter((plan) => plan.accepted);
  if (acceptedPlans.length > 1) {
    return {
      output: "External webhook setup request rejected: multiple accepted Telegram webhook plans are visible in this runtime snapshot.",
      isError: true,
      data: { action: "channels_external_webhook_rejected", channelId },
    };
  }
  const [acceptedPlan] = acceptedPlans;
  if (!acceptedPlan) {
    return {
      output: matchingPlans.length > 0
        ? "External webhook setup request rejected: Telegram webhook plan is not approval accepted."
        : "External webhook setup request rejected: no accepted Telegram webhook plan is visible in this runtime snapshot.",
      isError: true,
      data: { action: "channels_external_webhook_rejected", channelId },
    };
  }
  if (acceptedPlan.requiredSignature !== approvalSignature) {
    return {
      output: "External webhook setup request rejected: Telegram webhook approval signature does not match the accepted plan.",
      isError: true,
      data: { action: "channels_external_webhook_rejected", channelId },
    };
  }

  return {
    output: [
      "Telegram webhook setup request staged.",
      "Channel: telegram",
      `Approval signature: ${redactApprovalSignature(approvalSignature)}`,
      "Execution: host-mediated; this gateway command does not start listeners, register adapters, persist credentials, mutate auth policy, run retry workers, or contact vendor APIs directly.",
    ].join("\n"),
    data: {
      action: "channels_external_webhook_request",
      channelId,
      approvalSignatureRedacted: redactApprovalSignature(approvalSignature),
    },
    action: {
      kind: "setup_external_channel_webhook",
      channelId,
    },
  };
}

function buildExternalSubscriptionSubcommand(
  args: string[],
  plans: ExternalChannelSubscriptionPlan[],
): GatewayBasicCommandPayload {
  if (args.length !== 3) {
    return {
      output: "Usage: /channels external subscribe slack <approval-signature> | /channels external subscribe discord <approval-signature>",
      isError: true,
      data: { action: "channels_external_subscription_usage" },
    };
  }

  const channelId = normalizeChannelId(args[1] ?? "");
  const approvalSignature = args[2] ?? "";
  if (channelId !== "slack" && channelId !== "discord") {
    return {
      output: "External subscription setup request rejected: only Slack subscription setup or Discord Interactions setup is supported in this slice.",
      isError: true,
      data: {
        action: "channels_external_subscription_rejected",
        ...(safeChannelIdForData(channelId) ? { channelId } : {}),
      },
    };
  }
  if (!approvalSignature.startsWith(`channel-subscription:${channelId}:`)) {
    return {
      output: "External subscription setup request rejected: channel id and approval signature do not match.",
      isError: true,
      data: { action: "channels_external_subscription_rejected", channelId },
    };
  }

  const matchingPlans = plans.filter((plan) => normalizeChannelId(plan.channelId) === channelId);
  const acceptedPlans = matchingPlans.filter((plan) => plan.accepted);
  if (acceptedPlans.length > 1) {
    return {
      output: `External subscription setup request rejected: multiple accepted ${subscriptionPlanLabelForChannel(channelId)} plans are visible in this runtime snapshot.`,
      isError: true,
      data: { action: "channels_external_subscription_rejected", channelId },
    };
  }
  const [acceptedPlan] = acceptedPlans;
  if (!acceptedPlan) {
    return {
      output: matchingPlans.length > 0
        ? `External subscription setup request rejected: ${subscriptionPlanLabelForChannel(channelId)} plan is not approval accepted.`
        : `External subscription setup request rejected: no accepted ${subscriptionPlanLabelForChannel(channelId)} plan is visible in this runtime snapshot.`,
      isError: true,
      data: { action: "channels_external_subscription_rejected", channelId },
    };
  }
  if (acceptedPlan.requiredSignature !== approvalSignature) {
    return {
      output: `External subscription setup request rejected: ${subscriptionPlanLabelForChannel(channelId)} approval signature does not match the accepted plan.`,
      isError: true,
      data: { action: "channels_external_subscription_rejected", channelId },
    };
  }

  return {
    output: [
      `${subscriptionSetupLabelForChannel(channelId)} request staged.`,
      `Channel: ${channelId}`,
      `Approval signature: ${redactApprovalSignature(approvalSignature)}`,
      ...(channelId === "slack" ? [
        "Retry UX: default manual operator reinvoke; optional host_inline_bounded foreground retry is available to host executors.",
        "No retry worker or retry schedule is created by this gateway command.",
      ] : []),
      "Credential setup: host-supplied at execution time; Colony persists no credential values.",
      `Execution: host-mediated; this gateway command does not ${subscriptionForbiddenClaimsForChannel(channelId)}.`,
    ].join("\n"),
    data: {
      action: "channels_external_subscription_request",
      channelId,
      approvalSignatureRedacted: redactApprovalSignature(approvalSignature),
    },
    action: {
      kind: "setup_external_channel_subscription",
      channelId,
    },
  };
}

function displayNameForChannel(channelId: string): string {
  if (channelId === "discord") return "Discord";
  if (channelId === "slack") return "Slack";
  if (channelId === "telegram") return "Telegram";
  return channelId || "Unknown";
}

function subscriptionSetupLabelForChannel(channelId: string): string {
  if (channelId === "discord") return "Discord Interactions setup";
  if (channelId === "slack") return "Slack subscription setup";
  return `${displayNameForChannel(channelId)} subscription setup`;
}

function subscriptionPlanLabelForChannel(channelId: string): string {
  if (channelId === "discord") return "Discord Interactions setup";
  if (channelId === "slack") return "Slack subscription";
  return `${displayNameForChannel(channelId)} subscription`;
}

function subscriptionForbiddenClaimsForChannel(channelId: string): string {
  if (channelId === "discord") {
    return "create Discord apps, register interaction endpoints or slash commands directly, persist credentials, start listeners, provide public hosting, upload media, run retries, enable privileged Gateway intents, or enable default live inbound delivery";
  }
  return `create ${displayNameForChannel(channelId)} apps, register subscriptions directly, persist credentials, start listeners, provide public hosting, upload media, run retries, enable privileged intents, mutate slash commands, or enable default live inbound delivery`;
}

function contractCapabilities(contract: ChannelAdapterContractStatus): string {
  const enabled = [
    contract.capabilities.threading ? "threading" : "",
    contract.capabilities.mentions ? "mentions" : "",
    contract.capabilities.reactions ? "reactions" : "",
    contract.capabilities.attachments ? "attachments" : "",
    contract.capabilities.deliveryRetries ? "retries" : "",
    "redaction",
  ].filter(Boolean);
  return `capabilities ${enabled.join(", ")}`;
}

function emptyStatus(): ChannelRegistryStatus {
  return {
    channels: [],
    enabledCount: 0,
    connectedCount: 0,
    deliveryCount: 0,
  };
}

function emptySessionStatus(): ChannelSessionBridgeStatus {
  return {
    routeCount: 0,
    replyDeliveryCount: 0,
    failedTurnCount: 0,
    routes: [],
    recentTurns: [],
  };
}

function formatList(values?: string[]): string {
  return values && values.length > 0 ? values.join(", ") : "none";
}

function formatRedactedRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${sanitizeLine(key)}=${
      key === "slackManifestInspection" && isRecord(value)
        ? formatSlackManifestInspection(value)
        : key === "subscriptionCredentialReadiness" && isRecord(value)
          ? formatSubscriptionCredentialReadiness(value)
          : formatRecordValue(value)
    }`);
  return entries.length > 0 ? entries.join(", ") : "none";
}

function formatRecordValue(value: unknown): string {
  if (typeof value === "string") return sanitizeLine(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (value && typeof value === "object") return "{redacted-object}";
  return "unknown";
}

function formatSlackManifestInspection(value: Record<string, unknown>): string {
  const fields = [
    ["fullManifestBoundInApproval", value.fullManifestBoundInApproval],
    ["plannedHostManifestUpdateSubmission", value.plannedHostManifestUpdateSubmission],
    ["mutationScope", formatInspectionArray(value.mutationScope)],
    ["handoffChecklist", formatInspectionArray(value.handoffChecklist)],
    ["defaultRetryMode", value.defaultRetryMode],
    ["optionalRetryMode", value.optionalRetryMode],
    ["maxForegroundAttempts", value.maxForegroundAttempts],
    ["plannedBotEvents", formatInspectionArray(value.plannedBotEvents)],
    ["scopeCompatibility", value.scopeCompatibility],
    ["requiredBotScopes", formatInspectionArray(value.requiredBotScopes)],
    ["missingBotScopes", formatInspectionArray(value.missingBotScopes)],
    ["oauthBotScopes", formatInspectionArray(value.oauthBotScopes)],
    ["topLevelKeys", formatInspectionArray(value.topLevelKeys)],
    ["settingsKeys", formatInspectionArray(value.settingsKeys)],
    ["featureKeys", formatInspectionArray(value.featureKeys)],
    ["existingEventSubscriptionKeys", formatInspectionArray(value.existingEventSubscriptionKeys)],
  ]
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => `${key}:${formatRecordValue(item)}`);
  return `{${fields.join("; ")}}`;
}

function formatSubscriptionCredentialReadiness(value: Record<string, unknown>): string {
  const fields = [
    ["channelId", value.channelId],
    ["status", value.status],
    ["requiredCredentialRefs", formatInspectionArray(value.requiredCredentialRefs)],
    ["presentCredentialRefs", formatInspectionArray(value.presentCredentialRefs)],
    ["missingCredentialRefs", formatInspectionArray(value.missingCredentialRefs)],
    ["invalidCredentialRefs", formatInspectionArray(value.invalidCredentialRefs)],
    ["hostSuppliedRuntimeSecrets", formatInspectionArray(value.hostSuppliedRuntimeSecrets)],
    ["hostSuppliedRuntimeConfig", formatInspectionArray(value.hostSuppliedRuntimeConfig)],
    ["credentialPersistenceCreated", value.credentialPersistenceCreated],
    ["credentialValuesPersisted", value.credentialValuesPersisted],
    ["defaultLiveInboundDeliveryEnabled", value.defaultLiveInboundDeliveryEnabled],
    ["handoffChecklist", formatInspectionArray(value.handoffChecklist)],
  ]
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => `${key}:${formatRecordValue(item)}`);
  return `{${fields.join("; ")}}`;
}

function formatInspectionArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return `[${value.map((item) => typeof item === "string" ? sanitizeLine(item) : formatRecordValue(item)).join("|")}]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactApprovalSignature(value: string): string {
  const parts = value.split(":");
  if (parts.length < 3) return "[REDACTED]";
  return `${parts.slice(0, 2).join(":")}:[REDACTED]`;
}

function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function normalizeChannelId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeChannelViewArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

function normalizeChannelViewInput(value: string): string {
  const redacted = scrubSecrets(value.trim())
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

function isSupportedExternalChannel(value: string): boolean {
  return value === "slack" || value === "discord" || value === "telegram";
}

function safeChannelIdForData(value: string): boolean {
  return /^[a-z0-9_-]{1,40}$/.test(value) && !value.includes("signature") && !value.includes("token");
}
