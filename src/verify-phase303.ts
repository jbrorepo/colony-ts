import { buildTrustedPluginPreflight } from "./mcp/trusted-local-plugin-activation";
import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const preflight = buildTrustedPluginPreflight({
  id: "local-tools",
  source: "bundled",
  installed: true,
  trusted: true,
});
assert(preflight.ready, "trusted installed plugin is ready");
assert(preflight.registryFetchExecuted === false, "preflight performs no registry fetch");

const parser = new SlashCommandParser({ plugins: { entries: [{ id: "local-tools", source: "bundled", installed: true, trusted: true }] } });
assert(parser.tryHandle("/plugins preflight local-tools").output.includes("Trusted Plugin Preflight:"), "/plugins preflight renders");

console.log("Phase 303: trusted local plugin preflight UX is GREEN.");
