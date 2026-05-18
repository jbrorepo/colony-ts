import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser({
  workspace: {
    root: "D:/The Colony Test/colony-ts",
    name: "colony-ts",
    detected: true,
    projectType: "typescript",
    packageManager: "bun",
  },
});

const planned = parser.tryHandle("/github issue plan jbrorepo/colony-ts#320");
assert(planned.handled, "github issue plan is handled");
assert(!planned.isError, "valid github issue plan succeeds");
assert(planned.output.includes("GitHub Issue Plan:"), "valid issue plan renders heading");
assert(planned.output.includes("Issue: jbrorepo/colony-ts#320"), "valid issue plan includes normalized issue");
assert(planned.output.includes("Branch: colony/issue-320-github-issue-handoff"), "valid issue plan includes deterministic branch");
assert(planned.output.includes("Approval signature: github-local-workspace:jbrorepo/colony-ts#320:"), "valid issue plan includes exact workspace approval signature");
assert(planned.output.includes("Network fetch: no"), "valid issue plan preserves no-network boundary");
assert(planned.output.includes("No git push or remote PR creation is prepared"), "valid issue plan renders remote mutation boundary");

const url = parser.tryHandle("/github issue plan https://github.com/acme/widget/issues/12?token=ghp_SHOULD_NOT_LEAK12345678");
assert(!url.isError, "token-bearing github issue URL is accepted after redaction");
assert(url.output.includes("Issue: acme/widget#12"), "URL issue plan parses coordinates");
assert(!url.output.includes("SHOULD_NOT_LEAK"), "URL issue plan redacts token material");
assert(!url.output.includes("ghp_"), "URL issue plan redacts GitHub token prefix");

const invalid = parser.tryHandle("/github issue plan https://github.com/acme/widget/issues/not-a-number?token=ghp_SHOULD_NOT_LEAK12345678");
assert(invalid.isError, "invalid github issue plan is rejected");
assert(invalid.output.includes("GitHub Issue Plan rejected."), "invalid issue plan renders rejection heading");
assert(invalid.output.includes("owner, repo, and positive issue number"), "invalid issue plan explains coordinate requirement");
assert(invalid.output.includes("Next valid command: /github issue plan <owner>/<repo>#<n>"), "invalid issue plan gives retry command");
assert(!invalid.output.includes("SHOULD_NOT_LEAK"), "invalid issue plan redacts token material");

console.log("Phase 320: GitHub issue plan uses real local intake.");
