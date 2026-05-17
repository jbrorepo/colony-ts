import type { SlashCommandContext } from "./gateway-contract";
import {
  compactionPerfSummary,
  hookPerfSummary,
  recentCompactionEntries,
  recentHookEvents,
  recentRuntimeEvents,
  timedRuntimeEvents,
  toolPerfSummary,
} from "./gateway-events";
import { providerPerfSummaries } from "./gateway-provider";
import {
  readModelUsage,
  renderCostPerfBreakdown,
  type GatewayCostUsageRow,
} from "./gateway-cost";
import { recentToolActivity } from "./gateway-tools";

export type GatewayEventsSnapshot = Omit<
  Parameters<typeof import("./gateway-events").buildEventsCommandPayload>[0],
  "args"
>;
export type GatewayPerfSnapshot = Omit<
  Parameters<typeof import("./gateway-events").buildPerfCommandPayload>[0],
  "args"
>;

export function buildGatewayEventsSnapshot(
  ctx: SlashCommandContext,
): GatewayEventsSnapshot {
  return {
    events: recentRuntimeEvents(ctx),
    toolCount: recentToolActivity(ctx.session, 8).length,
    hookCount: recentHookEvents(ctx).length,
    compactionCount: recentCompactionEntries(ctx).length,
    failoverCount: (ctx.runtime?.recentFailovers ?? []).slice(-8).length,
  };
}

export function buildGatewayPerfSnapshot(
  ctx: SlashCommandContext,
): GatewayPerfSnapshot {
  const modelRows = readModelUsage(ctx.costTracker).filter((row) => row.callCount > 0 || row.apiDurationS > 0);
  const providerPerf = ctx.runtime ? providerPerfSummaries(ctx.costTracker, ctx.runtime) : null;
  const runtimeEvents = recentRuntimeEvents(ctx);
  const toolSummary = toolPerfSummary(ctx);
  const hookSummary = hookPerfSummary(ctx);
  const compactionSummary = compactionPerfSummary(ctx);

  return {
    modelRows,
    providerSummaries: providerPerf
      ? providerPerf.summaries.filter((summary) => summary.totalCalls > 0 || summary.totalApiDurationS > 0)
      : [],
    providerAmbiguousCount: providerPerf?.ambiguousRows.length ?? 0,
    providerUnmappedModels: providerPerf?.unmappedRows.map((row) => row.model) ?? [],
    runtimeEvents,
    toolSummary,
    hookSummary,
    compactionSummary,
    renderModelsView: () => renderCostPerfBreakdown({
      totalApiDurationS: ctx.costTracker && typeof ctx.costTracker === "object"
        ? ((ctx.costTracker as Record<string, unknown>).apiDurationS as number | undefined)
          ?? modelRows.reduce((sum, row) => sum + row.apiDurationS, 0)
        : 0,
      totalCalls: ctx.costTracker && typeof ctx.costTracker === "object"
        ? ((ctx.costTracker as Record<string, unknown>).callCount as number | undefined)
          ?? modelRows.reduce((sum, row) => sum + row.callCount, 0)
        : 0,
      modelRows: (modelRows as GatewayCostUsageRow[])
        .slice()
        .sort((left, right) => (
          right.apiDurationS - left.apiDurationS
          || right.callCount - left.callCount
          || left.model.localeCompare(right.model)
        )),
    }),
  };
}
