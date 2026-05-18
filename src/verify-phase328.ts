import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser({
  plugins: {
    entries: [
      { id: "local-tools", source: "bundled", installed: true, trusted: true },
      { id: "draft-plugin", source: "installed", installed: true, trusted: false },
    ],
    receipts: [
      {
        ok: true,
        pluginId: "local-tools",
        receiptId: "plugin_active_local-tools",
        active: true,
        approvedBy: "tester",
        registryFetchExecuted: false,
        packageCodeExecuted: false,
        credentialsPersisted: false,
        defaultExecution: false,
      },
    ],
  },
});

const summary = parser.tryHandle("/plugins status");
assert(!summary.isError, "plugins summary status remains accepted");
assert(summary.output.includes("Trusted entries: 2"), "plugins summary still reports aggregate entries");

const detail = parser.tryHandle("/plugins status local-tools");
assert(!detail.isError, "plugin status id is accepted");
assert(detail.output.includes("Plugin Status: local-tools"), "plugin status renders the requested id");
assert(detail.output.includes("Installed: yes"), "plugin status renders install state");
assert(detail.output.includes("Trusted: yes"), "plugin status renders trust state");
assert(detail.output.includes("Active: yes"), "plugin status renders active receipt state");
assert(detail.output.includes("Registry fetch executed: no"), "plugin status preserves registry boundary");
assert(detail.data?.pluginId === "local-tools", "plugin status data preserves plugin id");

const unknown = parser.tryHandle("/plugins status missing-plugin");
assert(unknown.isError, "unknown plugin status id is rejected");
assert(unknown.output.includes("Plugin not found: missing-plugin"), "unknown plugin status explains missing id");
assert(unknown.output.includes("/plugins trusted"), "unknown plugin status gives recovery command");

const flagOnly = parser.tryHandle("/plugins status --approved");
assert(flagOnly.isError, "flag-only plugin status id is rejected");
assert(flagOnly.output.includes("Plugin id required."), "flag-only plugin status explains id requirement");

const malformed = parser.tryHandle("/plugins status ../../escape");
assert(malformed.isError, "malformed plugin status id is rejected");
assert(malformed.output.includes("Plugin id rejected."), "malformed plugin status explains id rejection");

console.log("Phase 328: plugin status supports precise local plugin inspection.");
