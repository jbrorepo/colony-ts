import type {
  McpInitializeParams,
  McpInitializeResult,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  McpListToolsResult,
  McpListResourcesResult,
  McpReadResourceParams,
  McpReadResourceResult,
  McpToolCallParams,
  McpToolCallResult,
  McpServerInfo,
} from "./protocol";
import {
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  mcpError,
  mcpResult,
} from "./protocol";
import type { McpToolAdapter } from "./tool-adapter";
import { McpResourceAdapter } from "./resource-adapter";
import { scrubSecrets } from "../security/log-sanitizer";
import { readMcpResultShape } from "./result-validation";

export interface InProcessMcpServerOptions extends McpServerInfo {
  toolAdapter: McpToolAdapter;
  resourceAdapter?: McpResourceAdapter;
  protocolVersion?: string;
}

export class InProcessMcpServer {
  private readonly _serverInfo: McpServerInfo;
  private readonly _protocolVersion: string;
  private readonly _toolAdapter: McpToolAdapter;
  private readonly _resourceAdapter: McpResourceAdapter;

  constructor(options: InProcessMcpServerOptions) {
    this._serverInfo = {
      name: options.name,
      version: options.version,
    };
    this._protocolVersion = options.protocolVersion ?? MCP_PROTOCOL_VERSION;
    this._toolAdapter = options.toolAdapter;
    this._resourceAdapter = options.resourceAdapter ?? new McpResourceAdapter();
  }

  async handle(request: unknown): Promise<McpJsonRpcResponse> {
    let parsedRequest: McpJsonRpcRequest | null;
    try {
      parsedRequest = readJsonRpcRequest(request);
    } catch {
      parsedRequest = null;
    }

    if (!parsedRequest) {
      return safeMcpError(null, MCP_ERROR.invalidRequest, "Invalid JSON-RPC request");
    }

    try {
      switch (parsedRequest.method) {
        case "initialize":
          return mcpResult(
            parsedRequest.id,
            readMcpResultShape("initialize", this._initialize(parsedRequest.params)),
          );
        case "tools/list":
          return mcpResult(parsedRequest.id, readMcpResultShape("tools/list", this._listTools()));
        case "tools/call":
          return mcpResult(
            parsedRequest.id,
            readMcpResultShape("tools/call", await this._callTool(parsedRequest.params)),
          );
        case "resources/list":
          return mcpResult(parsedRequest.id, readMcpResultShape("resources/list", this._listResources()));
        case "resources/read":
          return mcpResult(
            parsedRequest.id,
            readMcpResultShape("resources/read", this._readResource(parsedRequest.params)),
          );
        default:
          return safeMcpError(parsedRequest.id, MCP_ERROR.methodNotFound, "MCP method not found");
      }
    } catch (error) {
      if (error instanceof InvalidMcpParamsError) {
        return safeMcpError(parsedRequest.id, MCP_ERROR.invalidParams, error.message);
      }
      return safeMcpError(parsedRequest.id, MCP_ERROR.internalError, "MCP internal error");
    }
  }

  private _initialize(params: unknown): McpInitializeResult {
    readInitializeParams(params);
    return {
      protocolVersion: this._protocolVersion,
      serverInfo: this._serverInfo,
      capabilities: {
        tools: {
          listChanged: false,
        },
        resources: {
          listChanged: false,
        },
      },
    };
  }

  private _listTools(): McpListToolsResult {
    return {
      tools: this._toolAdapter.listTools(),
    };
  }

  private async _callTool(params: unknown): Promise<McpToolCallResult> {
    const parsed = readToolCallParams(params);
    return await this._toolAdapter.callTool(parsed.name, parsed.arguments ?? {}, {
      approved: parsed._meta?.approved === true,
      approvalId: parsed._meta?.approvalId,
      approvalSignature: parsed._meta?.approvalSignature,
    });
  }

  private _listResources(): McpListResourcesResult {
    return {
      resources: this._resourceAdapter.listResources(),
    };
  }

  private _readResource(params: unknown): McpReadResourceResult {
    const parsed = readResourceReadParams(params);
    try {
      return this._resourceAdapter.readResource(parsed.uri);
    } catch (error) {
      if (error instanceof InvalidMcpParamsError) throw error;
      throw new InvalidMcpParamsError("MCP resource read failed");
    }
  }
}

function safeMcpError(
  id: McpJsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): McpJsonRpcResponse {
  return mcpError(id, code, scrubSecrets(message), data);
}

class InvalidMcpParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMcpParamsError";
  }
}

