import type { SlashCommandContext } from "./gateway-contract";
import type { RuntimeContextSnapshot } from "./runtime/runtime-snapshot";

export interface GatewayProviderSnapshot {
  runtime: Partial<RuntimeContextSnapshot> | null;
  startupReport: SlashCommandContext["startupReport"];
  costTracker: SlashCommandContext["costTracker"];
}

export function buildGatewayProviderSnapshot(
  ctx: SlashCommandContext,
): GatewayProviderSnapshot {
  return {
    runtime: ctx.runtime ?? null,
    startupReport: ctx.startupReport,
    costTracker: ctx.costTracker,
  };
}
