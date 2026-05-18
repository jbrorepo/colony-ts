import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const missingWait = parser.tryHandle("/browser wait");
assert(missingWait.isError, "missing browser wait target is rejected");
assert(missingWait.action?.kind !== "browser_wait", "missing browser wait emits no runtime action");
assert(missingWait.output.includes("Browser wait target required."), "missing browser wait explains target requirement");
assert(missingWait.output.includes("/browser wait <selector|ms>"), "missing browser wait gives retry command");

const flagOnlyWait = parser.tryHandle("/browser wait --approved");
assert(flagOnlyWait.isError, "flag-only browser wait target is rejected");
assert(flagOnlyWait.action?.kind !== "browser_wait", "flag-only browser wait emits no runtime action");

const validSelectorWait = parser.tryHandle("/browser wait #results");
assert(!validSelectorWait.isError, "selector browser wait is accepted");
assert(validSelectorWait.action?.kind === "browser_wait", "selector browser wait emits runtime action");
assert(validSelectorWait.action && "target" in validSelectorWait.action && validSelectorWait.action.target === "#results", "selector browser wait preserves target");

const validMsWait = parser.tryHandle("/browser wait 250");
assert(!validMsWait.isError, "millisecond browser wait is accepted");
assert(validMsWait.action?.kind === "browser_wait", "millisecond browser wait emits runtime action");
assert(validMsWait.output.includes("Target: 250"), "millisecond browser wait renders target");

console.log("Phase 326: browser wait requires an explicit target.");
