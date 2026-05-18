export type DoctorFilterMode =
  | "all"
  | "failing"
  | "errors"
  | "warnings"
  | "passed"
  | "providers"
  | "failovers"
  | "workspace"
  | "config"
  | "data"
  | "terminal"
  | "local"
  | "cloud"
  | "first-run"
  | "setup"
  | "demo"
  | "release";

export interface GatewayDoctorCheck {
  name?: string;
  passed?: boolean;
  severity?: string;
  message?: string;
  fix?: string;
  prefix?: string;
}

export interface GatewayDoctorCommandPayload {
  output: string;
  data?: Record<string, unknown>;
}

export interface GatewayDoctorFailoverEvent {
  fromProvider?: string;
  fromModel?: string;
  toProvider?: string;
  toModel?: string;
  errorType?: string;
  errorMessage?: string;
  timestamp?: number;
}

export interface GatewayDoctorRuntimeProviderState {
  provider?: string;
  providerHealth?: Record<string, { state?: string; failureCount?: number }>;
  recentFailovers?: GatewayDoctorFailoverEvent[];
}

export interface DoctorFilterSpec {
  mode: DoctorFilterMode;
  query: string;
}

function doctorChecklistStatus(checks: GatewayDoctorCheck[]): "ok" | "warn" | "error" | "unknown" {
  if (checks.length === 0) return "unknown";
  if (checks.some((check) => !check.passed && String(check.severity ?? "").toLowerCase() === "error")) return "error";
  if (checks.some((check) => !check.passed)) return "warn";
  return "ok";
}

function doctorChecklistLine(
  label: string,
  checks: GatewayDoctorCheck[],
  fallback: string,
): string {
  const status = doctorChecklistStatus(checks);
  const focus =
    checks.find((check) => !check.passed)?.message
    ?? checks.find((check) => typeof check.message === "string" && check.message.length > 0)?.message
    ?? fallback;
  return `${label}: ${status} | ${focus}`;
}

export function doctorFilterLabel(mode: DoctorFilterMode): string {
  if (mode === "failing") return "failing";
  if (mode === "errors") return "errors";
  if (mode === "warnings") return "warnings";
  if (mode === "passed") return "passed";
  if (mode === "providers") return "providers";
  if (mode === "failovers") return "failovers";
  if (mode === "workspace") return "workspace";
  if (mode === "config") return "config";
  if (mode === "data") return "data";
  if (mode === "terminal") return "terminal";
  if (mode === "local") return "local";
  if (mode === "cloud") return "cloud";
  if (mode === "first-run") return "first-run";
  if (mode === "setup") return "setup";
  if (mode === "demo") return "demo";
  if (mode === "release") return "release";
  return "all";
}

export function doctorInspectViews(): string {
  return "/doctor | /doctor errors | /doctor warnings | /doctor workspace | /doctor config | /doctor data | /doctor terminal | /doctor local | /doctor cloud | /doctor providers | /doctor failovers | /doctor first-run | /doctor setup | /doctor demo | /doctor release";
}

export function parseDoctorArgs(args: string[]): DoctorFilterSpec {
  const first = (args[0] ?? "").trim().toLowerCase();
  if (["all", "failing", "errors", "warnings", "passed", "providers", "failovers", "workspace", "config", "data", "terminal", "local", "cloud", "first-run", "setup", "demo", "release"].includes(first)) {
    return {
      mode: first as DoctorFilterMode,
      query: args.slice(1).join(" ").trim().toLowerCase(),
    };
  }
  return {
    mode: "all",
    query: args.join(" ").trim().toLowerCase(),
  };
}

export function doctorCheckPrefix(check: {
  passed?: boolean;
  severity?: string;
}): string {
  const severity = String(check.severity ?? "info").toLowerCase();
  if (check.passed) return "ok";
  if (severity === "error") return "error";
  if (severity === "warning") return "warn";
  return "info";
}

export function isProviderRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return [
    "provider",
    "ollama",
    "anthropic",
    "gemini",
    "google",
    "openai",
    "fallback",
    "claude",
  ].some((term) => haystack.includes(term));
}

export function isLocalRuntimeRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return [
    "ollama",
    "local-provider boundary",
    "wsl",
    "localhost:11434",
    "local runtime",
  ].some((term) => haystack.includes(term));
}

export function isCloudProviderRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return [
    "cloud fallback",
    "credentials",
    "connectivity",
    "anthropic",
    "claude",
    "gemini",
    "google",
    "openai",
  ].some((term) => haystack.includes(term));
}

