import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const flagOnlyGitHub = parser.tryHandle("/github --approved");
assert(!flagOnlyGitHub.isError, "flag-only GitHub command renders default status");
assert(flagOnlyGitHub.output.includes("GitHub Distribution:"), "flag-only GitHub command renders status heading");
assert(!flagOnlyGitHub.output.includes("Unknown GitHub command"), "flag-only GitHub command does not treat approval flag as command");

const unknownScope = parser.tryHandle("/github deploy");
assert(unknownScope.isError, "unknown GitHub scope is rejected");
assert(unknownScope.output.includes("Unknown GitHub command 'deploy'"), "unknown GitHub scope is named");
assert(unknownScope.output.includes("Next valid command: /github issue plan"), "unknown GitHub scope gives recovery path");

const secretScope = parser.tryHandle("/github github_pat_GITHUB_SCOPE_SHOULD_NOT_LEAK12345678");
assert(secretScope.isError, "secret-shaped GitHub scope is rejected");
assert(secretScope.output.includes("Unknown GitHub command '[REDACTED]'"), "secret-shaped GitHub scope renders redacted label");
assert(!secretScope.output.includes("GITHUB_SCOPE_SHOULD_NOT_LEAK"), "secret-shaped GitHub scope redacts token body");
assert(!secretScope.output.includes("github_pat_"), "secret-shaped GitHub scope redacts token prefix");

const unknownAction = parser.tryHandle("/github pr launch");
assert(unknownAction.isError, "unknown GitHub action is rejected");
assert(unknownAction.output.includes("Unknown GitHub command 'pr launch'"), "unknown GitHub action is named");
assert(unknownAction.output.includes("/github pr plan <run_id>"), "unknown GitHub action gives PR recovery path");

const secretAction = parser.tryHandle("/github pr ghp_GITHUB_ACTION_SHOULD_NOT_LEAK12345678");
assert(secretAction.isError, "secret-shaped GitHub action is rejected");
assert(secretAction.output.includes("Unknown GitHub command 'pr [REDACTED]'"), "secret-shaped GitHub action renders redacted label");
assert(!secretAction.output.includes("GITHUB_ACTION_SHOULD_NOT_LEAK"), "secret-shaped GitHub action redacts token body");
assert(!secretAction.output.includes("ghp_"), "secret-shaped GitHub action redacts token prefix");

console.log("Phase 350: GitHub command inputs ignore flags and redact secrets.");
