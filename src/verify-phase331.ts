import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const valid = parser.tryHandle("/capabilities inspect browser-sidecar");
assert(!valid.isError, "valid capability inspect is accepted");
assert(valid.output.includes("Capability: browser-sidecar"), "valid capability inspect renders capability");
assert(valid.data?.id === "browser-sidecar", "valid capability inspect preserves id");

const missing = parser.tryHandle("/capabilities inspect");
assert(missing.isError, "missing capability inspect id is rejected");
assert(missing.output.includes("Capability id required."), "missing capability inspect explains requirement");
assert(missing.output.includes("/capabilities inspect <id>"), "missing capability inspect gives retry command");

const flagOnly = parser.tryHandle("/capabilities inspect --json");
assert(flagOnly.isError, "flag-only capability inspect id is rejected");
assert(flagOnly.output.includes("Capability id required."), "flag-only capability inspect explains requirement");
assert(flagOnly.data?.action === "capabilities_missing_id", "flag-only capability inspect reports missing id action");

const malformed = parser.tryHandle("/capabilities inspect ../../browser-sidecar");
assert(malformed.isError, "malformed capability inspect id is rejected");
assert(malformed.output.includes("Capability id rejected."), "malformed capability inspect explains rejection");
assert(malformed.output.includes("Capability identifiers must be local capability ids"), "malformed capability inspect names id boundary");
assert(malformed.data?.action === "capabilities_rejected_id", "malformed capability inspect reports rejected id action");

const unknown = parser.tryHandle("/capabilities inspect unknown-track");
assert(unknown.isError, "unknown safe capability id still fails closed");
assert(unknown.output.includes("Capability not found: unknown-track"), "unknown safe capability id reports not found");
assert(unknown.data?.action === "capabilities_missing", "unknown safe capability id preserves missing action");

console.log("Phase 331: capability inspect identifiers are required and shape-checked.");
