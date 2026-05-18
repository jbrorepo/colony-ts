import {
  memoryTruthModeLabel,
  parseMemoryTruthModeInput,
  type MemoryTruthMode,
} from "./memory/hybrid-memory";
import {
  inferStructuredRankingPlan,
  type StructuredRankingPlan,
} from "./memory/structured-ranking";
import {
  inferDerivedSectionPriority,
  inferDerivedSectionPriorityProvenance,
  inferMemoryIntentTags,
  inferMemorySectionPriority,
  inferMemoryTruthMode,
  inferMemoryTruthProvenance,
  inferMempalaceBroadenProvenance,
  inferMempalaceExpandProvenance,
  inferMempalaceHall,
  inferMempalaceHallProvenance,
  inferMempalaceWing,
  inferMempalaceWingProvenance,
  inferPalaceRecallPriority,
  inferPalaceRecallPriorityProvenance,
  shouldBroadenMempalaceTraversal,
  shouldExpandMempalaceContext,
} from "./memory/service";
import type { AgentSession } from "./runtime/session";
import { renderModelStatusView } from "./gateway-runtime";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayControlCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: Record<string, unknown>;
}

type MemoryRecallViewSnapshot = {
  truthMode?: MemoryTruthMode;
  truthModeSource?: "explicit" | "inferred";
  truthProvenance?: string[];
  sectionOrder?: string[];
  shownSections?: string[];
  emptySections?: string[];
  hiddenSections?: string[];
  noHitReason?: string;
  exact?: { shown?: number; total?: number };
  compact?: { shown?: number; total?: number };
  structured?: { shown?: number; total?: number };
  palace?: {
    direct?: { shown?: number; total?: number };
    nearby?: { shown?: number; total?: number };
    broader?: { shown?: number; total?: number };
    related?: { shown?: number; total?: number };
    resolvedPath?: string;
    hintedPath?: string;
    path?: {
      resolvedHall?: string;
      resolvedWing?: string;
      resolvedRoom?: string;
      resolvedSourceFile?: string;
      inferredSourceFile?: string;
      hallFallback?: string;
      roomFallback?: string;
      sourceFallback?: string;
    };
    traversal?: {
      directHitStage?: string;
      directMissStage?: string;
      nearbySeed?: string;
      nearbySeedVia?: string;
      nearbyFallback?: string;
      nearbyHitStage?: string;
      nearbyUnavailable?: string;
      broaderSeed?: string;
      broaderSeedVia?: string;
      broaderFallback?: string;
      broaderHitStage?: string;
      broaderUnavailable?: string;
      relatedSeed?: string;
      relatedFallback?: string;
      relatedHitStage?: string;
      relatedMissStage?: string;
      relatedUnavailable?: string;
    };
  };
  sessionContribution?: {
    total?: { current?: number; archived?: number; palace?: number };
    shown?: { current?: number; archived?: number; palace?: number };
  };
};

export function buildCancelCommandPayload(): GatewayControlCommandPayload {
  return {
    output: "Canceling active Colony run...",
    data: { requested: true },
    action: { kind: "cancel_run" },
  };
}

export function buildClearCommandPayload(cleared: boolean): GatewayControlCommandPayload {
  return {
    output: cleared
      ? "Session history cleared. System prompt preserved."
      : "Session cleared (no active session state to reset).",
    data: { cleared },
    action: { kind: "clear_session" },
  };
}

