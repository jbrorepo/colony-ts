/**
 * Launch Alpha 0 Verification Gate
 *
 * Aggregates the public-alpha checks without replacing the full regression gate.
 *
 * Run: bun run src/verify-alpha0.ts
 */

import { readFile } from "fs/promises";
import {
  probeAlpha0ProviderReadiness,
  renderAlpha0ProviderReadinessReport,
} from "./alpha0-provider-readiness";

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

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function verifyPackageScripts(): Promise<void> {
  const pkg = await readJson("package.json");
  const scripts = pkg.scripts as Record<string, string>;
  assert(typeof scripts["verify:alpha0"] === "string", "package exposes verify:alpha0");
  assert(scripts["verify:alpha0"].includes("verify:phase226"), "alpha gate includes swarm LLM phase");
  assert(scripts["verify:alpha0"].includes("verify:phase227"), "alpha gate includes launch guardrail phase");
  assert(typeof scripts["verify:all"] === "string" && scripts["verify:all"].includes("verify:phase227"), "full gate includes alpha frontier");
}

async function verifyReadmeCommands(): Promise<void> {
  const readme = await readFile("README.md", "utf8");
  const launch = await readFile("docs/LAUNCH_ALPHA_0.md", "utf8");
  const pkg = await readJson("package.json");
  const scripts = pkg.scripts as Record<string, string>;
  for (const command of ["start", "build", "verify:alpha0", "verify:all"]) {
    assert(typeof scripts[command] === "string", `package has ${command}`);
    assert(readme.includes(`bun run ${command}`), `README documents bun run ${command}`);
  }
  assert(readme.includes("/swarm llm"), "README documents real LLM swarm command");
  assert(readme.includes("Ollama"), "README documents Ollama-first setup");
  assert(typeof scripts["alpha0:provider-check"] === "string", "package has alpha0 provider check");
  assert(readme.includes("bun run alpha0:provider-check"), "README documents provider readiness check");
  assert(launch.includes("bun run alpha0:provider-check"), "launch doc documents provider readiness check");
}

async function verifyClaimSafety(): Promise<void> {
  const docs = [
    await readFile("README.md", "utf8"),
    await readFile("docs/LAUNCH_ALPHA_0.md", "utf8"),
    await readFile("docs/release/ALPHA_0_RELEASE_NOTES.md", "utf8"),
    await readFile("docs/release/ALPHA_0_RELEASE_READINESS.md", "utf8"),
    await readFile("docs/release/ALPHA_0_PROVIDER_SMOKE.md", "utf8"),
    await readFile("docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md", "utf8"),
    await readFile("docs/release/ALPHA_0_DEPENDENCY_RISK.md", "utf8"),
  ].join("\n");
  const forbiddenClaims = [
    /default live (?:Slack|Discord|Telegram)/i,
    /persists? credentials/i,
    /automatic(?:ally)? creates? (?:remote )?(?:PR|pull request)/i,
    /default public hosting is shipped/i,
  ];
  for (const pattern of forbiddenClaims) {
    assert(!pattern.test(docs), `launch docs avoid forbidden claim ${pattern}`);
  }
  assert(docs.includes("must not claim"), "launch docs include claim-safety boundary");
}

async function verifyReleaseDocs(): Promise<void> {
  const launch = await readFile("docs/LAUNCH_ALPHA_0.md", "utf8");
  const notes = await readFile("docs/release/ALPHA_0_RELEASE_NOTES.md", "utf8");
  const readiness = await readFile("docs/release/ALPHA_0_RELEASE_READINESS.md", "utf8");
  const providerSmoke = await readFile("docs/release/ALPHA_0_PROVIDER_SMOKE.md", "utf8");
  const terminalSmoke = await readFile("docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md", "utf8");
  const dependencyRisk = await readFile("docs/release/ALPHA_0_DEPENDENCY_RISK.md", "utf8");

  assert(launch.includes("## Release Checklist"), "launch doc has release checklist");
  assert(notes.includes("## What Ships"), "release notes describe what ships");
  assert(notes.includes("## Known Limits"), "release notes describe known limits");
  assert(notes.includes("## Manual Demo Before Tag"), "release notes include manual demo gate");
  assert(readiness.includes("Block release until"), "readiness file blocks unverified release");
  assert(readiness.includes("manual terminal UI"), "readiness file tracks terminal UI smoke");
  assert(providerSmoke.includes("Result: READY"), "provider smoke record captures readiness result");
  assert(providerSmoke.includes("does not execute `/swarm llm`"), "provider smoke record separates preflight from live demo");
  assert(terminalSmoke.includes("Result: BLOCKED"), "terminal smoke record captures non-TTY blocker");
  assert(terminalSmoke.includes("requires an interactive terminal"), "terminal smoke record preserves TTY boundary");
  assert(readiness.includes("Support handoff complete"), "readiness file records support handoff");
  assert(readiness.includes("Incident response owner identified"), "readiness file records incident owner");
  assert(dependencyRisk.includes("No vulnerabilities found"), "dependency risk records audit result");
  assert(dependencyRisk.includes("raw `fetch()`"), "dependency risk records provider dependency boundary");
}

async function verifyProviderReadinessPreflight(): Promise<void> {
  const ready = await probeAlpha0ProviderReadiness({
    env: {},
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      models: [{ name: "llama3.2:latest" }],
    }), { status: 200 }),
  });
  assert(ready.readiness === "ready", "provider preflight passes with local model");
  assert(ready.ollama.modelAvailable, "provider preflight detects configured Ollama model");

  const cloudFallback = await probeAlpha0ProviderReadiness({
    env: { ANTHROPIC_API_KEY: "secret-value" },
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    fetchImpl: async () => { throw new Error("ollama unavailable"); },
  });
  const renderedCloud = renderAlpha0ProviderReadinessReport(cloudFallback);
  assert(cloudFallback.readiness === "ready", "provider preflight accepts configured cloud fallback");
  assert(renderedCloud.includes("ANTHROPIC_API_KEY: set"), "provider preflight reports env label only");
  assert(!renderedCloud.includes("secret-value"), "provider preflight redacts secret values");

  const blocked = await probeAlpha0ProviderReadiness({
    env: {},
    now: () => new Date("2026-05-10T00:00:00.000Z"),
    fetchImpl: async () => { throw new Error("connection refused"); },
  });
  assert(blocked.readiness === "blocked", "provider preflight blocks missing provider setup");
  assert(renderAlpha0ProviderReadinessReport(blocked).includes("ollama serve"), "provider preflight prints recovery command");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Launch Alpha 0 Verification\n");
  await verifyPackageScripts();
  await verifyReadmeCommands();
  await verifyClaimSafety();
  await verifyReleaseDocs();
  await verifyProviderReadinessPreflight();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nLaunch Alpha 0 gate: GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
