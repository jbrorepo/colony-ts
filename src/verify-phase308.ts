import { SecurityAuditTrail, SecurityEventType } from "./security/audit-trail";
import { exportAuditJsonl, exportAuditSummary } from "./security/audit-export";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const audit = new SecurityAuditTrail({ persist: false });
await audit.record({
  eventType: SecurityEventType.PERMISSION_GRANTED,
  action: "browser_click",
  resource: "https://example.com?token=ghp_secret123456",
  outcome: "allowed",
  details: { token: "ghp_secret123456" },
});
const jsonl = exportAuditJsonl(audit);
assert(!jsonl.includes("ghp_secret"), "audit JSONL export redacts secrets");
const summary = exportAuditSummary(audit);
assert(summary.integrityVerified === true, "audit summary verifies integrity");
assert(summary.totalEvents === 1, "audit summary counts events");

console.log("Phase 308: audit export redaction and integrity are GREEN.");
