/**
 * Zero-dependency structured logger for runtime audit events.
 *
 * Logging is disabled by default unless COLONY_STRUCTURED_LOGS=1 or an
 * explicit sink is provided. Every serialized record is scrubbed before it
 * leaves the process.
 */

import { scrubSecrets } from "../security/log-sanitizer";
import { SecretScanner } from "../security/secret-scanner";

const LOG_SECRET_SCANNER = new SecretScanner();

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  event: string;
  message?: string;
  sessionId?: string;
  agentId?: string;
  caste?: string;
  data?: Record<string, unknown>;
}

export type LogSink = (line: string, record: LogRecord) => void;

export class StructuredLogger {
  private _sink: LogSink;
  private _enabled: boolean;

  constructor(opts?: { sink?: LogSink; enabled?: boolean }) {
    this._sink = opts?.sink ?? ((line) => console.error(line));
    this._enabled =
      opts?.enabled ?? ["1", "true", "yes"].includes(
        String(process.env.COLONY_STRUCTURED_LOGS ?? "").toLowerCase(),
      );
  }

  get enabled(): boolean {
    return this._enabled;
  }

  emit(
    level: LogLevel,
    event: string,
    data: Record<string, unknown> = {},
    message?: string,
  ): void {
    if (!this._enabled) return;

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
      agentId: typeof data.agentId === "string" ? data.agentId : undefined,
      caste: typeof data.caste === "string" ? data.caste : undefined,
      data,
    };

    const line = LOG_SECRET_SCANNER.scan(scrubSecrets(JSON.stringify(record))).redactedText;
    this._sink(line, parseSanitizedRecord(line));
  }

  debug(event: string, data?: Record<string, unknown>, message?: string): void {
    this.emit("debug", event, data, message);
  }

  info(event: string, data?: Record<string, unknown>, message?: string): void {
    this.emit("info", event, data, message);
  }

  warn(event: string, data?: Record<string, unknown>, message?: string): void {
    this.emit("warn", event, data, message);
  }

  error(event: string, data?: Record<string, unknown>, message?: string): void {
    this.emit("error", event, data, message);
  }
}

export function createMemoryLogger(): {
  logger: StructuredLogger;
  lines: string[];
  records: LogRecord[];
} {
  const lines: string[] = [];
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({
    enabled: true,
    sink: (line, record) => {
      lines.push(line);
      records.push(record);
    },
  });
  return { logger, lines, records };
}

export const runtimeLogger = new StructuredLogger();

function parseSanitizedRecord(line: string): LogRecord {
  try {
    return JSON.parse(line) as LogRecord;
  } catch {
    return {
      timestamp: new Date().toISOString(),
      level: "error",
      event: "log_sanitization_parse_failed",
      data: { sanitized: true },
    };
  }
}
