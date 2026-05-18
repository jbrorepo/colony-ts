import { buildAuditCommandPayload } from "./gateway-audit";
import { SecurityAuditTrail } from "./security/audit-trail";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const audit = new SecurityAuditTrail({ persist: false });

const flagOnly = buildAuditCommandPayload(["--approved"], { trail: audit });
assert(!flagOnly.isError, "flag-only audit view renders status");
assert(flagOnly.output.includes("Audit Status:"), "flag-only audit view renders status heading");
assert(!flagOnly.output.includes("--approved"), "flag-only audit view does not echo stray flag");
assert(flagOnly.data?.action === "audit_status", "flag-only audit stores status action");

const flaggedExport = buildAuditCommandPayload(["export", "summary", "--approved"], { trail: audit });
assert(!flaggedExport.isError, "flagged audit export still succeeds");
assert(flaggedExport.output.includes("Audit Export Summary:"), "flagged audit export renders summary");
assert(!flaggedExport.output.includes("--approved"), "flagged audit export does not echo stray flag");
assert(flaggedExport.data?.action === "audit_export_summary", "flagged audit export stores summary action");

const secretCommand = buildAuditCommandPayload(["ghp_AUDIT_SHOULD_NOT_LEAK12345678"], { trail: audit });
assert(secretCommand.isError, "secret-shaped audit command remains rejected");
assert(secretCommand.output.includes("Unknown audit command '[REDACTED]'"), "secret-shaped audit command renders redacted label");
assert(!secretCommand.output.includes("AUDIT_SHOULD_NOT_LEAK"), "secret-shaped audit command redacts token body");
assert(!secretCommand.output.includes("ghp_"), "secret-shaped audit command redacts token prefix");
assert(secretCommand.data?.command === "[REDACTED]", "secret-shaped audit command stores only redacted value");

const secretExportFormat = buildAuditCommandPayload(["export", "github_pat_AUDIT_SHOULD_NOT_LEAK12345678"], { trail: audit });
assert(secretExportFormat.isError, "secret-shaped audit export format remains rejected");
assert(secretExportFormat.output.includes("Unknown audit export format '[REDACTED]'"), "secret-shaped audit export format renders redacted label");
assert(!secretExportFormat.output.includes("AUDIT_SHOULD_NOT_LEAK"), "secret-shaped audit export format redacts token body");
assert(!secretExportFormat.output.includes("github_pat_"), "secret-shaped audit export format redacts token prefix");
assert(secretExportFormat.data?.format === "[REDACTED]", "secret-shaped audit export format stores only redacted value");

console.log("Phase 341: audit command inputs ignore flags and redact secrets.");
