import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("CAPABILITY_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

const parser = new SlashCommandParser();

const secretInspect = parser.tryHandle("/capabilities inspect ghp_CAPABILITY_SURFACE_INSPECT_SHOULD_NOT_LEAK12345678");
assert(secretInspect.isError, "secret-shaped capability inspect id is rejected");
assert(secretInspect.output.includes("Capability id rejected."), "secret-shaped inspect explains rejection");
assert(secretInspect.data?.action === "capabilities_rejected_id", "secret-shaped inspect reports rejected id action");
assertRedacted(secretInspect.output, "secret-shaped capability inspect");

const secretUnknownCommand = parser.tryHandle("/capabilities github_pat_CAPABILITY_SURFACE_COMMAND_SHOULD_NOT_LEAK12345678");
assert(secretUnknownCommand.isError, "secret-shaped capability command is rejected");
assert(secretUnknownCommand.output.includes("Unknown capabilities command '[REDACTED]'"), "secret-shaped command label is redacted");
assertRedacted(secretUnknownCommand.output, "secret-shaped capability command");

const secretShowAlias = parser.tryHandle("/capabilities show github_pat_CAPABILITY_SURFACE_ALIAS_SHOULD_NOT_LEAK12345678");
assert(secretShowAlias.isError, "secret-shaped capability show alias id is rejected");
assert(secretShowAlias.output.includes("Capability id rejected."), "secret-shaped show alias explains rejection");
assertRedacted(secretShowAlias.output, "secret-shaped capability show alias");

const safeUnknown = parser.tryHandle("/capabilities inspect unknown-track");
assert(safeUnknown.isError, "safe unknown capability id still reports missing");
assert(safeUnknown.output.includes("Capability not found: unknown-track"), "safe unknown capability id remains visible");

console.log("Phase 375: capability command identifiers redact secret-shaped metadata.");
