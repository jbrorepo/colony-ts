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

const missingIssue = parser.tryHandle("/github issue plan");
assert(missingIssue.isError, "missing GitHub issue plan reference is rejected");
assert(missingIssue.output.includes("GitHub issue reference required."), "missing issue plan explains reference requirement");
assert(missingIssue.output.includes("/github issue plan <owner>/<repo>#<n>"), "missing issue plan gives retry command");

const flagOnlyIssue = parser.tryHandle("/github issue plan --approved");
assert(flagOnlyIssue.isError, "flag-only GitHub issue plan reference is rejected");
assert(flagOnlyIssue.output.includes("GitHub issue reference required."), "flag-only issue plan explains reference requirement");
assert(!flagOnlyIssue.output.includes("Approval signature:"), "flag-only issue plan emits no workspace approval signature");

const validIssue = parser.tryHandle("/github issue plan jbrorepo/colony-ts#333");
assert(!validIssue.isError, "valid GitHub issue plan reference still succeeds");
assert(validIssue.output.includes("Issue: jbrorepo/colony-ts#333"), "valid issue plan preserves coordinates");
assert(validIssue.output.includes("Network fetch: no"), "valid issue plan preserves no-network boundary");

console.log("Phase 333: GitHub issue plan references are required.");
