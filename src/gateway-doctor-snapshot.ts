import type { SlashCommandContext } from "./gateway-contract";
import {
  buildDoctorCommandPayload,
  doctorCheckPrefix,
  doctorInspectHints,
  doctorProviderDiagnosticsLines,
  isTerminalRelatedCheck,
  matchDoctorCheck,
  parseDoctorArgs,
  renderDoctorFirstRunLines,
  resolveDoctorFocusProvider,
} from "./gateway-doctor";
import {
  collectKnownProviders,
  formatFailoverEventLine,
  formatProviderHealthSummary,
  latestFailoverSummary,
  normalizeProviderAlias,
  providerRecoveryHints,
  providerSearchTerms,
} from "./gateway-provider";

export type GatewayDoctorSnapshot = Parameters<typeof buildDoctorCommandPayload>[0];

export function buildGatewayDoctorSnapshot(
  args: string[],
  ctx: SlashCommandContext,
): GatewayDoctorSnapshot {
  const report = ctx.startupReport;
  const filterSpec = parseDoctorArgs(args);
  const allChecks = report?.checks ?? [];
  const visibleChecks = allChecks.filter((check) => matchDoctorCheck(check, filterSpec));
  const firstRunLines = filterSpec.mode === "first-run"
    ? renderDoctorFirstRunLines({
        workspaceChecks: allChecks.filter((check) => String(check.name ?? "").startsWith("Workspace ")),
        terminalChecks: allChecks.filter((check) => isTerminalRelatedCheck(check)),
        configChecks: allChecks.filter((check) => String(check.name ?? "").startsWith("Config:")),
        dataChecks: allChecks.filter((check) => {
          const name = String(check.name ?? "");
          return name === "Data directory" || name.startsWith("Permissions:");
        }),
        providerChecks: allChecks.filter((check) => {
          const name = String(check.name ?? "");
          return name === "Provider config" || name === "Default provider" || name.endsWith(" credentials") || name === "Cloud fallback";
        }),
        localChecks: allChecks.filter((check) => String(check.name ?? "").startsWith("Ollama ")),
        workspaceDetected: Boolean(ctx.workspace?.detected),
        workspaceFallback: ctx.workspace?.detected
          ? `${ctx.workspace.name} (${ctx.workspace.projectType}, ${ctx.workspace.workspaceMode ?? "single-package"})`
          : "Workspace detection pending.",
        devCommand: ctx.workspace?.devCommand,
        verifyCommand: ctx.workspace?.verifyCommand,
        devCandidate: ctx.workspace?.workspaceDevCandidates?.[0] ?? null,
        verifyCandidate: ctx.workspace?.workspaceVerifyCandidates?.[0] ?? null,
      })
    : [];
  const inspectHints = doctorInspectHints(visibleChecks);
  const focusProvider = resolveDoctorFocusProvider(filterSpec, ctx.runtime, {
    collectKnownProviders,
    providerSearchTerms,
    normalizeProviderAlias,
  });
  const providerDiagnosticsLines = doctorProviderDiagnosticsLines(focusProvider, ctx.runtime, report, {
    expandFailovers: filterSpec.mode === "failovers",
    formatProviderHealthSummary,
    latestFailoverSummary,
    formatFailoverEventLine,
    providerRecoveryHints,
  });

  return {
    report,
    mode: filterSpec.mode,
    query: filterSpec.query,
    visibleChecks: visibleChecks.map((check) => ({
      ...check,
      prefix: doctorCheckPrefix(check),
    })),
    focusProvider,
    providerDiagnosticsLines,
    firstRunLines,
    inspectHints,
  };
}