function readJsonRpcRequest(value: unknown): McpJsonRpcRequest | null {
  if (!isRecord(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const jsonrpc = descriptors.jsonrpc;
  const id = descriptors.id;
  const method = descriptors.method;
  if (!isDataDescriptor(jsonrpc)
    || !isDataDescriptor(id)
    || !isDataDescriptor(method)
    || jsonrpc.value !== "2.0"
    || !isJsonRpcId(id.value)
    || typeof method.value !== "string") {
    return null;
  }
  const params = descriptors.params;
  if (params !== undefined && !isDataDescriptor(params)) return null;
  return {
    jsonrpc: "2.0",
    id: id.value,
    method: method.value,
    ...(params === undefined ? {} : { params: params.value }),
  };
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && "value" in descriptor;
}

function isJsonRpcId(value: unknown): value is McpJsonRpcRequest["id"] {
  return value === null
    || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function readInitializeParams(params: unknown): McpInitializeParams {
  if (params === undefined) return {};
  if (!isRecord(params)) {
    throw new InvalidMcpParamsError("initialize params must be an object");
  }
  return {
    clientName: readOptionalString(params.clientName, "clientName"),
    clientVersion: readOptionalString(params.clientVersion, "clientVersion"),
    protocolVersion: readOptionalString(params.protocolVersion, "protocolVersion"),
  };
}

function readToolCallParams(params: unknown): McpToolCallParams {
  if (!isRecord(params)) {
    throw new InvalidMcpParamsError("tools/call params must be an object");
  }
  if (typeof params.name !== "string" || params.name.trim().length === 0) {
    throw new InvalidMcpParamsError("tools/call params require a non-empty name");
  }
  const args = params.arguments;
  if (args !== undefined && !isRecord(args)) {
    throw new InvalidMcpParamsError("tools/call arguments must be an object");
  }
  const parsedArgs = args ? readJsonObject(args, "tools/call arguments") : {};
  const meta = params._meta;
  if (meta !== undefined && !isRecord(meta)) {
    throw new InvalidMcpParamsError("tools/call _meta must be an object");
  }
  return {
    name: params.name,
    arguments: parsedArgs,
    _meta: meta
      ? {
          approved: meta.approved === true,
          approvalId: readOptionalString(meta.approvalId, "approvalId"),
          approvalSignature: readOptionalString(meta.approvalSignature, "approvalSignature"),
        }
      : undefined,
  };
}

function readResourceReadParams(params: unknown): McpReadResourceParams {
  if (!isRecord(params)) {
    throw new InvalidMcpParamsError("resources/read params must be an object");
  }
  if (typeof params.uri !== "string" || params.uri.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(params.uri)) {
    throw new InvalidMcpParamsError("resources/read params require a resource URI");
  }
  return {
    uri: params.uri,
  };
}

function readJsonObject(value: Record<string, unknown>, path: string): Record<string, unknown> {
  const parsed = readJsonValue(value, path);
  if (!isRecord(parsed)) {
    throw new InvalidMcpParamsError(`${path} must be a JSON object`);
  }
  return parsed;
}

function readJsonValue(value: unknown, path: string): unknown {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidMcpParamsError(`${path} must contain only finite JSON numbers`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (hasJsonStringifyHook(value)) {
      throw new InvalidMcpParamsError(`${path} must not define toJSON`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new InvalidMcpParamsError(`${path} must not contain symbol properties`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      if (key !== "length" && !isArrayIndexKey(key, value.length)) {
        throw new InvalidMcpParamsError(`${path}.${key} must not be a non-index array property`);
      }
    }
    const parsed: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined) {
        throw new InvalidMcpParamsError(`${path}[${index}] must not be a sparse array hole`);
      }
      if (!descriptor.enumerable) {
        throw new InvalidMcpParamsError(`${path}[${index}] must be enumerable`);
      }
      if (!("value" in descriptor)) {
        throw new InvalidMcpParamsError(`${path}[${index}] must not be an accessor property`);
      }
      parsed.push(readJsonValue(descriptor.value, `${path}[${index}]`));
    }
    return parsed;
  }
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new InvalidMcpParamsError(`${path} must contain only plain JSON objects`);
    }
    if (hasJsonStringifyHook(value)) {
      throw new InvalidMcpParamsError(`${path} must not define toJSON`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new InvalidMcpParamsError(`${path} must not contain symbol properties`);
    }
    const parsed: Record<string, unknown> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable) {
        throw new InvalidMcpParamsError(`${path}.${key} must be enumerable`);
      }
      if (!("value" in descriptor)) {
        throw new InvalidMcpParamsError(`${path}.${key} must not be an accessor property`);
      }
      const child = descriptor.value;
      if (child === undefined) {
        throw new InvalidMcpParamsError(`${path}.${key} must not be undefined`);
      }
      parsed[key] = readJsonValue(child, `${path}.${key}`);
    }
    return parsed;
  }
  throw new InvalidMcpParamsError(`${path} contains a non-JSON value`);
}

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new InvalidMcpParamsError(`${fieldName} must be a string`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
