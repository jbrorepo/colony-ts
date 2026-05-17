import type {
  McpListResourcesResult,
  McpReadResourceResult,
  McpResource,
  McpResourceContent,
} from "./protocol";

export interface McpResourceRecord extends McpResource {
  contents: McpResourceContent[];
}

export interface McpResourceAdapterOptions {
  resources?: McpResourceRecord[];
}

export interface McpResourceOperatorInspection {
  serverId: string;
  resourceCount: number;
  resources: McpResource[];
  allowedResourceUris: string[];
  allowedResourceUriPrefixes: string[];
  warnings: string[];
}

export interface McpResourceOperatorInspectionOptions {
  serverId: string;
  resourceAdapter: McpResourceAdapter;
  allowedResourceUris?: string[];
  allowedResourceUriPrefixes?: string[];
}

const RESOURCE_WARNINGS = [
  "MCP resources are read-only context/data surfaces, not executable tools.",
  "Resource reads must remain separate from tool approval and execution paths.",
  "External resource content is untrusted until interpreted by higher-level policy.",
];

export class McpResourceAdapter {
  private readonly _resources: Map<string, McpResourceRecord>;

  constructor(options: McpResourceAdapterOptions = {}) {
    this._resources = new Map();
    for (const resource of options.resources ?? []) {
      const parsed = readResourceRecord(resource);
      this._resources.set(parsed.uri, parsed);
    }
  }

  listResources(): McpResource[] {
    return Array.from(this._resources.values())
      .map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        ...(resource.description === undefined ? {} : { description: resource.description }),
        ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
      }))
      .sort((left, right) => left.uri.localeCompare(right.uri));
  }

  readResource(uri: string): McpReadResourceResult {
    const cleanUri = readResourceUri(uri);
    const resource = this._resources.get(cleanUri);
    if (!resource) {
      throw new Error("MCP resource not found");
    }
    return {
      contents: resource.contents.map(readResourceContent),
    };
  }
}

export function buildMcpResourceOperatorInspection(
  options: McpResourceOperatorInspectionOptions,
): McpResourceOperatorInspection {
  return {
    serverId: safeAuditLabel(readSafeLabel(options.serverId, "server id")),
    resourceCount: options.resourceAdapter.listResources().length,
    resources: options.resourceAdapter.listResources().map((resource) => ({
      uri: safeAuditLabel(resource.uri),
      name: safeAuditLabel(resource.name),
      ...(resource.description === undefined ? {} : { description: safeAuditLabel(resource.description) }),
      ...(resource.mimeType === undefined ? {} : { mimeType: safeAuditLabel(resource.mimeType) }),
    })),
    allowedResourceUris: (options.allowedResourceUris ?? []).map((uri) => safeAuditLabel(readResourceUri(uri))).sort(),
    allowedResourceUriPrefixes: (options.allowedResourceUriPrefixes ?? [])
      .map((uri) => safeAuditLabel(readResourceUriPrefix(uri)))
      .sort(),
    warnings: [...RESOURCE_WARNINGS],
  };
}

function readResourceRecord(value: McpResourceRecord): McpResourceRecord {
  if (!isPlainRecord(value)) throw new Error("MCP resource record invalid");
  if (!Array.isArray(value.contents)) throw new Error("MCP resource contents invalid");
  const uri = readResourceUri(value.uri);
  return {
    uri,
    name: readSafeLabel(value.name, "resource name"),
    ...(value.description === undefined ? {} : { description: readSafeLabel(value.description, "resource description") }),
    ...(value.mimeType === undefined ? {} : { mimeType: readSafeLabel(value.mimeType, "resource mime type") }),
    contents: value.contents.map((content) => {
      const parsed = readResourceContent(content);
      if (parsed.uri !== uri) {
        throw new Error("MCP resource content URI mismatch");
      }
      return parsed;
    }),
  };
}

function readResourceContent(value: McpResourceContent): McpResourceContent {
  if (!isPlainRecord(value)) throw new Error("MCP resource content invalid");
  const hasText = Object.prototype.hasOwnProperty.call(value, "text");
  const hasBlob = Object.prototype.hasOwnProperty.call(value, "blob");
  if (hasText === hasBlob) {
    throw new Error("MCP resource content requires exactly one body");
  }
  return {
    uri: readResourceUri(value.uri),
    ...(value.mimeType === undefined ? {} : { mimeType: readSafeLabel(value.mimeType, "resource mime type") }),
    ...(hasText ? { text: readTextBody(value.text) } : {}),
    ...(hasBlob ? { blob: readBlobBody(value.blob) } : {}),
  };
}

export function readResourceUri(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("MCP resource URI invalid");
  }
  return value;
}

function readResourceUriPrefix(value: unknown): string {
  return readResourceUri(value);
}

function readSafeLabel(value: unknown, label: string): string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`MCP ${label} invalid`);
  }
  return value;
}

function readTextBody(value: unknown): string {
  if (typeof value !== "string" || /[\u0000]/.test(value)) {
    throw new Error("MCP resource text invalid");
  }
  return value;
}

function readBlobBody(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("MCP resource blob invalid");
  }
  return value;
}

function safeAuditLabel(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "");
  if (/(secret|token|password|credential|bearer|api[_-]?key)/i.test(clean)
    || hasHighEntropyToken(clean)) {
    return "<redacted>";
  }
  return clean.slice(0, 160);
}

function hasHighEntropyToken(value: string): boolean {
  return value
    .split(/[/?#&=:]/g)
    .some((part) => part.length >= 32 && /[A-Za-z0-9+/%=_-]{32,}/.test(part));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
