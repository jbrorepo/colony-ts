/**
 * SQLite persistence layer for The Colony.
 *
 * Uses bun:sqlite for zero-dependency embedded persistence.
 * Provides the Store subsystem used by BootstrapCoordinator.
 */

import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";
import type { Subsystem } from "../bootstrap";
import { createColonyTables } from "./sql-tables";

// ---------------------------------------------------------------------------
// SQLite store subsystem
// ---------------------------------------------------------------------------

export class SqliteStore implements Subsystem {
  readonly name = "store";
  readonly critical = true;
  private db: any = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    const defaultPath = join(homedir(), ".colony", "colony.db");
    this.dbPath = dbPath ?? defaultPath;
  }

  async init(): Promise<void> {
    const dir = dirname(this.dbPath);
    await mkdir(dir, { recursive: true });

    // Use Bun's built-in SQLite if available, otherwise create a placeholder
    if (typeof globalThis.Bun !== "undefined") {
      const { Database } = await import("bun:sqlite" as string);
      this.db = new Database(this.dbPath);
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA foreign_keys=ON");
    } else {
      // Node.js fallback — store in memory
      console.warn(
        "[store] bun:sqlite not available, using in-memory fallback",
      );
    }

    // Create core tables
    this.createTables();
  }

  private createTables(): void {
    if (!this.db) return;

    createColonyTables(this.db);
  }

  async teardown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.query("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  getDb(): any {
    return this.db;
  }
}
