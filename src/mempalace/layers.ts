/**
 * Mempalace Layers - 4-Layer Memory Stack.
 *
 * 1:1 port of mempalace/layers.py, adapted for async filesystem access so the
 * memory stack does not block the Bun event loop with sync disk reads.
 *
 *   Layer 0: Identity        (~100 tokens)   - Always loaded. "Who am I?"
 *   Layer 1: Essential Story (~500-800)      - Always loaded. Top moments.
 *   Layer 2: On-Demand       (~200-500 each) - Loaded when topic comes up.
 *   Layer 3: Deep Search     (unlimited)     - Full semantic search.
 *
 * Wake-up cost: ~600-900 tokens (L0+L1). Leaves 95%+ of context free.
 */

import { join, basename } from "path";
import { homedir } from "os";
import { watch } from "fs";
import type { FSWatcher } from "fs";

import { PalaceStore } from "./store";
import { MempalaceConfig } from "./config";
import type { SearchHit, StackStatus } from "./types";

// ---------------------------------------------------------------------------
// Layer 0 - Identity
// ---------------------------------------------------------------------------

export class Layer0 {
  private _path: string;
  private _text: string | null = null;
  private _watcher: FSWatcher | null = null;

  constructor(identityPath?: string) {
    this._path = identityPath ?? join(homedir(), ".mempalace", "identity.txt");
  }

  async render(): Promise<string> {
    if (this._text !== null) return this._text;

    const file = Bun.file(this._path);
    if (await file.exists()) {
      this._text = (await file.text()).trim();
      this._startWatcher();
    } else {
      this._text = "## L0 - IDENTITY\nNo identity configured. Create ~/.mempalace/identity.txt";
    }
    return this._text;
  }

  async tokenEstimate(): Promise<number> {
    return Math.ceil((await this.render()).length / 4);
  }

  /** Force cache invalidation — next render() call will re-read from disk. */
  invalidate(): void {
    this._text = null;
  }

  /** Stop the file watcher and release resources. Call during session teardown. */
  dispose(): void {
    this._watcher?.close();
    this._watcher = null;
  }

