/**
 * Knowledge Graph — Temporal Entity-Relationship Graph.
 *
 * 1:1 port of mempalace/knowledge_graph.py.
 *
 * Stores entity nodes and typed relationship edges with temporal validity
 * (valid_from → valid_to). Knows WHEN facts are true, not just IF.
 *
 * Storage: SQLite (local, no dependencies, no subscriptions).
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { homedir } from "os";
import type { Entity, Triple, KGResult, TimelineEntry, KGStats } from "./types";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_KG_PATH = join(homedir(), ".mempalace", "knowledge_graph.sqlite3");

// ---------------------------------------------------------------------------
// KnowledgeGraph
// ---------------------------------------------------------------------------

export class KnowledgeGraph {
  private _db: Database;
  private _dbPath: string;

  constructor(dbPath?: string) {
    this._dbPath = dbPath ?? DEFAULT_KG_PATH;
    mkdirSync(dirname(this._dbPath), { recursive: true });
    this._db = new Database(this._dbPath, { create: true });
    this._initDb();
  }

  private _initDb(): void {
    this._db.run("PRAGMA journal_mode=WAL");

    this._db.run(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'unknown',
        properties TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this._db.run(`
      CREATE TABLE IF NOT EXISTS triples (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        predicate TEXT NOT NULL,
        object TEXT NOT NULL,
        valid_from TEXT,
        valid_to TEXT,
        confidence REAL DEFAULT 1.0,
        source_closet TEXT,
        source_file TEXT,
        extracted_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (subject) REFERENCES entities(id),
        FOREIGN KEY (object) REFERENCES entities(id)
      )
    `);

    this._db.run("CREATE INDEX IF NOT EXISTS idx_triples_subject ON triples(subject)");
    this._db.run("CREATE INDEX IF NOT EXISTS idx_triples_object ON triples(object)");
    this._db.run("CREATE INDEX IF NOT EXISTS idx_triples_predicate ON triples(predicate)");
    this._db.run("CREATE INDEX IF NOT EXISTS idx_triples_valid ON triples(valid_from, valid_to)");
  }

  private _entityId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "");
  }

  // ── Write operations ─────────────────────────────────────────────────

  /** Add or update an entity node. */
  addEntity(name: string, entityType = "unknown", properties: Record<string, unknown> = {}): string {
    const eid = this._entityId(name);
    this._db.run(
      "INSERT OR REPLACE INTO entities (id, name, type, properties) VALUES (?, ?, ?, ?)",
      [eid, name, entityType, JSON.stringify(properties)],
    );
    return eid;
  }

  /** Add a relationship triple: subject → predicate → object. */
  addTriple(opts: {
    subject: string;
    predicate: string;
    object: string;
    validFrom?: string;
    validTo?: string;
    confidence?: number;
    sourceCloset?: string;
    sourceFile?: string;
  }): string {
    const subId = this._entityId(opts.subject);
    const objId = this._entityId(opts.object);
    const pred = opts.predicate.toLowerCase().replace(/\s+/g, "_");

    // Auto-create entities
    this._db.run(
      "INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)",
      [subId, opts.subject],
    );
    this._db.run(
      "INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)",
      [objId, opts.object],
    );

    // Check for existing identical triple
    const existing = this._db.query(
      "SELECT id FROM triples WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL",
    ).get(subId, pred, objId) as any;

    if (existing) return existing.id;

    const tripleId = `t_${subId}_${pred}_${objId}_${
      createHash("sha256")
        .update(`${opts.validFrom}${new Date().toISOString()}`)
        .digest("hex")
        .slice(0, 12)
    }`;

    this._db.run(
      `INSERT INTO triples (id, subject, predicate, object, valid_from, valid_to, confidence, source_closet, source_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tripleId, subId, pred, objId,
        opts.validFrom ?? null, opts.validTo ?? null,
        opts.confidence ?? 1.0,
        opts.sourceCloset ?? null, opts.sourceFile ?? null,
      ],
    );

    return tripleId;
  }

  /** Mark a relationship as no longer valid. */
  invalidate(subject: string, predicate: string, object: string, ended?: string): void {
    const subId = this._entityId(subject);
    const objId = this._entityId(object);
    const pred = predicate.toLowerCase().replace(/\s+/g, "_");
    const endDate = ended ?? new Date().toISOString().slice(0, 10);

    this._db.run(
      "UPDATE triples SET valid_to=? WHERE subject=? AND predicate=? AND object=? AND valid_to IS NULL",
      [endDate, subId, pred, objId],
    );
  }

  // ── Query operations ─────────────────────────────────────────────────

  /** Get all relationships for an entity. */
  queryEntity(name: string, opts?: { asOf?: string; direction?: "outgoing" | "incoming" | "both" }): KGResult[] {
    const eid = this._entityId(name);
    const direction = opts?.direction ?? "outgoing";
    const asOf = opts?.asOf;
    const results: KGResult[] = [];

    if (direction === "outgoing" || direction === "both") {
      let query = `
        SELECT t.*, e.name as obj_name FROM triples t
        JOIN entities e ON t.object = e.id
        WHERE t.subject = ?
      `;
      const params: string[] = [eid];
      if (asOf) {
        query += " AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to >= ?)";
        params.push(asOf, asOf);
      }

      for (const row of this._db.query(query).all(...params) as any[]) {
        results.push({
          direction: "outgoing",
          subject: name,
          predicate: row.predicate,
          object: row.obj_name,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          confidence: row.confidence,
          sourceCloset: row.source_closet,
          current: row.valid_to === null,
        });
      }
    }

    if (direction === "incoming" || direction === "both") {
      let query = `
        SELECT t.*, e.name as sub_name FROM triples t
        JOIN entities e ON t.subject = e.id
        WHERE t.object = ?
      `;
      const params: string[] = [eid];
      if (asOf) {
        query += " AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to >= ?)";
        params.push(asOf, asOf);
      }

      for (const row of this._db.query(query).all(...params) as any[]) {
        results.push({
          direction: "incoming",
          subject: row.sub_name,
          predicate: row.predicate,
          object: name,
          validFrom: row.valid_from,
          validTo: row.valid_to,
          confidence: row.confidence,
          sourceCloset: row.source_closet,
          current: row.valid_to === null,
        });
      }
    }

    return results;
  }

  /** Get all triples with a given relationship type. */
  queryRelationship(predicate: string, asOf?: string): KGResult[] {
    const pred = predicate.toLowerCase().replace(/\s+/g, "_");
    let query = `
      SELECT t.*, s.name as sub_name, o.name as obj_name
      FROM triples t
      JOIN entities s ON t.subject = s.id
      JOIN entities o ON t.object = o.id
      WHERE t.predicate = ?
    `;
    const params: string[] = [pred];
    if (asOf) {
      query += " AND (t.valid_from IS NULL OR t.valid_from <= ?) AND (t.valid_to IS NULL OR t.valid_to >= ?)";
      params.push(asOf, asOf);
    }

    return (this._db.query(query).all(...params) as any[]).map((r) => ({
      direction: "outgoing" as const,
      subject: r.sub_name,
      predicate: pred,
      object: r.obj_name,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      confidence: r.confidence,
      current: r.valid_to === null,
    }));
  }

  /** Get all facts in chronological order. */
  timeline(entityName?: string): TimelineEntry[] {
    let query: string;
    let params: string[];

    if (entityName) {
      const eid = this._entityId(entityName);
      query = `
        SELECT t.*, s.name as sub_name, o.name as obj_name
        FROM triples t
        JOIN entities s ON t.subject = s.id
        JOIN entities o ON t.object = o.id
        WHERE (t.subject = ? OR t.object = ?)
        ORDER BY t.valid_from ASC NULLS LAST
        LIMIT 100
      `;
      params = [eid, eid];
    } else {
      query = `
        SELECT t.*, s.name as sub_name, o.name as obj_name
        FROM triples t
        JOIN entities s ON t.subject = s.id
        JOIN entities o ON t.object = o.id
        ORDER BY t.valid_from ASC NULLS LAST
        LIMIT 100
      `;
      params = [];
    }

    return (this._db.query(query).all(...params) as any[]).map((r) => ({
      subject: r.sub_name,
      predicate: r.predicate,
      object: r.obj_name,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      current: r.valid_to === null,
    }));
  }

  // ── Stats ────────────────────────────────────────────────────────────

  stats(): KGStats {
    const entities = (this._db.query("SELECT COUNT(*) as cnt FROM entities").get() as any).cnt;
    const triples = (this._db.query("SELECT COUNT(*) as cnt FROM triples").get() as any).cnt;
    const current = (this._db.query("SELECT COUNT(*) as cnt FROM triples WHERE valid_to IS NULL").get() as any).cnt;
    const predicates = (
      this._db.query("SELECT DISTINCT predicate FROM triples ORDER BY predicate").all() as any[]
    ).map((r) => r.predicate);

    return {
      entities,
      triples,
      currentFacts: current,
      expiredFacts: triples - current,
      relationshipTypes: predicates,
    };
  }

  /** Close the database connection. */
  close(): void {
    this._db.close();
  }
}
