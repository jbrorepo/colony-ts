import { activateTrustedLocalPlugin } from "./mcp/trusted-local-plugin-activation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const receipt = await activateTrustedLocalPlugin({
  entry: { id: "local-tools", source: "bundled", installed: true, trusted: true },
  approval: { approved: true, approvedBy: "tester", signature: "plugin-activate:local-tools" },
  supervisor: async () => ({ ok: true }),
});
assert(receipt.registryFetchExecuted === false, "activation performs no registry fetch");
assert(receipt.packageCodeExecuted === false, "activation executes no package code");
assert(receipt.credentialsPersisted === false, "activation persists no credentials");
assert(receipt.defaultExecution === false, "activation is not default execution");

console.log("Phase 305: plugin no-registry/no-credential/default-execution guardrails are GREEN.");
