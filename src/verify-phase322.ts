import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const missing = parser.tryHandle("/github workspace approve");
assert(missing.isError, "missing GitHub workspace approval signature is rejected");
assert(missing.output.includes("Workspace approval signature required."), "missing workspace approval explains signature requirement");
assert(missing.output.includes("/github workspace approve <signature>"), "missing workspace approval gives retry command");

const malformed = parser.tryHandle("/github workspace approve wrong-signature");
assert(malformed.isError, "malformed GitHub workspace approval signature is rejected");
assert(malformed.output.includes("Malformed GitHub workspace approval signature."), "malformed workspace approval explains signature shape");
assert(malformed.output.includes("github-local-workspace:<owner>/<repo>#<issue>:<branch>"), "malformed workspace approval shows expected prefix");

const secret = parser.tryHandle("/github workspace approve ghp_SHOULD_NOT_LEAK12345678");
assert(secret.isError, "secret-looking workspace approval is rejected");
assert(!secret.output.includes("SHOULD_NOT_LEAK"), "secret-looking workspace approval redacts token body");
assert(!secret.output.includes("ghp_"), "secret-looking workspace approval redacts token prefix");

const valid = parser.tryHandle("/github workspace approve github-local-workspace:jbrorepo/colony-ts#322:colony/issue-322-workspace-approval");
assert(!valid.isError, "valid GitHub workspace approval signature is accepted");
assert(valid.output.includes("GitHub Workspace Approval:"), "valid workspace approval renders heading");
assert(valid.output.includes("Issue: jbrorepo/colony-ts#322"), "valid workspace approval includes parsed issue");
assert(valid.output.includes("Branch: colony/issue-322-workspace-approval"), "valid workspace approval includes parsed branch");
assert(valid.output.includes("Local branch/worktree mutation requires exact approval and injected executor."), "valid workspace approval preserves host executor boundary");

console.log("Phase 322: GitHub workspace approval validates local signatures.");
