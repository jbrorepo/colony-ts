/**
 * Phase 389 — setup wizard pure-helper contract.
 *
 * The `scripts/setup.ts` script takes a new user from clone to first
 * conversation. This verifier exercises every pure helper without making
 * real network calls or spawning real subprocesses, so a regression in
 * version parsing, Ollama response handling, cloud env detection, or the
 * per-platform install recommendation fails the gate before the script
 * is run against a real environment.
 *
 * Covered surfaces:
 *   1. parseBunVersion accepts plain semver and rejects garbage.
 *   2. bunVersionSatisfies enforces the >= 1.3 floor.
 *   3. detectOllamaResponse handles a happy path, missing models, and
 *      junk shapes without throwing.
 *   4. detectOllamaResponse recognizes the recommended model by exact
 *      match and by `name:tag` prefix.
 *   5. unreachableOllama produces the expected error shape.
 *   6. recommendInstallCommand returns a sensible record for darwin,
 *      linux, win32, and an unknown platform.
 *   7. detectCloudProviders reports presence/absence without echoing
 *      values and reflects whitespace-only as absent.
 *   8. classifyPlatform maps NodeJS.Platform values to the four bins.
 */

import {
  assert,
  bunVersionSatisfies,
  classifyPlatform,
  detectCloudProviders,
  detectOllamaResponse,
  parseBunVersion,
  recommendInstallCommand,
  unreachableOllama,
} from "../scripts/setup";

