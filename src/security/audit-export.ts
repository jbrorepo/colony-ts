import type { SecurityAuditTrail, SecurityEvent } from "./audit-trail";
import { scrubSecrets } from "./log-sanitizer";

export interface OpenTelemetryAuditEvent {
  name: string;
  timeUnixNano: number;
  attributes: Record<string, string | number | boolean>;
  networkSent: false;
}

export function exportAuditJsonl(audit: SecurityAuditTrail): string {
  return audit.allEvents.map((event) => JSON.stringify(redactEvent(event))).join("\n");
}

export function exportAuditSummary(audit: SecurityAuditTrail): ReturnType<SecurityAuditTrail["generateReport"]> {
  return audit.generateReport(24);
}

export function projectAuditToOpenTelemetryEvents(audit: SecurityAuditTrail): OpenTelemetryAuditEvent[] {
  return audit.allEvents.map((event) => ({
    name: `colony.security.${event.eventType}`,
    timeUnixNano: new Date(event.timestamp).getTime() * 1_000_000,
    attributes: {
      action: redact(String(event.action ?? "")),
      resource: redact(String(event.resource ?? "")),
      outcome: redact(String(event.outcome ?? "")),
      sessionId: redact(String(event.sessionId ?? "")),
    },
    networkSent: false,
  }));
}

function redactEvent(event: SecurityEvent): SecurityEvent {
  return {
    ...event,
    action: redact(event.action),
    resource: redact(event.resource),
    outcome: redact(event.outcome),
    details: JSON.parse(redact(JSON.stringify(event.details))) as Record<string, unknown>,
    actorAgentId: redact(event.actorAgentId),
    sessionId: event.sessionId ? redact(event.sessionId) : null,
  };
}

function redact(value: string): string {
  return scrubSecrets(value)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/([?&](?:token|api[_-]?key|secret|password|authorization)=)[^&#\s]+/gi, "$1[REDACTED]");
}
