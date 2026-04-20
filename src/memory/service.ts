/**
 * Memory runtime coordinator.
 *
 * Composes conversation logging with auto-memory extraction and builds the
 * compact memory block that gets injected into prompts.
 */

import { createHash } from "crypto";
import { join } from "path";

import { MemoryArtifactStore, createMemoryArtifact, type MemoryArtifact } from "./artifact-store";
import { HybridMemory } from "./hybrid-memory";
import type { SerializedMessage } from "../runtime/message";
import type { AgentSession } from "../runtime/session";
import { getDataPath, settings } from "../settings";
import { AutoMemoryService, MemoryStore, type MemoryEntry } from "./auto-memory";
import { ConversationLogger, type LoggedTurnRecord } from "./conversation-log";
import { ExtractedMemoryStore, MemoryExtractor, type StoredExtractedMemory } from "./extractor";

export interface ColonyMemoryServiceOptions {
  dataDir?: string;
}

export class ColonyMemoryService {
  readonly conversationLogger: ConversationLogger;
  readonly autoMemory: AutoMemoryService;
  readonly artifactStore: MemoryArtifactStore;
  readonly hybridMemory: HybridMemory;
  readonly extractedMemoryStore: ExtractedMemoryStore;
  readonly memoryExtractor: MemoryExtractor;
  private readonly _loggedKeys = new Map<string, Set<string>>();

  constructor(opts: ColonyMemoryServiceOptions = {}) {
    const dataDir = opts.dataDir ?? getDataPath(settings);
    const memoryDir = join(dataDir, "memories");
    const conversationDir = join(dataDir, "conversations");

    this.conversationLogger = new ConversationLogger(conversationDir);
    this.artifactStore = new MemoryArtifactStore(join(dataDir, "memory-artifacts"));
    this.autoMemory = new AutoMemoryService({
      store: new MemoryStore(memoryDir),
    });
    this.hybridMemory = new HybridMemory({
      conversationLogger: this.conversationLogger,
      artifactStore: this.artifactStore,
    });
    this.extractedMemoryStore = new ExtractedMemoryStore(join(dataDir, "memory-extracts"));
    this.memoryExtractor = new MemoryExtractor();
  }

  async syncSession(session: AgentSession): Promise<LoggedTurnRecord[]> {
    return this._logMessages(session.sessionId, session.history);
  }

  primeSession(session: AgentSession): void {
    void session;
  }

  async buildMemoryContext(query: string, session: AgentSession): Promise<string> {
    await this.syncSession(session);
    const exactAndDerived = await this.hybridMemory.recall(query, {
      sessionId: session.sessionId,
      topK: 6,
    });
    const distilled = await this.autoMemory.surfaceRelevant({
      query,
      caste: String(session.caste),
    });
    const structured = await this.extractedMemoryStore.surfaceRelevant({
      query,
      agentId: session.agentId,
      caste: String(session.caste),
      limit: 6,
    });
    return formatMemoryContext(exactAndDerived, distilled, structured);
  }

  async captureSession(session: AgentSession): Promise<{
    loggedCount: number;
    extracted: MemoryEntry[];
    structured: StoredExtractedMemory[];
    artifact: MemoryArtifact | null;
  }> {
    const loggedRecords = await this.syncSession(session);
    const transcriptPath = this.conversationLogger.storageDir
      ? join(this.conversationLogger.storageDir, `${session.sessionId}.jsonl`)
      : "";
    const meaningfulTurns = loggedRecords.filter((record) => record.role !== "system");
    const artifact = await this._persistArtifact({
      sessionId: session.sessionId,
      transcriptPath,
      turns: meaningfulTurns,
      metadata: {
        agentId: session.agentId,
        caste: String(session.caste),
      },
    });

    if (meaningfulTurns.length === 0) {
      return { loggedCount: loggedRecords.length, extracted: [], structured: [], artifact };
    }

    const extracted = await this.autoMemory.extractMemories(
      meaningfulTurns.map(loggedRecordToMessageShape),
      session.agentId,
      String(session.caste),
      session.sessionId,
    );
    const structured = await this._extractStructuredMemories(
      meaningfulTurns.map(loggedRecordToMessageShape),
      session.sessionId,
      session.agentId,
      String(session.caste),
    );

    return { loggedCount: loggedRecords.length, extracted, structured, artifact };
  }

  async captureCompaction(input: {
    sessionId: string;
    agentId: string;
    caste: string;
    compactedMessages: SerializedMessage[];
    strategy: string;
    triggerSource: string;
    summary: string;
  }): Promise<{
    loggedCount: number;
    structured: StoredExtractedMemory[];
    artifact: MemoryArtifact | null;
  }> {
    const loggedRecords = await this._logMessages(input.sessionId, input.compactedMessages);
    const transcriptPath = this.conversationLogger.storageDir
      ? join(this.conversationLogger.storageDir, `${input.sessionId}.jsonl`)
      : "";
    const meaningfulTurns = loggedRecords.filter((record) => record.role !== "system");
    const artifact = await this._persistArtifact({
      sessionId: input.sessionId,
      transcriptPath,
      turns: meaningfulTurns,
      metadata: {
        agentId: input.agentId,
        caste: input.caste,
        source: "compaction_handoff",
        compactionStrategy: input.strategy,
        compactionTrigger: input.triggerSource,
        compactionSummary: input.summary,
      },
    });
    const structured = await this._extractStructuredMemories(
      meaningfulTurns.map(loggedRecordToMessageShape),
      input.sessionId,
      input.agentId,
      input.caste,
    );
    return { loggedCount: loggedRecords.length, structured, artifact };
  }

