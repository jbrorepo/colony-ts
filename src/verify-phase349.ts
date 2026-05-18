import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser({
  plugins: {
    entries: [{ id: "local-tools", source: "bundled", installed: true, trusted: true }],
  },
});

const flagOnlyPlugins = parser.tryHandle("/plugins --approved");
assert(!flagOnlyPlugins.isError, "flag-only plugins command renders default status");
assert(flagOnlyPlugins.output.includes("Plugin Status:"), "flag-only plugins command renders status heading");
assert(!flagOnlyPlugins.output.includes("Unknown plugins command"), "flag-only plugins command does not treat approval flag as command");

const flaggedTrusted = parser.tryHandle("/plugins trusted --approved");
assert(!flaggedTrusted.isError, "flagged plugins trusted command still succeeds");
assert(flaggedTrusted.output.includes("Trusted Plugins:"), "flagged plugins trusted renders trusted heading");

const secretPlugins = parser.tryHandle("/plugins ghp_PLUGINS_SHOULD_NOT_LEAK12345678");
assert(secretPlugins.isError, "secret-shaped plugins command is rejected");
assert(secretPlugins.output.includes("Unknown plugins command '[REDACTED]'"), "secret-shaped plugins command renders redacted label");
assert(!secretPlugins.output.includes("PLUGINS_SHOULD_NOT_LEAK"), "secret-shaped plugins command redacts token body");
assert(!secretPlugins.output.includes("ghp_"), "secret-shaped plugins command redacts token prefix");

const unknownPlugins = parser.tryHandle("/plugins launch");
assert(unknownPlugins.isError, "unknown plugins command is rejected");
assert(unknownPlugins.output.includes("Unknown plugins command 'launch'"), "unknown plugins command is named");
assert(unknownPlugins.output.includes("Next valid command: /plugins trusted"), "unknown plugins command gives recovery path");

console.log("Phase 349: plugin command inputs ignore flags and redact secrets.");