function expectThrow(fn: () => unknown, label: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${label}: expected throw`);
}

// ---------------------------------------------------------------------------
// 1. parseBunVersion
// ---------------------------------------------------------------------------

{
  const v = parseBunVersion("1.3.0");
  assert(v.major === 1 && v.minor === 3 && v.patch === 0, "1.3.0 parsed");
  assert(v.raw === "1.3.0", "raw preserved");
}
{
  const v = parseBunVersion("v1.3.7");
  assert(v.major === 1 && v.minor === 3 && v.patch === 7, "v-prefix accepted");
}
{
  const v = parseBunVersion("1.4.12-canary.20260101");
  assert(v.major === 1 && v.minor === 4 && v.patch === 12, "canary suffix tolerated");
}
expectThrow(() => parseBunVersion(""), "empty version rejected");
expectThrow(() => parseBunVersion("not-a-version"), "garbage version rejected");
expectThrow(() => parseBunVersion("1.2"), "partial semver rejected");

// ---------------------------------------------------------------------------
// 2. bunVersionSatisfies
// ---------------------------------------------------------------------------

assert(bunVersionSatisfies(parseBunVersion("1.3.0")), "1.3.0 satisfies");
assert(bunVersionSatisfies(parseBunVersion("1.4.0")), "1.4.0 satisfies");
assert(bunVersionSatisfies(parseBunVersion("2.0.0")), "2.0.0 satisfies");
assert(!bunVersionSatisfies(parseBunVersion("1.2.99")), "1.2.99 fails floor");
assert(!bunVersionSatisfies(parseBunVersion("0.9.0")), "0.9.0 fails floor");

// ---------------------------------------------------------------------------
// 3. detectOllamaResponse — happy path, missing models, junk shapes
// ---------------------------------------------------------------------------

{
  const det = detectOllamaResponse(
    { version: "0.5.0" },
    { models: [{ name: "llama3.2" }, { name: "qwen2.5:7b" }] },
  );
  assert(det.reachable, "happy: reachable");
  assert(det.version === "0.5.0", "happy: version");
  assert(det.models.length === 2, "happy: model count");
  assert(det.hasRecommendedModel, "happy: recommended model found");
  assert(det.error === null, "happy: no error");
}
{
  const det = detectOllamaResponse({ version: "0.5.0" }, { models: [] });
  assert(det.reachable, "empty models: reachable");
  assert(det.models.length === 0, "empty models: no models");
  assert(!det.hasRecommendedModel, "empty models: recommended not found");
}
{
  // Junk shape on version body — treated as unreachable.
  const det = detectOllamaResponse({}, { models: [] });
  assert(!det.reachable, "no version => not reachable");
  assert(det.version === null, "no version => null");
}
{
  // Junk shape on tags body — should not throw, models list stays empty.
  const det = detectOllamaResponse({ version: "0.5.0" }, "not-an-object");
  assert(det.reachable, "junk tags: still reachable");
  assert(det.models.length === 0, "junk tags: empty models");
}
{
  // Entries with bad shapes are silently skipped.
  const det = detectOllamaResponse(
    { version: "0.5.0" },
    { models: [{ name: "good" }, "bad", null, { name: 42 }] },
  );
  assert(det.models.length === 1 && det.models[0] === "good", "malformed entries skipped");
}

// ---------------------------------------------------------------------------
// 4. detectOllamaResponse — recommended-model matching
// ---------------------------------------------------------------------------

{
  // Exact match.
  const det = detectOllamaResponse(
    { version: "0.5.0" },
    { models: [{ name: "llama3.2" }] },
  );
  assert(det.hasRecommendedModel, "exact match");
}
{
  // Tag-suffix match (llama3.2:latest).
  const det = detectOllamaResponse(
    { version: "0.5.0" },
    { models: [{ name: "llama3.2:latest" }] },
  );
  assert(det.hasRecommendedModel, "tag-suffix match");
}
{
  // Different model — not a match.
  const det = detectOllamaResponse(
    { version: "0.5.0" },
    { models: [{ name: "llama3.1" }] },
  );
  assert(!det.hasRecommendedModel, "different family is not a match");
}
{
  // Custom recommended model name.
  const det = detectOllamaResponse(
    { version: "0.5.0" },
    { models: [{ name: "qwen2.5:7b" }] },
    "qwen2.5",
  );
  assert(det.hasRecommendedModel, "custom recommended model matched");
}

// ---------------------------------------------------------------------------
// 5. unreachableOllama
// ---------------------------------------------------------------------------

{
  const det = unreachableOllama("could not reach http://localhost:11434/api/version");
  assert(!det.reachable, "unreachable: reachable=false");
  assert(det.version === null, "unreachable: no version");
  assert(det.models.length === 0, "unreachable: no models");
  assert(!det.hasRecommendedModel, "unreachable: no recommended");
  assert(det.error !== null && det.error.includes("could not reach"), "unreachable: error preserved");
}

// ---------------------------------------------------------------------------
// 6. recommendInstallCommand — per-platform branches
// ---------------------------------------------------------------------------

{
  const r = recommendInstallCommand("darwin");
  assert(r.platform === "darwin", "darwin: platform");
  assert(r.command.includes("brew install ollama"), "darwin: brew command");
  assert(r.url.startsWith("https://ollama.com/"), "darwin: ollama.com URL");
}
{
  const r = recommendInstallCommand("linux");
  assert(r.platform === "linux", "linux: platform");
  assert(r.command.includes("install.sh"), "linux: install.sh in command");
  assert(r.url.includes("linux"), "linux: linux URL");
}
{
  const r = recommendInstallCommand("win32");
  assert(r.platform === "win32", "win32: platform");
  assert(r.url.includes("windows"), "win32: windows URL");
}
{
  const r = recommendInstallCommand("freebsd");
  assert(r.platform === "other", "freebsd => other");
  assert(r.url.startsWith("https://ollama.com/"), "other: generic ollama.com URL");
}

// ---------------------------------------------------------------------------
// 7. detectCloudProviders — presence reporting, value never echoed
// ---------------------------------------------------------------------------

{
  const cloud = detectCloudProviders({
    ANTHROPIC_API_KEY: "sk-ant-test-value-should-not-appear-anywhere",
    OPENAI_API_KEY: undefined,
    GEMINI_API_KEY: "   ",
  });
  const anthropic = cloud.find((c) => c.envLabel === "ANTHROPIC_API_KEY");
  const openai = cloud.find((c) => c.envLabel === "OPENAI_API_KEY");
  const gemini = cloud.find((c) => c.envLabel === "GEMINI_API_KEY");
  assert(anthropic && anthropic.present, "anthropic present");
  assert(openai && !openai.present, "openai absent");
  assert(gemini && !gemini.present, "whitespace-only treated as absent");
  // The presence record must NOT carry the value.
  for (const entry of cloud) {
    assert(!Object.prototype.hasOwnProperty.call(entry, "value"), "no value field");
    const serialized = JSON.stringify(entry);
    assert(!serialized.includes("sk-ant-test-value"), "value not echoed in record");
  }
}
{
  const cloud = detectCloudProviders({});
  assert(cloud.length === 3, "always reports all three providers");
  assert(cloud.every((c) => !c.present), "all absent on empty env");
}

// ---------------------------------------------------------------------------
// 8. classifyPlatform
// ---------------------------------------------------------------------------

assert(classifyPlatform("darwin") === "darwin", "darwin classified");
assert(classifyPlatform("linux") === "linux", "linux classified");
assert(classifyPlatform("win32") === "win32", "win32 classified");
assert(classifyPlatform("aix") === "other", "aix => other");
assert(classifyPlatform("sunos") === "other", "sunos => other");

console.log(
  "Phase 389: setup wizard helpers — version parsing, Ollama detection, install hints, and cloud env detection all pass.",
);
