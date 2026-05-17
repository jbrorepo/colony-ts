/**
 * Phase 72 Verification Script - Trusted MCP Stdio Operator/Audit Surfaces
 *
 * Proves trusted stdio MCP config can be inspected and projected into startup
 * trust audit events without spawning local code or leaking argv/env secrets.
 *
 * Run: bun run src/verify-phase72.ts
 */

import {
  buildStdioMcpServerApprovalRequest,
  buildStdioMcpServerOperatorInspection,
  createApprovedStdioMcpServerTrust,
  projectStdioMcpStartupTrustEvent,
  stdioMcpServerTrustSignature,
  type StdioMcpServerDefinition,
} from "./mcp";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function expectRejects(label: string, run: () => Promise<unknown> | unknown, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

function trustedDefinition(overrides: Partial<StdioMcpServerDefinition> = {}): StdioMcpServerDefinition {
  return {
    id: "phase72-fixture",
    command: process.execPath,
    args: ["server.cjs", "--workspace", "demo"],
    cwd: process.cwd(),
    env: { SAFE_MODE: "1", FEATURE_FLAG: "audit" },
    allowedTools: ["echo_text", "inspect_status"],
    ...overrides,
  };
}

function text(value: unknown): string {
  return JSON.stringify(value);
}

async function verifyOperatorInspection(): Promise<void> {
  section("1. Redacted Operator Inspection");

  const definition = trustedDefinition();
  const inspection = buildStdioMcpServerOperatorInspection(definition);
  const serialized = text(inspection);

  assertEqual(inspection.serverId, "phase72-fixture", "Inspection carries server id");
  assertEqual(inspection.signature, stdioMcpServerTrustSignature(definition), "Inspection carries exact trust signature");
  assertEqual(inspection.riskLevel, "high", "Inspection marks stdio startup as high risk");
  assertEqual(inspection.command.label.length > 0, true, "Inspection exposes command label");
  assert(!inspection.command.label.includes("\\") && !inspection.command.label.includes("/"), "Inspection does not expose absolute command path");
  assertEqual(inspection.args.count, 3, "Inspection exposes argument count");
  assert(inspection.args.preview.every((arg) => arg === "<redacted>"), "Inspection redacts every argument value");
  assertEqual(inspection.env.keys.join(","), "FEATURE_FLAG,SAFE_MODE", "Inspection exposes sorted env keys");
  assert(!serialized.includes("server.cjs"), "Inspection does not leak arg values");
  assert(!serialized.includes("demo"), "Inspection does not leak workspace arg values");
  assert(!serialized.includes("\"1\""), "Inspection does not leak env values");
  assert(inspection.allowedTools.includes("echo_text"), "Inspection exposes local allowed tools");
  assert(inspection.warnings.some((warning) => warning.includes("local code execution")), "Inspection includes local-code-execution warning");

  const approvalRequest = buildStdioMcpServerApprovalRequest(definition);
  assert(!approvalRequest.details.includes(process.cwd()), "Approval request redacts cwd");

  const secretLabelDefinition = trustedDefinition({
    command: `${process.platform === "win32" ? "C:\\tools" : "/usr/local/bin"}/SHOULD_NOT_LEAK_TOKEN_12345.exe`,
    origin: "stdio://mcp/SHOULD_NOT_LEAK_TOKEN_12345",
    pluginId: "SHOULD_NOT_LEAK_TOKEN_12345",
    clientId: "SHOULD_NOT_LEAK_TOKEN_12345",
    allowedTools: ["SHOULD_NOT_LEAK_TOKEN_12345"],
  });
  const secretLabelInspection = buildStdioMcpServerOperatorInspection(secretLabelDefinition);
  const secretLabelRequest = buildStdioMcpServerApprovalRequest(secretLabelDefinition);
  const secretLabelEvent = projectStdioMcpStartupTrustEvent(secretLabelDefinition, createApprovedStdioMcpServerTrust(secretLabelDefinition), {
    stage: "startup_allowed",
  });
  const secretLabelSerialized = text([secretLabelInspection, secretLabelRequest, secretLabelEvent]);
  assert(!secretLabelSerialized.includes("SHOULD_NOT_LEAK_TOKEN_12345"), "Operator/audit surfaces redact secret-like command and metadata labels");

  await expectRejects(
    "Inspection rejects invalid config generically",
    () => buildStdioMcpServerOperatorInspection(trustedDefinition({ command: "node" })),
    (error) => error.message === "MCP stdio server config rejected",
  );
}

async function verifyStartupTrustEvents(): Promise<void> {
  section("2. Startup Trust Event Projection");

  const definition = trustedDefinition();
  const approval = createApprovedStdioMcpServerTrust(definition, { approvedBy: "operator", reason: "phase72 smoke" });
  const requested = projectStdioMcpStartupTrustEvent(definition, undefined, {
    stage: "approval_requested",
    timestamp: "2026-04-29T04:42:25.148Z",
  });
  const allowed = projectStdioMcpStartupTrustEvent(definition, approval, {
    stage: "startup_allowed",
    timestamp: "2026-04-29T04:42:26.000Z",
  });
  const denied = projectStdioMcpStartupTrustEvent(definition, { approved: false, signature: approval.signature, reason: "not now" }, {
    stage: "startup_denied",
    timestamp: "2026-04-29T04:42:27.000Z",
  });
  const stale = projectStdioMcpStartupTrustEvent(definition, { approved: true, signature: "mcp-stdio:stale" }, {
    stage: "startup_denied",
  });

  assertEqual(requested.eventType, "mcp_stdio_trust", "Trust event uses stable event type");
  assertEqual(requested.stage, "approval_requested", "Requested event keeps requested stage");
  assertEqual(requested.outcome, "pending", "Requested event outcome is pending");
  assertEqual(allowed.outcome, "allowed", "Approved exact trust event is allowed");
  assertEqual(denied.outcome, "denied", "Denied trust event is denied");
  assertEqual(stale.outcome, "denied", "Stale trust event is denied");
  assertEqual(allowed.signature, approval.signature, "Allowed trust event carries exact signature");
  assertEqual(allowed.config.serverId, "phase72-fixture", "Trust event carries server id");
  assertEqual(allowed.config.env.keys.join(","), "FEATURE_FLAG,SAFE_MODE", "Trust event carries env keys only");
  assertEqual(allowed.config.args.count, 3, "Trust event carries arg count");
  assert(allowed.config.args.preview.every((arg) => arg === "<redacted>"), "Trust event redacts args");
  assertEqual(allowed.approval.approvedBy, "operator", "Trust event carries approval actor");
  assertEqual(allowed.approval.reason, "<redacted>", "Trust event redacts approval reason");
  assertEqual(stale.approval.signatureMatches, false, "Trust event reports signature mismatch");
  assertEqual(allowed.approval.signatureMatches, true, "Trust event reports signature match");

  const serialized = text([requested, allowed, denied, stale]);
  assert(!serialized.includes("server.cjs"), "Trust events do not leak arg values");
  assert(!serialized.includes("demo"), "Trust events do not leak workspace arg values");
  assert(!serialized.includes("phase72 smoke"), "Trust events do not leak approval reason text");
  assert(!serialized.includes("\"1\""), "Trust events do not leak env values");

  const rejected = projectStdioMcpStartupTrustEvent(trustedDefinition({ command: "node" }), undefined, {
    stage: "config_rejected",
    timestamp: "2026-04-29T04:42:28.000Z",
  });
  assertEqual(rejected.outcome, "rejected", "Invalid config event is rejected");
  assertEqual(rejected.config.valid, false, "Invalid config event marks config invalid");
  assertEqual(rejected.config.serverId, "<invalid>", "Invalid config event does not echo unsafe config");
  assert(!text(rejected).includes("node"), "Invalid config event does not leak rejected command");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 72 Verification (Trusted MCP Stdio Operator/Audit Surfaces)\n");

  await verifyOperatorInspection();
  await verifyStartupTrustEvents();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 72: trusted MCP stdio operator/audit surfaces are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
