import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser({ startupReport: { passed: true, errorCount: 0, warningCount: 0, checks: [] } });
assert(parser.tryHandle("/doctor setup").output.includes("Guided Setup:"), "/doctor setup renders");
assert(parser.tryHandle("/doctor demo").output.includes("Demo Path:"), "/doctor demo renders");
assert(parser.tryHandle("/doctor release").output.includes("Release Readiness:"), "/doctor release renders");

console.log("Phase 310: guided first-run output is GREEN.");
