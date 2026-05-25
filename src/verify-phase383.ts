function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export {};

const readiness = await Bun.file("docs/release/ALPHA_0_RELEASE_READINESS.md").text();
const terminalSmoke = await Bun.file("docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md").text();
const providerSmoke = await Bun.file("docs/release/ALPHA_0_PROVIDER_SMOKE.md").text();
const cleanCheckout = await Bun.file("docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md").text();

assert(readiness.includes("verify:phase384"), "release readiness uses current phase384 verification frontier");
assert(readiness.includes("provider readiness and manual terminal UI swarm smoke"), "release readiness keeps RC blockers explicit");
assert(readiness.includes("local release owner"), "release readiness names support and incident owner");

assert(terminalSmoke.includes("Result: BLOCKED"), "terminal smoke keeps non-TTY automation result blocked");
assert(terminalSmoke.includes("Reason: this shell is not an interactive TTY."), "terminal smoke explains non-TTY blocker");
assert(terminalSmoke.includes("/doctor first-run"), "terminal smoke lists doctor command");
assert(terminalSmoke.includes('/swarm llm "prepare a concise local-first alpha launch checklist"'), "terminal smoke lists swarm demo command");
assert(terminalSmoke.includes("/swarm status <run_id>"), "terminal smoke lists swarm status command");
assert(terminalSmoke.includes("manual terminal UI smoke remains required"), "terminal smoke states manual evidence remains required");

assert(providerSmoke.includes("Latest Automation Preflight"), "provider smoke records latest automation preflight");
assert(providerSmoke.includes("Result: BLOCKED"), "provider smoke records blocked automation result truth");
assert(providerSmoke.includes("final Alpha 0 release tag must rerun"), "provider smoke requires final provider rerun");

assert(cleanCheckout.includes("clean checkout"), "clean checkout rehearsal doc exists");
assert(cleanCheckout.includes("release rehearsal"), "clean checkout doc records rehearsal intent");

console.log("Phase 383: local RC release evidence gates remain explicit and do not fabricate manual smoke.");
