/**
 * SQL table definitions for Colony persistence.
 *
 * Ports colony/store/sql_tables.py into zero-dependency SQLite DDL used by
 * bun:sqlite. JSON columns are stored as TEXT with JSON defaults.
 */

export type SqlColumnType = "TEXT" | "INTEGER" | "REAL";

export interface SqlColumnDefinition {
  name: string;
  type: SqlColumnType;
  primaryKey?: boolean;
  notNull?: boolean;
  defaultSql?: string;
  index?: boolean;
  foreignKey?: string;
}

export interface SqlTableDefinition {
  name: string;
  columns: SqlColumnDefinition[];
}

const TEXT = "TEXT";
const INTEGER = "INTEGER";
const REAL = "REAL";

export const COLONY_SQL_TABLES: SqlTableDefinition[] = [
  {
    name: "tasks",
    columns: [
      col("task_id", TEXT, { primaryKey: true }),
      col("task_type", TEXT, { notNull: true }),
      col("objective", TEXT, { notNull: true }),
      col("constraints", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("required_context", TEXT, { notNull: true, defaultSql: "'{}'" }),
      col("owning_caste", TEXT, { notNull: true }),
      col("supporting_castes", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("expected_outputs", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("risk_level", TEXT, { notNull: true, defaultSql: "'medium'" }),
      col("approval_class", TEXT, { notNull: true, defaultSql: "'A0'" }),
      col("current_state", TEXT, { notNull: true, defaultSql: "'intake'" }),
      col("state_history", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("failure_counter", INTEGER, { notNull: true, defaultSql: "0" }),
      col("retry_limit", INTEGER, { notNull: true, defaultSql: "3" }),
      col("structured_output", TEXT),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'" }),
      col("fanout_group_id", TEXT),
      col("created_at", TEXT, { notNull: true }),
      col("updated_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "approvals",
    columns: [
      col("approval_id", TEXT, { primaryKey: true }),
      col("task_id", TEXT, { notNull: true, index: true }),
      col("approval_class", TEXT, { notNull: true }),
      col("requested_action", TEXT, { notNull: true }),
      col("scope_limits", TEXT, { notNull: true, defaultSql: "''" }),
      col("required_approver_caste", TEXT),
      col("status", TEXT, { notNull: true, defaultSql: "'pending'" }),
      col("decided_by_caste", TEXT),
      col("decision_comment", TEXT, { notNull: true, defaultSql: "''" }),
      col("created_at", TEXT, { notNull: true }),
      col("decided_at", TEXT),
    ],
  },
  {
    name: "findings",
    columns: [
      col("finding_id", TEXT, { primaryKey: true }),
      col("severity", TEXT, { notNull: true }),
      col("source_caste", TEXT, { notNull: true, defaultSql: "'nameless_swarm'" }),
      col("evidence", TEXT, { notNull: true }),
      col("context", TEXT, { notNull: true, defaultSql: "''" }),
      col("remediation_owner", TEXT),
      col("fix_hypothesis", TEXT, { notNull: true, defaultSql: "''" }),
      col("validation_method", TEXT, { notNull: true, defaultSql: "''" }),
      col("retest_required", INTEGER, { notNull: true, defaultSql: "1" }),
      col("retest_outcome", TEXT),
      col("current_state", TEXT, { notNull: true, defaultSql: "'intake'" }),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'" }),
      col("created_at", TEXT, { notNull: true }),
      col("updated_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "incidents",
    columns: [
      col("incident_id", TEXT, { primaryKey: true }),
      col("severity", TEXT, { notNull: true }),
      col("incident_type", TEXT, { notNull: true, defaultSql: "'general'" }),
      col("commander_caste", TEXT, { notNull: true, defaultSql: "'shield_generals'" }),
      col("timeline_start", TEXT, { notNull: true }),
      col("owning_task_id", TEXT),
      col("current_state", TEXT, { notNull: true, defaultSql: "'intake'" }),
      col("created_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "cases",
    columns: [
      col("case_id", TEXT, { primaryKey: true }),
      col("task_id", TEXT, { notNull: true }),
      col("alert_source", TEXT, { notNull: true }),
      col("severity", TEXT, { notNull: true }),
      col("title", TEXT, { notNull: true }),
      col("triage_summary", TEXT, { notNull: true }),
      col("evidence_fields", TEXT, { notNull: true, defaultSql: "'{}'" }),
      col("next_action", TEXT, { notNull: true, defaultSql: "''" }),
      col("reviewer_caste", TEXT, { notNull: true, defaultSql: "'shield_generals'" }),
      col("package_complete", INTEGER, { notNull: true, defaultSql: "1" }),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'" }),
      col("created_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "audit_records",
    columns: [
      col("audit_id", TEXT, { primaryKey: true }),
      col("timestamp", TEXT, { notNull: true }),
      col("task_id", TEXT, { index: true }),
      col("agent_caste", TEXT),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'", index: true }),
      col("event_type", TEXT, { notNull: true }),
      col("actor_caste", TEXT),
      col("action_description", TEXT, { notNull: true, defaultSql: "''" }),
      col("outcome", TEXT, { notNull: true, defaultSql: "'success'" }),
      col("trace_id", TEXT, { notNull: true }),
      col("details", TEXT, { notNull: true, defaultSql: "'{}'" }),
    ],
  },
  {
    name: "fanout_groups",
    columns: [
      col("group_id", TEXT, { primaryKey: true }),
      col("parent_task_id", TEXT, { notNull: true, index: true }),
      col("join_policy", TEXT, { notNull: true, defaultSql: "'all'" }),
      col("branches", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("joined", INTEGER, { notNull: true, defaultSql: "0" }),
      col("join_outcome", TEXT),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'" }),
      col("created_at", TEXT, { notNull: true }),
      col("updated_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "handoffs",
    columns: [
      col("handoff_id", TEXT, { primaryKey: true }),
      col("task_id", TEXT, { notNull: true, index: true }),
      col("from_caste", TEXT, { notNull: true }),
      col("to_caste", TEXT, { notNull: true }),
      col("payload", TEXT, { notNull: true, defaultSql: "'{}'" }),
      col("instructions", TEXT, { notNull: true, defaultSql: "''" }),
      col("status", TEXT, { notNull: true, defaultSql: "'pending'" }),
      col("rejection_reason", TEXT, { notNull: true, defaultSql: "''" }),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'" }),
      col("created_at", TEXT, { notNull: true }),
      col("accepted_at", TEXT),
    ],
  },
  {
    name: "chat_sessions",
    columns: [
      col("session_id", TEXT, { primaryKey: true }),
      col("tenant_scope", TEXT, { defaultSql: "'default'" }),
      col("status", TEXT, { defaultSql: "'active'" }),
      col("message_count", INTEGER, { defaultSql: "0" }),
      col("created_at", TEXT),
      col("updated_at", TEXT),
    ],
  },
  {
    name: "chat_messages",
    columns: [
      col("message_id", TEXT, { primaryKey: true }),
      col("session_id", TEXT, { index: true, foreignKey: "chat_sessions(session_id)" }),
      col("role", TEXT),
      col("content", TEXT),
      col("agent_id", TEXT, { defaultSql: "'assist-ant'" }),
      col("tenant_scope", TEXT, { defaultSql: "'default'" }),
      col("created_at", TEXT, { index: true }),
    ],
  },
  {
    name: "feedback_records",
    columns: [
      col("feedback_id", TEXT, { primaryKey: true }),
      col("source", TEXT, { notNull: true }),
      col("rating", REAL, { notNull: true }),
      col("feedback_type", TEXT, { notNull: true, defaultSql: "'EXPLICIT'" }),
      col("context", TEXT, { notNull: true, defaultSql: "''" }),
      col("metadata", TEXT, { notNull: true, defaultSql: "'{}'" }),
      col("session_id", TEXT, { index: true }),
      col("created_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "feedback_trends",
    columns: [
      col("trend_id", TEXT, { primaryKey: true }),
      col("avg_rating", REAL, { notNull: true }),
      col("total_count", INTEGER, { notNull: true }),
      col("positive_count", INTEGER, { notNull: true }),
      col("negative_count", INTEGER, { notNull: true }),
      col("trend_direction", TEXT, { notNull: true, defaultSql: "'UNKNOWN'" }),
      col("prompt_adjustments", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("computed_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "memory_summaries",
    columns: [
      col("summary_id", TEXT, { primaryKey: true }),
      col("session_id", TEXT, { notNull: true, index: true }),
      col("summary_text", TEXT, { notNull: true }),
      col("keywords", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("message_count", INTEGER, { notNull: true, defaultSql: "0" }),
      col("created_at", TEXT, { notNull: true }),
    ],
  },
  {
    name: "sessions",
    columns: [
      col("session_id", TEXT, { primaryKey: true }),
      col("agent_id", TEXT, { notNull: true }),
      col("caste", TEXT, { notNull: true }),
      col("tenant_scope", TEXT, { notNull: true, defaultSql: "'default'" }),
      col("state", TEXT, { notNull: true, defaultSql: "'created'" }),
      col("created_at", TEXT, { notNull: true }),
      col("last_active", TEXT, { notNull: true }),
      col("history", TEXT, { notNull: true, defaultSql: "'[]'" }),
      col("total_iterations", INTEGER, { notNull: true, defaultSql: "0" }),
      col("total_tokens_used", INTEGER, { notNull: true, defaultSql: "0" }),
      col("config", TEXT, { notNull: true, defaultSql: "'{}'" }),
      col("metadata", TEXT, { notNull: true, defaultSql: "'{}'" }),
    ],
  },
  {
    name: "vault_refs",
    columns: [
      col("name", TEXT, { primaryKey: true }),
      col("scope", TEXT, { notNull: true, defaultSql: "'global'" }),
      col("owner_caste", TEXT),
      col("owner_agent_id", TEXT),
      col("created_at", TEXT, { notNull: true }),
      col("rotated_at", TEXT),
      col("description", TEXT, { notNull: true, defaultSql: "''" }),
    ],
  },
];

export function createTableSql(table: SqlTableDefinition): string {
  const columnSql = table.columns.map(createColumnSql).join(",\n  ");
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n  ${columnSql}\n);`;
}

export function createIndexSql(table: SqlTableDefinition): string[] {
  return table.columns
    .filter((column) => column.index)
    .map((column) => {
      const indexName = `idx_${table.name}_${column.name}`;
      return `CREATE INDEX IF NOT EXISTS ${quoteIdent(indexName)} ON ${quoteIdent(table.name)} (${quoteIdent(column.name)});`;
    });
}

export function createAllTablesSql(tables = COLONY_SQL_TABLES): string[] {
  return tables.flatMap((table) => [createTableSql(table), ...createIndexSql(table)]);
}

export function createColonyTables(db: { exec: (sql: string) => unknown }): void {
  for (const sql of createAllTablesSql()) {
    db.exec(sql);
  }
}

function col(
  name: string,
  type: SqlColumnType,
  opts: Omit<SqlColumnDefinition, "name" | "type"> = {},
): SqlColumnDefinition {
  return { name, type, ...opts };
}

function createColumnSql(column: SqlColumnDefinition): string {
  const parts = [quoteIdent(column.name), column.type];
  if (column.primaryKey) parts.push("PRIMARY KEY");
  if (column.notNull) parts.push("NOT NULL");
  if (column.defaultSql !== undefined) parts.push(`DEFAULT ${column.defaultSql}`);
  if (column.foreignKey) parts.push(`REFERENCES ${column.foreignKey}`);
  return parts.join(" ");
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
