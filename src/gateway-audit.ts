import type { GatewayBasicCommandPayload } from "./gateway-basic";
import type { SecurityAuditTrail } from "./security/audit-trail";
import { exportAuditJsonl, exportAuditSummary, projectAuditToOpenTelemetryEvents } from "./security/audit-export";

export interface GatewayAuditContext {
  trail?: SecurityAuditTrail | null;
}

function auditInspectViews(): string {
  return "/audit status | /audit export jsonl | /audit export summary | /audit verify | /audit otel";
}

export function buildAuditCommandPayload(args: string[], context: GatewayAuditContext = {}): GatewayBasicCommandPayload {
  const command = (args[0] ?? "status").toLowerCase();
  const trail = context.trail ?? null;
  if (!trail) {
    return {
      output: "Audit trail is not available in this context.\nNext valid command: /audit status",
      isError: true,
      data: { action: "audit_unavailable" },
    };
  }
  if (command === "export") {
    const format = args[1]?.trim().toLowerCase() ?? "";
    if (!format || format.startsWith("--")) {
      return missingAuditExportFormat();
    }
    if (format === "jsonl") {
      return {
        output: ["Audit Export JSONL:", "", exportAuditJsonl(trail), "", "Network sent: no"].join("\n"),
        data: { action: "audit_export_jsonl" },
      };
    }
    if (format === "summary") {
      const summary = exportAuditSummary(trail);
      return {
        output: [
          "Audit Export Summary:",
          "",
          `Total events: ${summary.totalEvents}`,
          `Integrity verified: ${summary.integrityVerified ? "yes" : "no"}`,
          `Denied actions: ${summary.deniedActions}`,
          "Network sent: no",
        ].join("\n"),
        data: { action: "audit_export_summary" },
      };
    }
    return unknownAuditExportFormat(format);
  }
  if (command === "verify") {
    const integrity = trail.verifyIntegrity();
    return {
      output: [
        "Audit Integrity:",
        "",
        `Verified: ${integrity.verified ? "yes" : "no"}`,
        `Events checked: ${integrity.eventsChecked}`,
        `First invalid: ${integrity.firstInvalid ?? "none"}`,
      ].join("\n"),
      data: { action: "audit_verify", verified: integrity.verified },
    };
  }
  if (command === "otel") {
    const events = projectAuditToOpenTelemetryEvents(trail);
    return {
      output: [
        "Audit OpenTelemetry Projection:",
        "",
        `Events: ${events.length}`,
        "Network sent: no",
        "Next valid command: /audit export jsonl | /audit export summary",
      ].join("\n"),
      data: { action: "audit_otel", count: events.length },
    };
  }
  if (command !== "status") {
    return unknownAuditCommand(command);
  }
  const stats = trail.getStats();
  return {
    output: [
      "Audit Status:",
      "",
      `Events: ${stats.totalEvents}`,
      `Types: ${Object.keys(stats.eventsByType).length}`,
      `Exports: ${auditInspectViews()}`,
      "Next valid command: /audit verify",
    ].join("\n"),
    data: { action: "audit_status", totalEvents: stats.totalEvents },
  };
}

function missingAuditExportFormat(): GatewayBasicCommandPayload {
  return {
    output: [
      "Audit export format required.",
      "",
      `Views: ${auditInspectViews()}`,
      "Next valid command: /audit export jsonl | /audit export summary",
    ].join("\n"),
    isError: true,
    data: { action: "audit_export_missing_format" },
  };
}

function unknownAuditExportFormat(format: string): GatewayBasicCommandPayload {
  return {
    output: [
      `Unknown audit export format '${format}'.`,
      "",
      "Supported export formats: jsonl, summary",
      `Views: ${auditInspectViews()}`,
      "Next valid command: /audit export jsonl | /audit export summary",
    ].join("\n"),
    isError: true,
    data: { action: "audit_export_unknown_format", format },
  };
}

function unknownAuditCommand(command: string): GatewayBasicCommandPayload {
  return {
    output: [
      `Unknown audit command '${command}'.`,
      "",
      `Views: ${auditInspectViews()}`,
      "Next valid command: /audit status",
    ].join("\n"),
    isError: true,
    data: { action: "audit_unknown_command", command },
  };
}
