import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const missingPlan = parser.tryHandle("/github pr plan");
assert(missingPlan.isError, "missing GitHub PR plan run id is rejected");
assert(missingPlan.output.includes("Run id required"), "missing PR plan explains run id requirement");
assert(missingPlan.output.includes("/github pr plan <run_id>"), "missing PR plan gives retry command");

const missingCreate = parser.tryHandle("/github pr create --approved");
assert(missingCreate.isError, "missing GitHub PR create run id is rejected");
assert(missingCreate.output.includes("Run id required"), "missing PR create explains run id requirement");
assert(missingCreate.action?.kind !== "github_pr_create", "missing PR create emits no runtime action");

const missingStatus = parser.tryHandle("/github pr status");
assert(missingStatus.isError, "missing GitHub PR status receipt id is rejected");
assert(missingStatus.output.includes("Receipt id required"), "missing PR status explains receipt id requirement");

const validCreate = parser.tryHandle("/github pr create run_321 --approved");
assert(!validCreate.isError, "valid approved GitHub PR create still succeeds");
assert(validCreate.action?.kind === "github_pr_create", "valid approved GitHub PR create emits runtime action");
assert(validCreate.action && "runId" in validCreate.action && validCreate.action.runId === "run_321", "valid approved GitHub PR create preserves run id");

console.log("Phase 321: GitHub PR commands require explicit identifiers.");
