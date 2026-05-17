/**
 * Phase 78 Verification Script - Safe Plugin Package Discovery/Import Planner
 *
 * Proves the production plugin fabric can discover package manifests and
 * produce redacted dry-run import/update/review/reject plans without installing
 * packages, executing package code, starting sidecars, touching the network, or
 * writing package/catalog state.
 *
 * Run: bun run src/verify-phase78.ts
 */

import {
  buildPluginMcpSidecarApprovalRequest,
  planPluginPackageManifest,
  planPluginPackageManifests,
  pluginMcpSidecarTrustSignature,
  type PluginPackageManifest,
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

function manifest(overrides: Partial<PluginPackageManifest> = {}): PluginPackageManifest {
  return {
    packageName: "@colony/plugin-phase78",
    packageVersion: "4.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase78.tgz",
    packageDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    reviewed: true,
    sidecars: [
      {
        id: "phase78-plugin",
        sidecarId: "phase78-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools", "mcp.tools", "memory.read"],
        allowedTools: ["echo_text", "echo_text", "lookup_memory"],
        allowedMethods: ["tools/list", "initialize", "tools/call", "tools/list"],
        origin: "plugin://phase78/sidecar",
        pluginId: "phase78-plugin",
        clientId: "colony",
        timeoutMs: 1000,
        maxRequestBytes: 4096,
        maxResponseBytes: 8192,
        maxJsonDepth: 16,
        maxConcurrent: 2,
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase78-plugin-sidecar",
        expectedServerVersion: "4.0.0",
      },
    ],
    ...overrides,
  };
}

