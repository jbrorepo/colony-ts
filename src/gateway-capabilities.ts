import type { GatewayBasicCommandPayload } from "./gateway-basic";
import {
  getGstackInspiredCapability,
  listGstackInspiredCapabilities,
  nextGstackInspiredCapability,
  type GstackInspiredCapability,
} from "./gstack-inspired-capabilities";

export function buildCapabilitiesCommandPayload(args: string[]): GatewayBasicCommandPayload {
  const command = (args[0] ?? "list").toLowerCase();

  if (args.length === 0 || command === "list") {
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
    const id = requiredCapabilityId(args[1]);
    if (!id) return missingCapabilityId();
    if (!id.ok) return rejectedCapabilityId();
    const capability = getGstackInspiredCapability(id.value);
    if (!capability) {
      return {
        output: `Capability not found: ${id.value}\n\nInspect: /capabilities | /capabilities next`,
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
    output: "Usage: /capabilities [list|next|inspect <id>]",
    isError: true,
    data: { action: "capabilities_usage" },
  };
}

type CapabilityIdValidation = { ok: true; value: string } | { ok: false };

function requiredCapabilityId(value: string | undefined): CapabilityIdValidation | null {
  const raw = value?.trim() ?? "";
  if (!raw || raw.startsWith("--")) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(raw)) return { ok: false };
  if (raw.includes("..") || raw.includes("@{")) return { ok: false };
  return { ok: true, value: raw };
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
    lines.push(`- ${capability.id} | ${capability.status} | ${capability.title}`);
    lines.push(`  Next: ${capability.nextSlice}`);
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
    `${capability.id} | ${capability.status} | ${capability.title}`,
    "",
    capability.nextSlice,
    "",
    "Guardrails:",
    ...capability.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
    `Inspect: /capabilities inspect ${capability.id}`,
  ].join("\n");
}

function renderCapabilityInspect(capability: GstackInspiredCapability): string {
  return [
    `Capability: ${capability.id}`,
    "",
    `Title: ${capability.title}`,
    `Status: ${capability.status}`,
    `Priority: ${capability.priority}`,
    "",
    "Rationale:",
    capability.rationale,
    "",
    "Colony fit:",
    capability.colonyFit,
    "",
    "Next slice:",
    capability.nextSlice,
    "",
    "Guardrails:",
    ...capability.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
    "Source signals:",
    ...capability.sourceSignals.map((signal) => `- ${signal}`),
    "",
    "Inspect: /capabilities | /capabilities next",
  ].join("\n");
}
