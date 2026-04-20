/**
 * Security audit trail with hash-chain integrity.
 *
 * Ports colony/security/audit_trail.py. Records security-relevant events in
 * memory and optional JSONL storage. Event details are sanitized before
 * checksum and persistence.
 */

import { createHash, randomUUID } from "crypto";
import { appendFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { scrubSecrets } from "./log-sanitizer";
import { SecretScanner } from "./secret-scanner";

const AUDIT_SECRET_SCANNER = new SecretScanner();

export enum SecurityEventType {
  AUTH_SUCCESS = "auth_success",
  AUTH_FAILURE = "auth_failure",
  SECRET_ACCESS = "secret_access",
  SECRET_DENIED = "secret_denied",
  POLICY_ALLOW = "policy_allow",
  POLICY_DENY = "policy_deny",
  POLICY_AUDIT = "policy_audit",
  DATA_CLASSIFIED = "data_classified",
  DATA_REDACTED = "data_redacted",
  PERMISSION_GRANTED = "permission_granted",
  PERMISSION_DENIED = "permission_denied",
  SESSION_CREATED = "session_created",
  SESSION_EXPIRED = "session_expired",
  KILL_SWITCH_ENGAGED = "kill_switch_engaged",
  KILL_SWITCH_RELEASED = "kill_switch_released",
}

export interface SecurityEvent {
  id: string;
  eventType: SecurityEventType;
  timestamp: string;
  actorCaste: string;
  actorAgentId: string;
  action: string;
  resource: string;
  outcome: string;
  details: Record<string, unknown>;
  sessionId: string | null;
  checksum: string;
}

export interface AuditQuery {
  eventTypes?: SecurityEventType[];
  actorCaste?: string;
  actorAgentId?: string;
  start?: string | Date;
  end?: string | Date;
  outcome?: string;
  limit?: number;
}

export interface IntegrityResult {
  verified: boolean;
  eventsChecked: number;
  firstInvalid: string | null;
}

export interface ComplianceReport {
  periodStart: string;
  periodEnd: string;
  totalEvents: number;
  eventsByType: Record<string, number>;
  deniedActions: number;
  failedAuths: number;
  secretsAccessed: number;
  dataRedactions: number;
  integrityVerified: boolean;
  findings: string[];
}

export interface AuditStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByCaste: Record<string, number>;
  eventsByOutcome: Record<string, number>;
}

export interface AuditTrailConfig {
  storageDir: string;
  fileName: string;
  persist: boolean;
}

const GENESIS_CHECKSUM = "0".repeat(64);

export class SecurityAuditTrail {
  private readonly config: AuditTrailConfig;
  private readonly events: SecurityEvent[] = [];
  private lastChecksum = GENESIS_CHECKSUM;

  constructor(opts: Partial<AuditTrailConfig> = {}) {
    this.config = {
      storageDir: resolve(expandHome(opts.storageDir ?? "~/.colony/security_audit")),
      fileName: opts.fileName ?? "audit.jsonl",
      persist: opts.persist ?? true,
    };
  }

  get allEvents(): SecurityEvent[] {
    return this.events.map((event) => ({ ...event, details: { ...event.details } }));
  }

