import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser({
  plugins: {
    entries: [{ id: "local-tools", source: "bundled", installed: true, trusted: true }],
  },
});

const missingPreflight = parser.tryHandle("/plugins preflight");
assert(missingPreflight.isError, "missing plugin preflight id is rejected");
assert(missingPreflight.output.includes("Plugin id required."), "missing plugin preflight explains requirement");

const missingActivate = parser.tryHandle("/plugins activate --approved");
assert(missingActivate.isError, "missing plugin activate id is rejected");
assert(missingActivate.action?.kind !== "plugin_activate", "missing plugin activate emits no runtime action");
assert(missingActivate.output.includes("/plugins activate <id> --approved"), "missing plugin activate gives retry command");

const secretActivate = parser.tryHandle("/plugins activate ghp_SHOULD_NOT_LEAK12345678 --approved");
assert(secretActivate.isError, "secret-looking plugin activate id is rejected");
assert(secretActivate.action?.kind !== "plugin_activate", "secret plugin activate emits no runtime action");
assert(!secretActivate.output.includes("SHOULD_NOT_LEAK"), "secret plugin activate redacts token body");
assert(!secretActivate.output.includes("ghp_"), "secret plugin activate redacts token prefix");

const malformedDeactivate = parser.tryHandle("/plugins deactivate ../../escape --approved");
assert(malformedDeactivate.isError, "malformed plugin deactivate id is rejected");
assert(malformedDeactivate.action?.kind !== "plugin_deactivate", "malformed plugin deactivate emits no runtime action");
assert(malformedDeactivate.output.includes("Plugin id rejected."), "malformed plugin id explains rejection");

const validPreflight = parser.tryHandle("/plugins preflight local-tools");
assert(!validPreflight.isError, "safe plugin preflight id is accepted");
assert(validPreflight.output.includes("local-tools"), "safe plugin preflight renders id");

const validActivate = parser.tryHandle("/plugins activate local-tools --approved");
assert(!validActivate.isError, "safe approved plugin activate is accepted");
assert(validActivate.action?.kind === "plugin_activate", "safe plugin activate emits runtime action");
assert(validActivate.action && "pluginId" in validActivate.action && validActivate.action.pluginId === "local-tools", "safe plugin activate preserves id");

console.log("Phase 324: plugin command identifiers are required and redacted.");
