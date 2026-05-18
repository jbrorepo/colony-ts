import { readFile } from "fs/promises";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const launch = await readFile("docs/LAUNCH_ALPHA_0.md", "utf8");
assert(launch.includes("Browser automation remains local-first and approval-gated"), "docs describe browser automation safety");
assert(launch.includes("GitHub PR creation requires explicit push and PR approvals"), "docs describe GitHub PR approvals");
assert(launch.includes("Trusted plugin activation requires local descriptor preflight"), "docs describe plugin activation safety");
assert(launch.includes("Executable workflow recipes pause before risky host actions"), "docs describe recipe workflow safety");

console.log("Phase 311: docs claim-safety checks are GREEN.");
