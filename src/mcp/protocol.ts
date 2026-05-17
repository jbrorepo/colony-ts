export type McpJsonRpcId = string | number | null;

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: McpJsonRpcId;
  method: string;
  params?: unknown;
}

export interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: McpJsonRpcId;
  result?: T;
  error?: McpJsonRpcError;
}

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpInitializeParams {
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: McpServerInfo;
  capabilities: {
    tools: {
      listChanged: boolean;
    };
    resources: {
      listChanged: boolean;
    };
  };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpListToolsResult {
  tools: McpTool[];
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpListResourcesResult {
  resources: McpResource[];
}

export interface McpReadResourceParams {
  uri: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
  _meta?: {
    approved?: boolean;
    approvalId?: string;
    approvalSignature?: string;
  };
}

export interface McpApprovalProof {
  approvalId: string;
  signature: string;
}

export interface McpApprovalCall {
  toolName: string;
  arguments: Record<string, unknown>;
  signature: string;
}

export interface McpToolContent {
  type: "text";
  text: string;
}

export interface McpToolCallResult {
  content: McpToolContent[];
  isError: boolean;
}

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export const MCP_ERROR = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export function mcpResult<T>(id: McpJsonRpcId, result: T): McpJsonRpcResponse<T> {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

export function mcpError(
  id: McpJsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): McpJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

export function textToolResult(text: string, isError = false): McpToolCallResult {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}
