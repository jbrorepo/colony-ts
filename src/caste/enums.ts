/**
 * Enumerations for The Colony domain model.
 *
 * 1:1 port of colony/models/enums.py — all values, docstrings,
 * and member ordering preserved for parity verification.
 */

// ---------------------------------------------------------------------------
// Caste — the 11 True Castes
// ---------------------------------------------------------------------------

export enum Caste {
  ROOT_QUEEN = "root_queen",
  ELDEST_ARCHITECT = "eldest_architect",
  ASSIST_ANT = "assist_ant",
  SHIELD_GENERALS = "shield_generals",
  WATCHER_SWARM = "watcher_swarm",
  FORGE_CARVERS = "forge_carvers",
  CORE_SHAPERS = "core_shapers",
  LIAISON_ANTS = "liaison_ants",
  LEDGER_ANTS = "ledger_ants",
  LORE_BURROW = "lore_burrow",
  NAMELESS_SWARM = "nameless_swarm",
}

// ---------------------------------------------------------------------------
// Workflow states (Phase 6 acceptance-test catalog)
// ---------------------------------------------------------------------------

export enum WorkflowState {
  INTAKE = "intake",
  CLASSIFIED = "classified",
  PENDING_APPROVAL = "pending_approval",
  APPROVED = "approved",
  EXECUTING = "executing",
  BLOCKED = "blocked",
  RE_TEST = "re_test",
  ESCALATED = "escalated",
  FAILED = "failed",
  CLOSED = "closed",
}

// ---------------------------------------------------------------------------
// Task types
// ---------------------------------------------------------------------------

export enum TaskType {
  ALERT_TRIAGE = "alert_triage",
  FINDING = "finding",
  INCIDENT = "incident",
  RESEARCH = "research",
  CONTAINMENT = "containment",
  FANOUT = "fanout",
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

// ---------------------------------------------------------------------------
// Approval classes (Phase 2 approval matrix)
// ---------------------------------------------------------------------------

/** A0 = no approval, A4 = prohibited for autonomous execution. */
export enum ApprovalClass {
  A0 = "A0",
  A1 = "A1",
  A2 = "A2",
  A3 = "A3",
  A4 = "A4",
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DENIED = "denied",
}

// ---------------------------------------------------------------------------
// Execution outcome
// ---------------------------------------------------------------------------

export enum ExecutionOutcome {
  SUCCESS = "success",
  FAILURE = "failure",
  TIMEOUT = "timeout",
  REJECTED = "rejected",
}

// ---------------------------------------------------------------------------
// Re-test outcome (Phase 4 retest policy)
// ---------------------------------------------------------------------------

export enum RetestOutcome {
  PASS = "pass",
  PARTIAL_PASS = "partial_pass",
  FAIL = "fail",
  INCONCLUSIVE = "inconclusive",
}

// ---------------------------------------------------------------------------
// Audit event types
// ---------------------------------------------------------------------------

export enum AuditEventType {
  TASK_CREATED = "task_created",
  STATE_TRANSITION = "state_transition",
  APPROVAL_REQUESTED = "approval_requested",
  APPROVAL_DECIDED = "approval_decided",
  POLICY_DENIAL = "policy_denial",
  TRIAGE_SUBMITTED = "triage_submitted",
  CASE_PACKAGE_CREATED = "case_package_created",
  ACCESS_DENIED = "access_denied",
  BOUNDARY_CROSSING = "boundary_crossing",
  EVIDENCE_GENERATED = "evidence_generated",
  CLOSURE_DECISION = "closure_decision",
  FINDING_CREATED = "finding_created",
  FINDING_STATE_CHANGED = "finding_state_changed",
  // Execution routing and dispatch
  EXECUTION_ROUTED = "execution_routed",
  EXECUTION_STARTED = "execution_started",
  EXECUTION_COMPLETED = "execution_completed",
  EXECUTION_FAILED = "execution_failed",
  // Secure runtime controls
  CONTEXT_FILTERED = "context_filtered",
  OUTPUT_REJECTED = "output_rejected",
  RETRY_LIMIT_REACHED = "retry_limit_reached",
  EXECUTION_ESCALATED = "execution_escalated",
  // Fan-out, handoff, join events
  FANOUT_DISPATCHED = "fanout_dispatched",
  BRANCH_COMPLETED = "branch_completed",
  BRANCH_FAILED = "branch_failed",
  JOIN_COMPLETED = "join_completed",
  JOIN_PARTIAL = "join_partial",
  HANDOFF_SENT = "handoff_sent",
  HANDOFF_RECEIVED = "handoff_received",
  // Rate limiting, kill switch, observability
  RATE_LIMITED = "rate_limited",
  KILL_SWITCH_ENGAGED = "kill_switch_engaged",
  KILL_SWITCH_RELEASED = "kill_switch_released",
  CONTAINMENT_TRIGGERED = "containment_triggered",
  CONTAINMENT_RELEASED = "containment_released",
  CASTE_LOCKED = "caste_locked",
  CASTE_UNLOCKED = "caste_unlocked",
  OBSERVABILITY_EXPORT = "observability_export",
  // LLM provider abstraction
  LLM_REQUEST_SENT = "llm_request_sent",
  LLM_RESPONSE_RECEIVED = "llm_response_received",
  LLM_REQUEST_FAILED = "llm_request_failed",
  LLM_FAILOVER = "llm_failover",
}

export enum AuditOutcome {
  SUCCESS = "success",
  DENIED = "denied",
  ERROR = "error",
}

// ---------------------------------------------------------------------------
// Fan-out / join / handoff
// ---------------------------------------------------------------------------

/** Determines how branch results are merged at the join point. */
export enum JoinPolicy {
  ALL = "all",
  ANY = "any",
  MAJORITY = "majority",
}

/** Lifecycle state of a single fan-out branch. */
export enum BranchState {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}

/** State of an inter-caste agent handoff. */
export enum HandoffStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

// ---------------------------------------------------------------------------
// Session state (ported from runtime/session.py)
// ---------------------------------------------------------------------------

export enum SessionState {
  CREATED = "created",
  ACTIVE = "active",
  IDLE = "idle",
  EXPIRED = "expired",
  CLOSED = "closed",
}

// ---------------------------------------------------------------------------
// Subsystem state (ported from bootstrap.py)
// ---------------------------------------------------------------------------

export enum SubsystemState {
  PENDING = "pending",
  INITIALIZING = "initializing",
  READY = "ready",
  FAILED = "failed",
  SHUTTING_DOWN = "shutting_down",
  STOPPED = "stopped",
}
