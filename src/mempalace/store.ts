/**
 * Mempalace Store — SQLite-backed vector storage.
 *
 * Replaces ChromaDB (Python-only) with Bun's built-in SQLite.
 * Stores drawers as content + metadata in SQLite, with optional
 * embedding vectors stored as BLOB for similarity search.
 *
 * When no embedding model is available, falls back to keyword-based
 * search using SQLite FTS5. This keeps the zero-dependency philosophy
 * and works fully offline.
 */

import { Database, type SQLQueryBindings } from "bun:sqlite";
import { chmod, mkdir, stat } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import type { Drawer, SearchHit, SearchResult } from "./types";
import { MempalaceConfig } from "./config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreOptions {
  palacePath?: string;
  collectionName?: string;
  create?: boolean;
}

// ---------------------------------------------------------------------------
// PalaceStore — SQLite-backed drawer storage
// ---------------------------------------------------------------------------

export class PalaceStore {
  private _db: Database;
  private _collectionName: string;
  private _palacePath: string;

  private constructor(db: Database, palacePath: string, collectionName: string) {
    this._palacePath = palacePath;
    this._collectionName = collectionName;
    this._db = db;
    this._initDb();
  }

  static async open(opts: StoreOptions = {}): Promise<PalaceStore> {
    const cfg = new MempalaceConfig();
    const palacePath = opts.palacePath ?? cfg.palacePath;
    const collectionName = opts.collectionName ?? cfg.collectionName;
    const dbPath = join(palacePath, "mempalace.sqlite3");

    if (opts.create) {
      await mkdir(palacePath, { recursive: true });
      try { await chmod(palacePath, 0o700); } catch { /* Windows */ }
    } else {
      try {
        const info = await stat(palacePath);
        if (!info.isDirectory()) {
          throw new Error("not_directory");
        }
      } catch {
        throw new Error(`No palace found at ${palacePath}`);
      }
    }

    try {
      // Bun on Windows can throw SQLITE_MISUSE when reopening an existing DB
      // with `create: false`, so we validate the path ourselves and always
      // open the database in non-destructive create-capable mode here.
      const db = new Database(dbPath, { create: true });
      return new PalaceStore(db, palacePath, collectionName);
    } catch {
      throw new Error(`No palace found at ${palacePath}`);
    }
  }

  private _initDb(): void {
    this._db.run("PRAGMA journal_mode=WAL");
    this._db.run("PRAGMA synchronous=NORMAL");

    this._db.run(`
      CREATE TABLE IF NOT EXISTS drawers (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        wing TEXT DEFAULT 'general',
        room TEXT DEFAULT 'general',
        hall TEXT DEFAULT '',
        source_file TEXT DEFAULT '',
        source_mtime REAL,
        date TEXT,
        importance REAL DEFAULT 3.0,
        emotional_weight REAL DEFAULT 0.5,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this._db.run(`
      CREATE INDEX IF NOT EXISTS idx_drawers_wing ON drawers(wing)
    `);
    this._db.run(`
      CREATE INDEX IF NOT EXISTS idx_drawers_room ON drawers(room)
    `);
    this._db.run(`
      CREATE INDEX IF NOT EXISTS idx_drawers_source ON drawers(source_file)
    `);

    this._ensureFtsSchema();
  }

  private _ensureFtsSchema(): void {
    const schemaRow = this._db.query(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'drawers_fts'",
    ).get() as { sql?: string } | null;
    const schemaSql = String(schemaRow?.sql ?? "");
    const needsRebuild = !schemaSql
      || !schemaSql.includes("hall")
      || !schemaSql.includes("source_file");

    this._db.run("DROP TRIGGER IF EXISTS drawers_ai");
    this._db.run("DROP TRIGGER IF EXISTS drawers_ad");
    this._db.run("DROP TRIGGER IF EXISTS drawers_au");

    if (needsRebuild) {
      this._db.run("DROP TABLE IF EXISTS drawers_fts");
      this._db.run(`
        CREATE VIRTUAL TABLE drawers_fts USING fts5(
          content, wing, room, hall, source_file,
          content='drawers',
          content_rowid='rowid'
        )
      `);
      this._db.run(`
        INSERT INTO drawers_fts(rowid, content, wing, room, hall, source_file)
        SELECT rowid, content, wing, room, hall, source_file FROM drawers
      `);
    } else {
      this._db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS drawers_fts USING fts5(
          content, wing, room, hall, source_file,
          content='drawers',
          content_rowid='rowid'
        )
      `);
    }

