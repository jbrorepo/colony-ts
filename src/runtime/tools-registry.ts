/**
 * Pluggable tool registry and executor for The Colony agent runtime.
 *
 * 1:1 port of colony/runtime/tools_registry.py — maintains a catalogue
 * of tools agents can invoke, with validation, timeout, and audit.
 *
 * Key classes:
 *   - ToolDefinition: schema and metadata for a tool
 *   - ToolRegistry: thread-safe catalogue with LLM schema export
 *   - ToolExecutor: validates inputs, invokes handlers, captures output
 */

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(message: string) {
    super(message);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends ToolError {
  constructor(message: string) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class ToolTimeoutError extends ToolError {
  constructor(message: string) {
    super(message);
    this.name = "ToolTimeoutError";
  }
}

// ---------------------------------------------------------------------------
// ToolDefinition
// ---------------------------------------------------------------------------

export type ToolConcurrencyMode = "parallel_safe" | "exclusive";
export type ToolInterruptMode = "interruptible" | "timeout_only" | "non_interruptible";
export type ToolProgressMode = "none" | "activity" | "streaming";
export type ToolTranscriptOutputMode = "inline" | "externalized" | "none";
export type ToolPersistedResultMode = "threshold" | "always" | "never";

export interface ToolTranscriptMetadata {
  includeArguments: boolean;
  searchIndexed: boolean;
  output: ToolTranscriptOutputMode;
  redact: boolean;
}

export interface ToolSearchMetadata {
  indexed: boolean;
  queryParameter?: string;
  pathParameter?: string;
  resultLimit?: number;
}

export interface ToolPersistedResultMetadata {
  mode: ToolPersistedResultMode;
  thresholdBytes: number;
  previewBytes: number;
  redact: boolean;
}

export interface ToolMetadata extends Record<string, unknown> {
  readOnly: boolean;
  destructive: boolean;
  concurrency: ToolConcurrencyMode;
  interrupt: ToolInterruptMode;
  progress: ToolProgressMode;
  transcript: ToolTranscriptMetadata;
  search: ToolSearchMetadata;
  persistedResult: ToolPersistedResultMetadata;
}

export interface ToolDefinition {
  toolId: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns: Record<string, unknown>;
  category: string; // "shell" | "file" | "http" | "custom"
  requiresApproval: boolean;
  timeoutSeconds: number;
  maxOutputBytes: number;
  metadata: ToolMetadata;
}

export type ToolDefinitionOptions = Omit<
  Partial<ToolDefinition>,
  "toolId" | "name" | "metadata"
> & {
  metadata?: Partial<ToolMetadata> & Record<string, unknown>;
};

export const DEFAULT_TOOL_METADATA: ToolMetadata = {
  readOnly: false,
  destructive: false,
  concurrency: "exclusive",
  interrupt: "interruptible",
  progress: "activity",
  transcript: {
    includeArguments: false,
    searchIndexed: false,
    output: "externalized",
    redact: true,
  },
  search: {
    indexed: false,
  },
  persistedResult: {
    mode: "threshold",
    thresholdBytes: 10_000,
    previewBytes: 2_000,
    redact: true,
  },
};

export function normalizeToolMetadata(
  metadata?: Partial<ToolMetadata> & Record<string, unknown>,
): ToolMetadata {
  const transcript = metadata?.transcript && typeof metadata.transcript === "object"
    ? metadata.transcript
    : {};
  const search = metadata?.search && typeof metadata.search === "object"
    ? metadata.search
    : {};
  const persistedResult = metadata?.persistedResult && typeof metadata.persistedResult === "object"
    ? metadata.persistedResult
    : {};

  return {
    ...(metadata ?? {}),
    readOnly: typeof metadata?.readOnly === "boolean" ? metadata.readOnly : DEFAULT_TOOL_METADATA.readOnly,
    destructive: typeof metadata?.destructive === "boolean" ? metadata.destructive : DEFAULT_TOOL_METADATA.destructive,
    concurrency: isToolConcurrency(metadata?.concurrency) ? metadata.concurrency : DEFAULT_TOOL_METADATA.concurrency,
    interrupt: isToolInterrupt(metadata?.interrupt) ? metadata.interrupt : DEFAULT_TOOL_METADATA.interrupt,
    progress: isToolProgress(metadata?.progress) ? metadata.progress : DEFAULT_TOOL_METADATA.progress,
    transcript: {
      ...DEFAULT_TOOL_METADATA.transcript,
      ...(transcript as Partial<ToolTranscriptMetadata>),
    },
    search: {
      ...DEFAULT_TOOL_METADATA.search,
      ...(search as Partial<ToolSearchMetadata>),
    },
    persistedResult: {
      ...DEFAULT_TOOL_METADATA.persistedResult,
      ...(persistedResult as Partial<ToolPersistedResultMetadata>),
    },
  };
}

export function createToolDefinition(
  toolId: string,
  name: string,
  opts?: ToolDefinitionOptions,
): ToolDefinition {
  return {
    toolId,
    name,
    description: opts?.description ?? "",
    parameters: opts?.parameters ?? { type: "object", properties: {} },
    returns: opts?.returns ?? {},
    category: opts?.category ?? "custom",
    requiresApproval: opts?.requiresApproval ?? false,
    timeoutSeconds: opts?.timeoutSeconds ?? 30.0,
    maxOutputBytes: opts?.maxOutputBytes ?? 1_048_576, // 1 MiB
    metadata: normalizeToolMetadata(opts?.metadata),
  };
}

function isToolConcurrency(value: unknown): value is ToolConcurrencyMode {
  return value === "parallel_safe" || value === "exclusive";
}

function isToolInterrupt(value: unknown): value is ToolInterruptMode {
  return value === "interruptible" || value === "timeout_only" || value === "non_interruptible";
}

function isToolProgress(value: unknown): value is ToolProgressMode {
  return value === "none" || value === "activity" || value === "streaming";
}

// ---------------------------------------------------------------------------
// ToolExecutionResult
// ---------------------------------------------------------------------------

export interface ToolExecutionResult {
  toolId: string;
  output: string;
  error: string | null;
  durationSeconds: number;
  truncated: boolean;
  timedOut: boolean;
}

export function isToolSuccess(result: ToolExecutionResult): boolean {
  return result.error === null;
}

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler = (...args: any[]) => any;

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private _tools = new Map<string, ToolDefinition>();
  private _handlers = new Map<string, ToolHandler>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this._tools.has(definition.toolId)) {
      throw new ToolError(`Tool already registered: '${definition.toolId}'`);
    }
    this._tools.set(definition.toolId, definition);
    this._handlers.set(definition.toolId, handler);
  }

  unregister(toolId: string): boolean {
    const existed = this._tools.delete(toolId);
    this._handlers.delete(toolId);
    return existed;
  }

  registerOrReplace(definition: ToolDefinition, handler: ToolHandler): void {
    this._tools.set(definition.toolId, definition);
    this._handlers.set(definition.toolId, handler);
  }

  get(toolId: string): ToolDefinition {
    const def = this._tools.get(toolId);
    if (!def) throw new ToolNotFoundError(`Tool not found: '${toolId}'`);
    return def;
  }

  getHandler(toolId: string): ToolHandler {
    const handler = this._handlers.get(toolId);
    if (!handler) throw new ToolNotFoundError(`Handler not found: '${toolId}'`);
    return handler;
  }

  has(toolId: string): boolean {
    return this._tools.has(toolId);
  }

  listTools(category?: string): ToolDefinition[] {
    let tools = Array.from(this._tools.values());
    if (category) {
      tools = tools.filter((t) => t.category === category);
    }
    return tools.sort((a, b) => a.toolId.localeCompare(b.toolId));
  }

  get count(): number {
    return this._tools.size;
  }

  toPromptSchema(toolIds?: string[]): Array<Record<string, unknown>> {
    const schemas: Array<Record<string, unknown>> = [];
    const sorted = Array.from(this._tools.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [toolId, definition] of sorted) {
      if (toolIds && !toolIds.includes(toolId)) continue;

      schemas.push({
        type: "function",
        function: {
          name: definition.toolId,
          description: definition.description,
          parameters: definition.parameters,
        },
      });
    }

    return schemas;
  }

  reset(): void {
    this._tools.clear();
    this._handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// ToolExecutor
// ---------------------------------------------------------------------------

export class ToolExecutor {
  private _registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this._registry = registry;
  }

  async execute(
    toolId: string,
    args?: Record<string, unknown>,
    opts?: { timeoutOverride?: number },
  ): Promise<ToolExecutionResult> {
    const arguments_ = args ?? {};
    const result: ToolExecutionResult = {
      toolId,
      output: "",
      error: null,
      durationSeconds: 0,
      truncated: false,
      timedOut: false,
    };
    const start = performance.now();

    try {
      // Resolve tool
      const definition = this._registry.get(toolId);
      const handler = this._registry.getHandler(toolId);

      // Validate arguments
      const validated = this._validateArguments(definition, arguments_);

      // Determine timeout
      const timeout = opts?.timeoutOverride ?? definition.timeoutSeconds;

      // Execute handler with timeout
      const output = await this._invokeHandler(handler, validated, timeout);

      // Capture output
      let outputStr = output != null ? String(output) : "";

      // Truncate if needed
      if (Buffer.byteLength(outputStr, "utf-8") > definition.maxOutputBytes) {
        outputStr =
          outputStr.slice(0, definition.maxOutputBytes) +
          "\n... [output truncated]";
        result.truncated = true;
      }

      result.output = outputStr;
    } catch (e) {
      if (e instanceof ToolNotFoundError) {
        result.error = e.message;
      } else if (e instanceof ToolValidationError) {
        result.error = `Validation error: ${e.message}`;
      } else if (e instanceof ToolTimeoutError) {
        result.error = `Tool '${toolId}' timed out`;
        result.timedOut = true;
      } else if (e instanceof Error) {
        result.error = `Tool execution error: ${e.message}`;
      } else {
        result.error = `Tool execution error: ${String(e)}`;
      }
    }

    result.durationSeconds =
      Math.round((performance.now() - start) / 1000 * 1000) / 1000;

    return result;
  }

  private async _invokeHandler(
    handler: ToolHandler,
    args: Record<string, unknown>,
    timeout: number,
  ): Promise<unknown> {
    const timeoutMs = timeout * 1000;

    const resultPromise = Promise.resolve(handler(args));

    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ToolTimeoutError(`Handler timed out after ${timeout}s`)),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([resultPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private _validateArguments(
    definition: ToolDefinition,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const schema = definition.parameters;
    if (!schema || (schema as Record<string, unknown>).type !== "object") {
      return args;
    }

    const properties = (schema as Record<string, unknown>).properties as
      | Record<string, unknown>
      | undefined;
    const required = ((schema as Record<string, unknown>).required ?? []) as string[];

    // Check required fields
    for (const fieldName of required) {
      if (!(fieldName in args)) {
        throw new ToolValidationError(`Missing required parameter: '${fieldName}'`);
      }
    }

    // Check for unknown fields
    if ((schema as Record<string, unknown>).additionalProperties === false && properties) {
      const known = new Set(Object.keys(properties));
      const unknown = Object.keys(args).filter((k) => !known.has(k));
      if (unknown.length > 0) {
        throw new ToolValidationError(
          `Unknown parameters: ${unknown.sort().join(", ")}`,
        );
      }
    }

    return args;
  }
}