  async record(input: {
    eventType: SecurityEventType;
    actorCaste?: string;
    actorAgentId?: string;
    action?: string;
    resource?: string;
    outcome?: string;
    details?: Record<string, unknown>;
    sessionId?: string | null;
    timestamp?: string | Date;
  }): Promise<SecurityEvent> {
    const event: SecurityEvent = {
      id: randomUUID(),
      eventType: input.eventType,
      timestamp: toIso(input.timestamp ?? new Date()),
      actorCaste: input.actorCaste ?? "",
      actorAgentId: input.actorAgentId ?? "",
      action: input.action ?? "",
      resource: input.resource ?? "",
      outcome: input.outcome ?? "",
      details: sanitizeDetails(input.details ?? {}),
      sessionId: input.sessionId ?? null,
      checksum: "",
    };
    event.checksum = this.computeChecksum(event, this.lastChecksum);
    this.events.push(event);
    this.lastChecksum = event.checksum;

    if (this.config.persist) {
      await mkdir(this.config.storageDir, { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf-8");
    }

    return { ...event, details: { ...event.details } };
  }

  query(filters: AuditQuery = {}): SecurityEvent[] {
    const limit = filters.limit ?? 100;
    const start = filters.start ? new Date(filters.start).getTime() : null;
    const end = filters.end ? new Date(filters.end).getTime() : null;
    const matches: SecurityEvent[] = [];

    for (const event of this.events) {
      const ts = new Date(event.timestamp).getTime();
      if (filters.eventTypes?.length && !filters.eventTypes.includes(event.eventType)) continue;
      if (filters.actorCaste && event.actorCaste !== filters.actorCaste) continue;
      if (filters.actorAgentId && event.actorAgentId !== filters.actorAgentId) continue;
      if (start != null && ts < start) continue;
      if (end != null && ts > end) continue;
      if (filters.outcome && event.outcome !== filters.outcome) continue;
      matches.push({ ...event, details: { ...event.details } });
      if (matches.length >= limit) break;
    }

    return matches;
  }

  verifyIntegrity(opts: { start?: string | Date; end?: string | Date } = {}): IntegrityResult {
    const start = opts.start ? new Date(opts.start).getTime() : null;
    const end = opts.end ? new Date(opts.end).getTime() : null;
    const events = this.events.filter((event) => {
      const ts = new Date(event.timestamp).getTime();
      return (start == null || ts >= start) && (end == null || ts <= end);
    });

    if (events.length === 0) {
      return { verified: true, eventsChecked: 0, firstInvalid: null };
    }

    const firstIndex = this.events.indexOf(events[0]);
    let previous = firstIndex === 0 ? GENESIS_CHECKSUM : this.events[firstIndex - 1].checksum;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const expected = this.computeChecksum(event, previous);
      if (event.checksum !== expected) {
        return {
          verified: false,
          eventsChecked: i + 1,
          firstInvalid: event.id,
        };
      }
      previous = event.checksum;
    }

    return {
      verified: true,
      eventsChecked: events.length,
      firstInvalid: null,
    };
  }

  generateReport(periodHours = 24): ComplianceReport {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodHours * 60 * 60 * 1000);
    const events = this.events.filter((event) => new Date(event.timestamp) >= periodStart);
    const eventsByType: Record<string, number> = {};
    let deniedActions = 0;
    let failedAuths = 0;
    let secretsAccessed = 0;
    let dataRedactions = 0;

    for (const event of events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] ?? 0) + 1;
      if (
        event.eventType === SecurityEventType.POLICY_DENY ||
        event.eventType === SecurityEventType.PERMISSION_DENIED
      ) {
        deniedActions++;
      }
      if (event.eventType === SecurityEventType.AUTH_FAILURE) failedAuths++;
      if (event.eventType === SecurityEventType.SECRET_ACCESS) secretsAccessed++;
      if (event.eventType === SecurityEventType.DATA_REDACTED) dataRedactions++;
    }

    const integrity = this.verifyIntegrity({ start: periodStart });
    const findings: string[] = [];
    if (failedAuths > 0) findings.push(`${failedAuths} authentication failure(s) detected`);
    if (deniedActions > 5) findings.push(`High denial rate: ${deniedActions} actions denied`);
    const killSwitches = events.filter((event) => event.eventType === SecurityEventType.KILL_SWITCH_ENGAGED).length;
    if (killSwitches > 0) findings.push(`Kill switch engaged ${killSwitches} time(s)`);
    if (!integrity.verified) findings.push("Integrity chain verification FAILED");

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalEvents: events.length,
      eventsByType,
      deniedActions,
      failedAuths,
      secretsAccessed,
      dataRedactions,
      integrityVerified: integrity.verified,
      findings,
    };
  }

  getStats(): AuditStats {
    const stats: AuditStats = {
      totalEvents: this.events.length,
      eventsByType: {},
      eventsByCaste: {},
      eventsByOutcome: {},
    };

    for (const event of this.events) {
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] ?? 0) + 1;
      if (event.actorCaste) {
        stats.eventsByCaste[event.actorCaste] = (stats.eventsByCaste[event.actorCaste] ?? 0) + 1;
      }
      if (event.outcome) {
        stats.eventsByOutcome[event.outcome] = (stats.eventsByOutcome[event.outcome] ?? 0) + 1;
      }
    }

    return stats;
  }

  tamperForTest(index: number, patch: Partial<SecurityEvent>): void {
    const event = this.events[index];
    if (!event) return;
    Object.assign(event, patch);
  }

  private get filePath(): string {
    return join(this.config.storageDir, this.config.fileName);
  }

  private computeChecksum(event: SecurityEvent, previous: string): string {
    const payload = [
      previous,
      event.id,
      event.eventType,
      event.timestamp,
      event.actorCaste,
      event.actorAgentId,
      event.action,
      event.resource,
      event.outcome,
      stableStringify(event.details),
      event.sessionId ?? "",
    ].join("|");
    return createHash("sha256").update(payload, "utf-8").digest("hex");
  }
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(details);
  const sanitized = AUDIT_SECRET_SCANNER.scan(scrubSecrets(text)).redactedText;
  try {
    return JSON.parse(sanitized) as Record<string, unknown>;
  } catch {
    return { sanitized };
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function expandHome(path: string): string {
  if (!path.startsWith("~")) return path;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return home ? join(home, path.slice(1)) : path;
}
