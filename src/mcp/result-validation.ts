import type {
  McpInitializeResult,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceResult,
  McpResource,
  McpResourceContent,
  McpTool,
  McpToolCallResult,
  McpToolContent,
} from "./protocol";

export class InvalidMcpResultShapeError extends Error {
  constructor(method: string) {
    super(`Invalid MCP ${method} result`);
    this.name = "InvalidMcpResultShapeError";
  }
}

export function readMcpResultShape(method: string, result: unknown): unknown {
  try {
    switch (method) {
      case "initialize":
        return readInitializeResult(result);
      case "tools/list":
        return readListToolsResult(result);
      case "tools/call":
        return readToolCallResult(result);
      case "resources/list":
        return readListResourcesResult(result);
      case "resources/read":
        return readReadResourceResult(result);
      default:
        return cloneJsonValue(result);
    }
  } catch {
    throw new InvalidMcpResultShapeError(method);
  }
}

function readInitializeResult(result: unknown): McpInitializeResult {
  const root = readPlainObject(result, "initialize");
  const serverInfo = readPlainObject(readRequired(root, "serverInfo"), "initialize.serverInfo");
  const capabilities = readPlainObject(readRequired(root, "capabilities"), "initialize.capabilities");
  const tools = readPlainObject(readRequired(capabilities, "tools"), "initialize.capabilities.tools");
  const resourcesValue = readOptional(capabilities, "resources");
  const resources = resourcesValue === undefined
    ? { listChanged: false }
    : readPlainObject(resourcesValue, "initialize.capabilities.resources");
  const protocolVersion = readString(readRequired(root, "protocolVersion"), "initialize.protocolVersion");
  return {
    protocolVersion,
    serverInfo: {
      name: readString(readRequired(serverInfo, "name"), "initialize.serverInfo.name"),
      version: readString(readRequired(serverInfo, "version"), "initialize.serverInfo.version"),
    },
    capabilities: {
      tools: {
        listChanged: readBoolean(
          readRequired(tools, "listChanged"),
          "initialize.capabilities.tools.listChanged",
        ),
      },
      resources: {
        listChanged: resourcesValue === undefined
          ? false
          : readBoolean(
              readRequired(resources, "listChanged"),
              "initialize.capabilities.resources.listChanged",
            ),
      },
    },
  };
}

function readListToolsResult(result: unknown): McpListToolsResult {
  const root = readPlainObject(result, "tools/list");
  const toolsValue = readRequired(root, "tools");
  if (!Array.isArray(toolsValue)) throw new InvalidMcpResultShapeError("tools/list");
  return {
    tools: readDenseArray(toolsValue, "tools/list.tools")
      .map((tool, index) => readTool(tool, `tools/list.tools[${index}]`)),
  };
}

function readTool(tool: unknown, path: string): McpTool {
  const root = readPlainObject(tool, path);
  const annotations = readOptional(root, "annotations");
  return {
    name: readNonEmptyString(readRequired(root, "name"), `${path}.name`),
    description: readString(readRequired(root, "description"), `${path}.description`),
    inputSchema: readJsonObject(readRequired(root, "inputSchema"), `${path}.inputSchema`),
    ...(annotations === undefined ? {} : { annotations: readJsonObject(annotations, `${path}.annotations`) }),
  };
}

function readToolCallResult(result: unknown): McpToolCallResult {
  const root = readPlainObject(result, "tools/call");
  const contentValue = readRequired(root, "content");
  if (!Array.isArray(contentValue)) throw new InvalidMcpResultShapeError("tools/call");
  return {
    content: readDenseArray(contentValue, "tools/call.content")
      .map((item, index) => readToolContent(item, `tools/call.content[${index}]`)),
    isError: readBoolean(readRequired(root, "isError"), "tools/call.isError"),
  };
}

function readListResourcesResult(result: unknown): McpListResourcesResult {
  const root = readPlainObject(result, "resources/list");
  const resourcesValue = readRequired(root, "resources");
  if (!Array.isArray(resourcesValue)) throw new InvalidMcpResultShapeError("resources/list");
  return {
    resources: readDenseArray(resourcesValue, "resources/list.resources")
      .map((resource, index) => readResource(resource, `resources/list.resources[${index}]`)),
  };
}

