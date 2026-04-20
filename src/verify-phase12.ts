/**
 * Phase 12 Verification Script - Store SQL Tables
 *
 * Covers Python parity SQL table definitions and SqliteStore integration.
 *
 * Run: bun run src/verify-phase12.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  COLONY_SQL_TABLES,
  createAllTablesSql,
  createColonyTables,
  createIndexSql,
  createTableSql,
} from "./store/sql-tables";
import { SqliteStore } from "./store/sqlite";

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

function verifySqlDefinitions(): void {
  section("1. SQL Table Definitions");

  const names = COLONY_SQL_TABLES.map((table) => table.name);
  const pythonTables = [
    "tasks",
    "approvals",
    "findings",
    "incidents",
    "cases",
    "audit_records",
    "fanout_groups",
    "handoffs",
    "chat_sessions",
    "chat_messages",
    "feedback_records",
    "feedback_trends",
    "memory_summaries",
  ];

  for (const tableName of pythonTables) {
    assert(names.includes(tableName), `Python table present: ${tableName}`);
  }
  assert(names.includes("sessions"), "TS core sessions table retained");
  assert(names.includes("vault_refs"), "TS core vault_refs table retained");
  assertEqual(names.length, 15, "Total table count includes Python + TS core tables");

  const tasks = COLONY_SQL_TABLES.find((table) => table.name === "tasks")!;
  assertEqual(tasks.columns.length, 19, "Tasks table column count matches Python source");
  assert(tasks.columns.some((column) => column.name === "task_id" && column.primaryKey), "Tasks task_id primary key");
  assert(tasks.columns.some((column) => column.name === "constraints" && column.defaultSql === "'[]'"), "Tasks constraints JSON default");
  assert(tasks.columns.some((column) => column.name === "required_context" && column.defaultSql === "'{}'"), "Tasks required_context JSON default");
  assert(tasks.columns.some((column) => column.name === "retry_limit" && column.defaultSql === "3"), "Tasks retry limit default");

  const approvals = COLONY_SQL_TABLES.find((table) => table.name === "approvals")!;
  assert(createIndexSql(approvals).some((sql) => sql.includes("idx_approvals_task_id")), "Approvals task_id index SQL");

  const chatMessages = COLONY_SQL_TABLES.find((table) => table.name === "chat_messages")!;
  const chatSql = createTableSql(chatMessages);
  assert(chatSql.includes("REFERENCES chat_sessions(session_id)"), "Chat messages foreign key SQL");
  assert(createIndexSql(chatMessages).some((sql) => sql.includes("idx_chat_messages_created_at")), "Chat messages created_at index SQL");

  const allSql = createAllTablesSql();
  assert(allSql.length > COLONY_SQL_TABLES.length, "createAllTablesSql includes indexes");
  assert(allSql[0].startsWith("CREATE TABLE IF NOT EXISTS"), "DDL begins with CREATE TABLE");

  const executed: string[] = [];
  createColonyTables({ exec: (sql) => executed.push(sql) });
  assertEqual(executed.length, allSql.length, "createColonyTables executes all generated statements");
  assert(executed.some((sql) => sql.includes('"memory_summaries"')), "createColonyTables includes memory summaries");
}

async function verifySqliteStoreIntegration(): Promise<void> {
  section("2. SqliteStore Integration");

  const dir = await mkdtemp(join(tmpdir(), "colony-store-"));
  const dbPath = join(dir, "colony.db");
  const store = new SqliteStore(dbPath);
  try {
    await store.init();
    assert(await store.healthCheck(), "SqliteStore health check passes");

    const db = store.getDb();
    const rows = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = rows.map((row) => row.name);
    for (const table of COLONY_SQL_TABLES) {
      assert(tableNames.includes(table.name), `SQLite table created: ${table.name}`);
    }

    const taskColumns = db.query("PRAGMA table_info(tasks)").all() as Array<{
      name: string;
      pk: number;
      notnull: number;
      dflt_value: string | null;
    }>;
    const taskId = taskColumns.find((column) => column.name === "task_id");
    const constraints = taskColumns.find((column) => column.name === "constraints");
    const retryLimit = taskColumns.find((column) => column.name === "retry_limit");
    assertEqual(taskId?.pk, 1, "SQLite tasks.task_id is primary key");
    assertEqual(constraints?.dflt_value, "'[]'", "SQLite tasks.constraints default preserved");
    assertEqual(retryLimit?.dflt_value, "3", "SQLite tasks.retry_limit default preserved");

    const approvalsIndexes = db.query("PRAGMA index_list(approvals)").all() as Array<{ name: string }>;
    assert(approvalsIndexes.some((index) => index.name === "idx_approvals_task_id"), "SQLite approvals task_id index created");

    db.run(`
      INSERT INTO sessions (
        session_id, agent_id, caste, created_at, last_active
      ) VALUES (
        'ses_test', 'assist-ant', 'assist_ant', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      )
    `);
    const session = db.query("SELECT tenant_scope, history, total_iterations FROM sessions WHERE session_id = 'ses_test'").get() as {
      tenant_scope: string;
      history: string;
      total_iterations: number;
    };
    assertEqual(session.tenant_scope, "default", "Sessions tenant default works");
    assertEqual(session.history, "[]", "Sessions history default works");
    assertEqual(session.total_iterations, 0, "Sessions total_iterations default works");

    const source = await Bun.file(join(process.cwd(), "src", "store", "sqlite.ts")).text();
    assert(!source.includes("existsSync"), "SqliteStore no longer uses existsSync");
    assert(!source.includes("mkdirSync"), "SqliteStore no longer uses mkdirSync");
  } finally {
    await store.teardown();
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 12 Verification (Store SQL Tables)\n");

  verifySqlDefinitions();
  await verifySqliteStoreIntegration();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 12 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 12: Store SQL tables are GREEN.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
