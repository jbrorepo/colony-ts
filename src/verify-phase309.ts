import { SecurityAuditTrail, SecurityEventType } from "./security/audit-trail";
import { projectAuditToOpenTelemetryEvents } from "./security/audit-export";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const audit = new SecurityAuditTrail({ persist: false });
await audit.record({ eventType: SecurityEventType.POLICY_DENY, action: "plugin_activate", resource: "plugin", outcome: "denied" });
const events = projectAuditToOpenTelemetryEvents(audit);
assert(events.length === 1, "one otel event projected");
assert(events[0]?.name === "colony.security.policy_deny", "otel event name is stable");
assert(events[0]?.networkSent === false, "otel projection sends no network");

console.log("Phase 309: telemetry projection schema and no-network behavior are GREEN.");
