import { SlashCommandParser } from "./gateway";
import { SecurityAuditTrail, SecurityEventType } from "./security/audit-trail";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const trail = new SecurityAuditTrail({ persist: false });
await trail.record({
  eventType: SecurityEventType.POLICY_DENY,
  action: "browser_click",
  resource: "https://example.test",
  outcome: "denied",
});

const parser = new SlashCommandParser({ audit: { trail } });

const validStatus = parser.tryHandle("/audit status");
assert(!validStatus.isError, "audit status remains accepted");
assert(validStatus.output.includes("Audit Status:"), "audit status renders");

const validExport = parser.tryHandle("/audit export jsonl");
assert(!validExport.isError, "audit export jsonl remains accepted");
assert(validExport.output.includes("Audit Export JSONL:"), "audit jsonl export renders");

const missingExportFormat = parser.tryHandle("/audit export");
assert(missingExportFormat.isError, "audit export without format is rejected");
assert(missingExportFormat.output.includes("Audit export format required."), "missing audit export explains requirement");
assert(missingExportFormat.output.includes("/audit export jsonl"), "missing audit export gives jsonl recovery command");

const unknownExportFormat = parser.tryHandle("/audit export csv");
assert(unknownExportFormat.isError, "unknown audit export format is rejected");
assert(unknownExportFormat.output.includes("Unknown audit export format 'csv'."), "unknown audit export explains format rejection");
assert(unknownExportFormat.output.includes("/audit export summary"), "unknown audit export gives summary recovery command");

const unknownCommand = parser.tryHandle("/audit purge");
assert(unknownCommand.isError, "unknown audit command is rejected");
assert(unknownCommand.output.includes("Unknown audit command 'purge'."), "unknown audit command explains rejection");
assert(unknownCommand.output.includes("/audit status"), "unknown audit command gives status recovery command");

console.log("Phase 329: audit command surface rejects unknown export and command forms.");
