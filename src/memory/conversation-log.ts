/**
 * File-based conversation persistence - append-only JSONL per session.
 *
 * Behavioral port of colony/memory/conversation_log.py using async Bun/Node
 * primitives so history can be searched, exported, and reused for memory.
 */

import { appendFile, mkdir, readdir, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";

import { scrubSecrets } from "../security/log-sanitizer";
import { SecretScanner } from "../security/secret-scanner";
import { getDataPath, settings } from "../settings";

const MEMORY_SECRET_SCANNER = new SecretScanner();

export interface LoggedTurnRecord {
  turn_id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

function utcNow(): string {
  return new Date().toISOString();
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[\\/]+/g, "_").replace(/\.\./g, "_");
}

function sanitizeText(value: string): string {
  return MEMORY_SECRET_SCANNER.scan(scrubSecrets(value)).redactedText;
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const sanitized = sanitizeText(JSON.stringify(metadata));
    const parsed = JSON.parse(sanitized);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export class ConversationLogger {
  private readonly _storageDir: string;

  constructor(storageDir = join(getDataPath(settings), "conversations")) {
    this._storageDir = storageDir;
  }

  get storageDir(): string {
    return this._storageDir;
  }

  private _sessionPath(sessionId: string): string {
    return join(this._storageDir, `${safeSessionId(sessionId)}.jsonl`);
  }

  async logTurn(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown> | null,
  ): Promise<LoggedTurnRecord> {
    const record: LoggedTurnRecord = {
      turn_id: randomUUID().replace(/-/g, "").slice(0, 12),
      session_id: sessionId,
      role,
      content: sanitizeText(content),
      timestamp: utcNow(),
      metadata: sanitizeMetadata(metadata),
    };

    await mkdir(this._storageDir, { recursive: true });
    await appendFile(
      this._sessionPath(sessionId),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );

    return record;
  }

  async getHistory(sessionId: string, limit = 50): Promise<LoggedTurnRecord[]> {
    const file = Bun.file(this._sessionPath(sessionId));
    if (!(await file.exists())) return [];

    const turns = await this._readRecords(file);
    if (limit > 0) {
      return [...turns.slice(-limit)].reverse();
    }
    return [...turns].reverse();
  }

  async countHistory(sessionId: string): Promise<number> {
    const history = await this.getHistory(sessionId, 0);
    return history.length;
  }

  async listLoggedSourceKeys(sessionId: string): Promise<Set<string>> {
    const turns = await this.getHistory(sessionId, 0);
    const keys = new Set<string>();
    for (const turn of turns) {
      const sourceKey = turn.metadata?.sourceMessageKey;
      if (typeof sourceKey === "string" && sourceKey.length > 0) {
        keys.add(sourceKey);
      }
    }
    return keys;
  }

  async searchHistory(sessionId: string, query: string): Promise<LoggedTurnRecord[]> {
    const file = Bun.file(this._sessionPath(sessionId));
    if (!(await file.exists())) return [];

    const queryLower = query.toLowerCase();
    const turns = await this._readRecords(file);
    const matches = turns.filter((turn) => turn.content.toLowerCase().includes(queryLower));
    return matches.reverse();
  }

  async exportSession(sessionId: string): Promise<string> {
    const turns = await this.getHistory(sessionId, 0);
    const chronological = turns.reverse();

    if (chronological.length === 0) {
      return `# Session: ${sessionId}\n\nNo conversation history.\n`;
    }

    const lines = [`# Session: ${sessionId}\n`];
    for (const turn of chronological) {
      lines.push(`## ${turn.role.charAt(0).toUpperCase()}${turn.role.slice(1)} (${turn.timestamp})\n`);
      lines.push(`${turn.content}\n`);
    }
    return lines.join("\n");
  }

  async listSessions(): Promise<string[]> {
    try {
      const entries = await readdir(this._storageDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => entry.name.replace(/\.jsonl$/i, ""))
        .sort();
    } catch {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const path = this._sessionPath(sessionId);
    const file = Bun.file(path);
    if (!(await file.exists())) return false;
    await rm(path, { force: true });
    return true;
  }

  private async _readRecords(file: Bun.BunFile): Promise<LoggedTurnRecord[]> {
    const text = await file.text();
    const turns: LoggedTurnRecord[] = [];

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as LoggedTurnRecord;
        if (
          parsed
          && typeof parsed.turn_id === "string"
          && typeof parsed.session_id === "string"
          && typeof parsed.role === "string"
          && typeof parsed.content === "string"
          && typeof parsed.timestamp === "string"
        ) {
          turns.push(parsed);
        }
      } catch {
        // Ignore malformed JSONL rows, matching Python behavior.
      }
    }

    return turns;
  }
}