export function buildModelCommandPayload(opts: {
  args: string[];
  runtime: {
    selectedProvider?: string | null;
    selectedModel?: string | null;
    provider?: string | null;
    model?: string | null;
  } | null;
  normalizeProviderAlias: (provider: string) => string;
  resolveConfiguredProvider: (
    target: string,
    runtime: Record<string, unknown>,
  ) => { provider: string } | { error: string };
}): GatewayControlCommandPayload {
  const runtime = opts.runtime;
  if (!runtime) {
    return {
      output: "Model selection is not available in this context.",
    };
  }

  const verb = opts.args[0]?.trim().toLowerCase();
  const selectionArgs = verb === "use" || verb === "set" || verb === "select"
    ? opts.args.slice(1)
    : opts.args;

  if (selectionArgs.length === 0) {
    const selectedProvider = runtime.selectedProvider ?? runtime.provider ?? "unknown";
    const selectedModel = runtime.selectedModel ?? runtime.model ?? "unknown";
    const currentProvider = runtime.provider ?? "unknown";
    const currentModel = runtime.model ?? "unknown";
    return {
      output: renderModelStatusView({
        selectedProvider,
        selectedModel,
        currentProvider,
        currentModel,
      }),
      data: {
        provider: selectedProvider,
        model: selectedModel,
        currentProvider,
        currentModel,
      },
    };
  }

  let provider = opts.normalizeProviderAlias(runtime.selectedProvider ?? runtime.provider ?? "");
  let model = "";

  if (selectionArgs.length === 1) {
    model = selectionArgs[0].trim();
  } else {
    const resolvedProvider = opts.resolveConfiguredProvider(selectionArgs[0], runtime as Record<string, unknown>);
    if ("error" in resolvedProvider) {
      return {
        output: resolvedProvider.error,
        isError: true,
      };
    }
    provider = resolvedProvider.provider;
    model = selectionArgs.slice(1).join(" ").trim();
  }

  if (!provider) {
    return {
      output: "No selected provider is available.\n\nUse /provider use <name> first.",
      isError: true,
    };
  }
  if (!model) {
    return {
      output: "Usage: /model <model> | /model <provider> <model>",
      isError: true,
    };
  }

  const lines = ["Model selection updated:", ""];
  lines.push(`Selected provider: ${provider}`);
  lines.push(`Selected model: ${model}`);
  lines.push(`Current provider: ${runtime.provider ?? "unknown"}`);
  lines.push(`Current model: ${runtime.model ?? "unknown"}`);
  lines.push(`Next run: ${provider}:${model} primary`);
  lines.push("Inspect: /model | /provider current | /status");
  return {
    output: lines.join("\n"),
    data: { provider, model },
    action: { kind: "set_provider", provider, model },
  };
}

export function memoryInspectViews(): string {
  return "/memory | /memory status | /memory routing | /memory palace | /memory plan <query> | /memory auto | /memory exact | /memory derived | /memory balanced | /memory prefer-exact | /memory prefer-derived";
}

export function buildMemoryCommandPayload(opts: {
  args: string[];
  runtime: {
    memoryTruthModeOverride?: MemoryTruthMode | null;
    lastMemoryRecall?: MemoryRecallViewSnapshot | null;
  } | null;
  session?: unknown;
}): GatewayControlCommandPayload {
  if (!opts.runtime) {
    return {
      output: "Memory recall control is not available in this context.",
      isError: true,
    };
  }

  const currentMode = opts.runtime.memoryTruthModeOverride ?? null;
  const args = normalizeMemoryCommandArgs(opts.args);
  const viewArg = normalizeMemoryCommandInput(args.join(" "));
  if (args.length === 0 || viewArg === "status") {
    return {
      output: renderMemoryStatusView(currentMode, opts.runtime.lastMemoryRecall ?? null),
      data: {
        mode: currentMode,
      },
    };
  }

  if (viewArg === "routing") {
    return {
      output: renderMemoryRoutingView(currentMode, opts.runtime.lastMemoryRecall ?? null),
      data: { mode: currentMode },
    };
  }

  if (viewArg === "palace") {
    return {
      output: renderMemoryPalaceView(currentMode, opts.runtime.lastMemoryRecall ?? null),
      data: { mode: currentMode },
    };
  }

  if (normalizeMemoryCommandInput(args[0] ?? "") === "plan" || normalizeMemoryCommandInput(args[0] ?? "") === "explain") {
    const query = args.slice(1).join(" ").trim();
    if (!query) {
      return {
        output: `Usage: /memory plan <query>\n\nViews: ${memoryInspectViews()}`,
        isError: true,
        data: { mode: currentMode },
      };
    }
    return {
      output: renderMemoryQueryPlan(query, currentMode, coerceMemoryPlanSession(opts.session)),
      data: { mode: currentMode, action: "memory_plan" },
    };
  }

  const requestedMode = parseMemoryTruthModeInput(args.join(" "));
  if (requestedMode === undefined) {
    const rejectedInput = viewArg.includes("[REDACTED]") ? "\nInput: [REDACTED]" : "";
    return {
      output: `Unknown memory mode.${rejectedInput}\n\nViews: ${memoryInspectViews()}`,
      isError: true,
    };
  }

  if (requestedMode === currentMode) {
    return {
      output: `Memory recall mode already ${memoryTruthModeLabel(currentMode)}.\n\nViews: ${memoryInspectViews()}`,
      data: { mode: currentMode },
    };
  }

  return {
    output: [
      "Memory recall mode updated:",
      "",
      `Current: ${memoryTruthModeLabel(currentMode)}`,
      `Next run: ${memoryTruthModeLabel(requestedMode)}`,
      `Inspect: ${memoryInspectViews()} | /status runtime`,
    ].join("\n"),
    data: { mode: requestedMode },
    action: { kind: "set_memory_truth_mode", mode: requestedMode },
  };
}

