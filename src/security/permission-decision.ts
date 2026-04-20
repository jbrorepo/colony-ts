/**
 * Structured permission decision model for The Colony.
 *
 * 1:1 port of colony/security/permission_decision.py — replaces boolean
 * is_allowed() results with rich, auditable decision objects that carry the
 * *reason* for the decision, its *source*, and optional updated_input.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** The three possible behaviors for a permission decision. */
export enum PermissionBehavior {
  ALLOW = "allow",
  DENY = "deny",
  ASK = "ask",
}

/**
 * Where the permission decision originated.
 * Each source traces back to a specific layer in The Colony's
 * security pipeline so audit logs are unambiguous.
 */
export enum PermissionReasonSource {
  CASTE_RULE = "caste_rule",
  USER_SETTINGS = "user_settings",
  PROJECT_SETTINGS = "project_settings",
  SAFETY_CHECK = "safety_check",
  CLASSIFIER = "classifier",
  HOOK = "hook",
  WORKING_DIR = "working_dir",
  SESSION = "session",
}

// ---------------------------------------------------------------------------
// Reason model
// ---------------------------------------------------------------------------

export interface PermissionDecisionReason {
  /** Which security layer produced this decision. */
  source: PermissionReasonSource;
  /** Human-readable explanation of the decision rationale. */
  detail: string;
}

// ---------------------------------------------------------------------------
// Decision model
// ---------------------------------------------------------------------------

export interface PermissionDecision {
  /** Whether to allow, deny, or ask the user. */
  behavior: PermissionBehavior;
  /** Source and detail of why this decision was made. */
  reason: PermissionDecisionReason;
  /** Optional modified tool input dict (set by hooks). */
  updatedInput: Record<string, unknown> | null;
  /** The agent that requested the action. */
  agentId: string;
  /** The agent's caste at the time of the request. */
  caste: string;
  /** The tool that was evaluated. */
  tool: string;
  /** When the decision was made (ISO string). */
  timestamp: string;
}

export function createPermissionDecision(
  behavior: PermissionBehavior,
  reason: PermissionDecisionReason,
  opts: Partial<Omit<PermissionDecision, "behavior" | "reason">> = {},
): PermissionDecision {
  return {
    behavior,
    reason,
    updatedInput: opts.updatedInput ?? null,
    agentId: opts.agentId ?? "",
    caste: opts.caste ?? "",
    tool: opts.tool ?? "",
    timestamp: opts.timestamp ?? new Date().toISOString(),
  };
}
