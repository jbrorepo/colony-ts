import { activateTrustedLocalPlugin, deactivateTrustedLocalPlugin } from "./mcp/trusted-local-plugin-activation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const entry = { id: "local-tools", source: "bundled" as const, installed: true, trusted: true };
const blocked = await activateTrustedLocalPlugin({ entry, approval: {}, supervisor: async () => ({ ok: true }) });
assert(!blocked.ok, "activation requires approval");
const active = await activateTrustedLocalPlugin({
  entry,
  approval: { approved: true, approvedBy: "tester", signature: "plugin-activate:local-tools" },
  supervisor: async () => ({ ok: true }),
});
assert(active.ok && active.active, "approved activation succeeds");
const stopped = await deactivateTrustedLocalPlugin({
  receipt: active,
  approval: { approved: true, approvedBy: "tester", signature: "plugin-deactivate:local-tools" },
  supervisor: async () => ({ ok: true }),
});
assert(stopped.ok && stopped.active === false, "approved deactivation succeeds");

console.log("Phase 304: trusted plugin activation/deactivation receipts are GREEN.");
