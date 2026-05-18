import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  buildTrustedPluginPreflight,
  renderTrustedPluginPreflight,
  type TrustedLocalPluginEntry,
  type TrustedPluginActivationReceipt,
} from "./mcp/trusted-local-plugin-activation";
import { scrubSecrets } from "./security/log-sanitizer";

export interface GatewayPluginsContext {
  entries?: TrustedLocalPluginEntry[];
  receipts?: TrustedPluginActivationReceipt[];
}

export function buildPluginsCommandPayload(args: string[], context: GatewayPluginsContext = {}): GatewayBasicCommandPayload {
  const command = (args[0] ?? "status").toLowerCase();
  const entries = context.entries ?? [];
  const receipts = context.receipts ?? [];
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
    const id = requiredPluginId(args[1]);
    if (!id) return missingPluginId("/plugins preflight <id>");
    if (!id.ok) return rejectedPluginId("/plugins preflight <id>");
    const entry = entries.find((candidate) => candidate.id === id.value) ?? { id: id.value, source: "installed" as const, installed: false, trusted: false };
    const preflight = buildTrustedPluginPreflight(entry);
    return {
      output: renderTrustedPluginPreflight(preflight),
      isError: !preflight.ready,
      data: { action: "plugins_preflight", pluginId: id.value, ready: preflight.ready },
    };
  }
  if (command === "activate" || command === "deactivate") {
    const id = requiredPluginId(args[1]);
    const retryCommand = `/plugins ${command} <id> --approved`;
    if (!id) return missingPluginId(retryCommand);
    if (!id.ok) return rejectedPluginId(retryCommand);
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
      data: { action: `plugins_${command}`, pluginId: id.value, approved },
      action: approved
        ? command === "activate"
          ? { kind: "plugin_activate", pluginId: id.value, approved: true }
          : { kind: "plugin_deactivate", pluginId: id.value, approved: true }
        : { kind: "display" },
    };
  }
  if (command === "status" && args.length > 1) {
    const id = requiredPluginId(args[1]);
    if (!id) return missingPluginId("/plugins status <id>");
    if (!id.ok) return rejectedPluginId("/plugins status <id>");
    const entry = entries.find((candidate) => candidate.id === id.value) ?? null;
    const pluginReceipts = receipts.filter((receipt) => receipt.pluginId === id.value);
    if (!entry && pluginReceipts.length === 0) {
      return {
        output: [
          `Plugin not found: ${id.value}`,
          "",
          "Trusted local plugin status can only inspect supplied local descriptors or recorded activation receipts.",
          "Next valid command: /plugins trusted | /plugins preflight <id>",
        ].join("\n"),
        isError: true,
        data: { action: "plugins_status_detail", pluginId: id.value, found: false },
      };
    }
    return {
      output: renderPluginStatusDetail(id.value, entry, pluginReceipts),
      data: {
        action: "plugins_status_detail",
        pluginId: id.value,
        found: true,
        receiptCount: pluginReceipts.length,
      },
    };
  }
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

type PluginIdValidation = { ok: true; value: string } | { ok: false };

function requiredPluginId(value: string | undefined): PluginIdValidation | null {
  const raw = value?.trim() ?? "";
  if (!raw || raw.startsWith("--")) return null;
  const scrubbed = scrubPluginId(raw);
  if (scrubbed.includes("[REDACTED]")) return { ok: false };
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(scrubbed)) return { ok: false };
  if (scrubbed.includes("..") || scrubbed.includes("@{")) return { ok: false };
  return { ok: true, value: scrubbed };
}

function missingPluginId(command: string): GatewayBasicCommandPayload {
  return {
    output: [
      "Plugin id required.",
      "",
      `Next valid command: ${command}`,
    ].join("\n"),
    isError: true,
    data: { action: "plugins_missing_id" },
  };
}

function rejectedPluginId(command: string): GatewayBasicCommandPayload {
  return {
    output: [
      "Plugin id rejected.",
      "",
      "Plugin identifiers must be local descriptor ids, not paths, shell text, or credentials.",
      `Next valid command: ${command}`,
    ].join("\n"),
    isError: true,
    data: { action: "plugins_rejected_id" },
  };
}

function renderPluginStatusDetail(
  pluginId: string,
  entry: TrustedLocalPluginEntry | null,
  receipts: TrustedPluginActivationReceipt[],
): string {
  const latestReceipt = receipts.at(-1) ?? null;
  return [
    `Plugin Status: ${pluginId}`,
    "",
    `Source: ${entry?.source ?? "receipt-only"}`,
    `Installed: ${entry ? yesNo(entry.installed) : "unknown"}`,
    `Trusted: ${entry ? yesNo(entry.trusted) : "unknown"}`,
    `Active: ${latestReceipt ? yesNo(latestReceipt.active) : "unknown"}`,
    `Last receipt: ${latestReceipt?.receiptId ?? "none"}`,
    `Receipt ok: ${latestReceipt ? yesNo(latestReceipt.ok) : "unknown"}`,
    latestReceipt?.reason ? `Reason: ${latestReceipt.reason}` : "",
    "Registry fetch executed: no",
    "Package code executed: no",
    "Credentials persisted: no",
    "Default execution: no",
    "",
    "Next valid command: /plugins preflight <id> | /plugins activate <id> --approved | /plugins deactivate <id> --approved",
  ].filter(Boolean).join("\n");
}

function scrubPluginId(value: string): string {
  return scrubSecrets(value)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
}
