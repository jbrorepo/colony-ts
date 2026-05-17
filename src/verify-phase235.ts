/**
 * Phase 235 Verification Script - Plugin Package Registry Metadata Enrichment
 *
 * Proves plugin package planning can consume supplied registry metadata for
 * checksum/signature enrichment without live registry fetch, credential echo,
 * or unsafe trust on mismatched metadata.
 *
 * Run: bun run src/verify-phase235.ts
 */

import {
  planPluginPackageManifest,
  type PluginPackageManifest,
  type PluginPackageRegistryMetadata,
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
    packageName: "@colony/plugin-phase235",
    packageVersion: "9.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase235.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    reviewed: true,
    sidecars: [
      {
        id: "phase235-plugin",
        sidecarId: "phase235-sidecar",
        sidecarKind: "local-sidecar",
        declaredCapabilities: ["mcp.tools"],
        allowedTools: ["echo_text"],
        allowedMethods: ["initialize", "tools/list", "tools/call"],
        expectedProtocolVersion: "2024-11-05",
        expectedServerName: "phase235-plugin-sidecar",
        expectedServerVersion: "9.0.0",
      },
    ],
    ...overrides,
  };
}

function metadata(overrides: Partial<PluginPackageRegistryMetadata> = {}): PluginPackageRegistryMetadata {
  return {
    packageName: "@colony/plugin-phase235",
    packageVersion: "9.0.0",
    packageSource: "https://plugins.example.com/colony/plugin-phase235.tgz",
    packageDigest: "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    registryUrl: "https://registry.example.com/plugins/phase235",
    fetchedAt: "2026-05-13T05:15:00.000Z",
    integrity: "sha256-cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    signatures: [
      {
        keyId: "colony-registry-root",
        algorithm: "sigstore-bundle",
        signature: "SHOULD_NOT_LEAK_SIGNATURE_BODY",
      },
    ],
    ...overrides,
  };
}

function verifyMatchingRegistryMetadata(): void {
  section("1. Matching Registry Metadata Enriches Trusted Plan");

  const plan = planPluginPackageManifest(manifest(), {
    registryMetadata: {
      "@colony/plugin-phase235@9.0.0": metadata(),
    },
  });
  const action = plan.actions[0];

  assertEqual(action?.action, "import", "Matching metadata still allows import");
  assertEqual(action?.registryMetadata?.verified, true, "Registry metadata is marked verified");
  assertEqual(action?.registryMetadata?.checksum.digest, "sha256:cdcdcdcdcdc...cdcdcdcd", "Checksum digest is bounded");
  assertEqual(action?.registryMetadata?.checksum.integrity, "sha256-cdcdcdcdcdc...cdcdcdcd", "Integrity is bounded");
  assertEqual(action?.registryMetadata?.signatures.length, 1, "Registry signature summary is present");
  assertEqual(action?.registryMetadata?.signatures[0]?.signature, "<redacted>", "Registry signature body is redacted");
  assertEqual(action?.registryMetadata?.registryUrl, "https://registry.example.com/plugins/phase235", "Safe registry URL is retained");

  const serialized = JSON.stringify(plan);
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Plan never echoes raw registry signature material");
  assert(plan.warnings.some((warning) => warning.includes("supplied registry metadata")), "Plan warns that metadata is supplied only");
  assert(plan.warnings.some((warning) => warning.includes("No live registry fetch")), "Plan preserves no live fetch truth");
}

function verifyDigestMismatchRejects(): void {
  section("2. Digest Mismatch Rejects Before Trust");

  const plan = planPluginPackageManifest(manifest(), {
    registryMetadata: {
      "@colony/plugin-phase235@9.0.0": metadata({
        packageDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      }),
    },
  });
  const action = plan.actions[0];

  assertEqual(action?.action, "reject", "Digest mismatch rejects action");
  assert(action?.reasons.includes("registry_digest_mismatch") === true, "Reject reason records digest mismatch");
  assertEqual(action?.signature, undefined, "Rejected action has no sidecar trust signature");
  assertEqual(action?.definition, undefined, "Rejected action has no normalized definition");
}

function verifyIdentityAndSourceMismatchRejects(): void {
  section("3. Identity and Source Mismatch Rejects");

  const identityPlan = planPluginPackageManifest(manifest(), {
    registryMetadata: {
      "@colony/plugin-phase235@9.0.0": metadata({ packageVersion: "9.9.9" }),
    },
  });
  assertEqual(identityPlan.actions[0]?.action, "reject", "Version mismatch rejects action");
  assert(identityPlan.actions[0]?.reasons.includes("registry_identity_mismatch") === true, "Identity mismatch reason is explicit");

  const sourcePlan = planPluginPackageManifest(manifest(), {
    registryMetadata: {
      "@colony/plugin-phase235@9.0.0": metadata({ packageSource: "https://plugins.example.com/colony/other.tgz" }),
    },
  });
  assertEqual(sourcePlan.actions[0]?.action, "reject", "Source mismatch rejects action");
  assert(sourcePlan.actions[0]?.reasons.includes("registry_source_mismatch") === true, "Source mismatch reason is explicit");
}

function verifyUnsafeRegistryMetadataRejectsAndRedacts(): void {
  section("4. Unsafe Registry Metadata Rejects and Redacts");

  const plan = planPluginPackageManifest(manifest(), {
    registryMetadata: {
      "@colony/plugin-phase235@9.0.0": metadata({
        registryUrl: "https://token:SHOULD_NOT_LEAK@registry.example.com/plugins/phase235",
      }),
    },
  });
  const action = plan.actions[0];

  assertEqual(action?.action, "reject", "Credential-bearing registry URL rejects action");
  assert(action?.reasons.includes("invalid_registry_metadata") === true, "Invalid metadata reason is explicit");
  assert(!JSON.stringify(plan).includes("SHOULD_NOT_LEAK"), "Unsafe registry metadata is redacted");
}

function verifyCompatibilityWithoutMetadata(): void {
  section("5. Missing Registry Metadata Preserves Existing Planner Behavior");

  const plan = planPluginPackageManifest(manifest());
  const action = plan.actions[0];

  assertEqual(action?.action, "import", "Import remains available without registry metadata");
  assertEqual(action?.registryMetadata, undefined, "No registry metadata field is emitted when absent");
  assertEqual(plan.importCount, 1, "Import count remains compatible");
}

async function run(): Promise<void> {
  console.log("THE COLONY - Phase 235 Verification (Plugin Package Registry Metadata Enrichment)\n");

  verifyMatchingRegistryMetadata();
  verifyDigestMismatchRejects();
  verifyIdentityAndSourceMismatchRejects();
  verifyUnsafeRegistryMetadataRejectsAndRedacts();
  verifyCompatibilityWithoutMetadata();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 235 verification FAILED");
    process.exit(1);
  }

  console.log("\nPhase 235: plugin package registry metadata enrichment is GREEN.");
}

run().catch((error) => {
  console.error("Phase 235 verification crashed:", error);
  process.exit(1);
});