export function isWorkspaceRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return ["workspace", "project root", "marker"].some((term) => haystack.includes(term));
}

export function isConfigRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return ["config", ".env", "credential", "api key", "llm config", "default provider"].some((term) => haystack.includes(term));
}

export function isDataRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return [
    "data directory",
    "permissions:",
    "sessions writable",
    "transcripts writable",
    "tool-results writable",
    "is writable",
    "data dir",
  ].some((term) => haystack.includes(term));
}

export function isTerminalRelatedCheck(check: GatewayDoctorCheck): boolean {
  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return ["terminal", "tty", "raw mode", "keyboard input", "hotkeys", "paging shortcuts"].some((term) => haystack.includes(term));
}

export function matchDoctorCheck(
  check: GatewayDoctorCheck,
  spec: DoctorFilterSpec,
): boolean {
  const passed = Boolean(check.passed);
  const severity = String(check.severity ?? "info").toLowerCase();

  const modeMatches = (
    spec.mode === "all"
    || spec.mode === "first-run"
    || spec.mode === "setup"
    || spec.mode === "demo"
    || spec.mode === "release"
    || (spec.mode === "failing" && !passed)
    || (spec.mode === "errors" && !passed && severity === "error")
    || (spec.mode === "warnings" && !passed && severity === "warning")
    || (spec.mode === "passed" && passed)
    || (spec.mode === "workspace" && isWorkspaceRelatedCheck(check))
    || (spec.mode === "config" && isConfigRelatedCheck(check))
    || (spec.mode === "data" && isDataRelatedCheck(check))
    || (spec.mode === "terminal" && isTerminalRelatedCheck(check))
    || (spec.mode === "local" && isLocalRuntimeRelatedCheck(check))
    || (spec.mode === "cloud" && isCloudProviderRelatedCheck(check))
  );
  if (!modeMatches) return false;
  if (!spec.query) return true;

  const haystack = [
    check.name,
    check.message,
    check.fix,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return haystack.includes(spec.query);
}

export function doctorInspectHints(checks: GatewayDoctorCheck[]): string[] {
  const hints: string[] = [];
  if (checks.some((check) => isProviderRelatedCheck(check))) {
    hints.push("/provider | /provider current | /provider failovers");
  }
  if (checks.some((check) => isWorkspaceRelatedCheck(check))) {
    hints.push("/doctor workspace | /workspace");
  }
  if (checks.some((check) => isConfigRelatedCheck(check))) {
    hints.push("/doctor config");
  }
  if (checks.some((check) => isDataRelatedCheck(check))) {
    hints.push("/doctor data");
  }
  if (checks.some((check) => isTerminalRelatedCheck(check))) {
    hints.push("/doctor terminal");
  }
  if (checks.some((check) => isLocalRuntimeRelatedCheck(check))) {
    hints.push("/doctor local");
  }
  if (checks.some((check) => isCloudProviderRelatedCheck(check))) {
    hints.push("/doctor cloud");
  }
  return hints;
}

export function resolveDoctorFocusProvider(
  spec: DoctorFilterSpec,
  runtime: GatewayDoctorRuntimeProviderState | null | undefined,
  opts: {
    collectKnownProviders: (runtime: GatewayDoctorRuntimeProviderState) => string[];
    providerSearchTerms: (provider: string) => string[];
    normalizeProviderAlias: (provider: string) => string;
  },
): string | null {
  const query = spec.query.trim().toLowerCase();
  const knownProviders = runtime ? opts.collectKnownProviders(runtime) : [];
  if (query) {
    for (const provider of knownProviders) {
      if (opts.providerSearchTerms(provider).some((term) => query.includes(term))) {
        return provider;
      }
    }
  }

  const currentProvider = opts.normalizeProviderAlias(runtime?.provider ?? "");
  return currentProvider || null;
}

export function doctorProviderDiagnosticsLines(
  focusProvider: string | null,
  runtime: GatewayDoctorRuntimeProviderState | null | undefined,
  report: { checks?: GatewayDoctorCheck[] } | null | undefined,
  opts: {
    expandFailovers?: boolean;
    formatProviderHealthSummary: (
      providerHealth: NonNullable<GatewayDoctorRuntimeProviderState["providerHealth"]>,
      currentProvider?: string,
    ) => string;
    latestFailoverSummary: (
      recentFailovers: NonNullable<GatewayDoctorRuntimeProviderState["recentFailovers"]>,
    ) => string;
    formatFailoverEventLine: (event: GatewayDoctorFailoverEvent) => string;
    providerRecoveryHints: (
      provider: string,
      runtime: GatewayDoctorRuntimeProviderState,
      report: { checks?: GatewayDoctorCheck[] } | null | undefined,
    ) => string[];
  } = {
    expandFailovers: false,
    formatProviderHealthSummary: () => "",
    latestFailoverSummary: () => "",
    formatFailoverEventLine: () => "",
    providerRecoveryHints: () => [],
  },
): string[] {
  if (!runtime) return [];

  const healthSummary = opts.formatProviderHealthSummary(runtime.providerHealth ?? {}, runtime.provider);
  const recentFailovers = runtime.recentFailovers ?? [];
  const latestFailover = opts.latestFailoverSummary(recentFailovers);
  const failoverLines = opts.expandFailovers
    ? recentFailovers.slice(-3).map((event) => `Failover: ${opts.formatFailoverEventLine(event)}`)
    : [];
  const recoveryHints = focusProvider
    ? opts.providerRecoveryHints(focusProvider, runtime, report).slice(0, 2)
    : [];
  if (!healthSummary && !latestFailover && recoveryHints.length === 0 && failoverLines.length === 0) {
    return [];
  }

  const lines = ["", "Provider diagnostics:"];
  if (focusProvider) {
    lines.push(`Focus: ${focusProvider}`);
  }
  if (healthSummary) {
    lines.push(`Observed health: ${healthSummary}`);
  }
  if (latestFailover) {
    lines.push(`Latest failover: ${latestFailover}`);
  }
  if (failoverLines.length > 0) {
    for (const line of failoverLines) {
      lines.push(line);
    }
    if (recentFailovers.length > failoverLines.length) {
      lines.push(`Older failovers hidden: ${recentFailovers.length - failoverLines.length}`);
    }
  }
  for (const hint of recoveryHints) {
    lines.push(`Recovery: ${hint}`);
  }
  lines.push("Inspect: /provider | /provider current | /provider failovers");
  return lines;
}

export function renderDoctorFirstRunLines(opts: {
  workspaceChecks: GatewayDoctorCheck[];
  terminalChecks: GatewayDoctorCheck[];
  configChecks: GatewayDoctorCheck[];
  dataChecks: GatewayDoctorCheck[];
  providerChecks: GatewayDoctorCheck[];
  localChecks: GatewayDoctorCheck[];
  workspaceDetected: boolean;
  workspaceFallback: string;
  devCommand?: string | null;
  verifyCommand?: string | null;
  devCandidate?: string | null;
  verifyCandidate?: string | null;
}): string[] {
  const lines = [
    "",
    "First-Run Checklist:",
    doctorChecklistLine("Workspace", opts.workspaceChecks, opts.workspaceFallback),
    doctorChecklistLine("Terminal", opts.terminalChecks, "No terminal compatibility checks available."),
    doctorChecklistLine("Config", opts.configChecks, "No config checks available."),
    doctorChecklistLine("Colony data", opts.dataChecks, "No data-path checks available."),
    doctorChecklistLine("Provider config", opts.providerChecks, "No provider checks available."),
    doctorChecklistLine("Local runtime", opts.localChecks, "No local-runtime checks available."),
  ];

  if (opts.workspaceDetected) {
    const commandBits = [
      opts.devCommand ? `dev: ${opts.devCommand}` : opts.devCandidate ? `dev pick: ${opts.devCandidate}` : null,
      opts.verifyCommand ? `verify: ${opts.verifyCommand}` : opts.verifyCandidate ? `verify pick: ${opts.verifyCandidate}` : null,
    ].filter(Boolean);
    lines.push(`Project commands: ${commandBits.length > 0 ? commandBits.join(" | ") : "warn | no dev or verify command found"}`);
  }

  lines.push("Inspect: /doctor terminal | /doctor workspace | /doctor config | /doctor data | /doctor local | /doctor cloud | /doctor providers | /workspace | /provider");
  return lines;
}

export function renderDoctorView(opts: {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  mode: DoctorFilterMode;
  query: string;
  allCheckCount: number;
  visibleChecks: GatewayDoctorCheck[];
  providerMode: boolean;
  failoverMode: boolean;
  firstRunMode: boolean;
  firstRunLines: string[];
  inspectHints: string[];
  providerDiagnosticsLines: string[];
}): string {
  const lines = [
    "Startup Diagnostics:",
    "",
    `Passed: ${opts.passed ? "yes" : "no"}`,
    `Errors: ${opts.errorCount}`,
    `Warnings: ${opts.warningCount}`,
    `Views: ${doctorInspectViews()}`,
  ];
  if (opts.mode !== "all" || opts.query) {
    lines.push(`Mode: ${doctorFilterLabel(opts.mode)}`);
    if (opts.query) lines.push(`Search: ${opts.query}`);
    lines.push(`Showing: ${opts.visibleChecks.length} of ${opts.allCheckCount} checks`);
  }

  if (opts.providerMode) {
    lines.push("");
    lines.push("Provider view: startup checks hidden; use provider diagnostics below.");
  } else if (opts.failoverMode) {
    lines.push("");
    lines.push("Failover view: startup checks hidden; use failover history below.");
  } else if (opts.mode === "setup") {
    lines.push("");
    lines.push("Guided Setup:");
    lines.push("1. Install dependencies: bun install");
    lines.push("2. Check providers: bun run alpha0:provider-check");
    lines.push("3. Start local runtime: bun run start");
    lines.push("4. Inspect: /doctor first-run | /provider | /workspace");
    lines.push("Next valid command: /doctor demo");
  } else if (opts.mode === "demo") {
    lines.push("");
    lines.push("Demo Path:");
    lines.push("1. /browser status");
    lines.push("2. /workflow recipes");
    lines.push("3. /swarm llm \"prepare a concise launch checklist\"");
    lines.push("4. /status operator");
    lines.push("Next valid command: /doctor release");
  } else if (opts.mode === "release") {
    lines.push("");
    lines.push("Release Readiness:");
    lines.push("1. bun run verify:all");
    lines.push("2. bun run release:gate");
    lines.push("3. bun run verify:market-parity");
    lines.push("4. bun run release:market-gate");
    lines.push("Next valid command: /audit verify | /status operator");
  } else if (opts.firstRunMode) {
    lines.push(...opts.firstRunLines);
  } else if (opts.visibleChecks.length === 0) {
    lines.push("");
    lines.push("(No check details match current filter)");
  } else {
    lines.push("");
    for (const check of opts.visibleChecks) {
      lines.push(`${check.prefix ?? "?"}: ${check.name ?? "check"} - ${check.message ?? ""}`.trim());
      if (!check.passed && check.fix) {
        lines.push(`fix: ${check.fix}`);
      }
    }
    if (opts.inspectHints.length > 0) {
      lines.push("");
      for (const hint of opts.inspectHints) {
        lines.push(`Inspect: ${hint}`);
      }
    }
  }

  lines.push(...opts.providerDiagnosticsLines);
  return lines.join("\n");
}

export function buildDoctorCommandPayload(opts: {
  report: {
    passed?: boolean;
    errorCount?: number;
    warningCount?: number;
    checks?: GatewayDoctorCheck[];
  } | null | undefined;
  mode: DoctorFilterMode;
  query: string;
  visibleChecks: GatewayDoctorCheck[];
  focusProvider: string | null;
  providerDiagnosticsLines: string[];
  firstRunLines: string[];
  inspectHints: string[];
}): GatewayDoctorCommandPayload {
  if (!opts.report) {
    return {
      output: "Startup diagnostics have not completed yet.",
    };
  }

  const allChecks = opts.report.checks ?? [];
  const providerMode = opts.mode === "providers";
  const failoverMode = opts.mode === "failovers";
  const firstRunMode = opts.mode === "first-run";

  return {
    output: renderDoctorView({
      passed: opts.report.passed ?? false,
      errorCount: opts.report.errorCount ?? 0,
      warningCount: opts.report.warningCount ?? 0,
      mode: opts.mode,
      query: opts.query,
      allCheckCount: allChecks.length,
      visibleChecks: opts.visibleChecks.map((check) => ({
        ...check,
        prefix: check.prefix,
      })),
      providerMode,
      failoverMode,
      firstRunMode,
      firstRunLines: opts.firstRunLines,
      inspectHints: opts.inspectHints,
      providerDiagnosticsLines: opts.providerDiagnosticsLines,
    }),
    data: {
      passed: opts.report.passed ?? false,
      errorCount: opts.report.errorCount ?? 0,
      warningCount: opts.report.warningCount ?? 0,
      mode: opts.mode,
      query: opts.query || null,
      shownChecks: providerMode || failoverMode ? 0 : opts.visibleChecks.length,
      focusProvider: opts.focusProvider,
    },
  };
}
