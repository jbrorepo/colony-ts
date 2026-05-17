import type {
  McpInitializeParams,
  McpInitializeResult,
  McpJsonRpcResponse,
  McpJsonRpcId,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceResult,
  McpApprovalProof,
  McpToolCallResult,
} from "./protocol";
import type { InProcessMcpServer } from "./server";
import { scrubSecrets } from "../security/log-sanitizer";
import {
  InProcessMcpTransport,
  type McpTransport,
} from "./transport";
import { readMcpResultShape } from "./result-validation";

export class InProcessMcpClient {
  private readonly _transport: McpTransport;
  private _nextId = 1;

  constructor(endpoint: InProcessMcpServer | McpTransport) {
    this._transport = isMcpTransport(endpoint)
      ? endpoint
      : new InProcessMcpTransport(endpoint);
  }

  async initialize(params: McpInitializeParams = {}): Promise<McpInitializeResult> {
    return await this._send<McpInitializeResult>("initialize", params);
  }

  async listTools(): Promise<McpListToolsResult> {
    return await this._send<McpListToolsResult>("tools/list", {});
  }

  async listResources(): Promise<McpListResourcesResult> {
    return await this._send<McpListResourcesResult>("resources/list", {});
  }

  async readResource(uri: string): Promise<McpReadResourceResult> {
    if (typeof uri !== "string" || uri.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(uri)) {
      throw new Error("MCP resource URI must be a non-empty string");
    }
    return await this._send<McpReadResourceResult>("resources/read", { uri });
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: { approved?: boolean; approvalId?: string; approvalSignature?: string; approvalProof?: McpApprovalProof } = {},
  ): Promise<McpToolCallResult> {
    if (!isJsonCompatibleObject(args)) {
      throw new Error("MCP tool arguments must be JSON-compatible before transport send");
    }
    const proof = options.approvalProof;
    return await this._send<McpToolCallResult>("tools/call", {
      name,
      arguments: args,
      _meta: {
        approved: options.approved === true,
        ...(proof?.approvalId || options.approvalId ? { approvalId: proof?.approvalId ?? options.approvalId } : {}),
        ...(proof?.signature || options.approvalSignature ? { approvalSignature: proof?.signature ?? options.approvalSignature } : {}),
      },
    });
  }

  private async _send<T>(method: string, params: unknown): Promise<T> {
    const request = {
      jsonrpc: "2.0",
      id: this._nextId++,
      method,
      params,
    } as const;

    let response: unknown;
    try {
      response = await this._transport.send(request);
    } catch {
      throw new Error("MCP transport failed");
    }

    const parsed = readTransportResponse<T>(response, request.id, method);

    if (parsed.error) {
      throw new Error(`${parsed.error.code}: ${scrubSecrets(parsed.error.message)}`);
    }
    if (parsed.result === undefined) {
      throw new Error(`MCP response for ${method} did not include a result`);
    }
    return readMcpResultShape(method, parsed.result) as T;
  }
}

function isMcpTransport(value: InProcessMcpServer | McpTransport): value is McpTransport {
  return typeof (value as McpTransport).send === "function";
}

function readTransportResponse<T>(
  value: unknown,
  expectedId: McpJsonRpcId,
  method: string,
): McpJsonRpcResponse<T> {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new Error(`Invalid MCP transport response for ${method}`);
  }
  if (value.id !== expectedId) {
    throw new Error(`MCP response id mismatch for ${method}`);
  }
  const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
  const hasError = Object.prototype.hasOwnProperty.call(value, "error");
  if (hasResult && hasError) {
    throw new Error(`MCP response for ${method} included both result and error`);
  }
  if (!hasResult && !hasError) {
    throw new Error(`MCP response for ${method} did not include a result`);
  }
  if (hasError) {
    if (!isRecord(value.error)
      || typeof value.error.code !== "number"
      || typeof value.error.message !== "string") {
      throw new Error(`Invalid MCP error response for ${method}`);
    }
    return {
      jsonrpc: "2.0",
      id: expectedId,
      error: {
        code: value.error.code,
        message: scrubSecrets(value.error.message),
        ...(value.error.data === undefined ? {} : { data: value.error.data }),
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id: expectedId,
    result: value.result as T,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
