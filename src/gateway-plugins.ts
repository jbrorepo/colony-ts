import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  buildTrustedPluginPreflight,
  renderTrustedPluginPreflight,
  type TrustedLocalPluginEntry,
  type TrustedPluginActivationReceipt,
} from "./mcp/trusted-local-plugin-activation";

export interface GatewayPluginsContext {
  entries?: TrustedLocalPluginEntry[];
  receipts?: TrustedPluginActivationReceipt[];
}

export function buildPluginsCommandPayload(args: string[], context: GatewayPluginsContext = {}): GatewayBasicCommandPayload {
  const command = (args[0] ?? "status").toLowerCase();
  const entries = context.entries ?? [];
  if (command === "trusted") {
    return {
      output: [
        "Trusted Plugins:",
        "",
        ...(entries.length === 0 ? ["(No trusted local plugins supplied)"] : entries.map((entry) => `- ${entry.id} | ${entry.source} | installed ${yesNo(entry.installed)} | trusted ${yesNo(entry.trusted)}`)),
        "",
        "Next valid command: /plugins preflight <id>",
      ].join("\n"),
      data: { action: "plugins_trusted", count: entries.length },
    };
  }
  if (command === "preflight") {
    const id = args[1] ?? "";
    const entry = entries.find((candidate) => candidate.id === id) ?? { id, source: "installed" as const, installed: false, trusted: false };
    const preflight = buildTrustedPluginPreflight(entry);
    return {
      output: renderTrustedPluginPreflight(preflight),
      isError: !preflight.ready,
      data: { action: "plugins_preflight", pluginId: id, ready: preflight.ready },
    };
  }
  if (command === "activate" || command === "deactivate") {
    const id = args[1] ?? "";
    const approved = args.includes("--approved");
    return {
      output: [
        approved ? `Plugin ${command} approved.` : `Plugin ${command} blocked.`,
        "",
        approved
          ? "Trusted local plugin action must run through the injected supervisor and emit a receipt."
          : `Exact plugin ${command} approval is required.`,
        "Registry fetch executed: no",
        "Package code executed: no",
        "Credentials persisted: no",
        "Default execution: no",
        "Next valid command: /plugins status",
      ].join("\n"),
      isError: !approved,
      data: { action: `plugins_${command}`, pluginId: id, approved },
      action: approved
        ? command === "activate"
          ? { kind: "plugin_activate", pluginId: id, approved: true }
          : { kind: "plugin_deactivate", pluginId: id, approved: true }
        : { kind: "display" },
    };
  }
  const receipts = context.receipts ?? [];
  return {
    output: [
      "Plugin Status:",
      "",
      `Trusted entries: ${entries.length}`,
      `Activation receipts: ${receipts.length}`,
      ...(receipts.length === 0 ? ["(No activation receipts recorded)"] : receipts.map((receipt) => `- ${receipt.pluginId} | active ${yesNo(receipt.active)} | ok ${yesNo(receipt.ok)}`)),
      "",
      "Next valid command: /plugins trusted | /plugins preflight <id>",
    ].join("\n"),
    data: { action: "plugins_status", count: entries.length, receiptCount: receipts.length },
  };
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}
