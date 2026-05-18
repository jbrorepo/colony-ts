import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser({
  runtime: { activeRun: false, workflowRuns: [] },
  browser: {},
  plugins: { entries: [] },
});
const status = parser.tryHandle("/status operator").output;
assert(status.includes("Operator Dashboard:"), "/status operator renders dashboard");
assert(status.includes("Next valid command:"), "operator dashboard includes next command");
assert(parser.tryHandle("/tools activity").output.includes("Recent tool activity:"), "/tools activity alias works");
assert(parser.tryHandle("/browser status").output.includes("Next valid command:"), "/browser status includes next command");

console.log("Phase 306: dashboard next-action rendering is GREEN.");