function renderMemoryQueryPlan(
  query: string,
  currentMode: MemoryTruthMode | null,
  session: Pick<AgentSession, "tenantScope" | "metadata">,
): string {
  const truthMode = currentMode ?? inferMemoryTruthMode(query);
  const truthSource = currentMode ? "explicit" : `inferred:${inferMemoryTruthProvenance(query).join("+")}`;
  const sectionOrder = inferMemorySectionPriority(truthMode);
  const derivedOrder = inferDerivedSectionPriority(query);
  const hall = inferMempalaceHall(query);
  const wing = inferMempalaceWing(query, session);
  const palaceHint = [hall, wing].filter(Boolean).join("/") || "none";
  const expand = shouldExpandMempalaceContext(query);
  const broaden = shouldBroadenMempalaceTraversal(query);
  const structuredPlan = inferStructuredRankingPlan(query);
  const recallControls = inferMemoryRecallControlPlan({
    truthMode,
    hall,
    wing,
    expand,
    broaden,
  });

  const lines = [
    "Memory Query Plan:",
    "",
    `Truth mode: ${memoryTruthModeLabel(truthMode)}`,
    `Truth source: ${truthSource}`,
    `Section order: ${sectionOrder.join(">")}`,
    `Derived order: ${derivedOrder.join(">")} via ${inferDerivedSectionPriorityProvenance(query).join("+") || "default"}`,
    `Intent tags: ${formatMemoryPlanList(inferMemoryIntentTags(query))}`,
    `Structured focus: ${structuredPlan.focus} via ${structuredPlan.focusVia}`,
    `Structured hints: ${formatStructuredPlanCategories(structuredPlan.hints)}`,
    `Structured boosts: ${formatMemoryPlanList(structuredPlan.boosts)}`,
    "",
    "Recall controls:",
    `Exact recall: ${recallControls.exactRecall ? "enabled" : "disabled"}`,
    `Derived recall: ${recallControls.derivedRecall ? "enabled" : "disabled"}`,
    `Palace search: ${recallControls.palaceSearch}`,
    `Distance threshold: ${recallControls.distanceThreshold}`,
    `Graph hops: nearby=${recallControls.nearbyHops} broader=${recallControls.broaderHops}`,
    `Filter controls: hall=${recallControls.hall} wing=${recallControls.wing} room=auto source=auto`,
    `Route explanation: starts at hinted hall/wing, resolves exact transcript truth first, then nearby/broader/related palace routes when enabled.`,
    `Filter explanation: hall=${recallControls.hall} and wing=${recallControls.wing} constrain candidate routes before fallback stages are reported.`,
    `Precision diagnostics: ${recallControls.precisionDiagnostics}`,
    "",
    `Palace hint: ${palaceHint}`,
    `Hall source: ${hall ? inferMempalaceHallProvenance(query).join("+") : "none"}`,
    `Wing source: ${wing ? inferMempalaceWingProvenance(query, session).join("+") : "none"}`,
    `Palace order: ${inferPalaceRecallPriority(query).join(">")} via ${inferPalaceRecallPriorityProvenance(query).join("+") || "default"}`,
    `Expand: ${expand ? "yes" : "no"}${expand ? ` via ${inferMempalaceExpandProvenance(query).join("+") || "default"}` : ""}`,
    `Broaden: ${broaden ? "yes" : "no"}${broaden ? ` via ${inferMempalaceBroadenProvenance(query).join("+") || "default"}` : ""}`,
    "",
    "This view does not read memory stores or emit recalled content.",
    "Run the user prompt to execute retrieval, then inspect /memory routing or /memory palace.",
  ];

  return lines.join("\n");
}

function normalizeMemoryCommandArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