function readResource(resource: unknown, path: string): McpResource {
  const root = readPlainObject(resource, path);
  const description = readOptional(root, "description");
  const mimeType = readOptional(root, "mimeType");
  return {
    uri: readNonEmptyString(readRequired(root, "uri"), `${path}.uri`),
    name: readNonEmptyString(readRequired(root, "name"), `${path}.name`),
    ...(description === undefined ? {} : { description: readString(description, `${path}.description`) }),
    ...(mimeType === undefined ? {} : { mimeType: readString(mimeType, `${path}.mimeType`) }),
  };
}

function readReadResourceResult(result: unknown): McpReadResourceResult {
  const root = readPlainObject(result, "resources/read");
  const contentsValue = readRequired(root, "contents");
  if (!Array.isArray(contentsValue)) throw new InvalidMcpResultShapeError("resources/read");
  return {
    contents: readDenseArray(contentsValue, "resources/read.contents")
      .map((content, index) => readResourceContent(content, `resources/read.contents[${index}]`)),
  };
}

function readResourceContent(content: unknown, path: string): McpResourceContent {
  const root = readPlainObject(content, path);
  const mimeType = readOptional(root, "mimeType");
  const text = readOptional(root, "text");
  const blob = readOptional(root, "blob");
  if ((text === undefined) === (blob === undefined)) {
    throw new InvalidMcpResultShapeError("resources/read");
  }
  const out: McpResourceContent = {
    uri: readNonEmptyString(readRequired(root, "uri"), `${path}.uri`),
    ...(mimeType === undefined ? {} : { mimeType: readString(mimeType, `${path}.mimeType`) }),
  };
  if (text !== undefined) out.text = readString(text, `${path}.text`);
  if (blob !== undefined) {
    const encoded = readString(blob, `${path}.blob`);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw new InvalidMcpResultShapeError("resources/read");
    }
    out.blob = encoded;
  }
  return out;
}

function readToolContent(content: unknown, path: string): McpToolContent {
  const root = readPlainObject(content, path);
  const type = readString(readRequired(root, "type"), `${path}.type`);
  if (type !== "text") throw new InvalidMcpResultShapeError("tools/call");
  return {
    type: "text",
    text: readString(readRequired(root, "text"), `${path}.text`),
  };
}

function readJsonObject(value: unknown, path: string): Record<string, unknown> {
  const cloned = cloneJsonValue(value, path);
  if (!isRecord(cloned)) throw new InvalidMcpResultShapeError(path);
  return cloned;
}

function cloneJsonValue(value: unknown, path = "result"): unknown {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new InvalidMcpResultShapeError(path);
    return value;
  }
  if (Array.isArray(value)) {
    if (hasJsonStringifyHook(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw new InvalidMcpResultShapeError(path);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      if (key !== "length" && !isArrayIndexKey(key, value.length)) {
        throw new InvalidMcpResultShapeError(path);
      }
    }
    return readDenseArray(value, path).map((item, index) => cloneJsonValue(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const root = readPlainObject(value, path);
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(root).sort()) {
      const child = root[key];
      if (child === undefined) throw new InvalidMcpResultShapeError(path);
      Object.defineProperty(out, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: cloneJsonValue(child, `${path}.${key}`),
      });
    }
    return out;
  }
  throw new InvalidMcpResultShapeError(path);
}

function readPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new InvalidMcpResultShapeError(path);
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null)
    || hasJsonStringifyHook(value)
    || Object.getOwnPropertySymbols(value).length > 0) {
    throw new InvalidMcpResultShapeError(path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
      throw new InvalidMcpResultShapeError(path);
    }
    out[key] = descriptor.value;
  }
  return out;
}

function readDenseArray(value: unknown[], path: string): unknown[] {
  if (hasJsonStringifyHook(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new InvalidMcpResultShapeError(path);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    if (key !== "length" && !isArrayIndexKey(key, value.length)) {
      throw new InvalidMcpResultShapeError(path);
    }
  }
  const out: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
      throw new InvalidMcpResultShapeError(path);
    }
    out.push(descriptor.value);
  }
  return out;
}

function readRequired(value: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) throw new InvalidMcpResultShapeError(key);
  const child = value[key];
  if (child === undefined) throw new InvalidMcpResultShapeError(key);
  return child;
}

function readOptional(value: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  return value[key];
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new InvalidMcpResultShapeError(path);
  return value;
}

function readNonEmptyString(value: unknown, path: string): string {
  const text = readString(value, path);
  if (text.trim().length === 0) throw new InvalidMcpResultShapeError(path);
  return text;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new InvalidMcpResultShapeError(path);
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
