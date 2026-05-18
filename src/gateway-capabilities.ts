import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  getGstackInspiredCapability,
  listGstackInspiredCapabilities,
  nextGstackInspiredCapability,
  type GstackInspiredCapability,
} from "./gstack-inspired-capabilities";
import { scrubSecrets } from "./security/log-sanitizer";

export function buildCapabilitiesCommandPayload(args: string[]): GatewayBasicCommandPayload {
  const commandArgs = normalizeCapabilitiesCommandArgs(args);
  const command = normalizeCapabilitiesCommandInput(commandArgs[0] ?? "list");

  if (commandArgs.length === 0 || command === "list") {
    const capabilities = listGstackInspiredCapabilities();
    return {
      output: renderCapabilitiesList(capabilities),
      data: {
        action: "capabilities_list",
        count: capabilities.length,
      },
    };
  }

  if (command === "next") {
    const capability = nextGstackInspiredCapability();
    return {
      output: renderNextCapability(capability),
      data: {
        action: "capabilities_next",
        id: capability?.id ?? null,
      },
    };
  }

  if (command === "inspect" || command === "show") {
    const id = requiredCapabilityId(commandArgs[1]);
    if (!id) return missingCapabilityId();
    if (!id.ok) return rejectedCapabilityId();
    const capability = getGstackInspiredCapability(id.value);
    if (!capability) {
      return {
        output: `Capability not found: ${redactCapabilitySurfaceText(id.value)}\n\nInspect: /capabilities | /capabilities next`,
        isError: true,
        data: {
          action: "capabilities_missing",
          id: id.value,
        },
      };
    }
    return {
      output: renderCapabilityInspect(capability),
      data: {
        action: "capabilities_inspect",
        id: capability.id,
        status: capability.status,
      },
    };
  }

  return {
    output: `Unknown capabilities command '${command}'.\n\nUsage: /capabilities [list|next|inspect <id>]`,
    isError: true,
    data: { action: "capabilities_usage" },
  };
}

function normalizeCapabilitiesCommandArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

function normalizeCapabilitiesCommandInput(value: string): string {
  const redacted = redactCapabilitySurfaceText(value);
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

type CapabilityIdValidation = { ok: true; value: string } | { ok: false };

function requiredCapabilityId(value: string | undefined): CapabilityIdValidation | null {
  const raw = value?.trim() ?? "";
  if (!raw || raw.startsWith("--")) return null;
  const redacted = redactCapabilitySurfaceText(raw);
  if (redacted.includes("[REDACTED]")) return { ok: false };
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(redacted)) return { ok: false };
  if (redacted.includes("..") || redacted.includes("@{")) return { ok: false };
  return { ok: true, value: redacted };
}

function missingCapabilityId(): GatewayBasicCommandPayload {
  return {
    output: [
      "Capability id required.",
      "",
      "Next valid command: /capabilities inspect <id>",
    ].join("\n"),
    isError: true,
    data: { action: "capabilities_missing_id" },
  };
}

function rejectedCapabilityId(): GatewayBasicCommandPayload {
  return {
    output: [
      "Capability id rejected.",
      "",
      "Capability identifiers must be local capability ids, not paths, shell text, flags, or credentials.",
      "Next valid command: /capabilities inspect <id>",
    ].join("\n"),
    isError: true,
    data: { action: "capabilities_rejected_id" },
  };
}

function renderCapabilitiesList(capabilities: GstackInspiredCapability[]): string {
  const lines = ["GStack-Inspired Colony Capabilities:", ""];
  for (const capability of capabilities) {
    lines.push(`- ${redactCapabilitySurfaceText(capability.id)} | ${redactCapabilitySurfaceText(capability.status)} | ${redactCapabilitySurfaceText(capability.title)}`);
    lines.push(`  Next: ${redactCapabilitySurfaceText(capability.nextSlice)}`);
  }
  lines.push("");
  lines.push("Inspect: /capabilities inspect <id> | /capabilities next");
  return lines.join("\n");
}

function renderNextCapability(capability: GstackInspiredCapability | null): string {
  if (!capability) {
    return [
      "Next Capability Slice:",
      "",
      "All tracked GStack-inspired capability tracks are marked shipped.",
      "Inspect: /capabilities",
    ].join("\n");
  }

  return [
    "Next Capability Slice:",
    "",
    `${redactCapabilitySurfaceText(capability.id)} | ${redactCapabilitySurfaceText(capability.status)} | ${redactCapabilitySurfaceText(capability.title)}`,
    "",
    redactCapabilitySurfaceText(capability.nextSlice),
    "",
    "Guardrails:",
    ...capability.guardrails.map((guardrail) => `- ${redactCapabilitySurfaceText(guardrail)}`),
    "",
    `Inspect: /capabilities inspect ${redactCapabilitySurfaceText(capability.id)}`,
  ].join("\n");
}

function renderCapabilityInspect(capability: GstackInspiredCapability): string {
  return [
    `Capability: ${redactCapabilitySurfaceText(capability.id)}`,
    "",
    `Title: ${redactCapabilitySurfaceText(capability.title)}`,
    `Status: ${redactCapabilitySurfaceText(capability.status)}`,
    `Priority: ${redactCapabilitySurfaceText(String(capability.priority))}`,
    "",
    "Rationale:",
    redactCapabilitySurfaceText(capability.rationale),
    "",
    "Colony fit:",
    redactCapabilitySurfaceText(capability.colonyFit),
    "",
    "Next slice:",
    redactCapabilitySurfaceText(capability.nextSlice),
    "",
    "Guardrails:",
    ...capability.guardrails.map((guardrail) => `- ${redactCapabilitySurfaceText(guardrail)}`),
    "",
    "Source signals:",
    ...capability.sourceSignals.map((signal) => `- ${redactCapabilitySurfaceText(signal)}`),
    "",
    "Inspect: /capabilities | /capabilities next",
  ].join("\n");
}

function redactCapabilitySurfaceText(value: string): string {
  return scrubSecrets(value.replace(/[\r\n]+/g, " ").trim())
    .replace(/(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]");
}
