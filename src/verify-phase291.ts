/**
 * Phase 291 Verification Script - Release Readiness Follow-Through
 *
 * Run: bun run src/verify-phase291.ts
 */

import { readFile } from "fs/promises";
import { SlashCommandParser } from "./gateway";

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

async function verifyPackageWiring(): Promise<void> {
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  for (const phase of [285, 286, 287, 288, 289, 290, 291]) {
    assert(packageJson.includes(`"verify:phase${phase}"`), `package exposes verify:phase${phase}`);
    assert(packageJson.includes(`bun run verify:phase${phase}`), `verify:all includes phase${phase}`);
  }
}

async function verifyDocs(): Promise<void> {
  const launch = await readFile(new URL("../docs/LAUNCH_ALPHA_0.md", import.meta.url), "utf8");
  assert(launch.includes("Browser sidecar lifecycle remains local-only"), "Launch docs mention local-only browser sidecar lifecycle");
  assert(launch.includes("Generated skill documentation and trace-to-skill output are preview/proposal artifacts"), "Launch docs mention generated docs/proposals are inert");
  assert(launch.includes("Workflow recipes are descriptor-first"), "Launch docs mention descriptor-first workflow recipes");
  assert(launch.includes("No default live browser tunnel, plugin activation, registry fetch, channel delivery, or credential persistence is shipped."), "Launch docs keep claim-safety boundary");
}

function verifyCommandSurfaces(): void {
  const parser = new SlashCommandParser();
  assert(parser.tryHandle("/browser status").output.includes("Browser Sidecar Boundary"), "Browser status command remains available");
  assert(parser.tryHandle("/skills docs-preview").output.includes("Generated Skill Documentation Preview"), "Skills docs-preview command remains available");
  assert(parser.tryHandle("/workflow recipes").output.includes("Workflow Recipes"), "Workflow recipes command remains available");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 291 Verification (Release Readiness Follow-Through)\n");
  await verifyPackageWiring();
  await verifyDocs();
  verifyCommandSurfaces();
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 291: release readiness follow-through is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