  private async _knownLoggedKeys(sessionId: string): Promise<Set<string>> {
    const known = this._loggedKeys.get(sessionId);
    if (known) return known;
    const loaded = await this.conversationLogger.listLoggedSourceKeys(sessionId);
    this._loggedKeys.set(sessionId, loaded);
    return loaded;
  }

  private async _logMessages(
    sessionId: string,
    messages: SerializedMessage[],
  ): Promise<LoggedTurnRecord[]> {
    const knownKeys = await this._knownLoggedKeys(sessionId);
    const records: LoggedTurnRecord[] = [];

    for (const [index, message] of messages.entries()) {
      const sourceMessageKey = historyMessageKey(message, index);
      if (knownKeys.has(sourceMessageKey)) continue;
      const record = mapHistoryMessage(message, sourceMessageKey);
      records.push(await this.conversationLogger.logTurn(
        sessionId,
        record.role,
        record.content,
        record.metadata,
      ));
      knownKeys.add(sourceMessageKey);
    }

    this._loggedKeys.set(sessionId, knownKeys);
    return records;
  }

  private async _persistArtifact(input: {
    sessionId: string;
    transcriptPath: string;
    turns: LoggedTurnRecord[];
    metadata: Record<string, unknown>;
  }): Promise<MemoryArtifact | null> {
    const artifact = createMemoryArtifact(input);
    if (artifact) {
      await this.artifactStore.appendArtifact(artifact);
    }
    return artifact;
  }

  private async _extractStructuredMemories(
    messages: Record<string, unknown>[],
    sessionId: string,
    agentId: string,
    caste: string,
  ): Promise<StoredExtractedMemory[]> {
    const extracted = await this.memoryExtractor.extract(messages, agentId);
    return this.extractedMemoryStore.save(sessionId, caste, extracted);
  }
}

function mapHistoryMessage(
  message: SerializedMessage,
  sourceMessageKey: string,
): {
  role: string;
  content: string;
  metadata: Record<string, unknown>;
} {
  if (message.type === "tool_result") {
    return {
      role: "tool",
      content: String(message.content ?? ""),
      metadata: {
        type: message.type,
        toolName: message.name,
        toolCallId: message.toolCallId,
        isError: Boolean(message.isError),
        timestamp: message.timestamp,
        sourceMessageKey,
      },
    };
  }

  return {
    role: message.type,
    content: String(message.content ?? ""),
    metadata: {
      type: message.type,
      timestamp: message.timestamp,
      toolCalls: message.type === "assistant" ? message.toolCalls ?? [] : [],
      sourceMessageKey,
    },
  };
}

function historyToMessageShape(message: SerializedMessage): Record<string, unknown> {
  if (message.type === "tool_result") {
    return {
      role: "tool",
      content: String(message.content ?? ""),
      name: message.name,
      toolCallId: message.toolCallId,
      isError: Boolean(message.isError),
    };
  }
  return {
    role: message.type,
    content: String(message.content ?? ""),
  };
}

function loggedRecordToMessageShape(record: LoggedTurnRecord): Record<string, unknown> {
  return {
    role: record.role,
    content: record.content,
  };
}

function historyMessageKey(message: SerializedMessage, index: number): string {
  if (typeof message.id === "string" && message.id.length > 0) {
    return `${message.type}:${message.id}`;
  }
  if (message.type === "tool_result" && typeof message.toolCallId === "string" && message.toolCallId.length > 0) {
    return `${message.type}:${message.toolCallId}`;
  }

  const hash = createHash("sha1")
    .update(JSON.stringify({
      type: message.type,
      content: String(message.content ?? ""),
      timestamp: message.timestamp ?? "",
      name: message.name ?? "",
      toolCallId: message.toolCallId ?? "",
      index,
    }))
    .digest("hex")
    .slice(0, 16);
  return `${message.type}:${hash}`;
}

function compactPreview(text: string, maxChars = 280): string {
  const collapsed = text
    .replace(/^#.+$/gm, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/\n---\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars - 3)}...`;
}

function formatMemoryContext(
  recall: Array<{
    content: string;
    source: "conversation" | "artifact";
    sessionId: string;
    exact: boolean;
  }>,
  entries: MemoryEntry[],
  structured: StoredExtractedMemory[],
): string {
  const verbatim = recall.filter((entry) => entry.exact);
  const derived = recall.filter((entry) => !entry.exact);
  const lines: string[] = [];

  if (verbatim.length > 0) {
    lines.push("Verbatim recall (exact transcript excerpts):");
    for (const entry of verbatim.slice(0, 3)) {
      lines.push(`- [session:${entry.sessionId}] ${compactPreview(entry.content)}`);
    }
  }

  if (derived.length > 0 || entries.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Derived compact recall (not verbatim; use to find truth, not replace it):");
    for (const entry of derived.slice(0, 2)) {
      lines.push(`- [artifact:${entry.sessionId}] ${compactPreview(entry.content, 380)}`);
    }
    for (const entry of entries.slice(0, 3)) {
      lines.push(`- [memory:${entry.caste || "general"}] ${entry.topic}: ${compactPreview(entry.content)}`);
    }
  }

  if (structured.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Reusable facts (derived, scoped, durable):");
    for (const entry of structured.slice(0, 4)) {
      const scopeTag = entry.scope === "agent" ? `agent:${entry.agentId}` : "colony";
      lines.push(`- [${scopeTag}/${entry.category}] ${compactPreview(entry.content)}`);
    }
  }

  return lines.join("\n");
}