function verifyValidDryRunPlan(): void {
  section("1. Valid Dry-Run Import Plan");

  const plan = planPluginPackageManifest(manifest());

  assert(plan.dryRun, "Planner is explicitly dry-run");
  assert(plan.approvalRequired, "Planner requires approval before package writes/install/start");
  assertEqual(plan.totalActions, 1, "Planner emits one action for one sidecar manifest");
  assertEqual(plan.importCount, 1, "Planner counts missing reviewed sidecar as import");
  assertEqual(plan.updateCount, 0, "Planner has no update for a new sidecar");
  assertEqual(plan.reviewCount, 0, "Planner has no review for a reviewed known sidecar");
  assertEqual(plan.rejectCount, 0, "Planner has no reject for a valid manifest");

  const action = plan.actions[0];
  assertEqual(action?.action, "import", "Valid reviewed missing sidecar is planned as import");
  assertEqual(action?.dryRun, true, "Action is explicitly dry-run");
  assertEqual(action?.definition?.declaredCapabilities.join(","), "mcp.tools,memory.read", "Capabilities are sorted and deduped");
  assertEqual(action?.definition?.allowedTools.join(","), "echo_text,lookup_memory", "Allowed tools are sorted and deduped");
  assertEqual(action?.definition?.allowedMethods.join(","), "initialize,tools/call,tools/list", "Allowed methods are sorted and deduped");
  assertEqual(action?.definition?.packageDigest, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Trusted definition preserves full digest for exact trust signature");
  assert(action?.approvalRequest?.signature === pluginMcpSidecarTrustSignature(action.definition!), "Action includes exact plugin sidecar approval signature");
  assert(action?.approvalRequest?.details.includes("allowed tools: echo_text, lookup_memory") ?? false, "Approval request renders normalized allowlist");
  assert(action?.commandPreview.includes("requires explicit approval") ?? false, "Command preview states approval boundary");
  assert(action?.commandPreview.includes("dry-run only") ?? false, "Command preview states dry-run boundary");
  assert(!JSON.stringify(plan).includes("sidecarTransport"), "Plan does not expose or create raw sidecar transport");
}

function verifyDeterminismAndUpdates(): void {
  section("2. Determinism, Keep, and Update");

  const first = planPluginPackageManifest(manifest());
  const reordered = planPluginPackageManifest(manifest({
    sidecars: [
      {
        sidecarId: "phase78-sidecar",
        id: "phase78-plugin",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["memory.read", "mcp.tools"],
        allowedTools: ["lookup_memory", "echo_text"],
        allowedMethods: ["tools/call", "tools/list", "initialize"],
        origin: "plugin://phase78/sidecar",
        pluginId: "phase78-plugin",
        clientId: "colony",
        timeoutMs: 1000,
        maxRequestBytes: 4096,
        maxResponseBytes: 8192,
        maxJsonDepth: 16,
        maxConcurrent: 2,
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase78-plugin-sidecar",
        expectedServerVersion: "4.0.0",
      },
    ],
  }));

  assertEqual(reordered.actions[0]?.signature, first.actions[0]?.signature, "Equivalent manifest ordering yields stable signature");

  const signature = first.actions[0]?.signature ?? "";
  const keep = planPluginPackageManifest(manifest(), { installedSignatures: { "phase78-plugin": signature } });
  assertEqual(keep.keepCount, 1, "Matching installed signature is planned as keep");
  assertEqual(keep.actions[0]?.action, "keep", "Planner emits keep for current sidecar");

  const changedDigest = planPluginPackageManifest(manifest({
    packageDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }), { installedSignatures: { "phase78-plugin": signature } });
  assertEqual(changedDigest.actions[0]?.action, "update", "Digest change plans update against existing sidecar");
  assert(changedDigest.actions[0]?.signature !== signature, "Digest change changes the trust signature");
}

function verifyRejectsAndRedaction(): void {
  section("3. Rejects and Redaction");

  const secret = "SHOULD_NOT_LEAK_TOKEN_12345";
  const unsafe = planPluginPackageManifest(manifest({
    packageSource: `https://${secret}@plugins.example.com/pkg.tgz?token=${secret}#${secret}`,
    sidecars: [
      {
        id: secret,
        sidecarId: secret,
        sidecarKind: "local-sidecar",
        allowedTools: [secret],
        allowedMethods: ["tools/call"],
        origin: `plugin://${secret}`,
        clientId: secret,
        expectedServerName: secret,
      },
    ],
  }));

  assertEqual(unsafe.rejectCount, 1, "Unsafe source and secret-like labels reject the action");
  assertEqual(unsafe.actions[0]?.action, "reject", "Unsafe manifest action is reject");
  assertEqual(unsafe.actions[0]?.definition, undefined, "Rejected manifests do not produce trusted sidecar definitions");
  assert(!JSON.stringify(unsafe).includes(secret), "Rejected plan output redacts secret-like manifest strings");
  assert(!JSON.stringify(unsafe).includes("?token="), "Rejected plan output does not echo unsafe URL query");
  assert(!JSON.stringify(unsafe).includes("pkg.tgz"), "Rejected plan output does not echo unsafe source body");

  const badResourceRead = planPluginPackageManifest(manifest({
    sidecars: [{ id: "bad-method", sidecarId: "bad-method-sidecar", sidecarKind: "local-sidecar", allowedMethods: ["resources/read"] }],
  }));
  assertEqual(badResourceRead.actions[0]?.action, "reject", "resources/read without resource allowlist rejects the action");

  const resourceRead = planPluginPackageManifest(manifest({
    sidecars: [{
      id: "resource-method",
      sidecarId: "resource-method-sidecar",
      sidecarKind: "local-sidecar",
      allowedMethods: ["resources/list", "resources/read"],
      allowedResourceUris: ["colony://runtime/status"],
      allowedResourceUriPrefixes: ["file:///workspace/docs/"],
    }],
  }));
  assertEqual(resourceRead.actions[0]?.action, "import", "resources/read with explicit resource allowlists is plannable");
  assertEqual(resourceRead.actions[0]?.definition?.allowedMethods.join(","), "resources/list,resources/read", "Resource methods are sorted and preserved");
  assertEqual(resourceRead.actions[0]?.definition?.allowedResourceUris.join(","), "colony://runtime/status", "Exact resource allowlist is preserved");
  assertEqual(resourceRead.actions[0]?.definition?.allowedResourceUriPrefixes.join(","), "file:///workspace/docs/", "Resource prefix allowlist is preserved");

  const malformedMethod = planPluginPackageManifest(manifest({
    sidecars: [{ id: "malformed-method", sidecarId: "malformed-method-sidecar", sidecarKind: "local-sidecar", allowedMethods: "tools/list" as unknown as string[] }],
  }));
  assertEqual(malformedMethod.actions[0]?.action, "reject", "Malformed MCP method list rejects instead of throwing");

  const badToolCall = planPluginPackageManifest(manifest({
    sidecars: [{ id: "bad-tool-call", sidecarId: "bad-tool-call-sidecar", sidecarKind: "local-sidecar", allowedMethods: ["tools/call"] }],
  }));
  assertEqual(badToolCall.actions[0]?.action, "reject", "tools/call without allowed tools rejects the action");

  const invalidNumeric = planPluginPackageManifest(manifest({
    sidecars: [{ id: "bad-number", sidecarId: "bad-number-sidecar", sidecarKind: "local-sidecar", timeoutMs: -1, allowedTools: ["echo_text"] }],
  }));
  assertEqual(invalidNumeric.actions[0]?.action, "reject", "Invalid numeric guard settings reject instead of falling back");

  const hugeNumeric = planPluginPackageManifest(manifest({
    sidecars: [{ id: "huge-number", sidecarId: "huge-number-sidecar", sidecarKind: "local-sidecar", timeoutMs: Number.MAX_SAFE_INTEGER, allowedTools: ["echo_text"] }],
  }));
  assertEqual(hugeNumeric.actions[0]?.action, "reject", "Absurd numeric guard settings reject instead of weakening bounds");

  const unsafeButNotSecret = planPluginPackageManifest(manifest({
    packageSource: "http://internal.example/pkg.tgz",
  }));
  assertEqual(unsafeButNotSecret.actions[0]?.action, "reject", "Unsafe non-HTTPS source rejects");
  const unsafeButNotSecretJson = JSON.stringify(unsafeButNotSecret);
  assert(!unsafeButNotSecretJson.includes("http://internal.example/pkg.tgz"), "Rejected unsafe source output does not echo source URL");
  assert(!unsafeButNotSecretJson.includes("aaaaaaaaaaaaaaaa"), "Rejected unsafe source output does not expose digest material");
}

function verifyReviewBoundaries(): void {
  section("4. Review Boundaries");

  const unknown = planPluginPackageManifest(manifest({
    sidecars: [{ id: "unknown-kind", sidecarId: "unknown-kind-sidecar", sidecarKind: "unknown", allowedTools: ["echo_text"] }],
  }));
  assertEqual(unknown.actions[0]?.action, "review", "Unknown sidecar kind requires review by default");
  assertEqual(unknown.actions[0]?.definition, undefined, "Review actions do not produce trusted definitions by default");
  assert(unknown.actions[0]?.reasons.includes("unknown_sidecar_kind") ?? false, "Unknown sidecar review records reason");

  const acceptedUnknown = planPluginPackageManifest(manifest({
    sidecars: [{ id: "accepted-unknown", sidecarId: "accepted-unknown-sidecar", sidecarKind: "unknown", allowedTools: ["echo_text"] }],
  }), { acceptUnknownSidecars: true });
  assertEqual(acceptedUnknown.actions[0]?.action, "import", "Explicitly accepted unknown sidecar can be planned after review metadata");

  const unreviewed = planPluginPackageManifest(manifest({ reviewed: false }));
  assertEqual(unreviewed.actions[0]?.action, "review", "Unreviewed package metadata requires review");
  assertEqual(unreviewed.actions[0]?.definition, undefined, "Unreviewed package metadata does not produce trusted definition");
}

function verifyBatchPlanningHasNoExecutionHooks(): void {
  section("5. Batch Planning and No Execution Hooks");

  const plan = planPluginPackageManifests([
    manifest(),
    manifest({
      packageName: "@colony/plugin-phase78-extra",
      sidecars: [{ id: "extra-sidecar", sidecarId: "extra-sidecar", sidecarKind: "local-sidecar" }],
    }),
  ]);

  assertEqual(plan.totalActions, 2, "Batch planner includes all manifest sidecars");
  assertEqual(plan.importCount, 2, "Batch planner counts imports");
  assertEqual(plan.dryRun, true, "Batch planner remains dry-run");

  const serialized = JSON.stringify(plan);
  assert(!serialized.includes("installCommand"), "Plan has no install command execution field");
  assert(!serialized.includes("postinstall"), "Plan has no package script execution field");
  assert(!serialized.includes("network"), "Plan has no network execution field");
  assert(!serialized.includes("writeFile"), "Plan has no filesystem write execution field");
  assert(!serialized.includes("startSidecar"), "Plan has no sidecar launch execution field");

  const request = buildPluginMcpSidecarApprovalRequest(plan.actions[0]!.definition!);
  assertEqual(request.signature, plan.actions[0]?.approvalRequest?.signature, "Planner output remains compatible with existing approval request builder");
}

function main(): void {
  console.log("THE COLONY - Phase 78 Verification (Safe Plugin Package Discovery/Import Planner)\n");

  verifyValidDryRunPlan();
  verifyDeterminismAndUpdates();
  verifyRejectsAndRedaction();
  verifyReviewBoundaries();
  verifyBatchPlanningHasNoExecutionHooks();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 78: safe plugin package discovery/import planner is GREEN.");
}

main();
