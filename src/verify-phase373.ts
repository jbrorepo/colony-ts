import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("PLUGIN_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

const parser = new SlashCommandParser({
  plugins: {
    entries: [
      {
        id: "local-tools-ghp_PLUGIN_SURFACE_ENTRY_ID_SHOULD_NOT_LEAK12345678",
        source: "bundled",
        installed: true,
        trusted: true,
      },
      {
        id: "local-tools",
        source: "installed",
        installed: true,
        trusted: true,
      },
    ],
    receipts: [
      {
        ok: true,
        pluginId: "local-tools",
        receiptId: "plugin_active_ghp_PLUGIN_SURFACE_RECEIPT_ID_SHOULD_NOT_LEAK12345678",
        active: true,
        approvedBy: "github_pat_PLUGIN_SURFACE_APPROVER_SHOULD_NOT_LEAK12345678",
        reason: "supervisor returned ghp_PLUGIN_SURFACE_REASON_SHOULD_NOT_LEAK12345678",
        registryFetchExecuted: false,
        packageCodeExecuted: false,
        credentialsPersisted: false,
        defaultExecution: false,
      },
      {
        ok: true,
        pluginId: "plugin-github_pat_PLUGIN_SURFACE_SUMMARY_ID_SHOULD_NOT_LEAK12345678",
        receiptId: "plugin_active_safe",
        active: true,
        registryFetchExecuted: false,
        packageCodeExecuted: false,
        credentialsPersisted: false,
        defaultExecution: false,
      },
    ],
  },
});

const trusted = parser.tryHandle("/plugins trusted").output;
assert(trusted.includes("local-tools-[REDACTED]"), "trusted plugin list redacts secret-shaped descriptor ids");
assertRedacted(trusted, "trusted plugin list");

const summary = parser.tryHandle("/plugins status").output;
assert(summary.includes("plugin-[REDACTED] | active yes | ok yes"), "plugin status summary redacts receipt plugin ids");
assertRedacted(summary, "plugin status summary");

const detail = parser.tryHandle("/plugins status local-tools").output;
assert(detail.includes("Plugin Status: local-tools"), "plugin detail keeps safe requested id");
assert(detail.includes("Last receipt: plugin_active_[REDACTED]"), "plugin detail redacts receipt id");
assert(detail.includes("Reason: supervisor returned [REDACTED]"), "plugin detail redacts receipt reason");
assertRedacted(detail, "plugin status detail");

console.log("Phase 373: plugin status surfaces redact secret-shaped metadata.");