function normalizeMemoryCommandInput(value: string): string {
  const redacted = scrubSecrets(value.trim())
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

function inferMemoryRecallControlPlan(input: {
  truthMode: MemoryTruthMode;
  hall?: string;
  wing?: string;
  expand: boolean;
  broaden: boolean;
}): {
  exactRecall: boolean;
  derivedRecall: boolean;
  palaceSearch: string;
  distanceThreshold: "disabled" | "strict" | "balanced" | "broad";
  nearbyHops: 0 | 1;
  broaderHops: 0 | 2;
  hall: string;
  wing: string;
  precisionDiagnostics: string;
} {
  const exactRecall = input.truthMode !== "derived_only";
  const derivedRecall = input.truthMode !== "exact_only";
  const palaceSearch = exactRecall ? "enabled" : "disabled (derived-only)";
  const nearbyHops = exactRecall && input.expand ? 1 : 0;
  const broaderHops = exactRecall && input.broaden ? 2 : 0;
  const distanceThreshold = !exactRecall
    ? "disabled"
    : input.truthMode === "exact_only"
      ? "strict"
      : input.broaden
        ? "broad"
        : "balanced";
  const precisionDiagnostics = exactRecall
    ? "strict filters first; fallback stages reported after retrieval; plan reads no memory stores"
    : "derived-only mode skips palace retrieval; plan reads no memory stores";

  return {
    exactRecall,
    derivedRecall,
    palaceSearch,
    distanceThreshold,
    nearbyHops,
    broaderHops,
    hall: input.hall ?? "auto",
    wing: input.wing ?? "auto",
    precisionDiagnostics,
  };
}

function renderMemoryStatusView(
  currentMode: MemoryTruthMode | null,
  lastRecall: MemoryRecallViewSnapshot | null,
): string {
  const lines = [
    "Memory Recall:",
    "",
    `Current mode: ${memoryTruthModeLabel(currentMode)}`,
    "Auto follows prompt wording. Exact keeps transcript truth. Derived keeps compact artifacts and reusable facts.",
  ];
  if (!lastRecall) {
    lines.push("Last recall: none yet");
  } else {
    lines.push(
      `Last recall: ${memoryTruthModeLabel(lastRecall.truthMode ?? null)} (${lastRecall.truthModeSource ?? "inferred"}${lastRecall.truthProvenance?.length ? `:${lastRecall.truthProvenance.join("+")}` : ""})`,
    );
    lines.push(`Sections shown: ${lastRecall.shownSections?.join(">") || "none"}`);
    lines.push(
      `Shown counts: exact ${lastRecall.exact?.shown ?? 0}/${lastRecall.exact?.total ?? 0} | compact ${lastRecall.compact?.shown ?? 0}/${lastRecall.compact?.total ?? 0} | structured ${lastRecall.structured?.shown ?? 0}/${lastRecall.structured?.total ?? 0} | palace ${lastRecall.palace?.direct?.shown ?? 0}/${lastRecall.palace?.direct?.total ?? 0},${lastRecall.palace?.nearby?.shown ?? 0}/${lastRecall.palace?.nearby?.total ?? 0},${lastRecall.palace?.broader?.shown ?? 0}/${lastRecall.palace?.broader?.total ?? 0},${lastRecall.palace?.related?.shown ?? 0}/${lastRecall.palace?.related?.total ?? 0}`,
    );
    if (lastRecall.noHitReason) lines.push(`No-hit: ${lastRecall.noHitReason}`);
  }
  lines.push("Inspect: /memory routing | /memory palace | /status runtime");
  lines.push(`Set: ${memoryInspectViews()}`);
  return lines.join("\n");
}

function coerceMemoryPlanSession(session: unknown): Pick<AgentSession, "tenantScope" | "metadata"> {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return { tenantScope: "default", metadata: {} };
  }
  const record = session as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : {};
  return {
    tenantScope: typeof record.tenantScope === "string" ? record.tenantScope : "default",
    metadata,
  };
}

