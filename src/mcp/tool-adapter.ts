import type {
  ToolDefinition,
  ToolExecutor,
  ToolRegistry,
} from "../runtime/tools-registry";
import type {
  McpApprovalCall,
  McpApprovalProof,
  McpTool,
  McpToolCallResult,
} from "./protocol";
import { textToolResult } from "./protocol";
import { approvalSignature } from "../runtime/approval";

export type McpApprovalVerifier = (
  proof: McpApprovalProof,
  call: McpApprovalCall,
) => boolean | Promise<boolean>;

export interface McpToolAdapterOptions {
  exposedToolIds?: string[];
  maxContentChars?: number;
  approvalVerifier?: McpApprovalVerifier;
}

export class McpToolAdapter {
  private readonly _registry: ToolRegistry;
  private readonly _executor: ToolExecutor;
  private readonly _exposedToolIds: Set<string> | null;
  private readonly _maxContentChars: number;
  private readonly _approvalVerifier: McpApprovalVerifier | null;

  constructor(
    registry: ToolRegistry,
    executor: ToolExecutor,
    options: McpToolAdapterOptions = {},
  ) {
    this._registry = registry;
    this._executor = executor;
    this._exposedToolIds = options.exposedToolIds
      ? new Set(options.exposedToolIds)
      : null;
    this._maxContentChars = options.maxContentChars ?? 10_000;
    this._approvalVerifier = options.approvalVerifier ?? null;
  }

  listTools(): McpTool[] {
    return this._exposedDefinitions().map((definition) => ({
      name: definition.toolId,
      description: definition.description,
      inputSchema: normalizeInputSchema(definition.parameters),
      annotations: {
        title: definition.name,
        readOnlyHint: definition.metadata.readOnly,
        destructiveHint: definition.metadata.readOnly ? false : definition.metadata.destructive,
        idempotentHint: definition.metadata.readOnly,
        openWorldHint: isOpenWorldTool(definition),
        category: definition.category,
        requiresApproval: definition.requiresApproval,
        maxOutputBytes: definition.maxOutputBytes,
        readOnly: definition.metadata.readOnly,
        destructive: definition.metadata.destructive,
        concurrency: definition.metadata.concurrency,
        interrupt: definition.metadata.interrupt,
        progress: definition.metadata.progress,
        transcriptOutput: definition.metadata.transcript.output,
        transcriptSearchIndexed: definition.metadata.transcript.searchIndexed,
        searchIndexed: definition.metadata.search.indexed,
        persistedResult: definition.metadata.persistedResult.mode,
        persistedResultThresholdBytes: definition.metadata.persistedResult.thresholdBytes,
      },
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: { approved?: boolean; approvalId?: string; approvalSignature?: string } = {},
  ): Promise<McpToolCallResult> {
    if (!isJsonCompatibleObject(args)) {
      return textToolResult("MCP tool arguments must be JSON-compatible before execution.", true);
    }
    if (!this._isExposed(name)) {
      return textToolResult(`MCP tool not found or not exposed: ${name}`, true);
    }

    const definition = this._registry.get(name);
    if (definition.requiresApproval) {
      const approved = await this._verifyApproval(name, args, options);
      if (!approved) {
        return textToolResult(
          `Approval required for MCP tool '${name}' before execution.`,
          true,
        );
      }
    }

    const result = await this._executor.execute(name, args);
    if (result.error) {
      return textToolResult(result.error, true);
    }

    return textToolResult(this._boundedText(result.output));
  }

  private _exposedDefinitions(): ToolDefinition[] {
    return this._registry
      .listTools()
      .filter((definition) => this._isExposed(definition.toolId));
  }

  private _isExposed(toolId: string): boolean {
    if (!this._registry.has(toolId)) return false;
    return this._exposedToolIds === null || this._exposedToolIds.has(toolId);
  }

  private async _verifyApproval(
    name: string,
    args: Record<string, unknown>,
    options: { approvalId?: string; approvalSignature?: string },
  ): Promise<boolean> {
    if (!this._approvalVerifier || !options.approvalId || !options.approvalSignature) {
      return false;
    }

    let signature: string;
    try {
      signature = approvalSignature(name, args);
    } catch {
      return false;
    }
    if (options.approvalSignature !== signature) return false;

    try {
      return await this._approvalVerifier(
        {
          approvalId: options.approvalId,
          signature: options.approvalSignature,
        },
        {
          toolName: name,
          arguments: args,
          signature,
        },
      );
    } catch {
      return false;
    }
  }

  private _boundedText(text: string): string {
    if (text.length <= this._maxContentChars) return text;
    return `${text.slice(0, this._maxContentChars)}\n... [MCP tool output truncated]`;
  }
}

function isOpenWorldTool(definition: ToolDefinition): boolean {
  if (definition.category === "http" || definition.category === "web") return true;
  if (definition.toolId === "shell_exec") return true;
  return false;
}

function normalizeInputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.type === "object") return { ...schema };
  return {
    type: "object",
    properties: {},
  };
}

function isJsonCompatibleObject(value: Record<string, unknown>): boolean {
  return isJsonCompatibleValue(value);
}

function isJsonCompatibleValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (hasJsonStringifyHook(value)) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      if (key !== "length" && !isArrayIndexKey(key, value.length)) return false;
    }
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined
        || descriptor.enumerable !== true
        || !("value" in descriptor)
        || !isJsonCompatibleValue(descriptor.value)) {
        return false;
      }
    }
    return true;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (hasJsonStringifyHook(value)) return false;
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.keys(descriptors).every((key) => {
      const descriptor = descriptors[key];
      return descriptor !== undefined
        && descriptor.enumerable === true
        && "value" in descriptor
        && descriptor.value !== undefined
        && isJsonCompatibleValue(descriptor.value);
    });
  }
  return false;
}

function isArrayIndexKey(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function hasJsonStringifyHook(value: object): boolean {
  let current: object | null = value;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, "toJSON")) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}
