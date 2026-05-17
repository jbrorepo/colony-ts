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
    const id = args[1] ?? "";
    if (!id) {
      return {
        output: "Usage: /capabilities inspect <id>",
        isError: true,
        data: { action: "capabilities_usage" },
      };
    }
    const capability = getGstackInspiredCapability(id);
    if (!capability) {
      return {
        output: `Capability not found: ${id}\n\nInspect: /capabilities | /capabilities next`,
        isError: true,
        data: {
          action: "capabilities_missing",
          id,
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