function formatMemoryPlanList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function formatStructuredPlanCategories(values: StructuredRankingPlan["hints"]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function renderMemoryRoutingView(
  currentMode: MemoryTruthMode | null,
  lastRecall: MemoryRecallViewSnapshot | null,
): string {
  const lines = [
    "Memory Routing:",
    "",
    `Current mode: ${memoryTruthModeLabel(currentMode)}`,
  ];
  if (!lastRecall) {
    lines.push("Last recall: none yet");
    lines.push("Inspect: /memory | /memory palace");
    return lines.join("\n");
  }
  lines.push(`Last truth: ${memoryTruthModeLabel(lastRecall.truthMode ?? null)} (${lastRecall.truthModeSource ?? "inferred"})`);
  if (lastRecall.truthProvenance?.length) lines.push(`Truth source: ${lastRecall.truthProvenance.join("+")}`);
  lines.push(`Section order: ${lastRecall.sectionOrder?.join(">") || "none"}`);
  lines.push(`Shown sections: ${lastRecall.shownSections?.join(">") || "none"}`);
  lines.push(`Hidden sections: ${lastRecall.hiddenSections?.join(">") || "none"}`);
  lines.push(`Empty sections: ${lastRecall.emptySections?.join(">") || "none"}`);
  lines.push(`Counts: exact ${lastRecall.exact?.shown ?? 0}/${lastRecall.exact?.total ?? 0} | compact ${lastRecall.compact?.shown ?? 0}/${lastRecall.compact?.total ?? 0} | structured ${lastRecall.structured?.shown ?? 0}/${lastRecall.structured?.total ?? 0}`);
  lines.push(`Palace counts: direct ${lastRecall.palace?.direct?.shown ?? 0}/${lastRecall.palace?.direct?.total ?? 0} | nearby ${lastRecall.palace?.nearby?.shown ?? 0}/${lastRecall.palace?.nearby?.total ?? 0} | broader ${lastRecall.palace?.broader?.shown ?? 0}/${lastRecall.palace?.broader?.total ?? 0} | related ${lastRecall.palace?.related?.shown ?? 0}/${lastRecall.palace?.related?.total ?? 0}`);
  lines.push(`Session scope: shown current ${lastRecall.sessionContribution?.shown?.current ?? 0} | shown archived ${lastRecall.sessionContribution?.shown?.archived ?? 0} | shown palace ${lastRecall.sessionContribution?.shown?.palace ?? 0}`);
  lines.push(`Session total: current ${lastRecall.sessionContribution?.total?.current ?? 0} | archived ${lastRecall.sessionContribution?.total?.archived ?? 0} | palace ${lastRecall.sessionContribution?.total?.palace ?? 0}`);
  if (lastRecall.noHitReason) lines.push(`No-hit: ${lastRecall.noHitReason}`);
  lines.push("Inspect: /memory | /memory palace | /status runtime");
  return lines.join("\n");
}

function renderMemoryPalaceView(
  currentMode: MemoryTruthMode | null,
  lastRecall: MemoryRecallViewSnapshot | null,
): string {
  const lines = [
    "Memory Palace:",
    "",
    `Current mode: ${memoryTruthModeLabel(currentMode)}`,
  ];
  if (!lastRecall?.palace) {
    lines.push("Last palace recall: none yet");
    lines.push("Inspect: /memory | /memory routing");
    return lines.join("\n");
  }
  lines.push(`Hinted path: ${lastRecall.palace.hintedPath ?? "none"}`);
  lines.push(`Resolved path: ${lastRecall.palace.resolvedPath ?? "none"}`);
  lines.push(`Resolved hall/wing/room: ${lastRecall.palace.path?.resolvedHall ?? "none"} | ${lastRecall.palace.path?.resolvedWing ?? "none"} | ${lastRecall.palace.path?.resolvedRoom ?? "none"}`);
  lines.push(`Source hint/resolved: ${lastRecall.palace.path?.inferredSourceFile ?? "none"} | ${lastRecall.palace.path?.resolvedSourceFile ?? "none"}`);
  lines.push(`Traversal: direct ${lastRecall.palace.traversal?.directHitStage ?? lastRecall.palace.traversal?.directMissStage ?? "none"} | nearby ${lastRecall.palace.traversal?.nearbySeed ?? "none"} via ${lastRecall.palace.traversal?.nearbySeedVia ?? lastRecall.palace.traversal?.nearbyUnavailable ?? "none"} | broader ${lastRecall.palace.traversal?.broaderSeed ?? "none"} via ${lastRecall.palace.traversal?.broaderSeedVia ?? lastRecall.palace.traversal?.broaderUnavailable ?? "none"} | related ${lastRecall.palace.traversal?.relatedSeed ?? "none"} via ${lastRecall.palace.traversal?.relatedHitStage ?? lastRecall.palace.traversal?.relatedMissStage ?? lastRecall.palace.traversal?.relatedUnavailable ?? "none"}`);
  lines.push(`Fallbacks: hall ${lastRecall.palace.path?.hallFallback ?? "none"} | room ${lastRecall.palace.path?.roomFallback ?? "none"} | source ${lastRecall.palace.path?.sourceFallback ?? "none"} | nearby ${lastRecall.palace.traversal?.nearbyFallback ?? "none"} | broader ${lastRecall.palace.traversal?.broaderFallback ?? "none"} | related ${lastRecall.palace.traversal?.relatedFallback ?? "none"}`);
  if (lastRecall.noHitReason) lines.push(`No-hit: ${lastRecall.noHitReason}`);
  lines.push("Inspect: /memory | /memory routing | /status runtime");
  return lines.join("\n");
}