    // Keep FTS in sync via triggers
    this._db.run(`
      CREATE TRIGGER IF NOT EXISTS drawers_ai AFTER INSERT ON drawers BEGIN
        INSERT INTO drawers_fts(rowid, content, wing, room, hall, source_file)
        VALUES (new.rowid, new.content, new.wing, new.room, new.hall, new.source_file);
      END
    `);
    this._db.run(`
      CREATE TRIGGER IF NOT EXISTS drawers_ad AFTER DELETE ON drawers BEGIN
        INSERT INTO drawers_fts(drawers_fts, rowid, content, wing, room, hall, source_file)
        VALUES ('delete', old.rowid, old.content, old.wing, old.room, old.hall, old.source_file);
      END
    `);
    this._db.run(`
      CREATE TRIGGER IF NOT EXISTS drawers_au AFTER UPDATE ON drawers BEGIN
        INSERT INTO drawers_fts(drawers_fts, rowid, content, wing, room, hall, source_file)
        VALUES ('delete', old.rowid, old.content, old.wing, old.room, old.hall, old.source_file);
        INSERT INTO drawers_fts(rowid, content, wing, room, hall, source_file)
        VALUES (new.rowid, new.content, new.wing, new.room, new.hall, new.source_file);
      END
    `);
  }

  // ── Write operations ─────────────────────────────────────────────────

  /** Add a drawer to the palace. */
  add(drawer: Omit<Drawer, "createdAt">): string {
    const id = drawer.id || this._generateId(drawer.content, drawer.sourceFile);

    this._db.run(
      `INSERT OR REPLACE INTO drawers
       (id, content, wing, room, hall, source_file, source_mtime, date,
        importance, emotional_weight, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        drawer.content,
        drawer.wing || "general",
        drawer.room || "general",
        drawer.hall || "",
        drawer.sourceFile || "",
        drawer.sourceMtime ?? null,
        drawer.date ?? null,
        drawer.importance ?? 3.0,
        drawer.emotionalWeight ?? 0.5,
        JSON.stringify(drawer.metadata || {}),
      ],
    );

    return id;
  }

  /** Add multiple drawers at once. */
  addBatch(drawers: Omit<Drawer, "createdAt">[]): string[] {
    const insert = this._db.prepare(
      `INSERT OR REPLACE INTO drawers
       (id, content, wing, room, hall, source_file, source_mtime, date,
        importance, emotional_weight, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const ids: string[] = [];
    const tx = this._db.transaction(() => {
      for (const d of drawers) {
        const id = d.id || this._generateId(d.content, d.sourceFile);
        insert.run(
          id, d.content, d.wing || "general", d.room || "general",
          d.hall || "", d.sourceFile || "", d.sourceMtime ?? null,
          d.date ?? null, d.importance ?? 3.0, d.emotionalWeight ?? 0.5,
          JSON.stringify(d.metadata || {}),
        );
        ids.push(id);
      }
    });
    tx();
    return ids;
  }

  /** Delete a drawer by ID. */
  delete(id: string): boolean {
    const result = this._db.run("DELETE FROM drawers WHERE id = ?", [id]);
    return result.changes > 0;
  }

  /** Delete drawers by source file. */
  deleteBySource(sourceFile: string): number {
    const result = this._db.run("DELETE FROM drawers WHERE source_file = ?", [sourceFile]);
    return result.changes;
  }

  // ── Read operations ──────────────────────────────────────────────────

  /** Get a drawer by ID. */
  get(id: string): Drawer | null {
    const row = this._db.query(
      "SELECT * FROM drawers WHERE id = ?",
    ).get(id) as any;
    return row ? this._rowToDrawer(row) : null;
  }

  /** Get drawers with optional wing/room filter. */
  list(opts: {
    wing?: string;
    room?: string;
    hall?: string;
    sourceFile?: string;
    limit?: number;
    offset?: number;
    orderBy?: "importance" | "created_at";
  } = {}): Drawer[] {
    const conditions: string[] = [];
    const params: SQLQueryBindings[] = [];

    if (opts.wing) { conditions.push("wing = ?"); params.push(opts.wing); }
    if (opts.room) { conditions.push("room = ?"); params.push(opts.room); }
    if (opts.hall) { conditions.push("hall = ?"); params.push(opts.hall); }
    if (opts.sourceFile) { conditions.push("source_file = ?"); params.push(opts.sourceFile); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = opts.orderBy === "importance" ? "importance DESC" : "created_at DESC";
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const rows = this._db.query(
      `SELECT * FROM drawers ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset) as any[];

    return rows.map((r) => this._rowToDrawer(r));
  }

  /** Full-text search using SQLite FTS5. */
  search(query: string, opts: {
    wing?: string;
    room?: string;
    hall?: string;
    sourceFile?: string;
    nResults?: number;
    maxDistance?: number;
  } = {}): SearchResult {
    const nResults = opts.nResults ?? 5;

    // Build FTS5 query — escape special chars
    const ftsQuery = query
      .replace(/[^\w\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => `"${w}"`)
      .join(" OR ");

    if (!ftsQuery) {
      return { query, filters: {}, totalBeforeFilter: 0, results: [] };
    }

    const totalBeforeFilterRow = this._db.query(
      "SELECT COUNT(*) as cnt FROM drawers_fts WHERE drawers_fts MATCH ?",
    ).get(ftsQuery) as { cnt?: number } | null;
    const totalBeforeFilter = totalBeforeFilterRow?.cnt ?? 0;

    // Wing/room/hall filtering
    let metadataFilter = "";
    const params: SQLQueryBindings[] = [];
    if (opts.wing) {
      metadataFilter += " AND d.wing = ?";
      params.push(opts.wing);
    }
    if (opts.room) {
      metadataFilter += " AND d.room = ?";
      params.push(opts.room);
    }
    if (opts.hall) {
      metadataFilter += " AND d.hall = ?";
      params.push(opts.hall);
    }
    if (opts.sourceFile) {
      metadataFilter += " AND d.source_file = ?";
      params.push(opts.sourceFile);
    }

    const sql = `
      SELECT d.*, rank
      FROM drawers_fts fts
      JOIN drawers d ON d.rowid = fts.rowid
      WHERE drawers_fts MATCH ?
      ${metadataFilter}
      LIMIT ?
    `;

    const rows = this._db.query(sql).all(ftsQuery, ...params, Math.max(nResults * 6, 24)) as any[];

    const hits: SearchHit[] = rows
      .map((r) => {
      // FTS5 rank is negative — lower is better. Normalize to 0–1 similarity.
      const rawRank = Math.abs(r.rank ?? 0);
      const lexicalSimilarity = Math.max(0, 1 - rawRank / 10);
      const importanceScore = clamp01(Number(r.importance ?? 3) / 5);
      const emotionalScore = clamp01(Number(r.emotional_weight ?? 0.5));
      const recencyScore = recencyScoreFor(r.created_at);
      const hierarchySimilarity = clamp01(
        lexicalSimilarity * 0.66
        + importanceScore * 0.2
        + emotionalScore * 0.08
        + recencyScore * 0.06
        + exactFilterBoost(query, r, opts),
      );
      return {
        id: r.id,
        text: r.content,
        wing: r.wing,
        room: r.room,
        hall: r.hall,
        sourceFile: r.source_file,
        similarity: Math.round(hierarchySimilarity * 1000) / 1000,
        distance: Math.round(rawRank * 10000) / 10000,
        metadata: JSON.parse(r.metadata || "{}"),
      };
      })
      .filter((hit) => opts.maxDistance == null || hit.distance <= opts.maxDistance)
      .sort((left, right) => right.similarity - left.similarity || left.distance - right.distance)
      .slice(0, nResults);

    return {
      query,
      filters: { wing: opts.wing, room: opts.room, hall: opts.hall, sourceFile: opts.sourceFile },
      totalBeforeFilter,
      results: hits,
    };
  }

  /** Check if a file has already been mined. */
  async fileAlreadyMined(sourceFile: string, checkMtime = false): Promise<boolean> {
    const row = this._db.query(
      "SELECT source_mtime FROM drawers WHERE source_file = ? LIMIT 1",
    ).get(sourceFile) as any;

    if (!row) return false;
    if (!checkMtime) return true;

    try {
      const info = await stat(sourceFile);
      return Math.abs((row.source_mtime ?? 0) - info.mtimeMs / 1000) < 0.001;
    } catch {
      return false;
    }
  }

  // ── Status ──────────────────────────────────────────────────────────

  /** Total drawer count. */
  count(): number {
    const row = this._db.query("SELECT COUNT(*) as cnt FROM drawers").get() as any;
    return row?.cnt ?? 0;
  }

  /** List distinct wings. */
  listWings(): { wing: string; count: number }[] {
    return this._db.query(
      "SELECT wing, COUNT(*) as count FROM drawers GROUP BY wing ORDER BY count DESC",
    ).all() as any[];
  }

  /** List distinct rooms, optionally filtered by wing. */
  listRooms(wing?: string): { room: string; count: number }[] {
    if (wing) {
      return this._db.query(
        "SELECT room, COUNT(*) as count FROM drawers WHERE wing = ? GROUP BY room ORDER BY count DESC",
      ).all(wing) as any[];
    }
    return this._db.query(
      "SELECT room, COUNT(*) as count FROM drawers GROUP BY room ORDER BY count DESC",
    ).all() as any[];
  }

  /** Full taxonomy: wing → room → count. */
  getTaxonomy(): Record<string, Record<string, number>> {
    const rows = this._db.query(
      "SELECT wing, room, COUNT(*) as count FROM drawers GROUP BY wing, room ORDER BY wing, room",
    ).all() as any[];

    const taxonomy: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!taxonomy[r.wing]) taxonomy[r.wing] = {};
      taxonomy[r.wing][r.room] = r.count;
    }
    return taxonomy;
  }

  /** Full hierarchy: wing, room, hall, source, and wing-room-hall counts. */
  getHierarchy(): {
    wings: Record<string, number>;
    rooms: Record<string, number>;
    halls: Record<string, number>;
    sources: Record<string, number>;
    taxonomy: Record<string, Record<string, Record<string, number>>>;
  } {
    const rows = this._db.query(
      "SELECT wing, room, hall, source_file, COUNT(*) as count FROM drawers GROUP BY wing, room, hall, source_file ORDER BY wing, room, hall, source_file",
    ).all() as Array<{
      wing?: string;
      room?: string;
      hall?: string;
      source_file?: string;
      count?: number;
    }>;

    const hierarchy = {
      wings: {} as Record<string, number>,
      rooms: {} as Record<string, number>,
      halls: {} as Record<string, number>,
      sources: {} as Record<string, number>,
      taxonomy: {} as Record<string, Record<string, Record<string, number>>>,
    };

    for (const row of rows) {
      const count = Number(row.count ?? 0);
      const wing = normalizeHierarchyKey(row.wing, "unknown");
      const room = normalizeHierarchyKey(row.room, "unknown");
      const hall = normalizeHierarchyKey(row.hall, "none");
      const source = normalizeHierarchyKey(row.source_file, "unknown");

      hierarchy.wings[wing] = (hierarchy.wings[wing] ?? 0) + count;
      hierarchy.rooms[room] = (hierarchy.rooms[room] ?? 0) + count;
      hierarchy.halls[hall] = (hierarchy.halls[hall] ?? 0) + count;
      hierarchy.sources[source] = (hierarchy.sources[source] ?? 0) + count;
      hierarchy.taxonomy[wing] ??= {};
      hierarchy.taxonomy[wing][room] ??= {};
      hierarchy.taxonomy[wing][room][hall] = (hierarchy.taxonomy[wing][room][hall] ?? 0) + count;
    }

    return hierarchy;
  }

  /** Close the database. */
  close(): void {
    this._db.close();
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private _generateId(content: string, sourceFile: string): string {
    const hash = createHash("sha256")
      .update(content.slice(0, 500))
      .update(sourceFile)
      .digest("hex")
      .slice(0, 16);
    return `d_${hash}`;
  }

  private _rowToDrawer(row: any): Drawer {
    return {
      id: row.id,
      content: row.content,
      wing: row.wing,
      room: row.room,
      hall: row.hall,
      sourceFile: row.source_file,
      sourceMtime: row.source_mtime,
      date: row.date,
      importance: row.importance,
      emotionalWeight: row.emotional_weight,
      metadata: JSON.parse(row.metadata || "{}"),
      createdAt: row.created_at,
    };
  }
}

function normalizeHierarchyKey(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function recencyScoreFor(createdAt: unknown): number {
  if (typeof createdAt !== "string" || createdAt.length === 0) return 0;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageMs = Math.max(0, Date.now() - timestamp);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return clamp01(1 - ageDays / 30);
}

function exactFilterBoost(
  query: string,
  row: { wing?: string; room?: string; hall?: string; source_file?: string },
  opts: { wing?: string; room?: string; hall?: string },
): number {
  let boost = 0;
  if (opts.wing && row.wing === opts.wing) boost += 0.02;
  if (opts.room && row.room === opts.room) boost += 0.02;
  if (opts.hall && row.hall === opts.hall) boost += 0.02;
  boost += sourceFileBoost(query, row.source_file);
  return boost;
}

function sourceFileBoost(query: string, sourceFile: string | undefined): number {
  if (!sourceFile) return 0;
  const queryTokens = tokenizeSourceRankingText(query);
  if (queryTokens.length === 0) return 0;
  const sourceTokens = new Set(tokenizeSourceRankingText(sourceFile));
  if (sourceTokens.size === 0) return 0;
  const overlap = queryTokens.reduce((count, token) => count + (sourceTokens.has(token) ? 1 : 0), 0);
  const overlapScore = overlap / queryTokens.length;
  const normalizedQuery = normalizeSourceRankingText(query);
  const normalizedSource = normalizeSourceRankingText(sourceFile);
  const exactSourceBonus = normalizedQuery.includes(normalizedSource) || normalizedSource.includes(normalizedQuery)
    ? 0.03
    : 0;
  return overlapScore * 0.08 + exactSourceBonus;
}

function tokenizeSourceRankingText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function normalizeSourceRankingText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
