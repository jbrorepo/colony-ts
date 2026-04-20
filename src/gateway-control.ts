import { renderModelStatusView } from "./gateway-runtime";

export interface GatewayControlCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: Record<string, unknown>;
}

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
