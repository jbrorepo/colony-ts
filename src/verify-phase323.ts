import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const secretPlan = parser.tryHandle("/github pr plan ghp_SHOULD_NOT_LEAK12345678");
assert(secretPlan.isError, "secret-looking GitHub PR plan run id is rejected");
assert(!secretPlan.output.includes("SHOULD_NOT_LEAK"), "secret PR plan run id redacts token body");
assert(!secretPlan.output.includes("ghp_"), "secret PR plan run id redacts token prefix");

const secretCreate = parser.tryHandle("/github pr create ghp_SHOULD_NOT_LEAK12345678 --approved");
assert(secretCreate.isError, "secret-looking GitHub PR create run id is rejected");
assert(secretCreate.action?.kind !== "github_pr_create", "secret PR create emits no runtime action");
assert(!secretCreate.output.includes("SHOULD_NOT_LEAK"), "secret PR create run id redacts token body");
assert(!secretCreate.output.includes("ghp_"), "secret PR create run id redacts token prefix");

const secretStatus = parser.tryHandle("/github pr status ghp_SHOULD_NOT_LEAK12345678");
assert(secretStatus.isError, "secret-looking GitHub PR receipt id is rejected");
assert(!secretStatus.output.includes("SHOULD_NOT_LEAK"), "secret PR status receipt id redacts token body");
assert(!secretStatus.output.includes("ghp_"), "secret PR status receipt id redacts token prefix");

const malformedPlan = parser.tryHandle("/github pr plan ../../escape");
assert(malformedPlan.isError, "malformed GitHub PR plan run id is rejected");
assert(malformedPlan.output.includes("Run id rejected."), "malformed PR plan explains rejected run id");

const validPlan = parser.tryHandle("/github pr plan run_323-alpha.1");
assert(!validPlan.isError, "safe GitHub PR plan run id is accepted");
assert(validPlan.output.includes("Run: run_323-alpha.1"), "safe PR plan renders run id");

const validCreate = parser.tryHandle("/github pr create run_323-alpha.1 --approved");
assert(!validCreate.isError, "safe GitHub PR create run id is accepted");
assert(validCreate.action?.kind === "github_pr_create", "safe PR create emits runtime action");
assert(validCreate.action && "runId" in validCreate.action && validCreate.action.runId === "run_323-alpha.1", "safe PR create preserves run id");

console.log("Phase 323: GitHub PR identifiers are redacted and shape-checked.");
