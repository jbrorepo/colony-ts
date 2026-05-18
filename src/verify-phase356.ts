import { SlashCommandParser } from "./gateway";
import { parseCommand } from "./gateway-parse";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const flagUnknown = parser.tryHandle("/--approved");
assert(flagUnknown.handled, "flag-shaped unknown command is handled as command error");
assert(flagUnknown.isError, "flag-shaped unknown command is rejected");
assert(flagUnknown.output.includes("Unknown command: /[flag]"), "flag-shaped unknown command is normalized");
assert(!flagUnknown.output.includes("--approved"), "flag-shaped unknown command does not echo flag");

const secretUnknown = parser.tryHandle("/ghp_UNKNOWN_SHOULD_NOT_LEAK12345678");
assert(secretUnknown.handled, "secret-shaped unknown command is handled as command error");
assert(secretUnknown.isError, "secret-shaped unknown command is rejected");
assert(secretUnknown.output.includes("Unknown command: /[REDACTED]"), "secret-shaped unknown command renders redacted label");
assert(!secretUnknown.output.includes("UNKNOWN_SHOULD_NOT_LEAK"), "secret-shaped unknown command redacts token body");
assert(!secretUnknown.output.includes("ghp_"), "secret-shaped unknown command redacts token prefix");
assert(secretUnknown.command === "[REDACTED]", "secret-shaped unknown command stores only redacted command");

const secretAlias = parser.tryHandle("/github_pat_UNKNOWN_SHOULD_NOT_LEAK12345678 inspect");
assert(secretAlias.isError, "secret-shaped unknown command with args is rejected");
assert(!secretAlias.output.includes("UNKNOWN_SHOULD_NOT_LEAK"), "secret-shaped unknown command with args redacts token body");
assert(!secretAlias.output.includes("github_pat_"), "secret-shaped unknown command with args redacts token prefix");

const parsedSecret = parseCommand("/github_pat_PARSE_SHOULD_NOT_LEAK12345678");
assert(parsedSecret.type === "chat", "unknown slash commands still route through chat parser fallback");
assert(parsedSecret.raw.includes("github_pat_PARSE_SHOULD_NOT_LEAK12345678"), "parser preserves raw user input for chat fallback");

console.log("Phase 356: unknown slash command labels ignore flags and redact secrets.");
