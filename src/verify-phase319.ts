import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();
const invalid = parser.tryHandle("/workflow start not-a-recipe");

assert(invalid.handled, "invalid workflow start is handled");
assert(invalid.isError, "invalid workflow start is rejected before handoff");
assert(invalid.output.includes("Unknown workflow recipe: not-a-recipe"), "invalid workflow start names rejected recipe");
assert(invalid.output.includes("/workflow recipes"), "invalid workflow start points to recipe listing");
assert(invalid.action?.kind !== "start_workflow_recipe", "invalid workflow start does not emit runtime start action");

const valid = parser.tryHandle("/workflow start qa");
assert(!valid.isError, "known workflow recipe start remains accepted");
assert(valid.action?.kind === "start_workflow_recipe", "known workflow recipe start still emits runtime action");

console.log("Phase 319: workflow start rejects unknown recipe handoffs.");
