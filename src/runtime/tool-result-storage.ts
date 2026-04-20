/**
 * Large tool-result externalization.
 *
 * Results over 10KB are persisted under the Colony data directory and replaced
 * in session history/UI state with a small preview plus a file reference.
 */

import { mkdir } from "fs/promises";
import { join } from "path";

import { getDataPath, settings } from "../settings";
import { scrubSecrets } from "../security/log-sanitizer";
import { SecretScanner } from "../security/secret-scanner";

export const DEFAULT_TOOL_RESULT_THRESHOLD_CHARS = 10_000;
export const DEFAULT_TOOL_RESULT_PREVIEW_CHARS = 2_000;
const PERSISTED_OUTPUT_OPEN = "<persisted-output>";
const PERSISTED_OUTPUT_CLOSE = "</persisted-output>";
const REDACTION_NOTE = "Sensitive tokens were redacted before persistence.";

const TOOL_RESULT_SECRET_SCANNER = new SecretScanner();

export interface PersistedToolResult {
  filepath: string;
  originalSize: number;
  preview: string;
  hasMore: boolean;
  isJson: boolean;
  redacted: boolean;
}

export interface ToolResultStorageOptions {
  sessionId: string;
  dataDir?: string;
  thresholdChars?: number;
  previewChars?: number;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "result";
}

function isJsonText(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

export function generateToolResultPreview(
  content: string,
  maxChars = DEFAULT_TOOL_RESULT_PREVIEW_CHARS,
): { preview: string; hasMore: boolean } {
  if (content.length <= maxChars) return { preview: content, hasMore: false };

  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = lastNewline > maxChars * 0.5 ? lastNewline : maxChars;
  return { preview: content.slice(0, cutPoint), hasMore: true };
}

export function buildPersistedToolResultMessage(result: PersistedToolResult): string {
  const size = result.originalSize.toLocaleString();
  const previewSize = result.preview.length.toLocaleString();
  return [
    "<persisted-output>",
    `Output too large (${size} chars). Full output saved to: ${result.filepath}`,
    result.redacted ? "Sensitive tokens were redacted before persistence." : "",
    "",
    `Preview (first ${previewSize} chars):`,
    result.preview,
    result.hasMore ? "..." : "",
    "</persisted-output>",
  ].filter((line) => line !== "").join("\n");
}

export function parsePersistedToolResultMessage(content: string): PersistedToolResult | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith(PERSISTED_OUTPUT_OPEN) || !trimmed.endsWith(PERSISTED_OUTPUT_CLOSE)) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/).slice(1, -1);
  if (lines.length < 2) return null;

  const header = lines[0] ?? "";
  const match = /^Output too large \(([\d,]+) chars\)\. Full output saved to: (.+)$/.exec(header);
  if (!match) return null;

  let cursor = 1;
  let redacted = false;
  if (lines[cursor] === REDACTION_NOTE) {
    redacted = true;
    cursor += 1;
  }

  const previewHeader = lines[cursor] ?? "";
  if (!/^Preview \(first [\d,]+ chars\):$/.test(previewHeader)) {
    return null;
  }

  const previewLines = lines.slice(cursor + 1);
  let hasMore = false;
  if (previewLines.at(-1) === "...") {
    previewLines.pop();
    hasMore = true;
  }

  const filepath = match[2];
  return {
    filepath,
    originalSize: Number.parseInt(match[1].replace(/,/g, ""), 10),
    preview: previewLines.join("\n"),
    hasMore,
    isJson: filepath.toLowerCase().endsWith(".json"),
    redacted,
  };
}

function sanitizePersistedContent(content: string): { sanitized: string; redacted: boolean } {
  const scrubbed = scrubSecrets(content);
  const sanitized = TOOL_RESULT_SECRET_SCANNER.scan(scrubbed).redactedText;
  return {
    sanitized,
    redacted: sanitized !== content,
  };
}

export class ToolResultStorage {
  readonly sessionId: string;
  readonly thresholdChars: number;
  readonly previewChars: number;
  private _dataDir: string;
  private _persistedIds = new Set<string>();

  constructor(opts: ToolResultStorageOptions) {
    this.sessionId = opts.sessionId || "default";
    this._dataDir = opts.dataDir ?? getDataPath(settings);
    this.thresholdChars = opts.thresholdChars ?? DEFAULT_TOOL_RESULT_THRESHOLD_CHARS;
    this.previewChars = opts.previewChars ?? DEFAULT_TOOL_RESULT_PREVIEW_CHARS;
  }

  get resultsDir(): string {
    return join(this._dataDir, "tool-results", safeId(this.sessionId));
  }

  shouldPersist(content: string): boolean {
    return content.length > this.thresholdChars;
  }

  async persist(
    toolName: string,
    toolUseId: string,
    content: string,
  ): Promise<PersistedToolResult> {
    const { sanitized, redacted } = sanitizePersistedContent(content);
    const json = isJsonText(sanitized);
    const ext = json ? "json" : "txt";
    const filename = `${safeId(toolUseId || toolName)}.${ext}`;
    const filepath = join(this.resultsDir, filename);
    const { preview, hasMore } = generateToolResultPreview(sanitized, this.previewChars);

    await mkdir(this.resultsDir, { recursive: true });
    if (!this._persistedIds.has(toolUseId)) {
      const file = Bun.file(filepath);
      if (!(await file.exists())) {
        await Bun.write(filepath, sanitized);
      }
      this._persistedIds.add(toolUseId);
    }

    return {
      filepath,
      originalSize: content.length,
      preview,
      hasMore,
      isJson: json,
      redacted,
    };
  }

  async externalizeIfNeeded(
    toolName: string,
    toolUseId: string,
    content: string,
  ): Promise<{ content: string; persisted: PersistedToolResult | null }> {
    if (!this.shouldPersist(content)) {
      return { content, persisted: null };
    }

    const persisted = await this.persist(toolName, toolUseId, content);
    return {
      content: buildPersistedToolResultMessage(persisted),
      persisted,
    };
  }

  async read(toolUseId: string): Promise<string | null> {
    for (const ext of ["txt", "json"]) {
      const path = join(this.resultsDir, `${safeId(toolUseId)}.${ext}`);
      const file = Bun.file(path);
      if (await file.exists()) return file.text();
    }
    return null;
  }
}
