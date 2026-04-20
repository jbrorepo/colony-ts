/**
 * Phase 19 Verification Script - Async MemPalace Filesystem Safety
 *
 * Proves MemPalace layers and store no longer rely on sync filesystem helpers,
 * while keeping wake-up, recall, search, and graph behavior intact.
 *
 * Run: bun run src/verify-phase19a.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { MemoryStack } from "./mempalace/layers";
import { findTunnels, graphStats, traverse } from "./mempalace/palace-graph";
import { PalaceStore } from "./mempalace/store";

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

async function removeWithRetry(path: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === "EBUSY" || code === "EPERM") && attempt < 9) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }
      console.warn(`  WARN cleanup skipped for ${path}: ${String(error)}`);
      return;
    }
  }
}

async function verifyAsyncStoreOpenAndMining(): Promise<void> {
  section("1. PalaceStore Async Open");

  const dir = await mkdtemp(join(tmpdir(), "colony-mempalace-store-"));
  const palacePath = join(dir, "palace");
  const sourceFile = join(dir, "source.txt");

  try {
    let missingThrows = false;
    try {
      await PalaceStore.open({ palacePath: join(dir, "missing"), create: false });
    } catch (error) {
      missingThrows = String(error).includes("No palace found");
    }
    assert(missingThrows, "Missing palace throws clean async error");

    await Bun.write(sourceFile, "login token rotation notes");
    const store = await PalaceStore.open({ palacePath, create: true });

    try {
      const id = store.add({
        id: "",
        content: "Decision: keep auth token rotation local-first.",
        wing: "project_alpha",
        room: "auth",
        hall: "hall_facts",
        sourceFile,
        sourceMtime: (await Bun.file(sourceFile).stat()).mtime?.getTime()
          ? (await Bun.file(sourceFile).stat()).mtime!.getTime() / 1000
          : undefined,
        date: "2026-04-16",
        importance: 5,
        emotionalWeight: 0.5,
        metadata: { source: "verify" },
      });

      assert(id.startsWith("d_"), "Store generates drawer id");
      assertEqual(store.count(), 1, "Store count reflects inserted drawer");
      assert(store.search("token rotation").results.length > 0, "Store search still works");
      assert(await store.fileAlreadyMined(sourceFile), "fileAlreadyMined works without mtime check");
      assert(await store.fileAlreadyMined(sourceFile, true), "fileAlreadyMined works with async stat mtime check");
    } finally {
      store.close();
    }
  } finally {
    await removeWithRetry(dir);
  }
}

async function verifyAsyncLayersAndMemoryStack(): Promise<void> {
  section("2. Async Layers + MemoryStack");

  const dir = await mkdtemp(join(tmpdir(), "colony-mempalace-layers-"));
  const palacePath = join(dir, "palace");
  const identityPath = join(dir, "identity.txt");
  const sourceFile = join(dir, "auth.md");

  try {
    await Bun.write(identityPath, "I am Assist-Ant. Keep truth exact.");
    await Bun.write(sourceFile, "auth migration source");

    const file = Bun.file(sourceFile);
    const stat = await file.stat();

    const store = await PalaceStore.open({ palacePath, create: true });
    try {
      store.addBatch([
        {
          id: "",
          content: "Decision: auth migration uses token rotation with conservative approvals.",
          wing: "project_alpha",
          room: "auth",
          hall: "hall_facts",
          sourceFile,
          sourceMtime: stat.mtime ? stat.mtime.getTime() / 1000 : undefined,
          date: "2026-04-16",
          importance: 5,
          emotionalWeight: 0.5,
          metadata: {},
        },
        {
          id: "",
          content: "Pattern: project_alpha login flow keeps provider failover local-first.",
          wing: "project_alpha",
          room: "auth",
          hall: "hall_discoveries",
          sourceFile,
          sourceMtime: stat.mtime ? stat.mtime.getTime() / 1000 : undefined,
          date: "2026-04-16",
          importance: 4,
          emotionalWeight: 0.5,
          metadata: {},
        },
      ]);
    } finally {
      store.close();
    }

    const stack = new MemoryStack(palacePath, identityPath);
    const wakeUp = await stack.wakeUp("project_alpha");
    const recall = await stack.recall({ wing: "project_alpha", room: "auth" });
    const search = await stack.search("token rotation");
    const status = await stack.status();

    assert(wakeUp.includes("I am Assist-Ant"), "wakeUp includes async identity layer");
    assert(wakeUp.includes("ESSENTIAL STORY"), "wakeUp includes L1 essential story");
    assert(recall.includes("ON-DEMAND"), "recall returns async L2 content");
    assert(search.includes("SEARCH RESULTS"), "search returns async L3 content");
    assertEqual(status.totalDrawers, 2, "status counts drawers through async store open");
    assert(status.l0Identity.exists, "status sees async identity file");
    assert(status.l0Identity.tokens > 0, "status computes async identity token estimate");
  } finally {
    await removeWithRetry(dir);
  }
}

async function verifyAsyncPalaceGraph(): Promise<void> {
  section("3. Async Palace Graph");

  const dir = await mkdtemp(join(tmpdir(), "colony-mempalace-graph-"));
  const palacePath = join(dir, "palace");

  try {
    const store = await PalaceStore.open({ palacePath, create: true });
    try {
      store.addBatch([
        {
          id: "",
          content: "Auth topic in alpha.",
          wing: "project_alpha",
          room: "auth",
          hall: "hall_facts",
          sourceFile: "alpha.md",
          importance: 5,
          metadata: {},
        },
        {
          id: "",
          content: "Auth topic in beta.",
          wing: "project_beta",
          room: "auth",
          hall: "hall_facts",
          sourceFile: "beta.md",
          importance: 4,
          metadata: {},
        },
        {
          id: "",
          content: "Billing topic in alpha.",
          wing: "project_alpha",
          room: "billing",
          hall: "hall_events",
          sourceFile: "billing.md",
          importance: 3,
          metadata: {},
        },
      ]);
    } finally {
      store.close();
    }

    const walk = await traverse("auth", palacePath, 2);
    const tunnels = await findTunnels("project_alpha", "project_beta", palacePath);
    const stats = await graphStats(palacePath);

    assert(Array.isArray(walk), "traverse returns result array for known room");
    assert((walk as Array<{ room: string }>).some((entry) => entry.room === "billing"), "traverse crosses shared wing edges");
    assertEqual(tunnels.length, 1, "findTunnels finds shared auth room");
    assertEqual(stats.tunnelRooms, 1, "graphStats counts tunnel rooms");
    assertEqual(stats.totalRooms, 2, "graphStats counts distinct named rooms");
  } finally {
    await removeWithRetry(dir);
  }
}

async function verifyNoSyncFsHelpersRemain(): Promise<void> {
  section("4. No Sync Filesystem Helpers Remain");

  const targets = [
    "./src/mempalace/store.ts",
    "./src/mempalace/layers.ts",
    "./src/mempalace/palace-graph.ts",
  ];
  const forbidden = ["existsSync", "readFileSync", "mkdirSync", "chmodSync", "statSync"];

  for (const target of targets) {
    const source = await Bun.file(target).text();
    for (const token of forbidden) {
      assert(!source.includes(token), `${target} omits ${token}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 19a Verification (Async MemPalace Filesystem Safety)\n");

  await verifyAsyncStoreOpenAndMining();
  await verifyAsyncLayersAndMemoryStack();
  await verifyAsyncPalaceGraph();
  await verifyNoSyncFsHelpersRemain();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 19a verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 19a: Async MemPalace filesystem safety is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