  /**
   * Start watching the identity file for changes.  Invalidates the cache
   * whenever the file is modified or renamed.  Called lazily after the file
   * is confirmed to exist.  The watcher is unreffed so it does not prevent
   * clean process exit.
   */
  private _startWatcher(): void {
    if (this._watcher) return;
    try {
      this._watcher = watch(this._path, () => {
        this._text = null; // Invalidate — next render() re-reads from disk
      });
      // Don't keep the process alive just for cache invalidation
      this._watcher.unref();
    } catch {
      // File watching is unavailable in some environments (sandboxed, read-only
      // filesystems, etc.) — fail silently; stale cache is better than a crash
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 1 - Essential Story (auto-generated from palace)
// ---------------------------------------------------------------------------

export class Layer1 {
  static readonly MAX_DRAWERS = 15;
  static readonly MAX_CHARS = 3200;
  static readonly MAX_SCAN = 2000;

  private _palacePath: string;
  private _wing?: string;

  constructor(palacePath?: string, wing?: string) {
    const cfg = new MempalaceConfig();
    this._palacePath = palacePath ?? cfg.palacePath;
    this._wing = wing;
  }

  set wing(w: string | undefined) {
    this._wing = w;
  }

  async generate(): Promise<string> {
    let store: PalaceStore;
    try {
      store = await PalaceStore.open({ palacePath: this._palacePath, create: false });
    } catch {
      return "## L1 - No palace found. Run: mempalace mine <dir>";
    }

    try {
      const drawers = store.list({
        wing: this._wing,
        limit: Layer1.MAX_SCAN,
        orderBy: "importance",
      });

      if (drawers.length === 0) return "## L1 - No memories yet.";

      const scored = drawers.map((drawer) => ({
        importance: drawer.importance ?? 3,
        drawer,
      }));
      scored.sort((left, right) => right.importance - left.importance);
      const top = scored.slice(0, Layer1.MAX_DRAWERS);

      const byRoom = new Map<string, typeof top>();
      for (const entry of top) {
        const room = entry.drawer.room || "general";
        if (!byRoom.has(room)) byRoom.set(room, []);
        byRoom.get(room)!.push(entry);
      }

      const lines = ["## L1 - ESSENTIAL STORY"];
      let totalLen = 0;

      for (const [room, entries] of [...byRoom.entries()].sort()) {
        const roomLine = `\n[${room}]`;
        lines.push(roomLine);
        totalLen += roomLine.length;

        for (const { drawer } of entries) {
          const source = drawer.sourceFile ? basename(drawer.sourceFile) : "";
          let snippet = drawer.content.trim().replace(/\n/g, " ");
          if (snippet.length > 200) snippet = `${snippet.slice(0, 197)}...`;

          let entryLine = `  - ${snippet}`;
          if (source) entryLine += `  (${source})`;

          if (totalLen + entryLine.length > Layer1.MAX_CHARS) {
            lines.push("  ... (more in L3 search)");
            return lines.join("\n");
          }

          lines.push(entryLine);
          totalLen += entryLine.length;
        }
      }

      return lines.join("\n");
    } finally {
      store.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 2 - On-Demand (wing/room filtered retrieval)
// ---------------------------------------------------------------------------

export class Layer2 {
  private _palacePath: string;

  constructor(palacePath?: string) {
    const cfg = new MempalaceConfig();
    this._palacePath = palacePath ?? cfg.palacePath;
  }

  async retrieve(opts?: { wing?: string; room?: string; hall?: string; nResults?: number }): Promise<string> {
    let store: PalaceStore;
    try {
      store = await PalaceStore.open({ palacePath: this._palacePath, create: false });
    } catch {
      return "No palace found.";
    }

    try {
      const drawers = store.list({
        wing: opts?.wing,
        room: opts?.room,
        hall: opts?.hall,
        limit: opts?.nResults ?? 10,
      });

      if (drawers.length === 0) {
        const label = [opts?.wing && `wing=${opts.wing}`, opts?.room && `room=${opts.room}`, opts?.hall && `hall=${opts.hall}`]
          .filter(Boolean)
          .join(" ");
        return `No drawers found for ${label}.`;
      }

      const lines = [`## L2 - ON-DEMAND (${drawers.length} drawers)`];
      for (const drawer of drawers) {
        const source = drawer.sourceFile ? basename(drawer.sourceFile) : "";
        let snippet = drawer.content.trim().replace(/\n/g, " ");
        if (snippet.length > 300) snippet = `${snippet.slice(0, 297)}...`;

        let entry = `  [${drawer.room}${drawer.hall ? `/${drawer.hall}` : ""}] ${snippet}`;
        if (source) entry += `  (${source})`;
        lines.push(entry);
      }

      return lines.join("\n");
    } finally {
      store.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 3 - Deep Search (full semantic search)
// ---------------------------------------------------------------------------

export class Layer3 {
  private _palacePath: string;

  constructor(palacePath?: string) {
    const cfg = new MempalaceConfig();
    this._palacePath = palacePath ?? cfg.palacePath;
  }

  async search(query: string, opts?: { wing?: string; room?: string; hall?: string; sourceFile?: string; nResults?: number }): Promise<string> {
    let store: PalaceStore;
    try {
      store = await PalaceStore.open({ palacePath: this._palacePath, create: false });
    } catch {
      return "No palace found.";
    }

    try {
      const result = store.search(query, {
        wing: opts?.wing,
        room: opts?.room,
        hall: opts?.hall,
        sourceFile: opts?.sourceFile,
        nResults: opts?.nResults ?? 5,
      });

      if (result.results.length === 0) return "No results found.";

      const lines = [`## L3 - SEARCH RESULTS for "${query}"`];
      for (let index = 0; index < result.results.length; index++) {
        const hit = result.results[index];
        let snippet = hit.text.trim().replace(/\n/g, " ");
        if (snippet.length > 300) snippet = `${snippet.slice(0, 297)}...`;

        lines.push(`  [${index + 1}] ${hit.wing}/${hit.room}${hit.hall ? `/${hit.hall}` : ""} (sim=${hit.similarity})`);
        lines.push(`      ${snippet}`);
        if (hit.sourceFile) lines.push(`      src: ${hit.sourceFile}`);
      }

      return lines.join("\n");
    } finally {
      store.close();
    }
  }

  async searchRaw(query: string, opts?: { wing?: string; room?: string; hall?: string; sourceFile?: string; nResults?: number }): Promise<SearchHit[]> {
    let store: PalaceStore;
    try {
      store = await PalaceStore.open({ palacePath: this._palacePath, create: false });
    } catch {
      return [];
    }

    try {
      return store.search(query, {
        wing: opts?.wing,
        room: opts?.room,
        hall: opts?.hall,
        sourceFile: opts?.sourceFile,
        nResults: opts?.nResults ?? 5,
      }).results;
    } finally {
      store.close();
    }
  }
}

// ---------------------------------------------------------------------------
// MemoryStack - unified interface
// ---------------------------------------------------------------------------

export class MemoryStack {
  private _palacePath: string;
  private _identityPath: string;

  readonly l0: Layer0;
  readonly l1: Layer1;
  readonly l2: Layer2;
  readonly l3: Layer3;

  constructor(palacePath?: string, identityPath?: string) {
    const cfg = new MempalaceConfig();
    this._palacePath = palacePath ?? cfg.palacePath;
    this._identityPath = identityPath ?? join(homedir(), ".mempalace", "identity.txt");

    this.l0 = new Layer0(this._identityPath);
    this.l1 = new Layer1(this._palacePath);
    this.l2 = new Layer2(this._palacePath);
    this.l3 = new Layer3(this._palacePath);
  }

  /**
   * Generate wake-up text: L0 (identity) + L1 (essential story).
   * Typically ~600-900 tokens. Inject into system prompt.
   */
  async wakeUp(wing?: string): Promise<string> {
    const parts: string[] = [];
    parts.push(await this.l0.render());
    parts.push("");
    if (wing) this.l1.wing = wing;
    parts.push(await this.l1.generate());
    return parts.join("\n");
  }

  /** On-demand L2 retrieval filtered by wing/room. */
  async recall(opts?: { wing?: string; room?: string; hall?: string; nResults?: number }): Promise<string> {
    return this.l2.retrieve(opts);
  }

  /** Deep L3 semantic search. */
  async search(query: string, opts?: { wing?: string; room?: string; hall?: string; sourceFile?: string; nResults?: number }): Promise<string> {
    return this.l3.search(query, opts);
  }

  /**
   * Release resources held by the memory stack.
   * Stops the L0 identity file watcher.  Call during session teardown.
   */
  dispose(): void {
    this.l0.dispose();
  }

  /** Status of all layers. */
  async status(): Promise<StackStatus> {
    let totalDrawers = 0;
    const hierarchy = emptyHierarchy();
    try {
      const store = await PalaceStore.open({ palacePath: this._palacePath, create: false });
      totalDrawers = store.count();
      Object.assign(hierarchy, store.getHierarchy());
      store.close();
    } catch {
      // No palace yet.
    }

    return {
      palacePath: this._palacePath,
      l0Identity: {
        path: this._identityPath,
        exists: await Bun.file(this._identityPath).exists(),
        tokens: await this.l0.tokenEstimate(),
      },
      l1Essential: { description: "Auto-generated from top palace drawers" },
      l2OnDemand: { description: "Wing/room filtered retrieval" },
      l3DeepSearch: { description: "Full semantic search via SQLite FTS5" },
      totalDrawers,
      hierarchy,
    };
  }
}

function emptyHierarchy(): StackStatus["hierarchy"] {
  return {
    wings: {},
    rooms: {},
    halls: {},
    sources: {},
    taxonomy: {},
  };
}
