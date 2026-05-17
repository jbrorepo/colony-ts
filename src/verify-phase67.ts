/**
 * Phase 67 Verification Script - MCP Guarded Transport Boundary
 *
 * Proves external-facing MCP transports can be wrapped with local guardrails
 * before real stdio, HTTP, or plugin transports are exposed.
 *
 * Run: bun run src/verify-phase67.ts
 */

import {
  GuardedMcpTransport,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpTransportContext,
  type McpTransport,
} from "./mcp";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

class StaticTransport implements McpTransport {
  readonly requests: McpJsonRpcRequest[] = [];

  constructor(private readonly response: McpJsonRpcResponse) {}

  async send(request: McpJsonRpcRequest, _context?: McpTransportContext): Promise<McpJsonRpcResponse> {
    this.requests.push(request);
    return this.response;
  }
}

class DeferredTransport implements McpTransport {
  readonly requests: McpJsonRpcRequest[] = [];
  private readonly _waiters: Array<(response: McpJsonRpcResponse) => void> = [];

  async send(request: McpJsonRpcRequest, _context?: McpTransportContext): Promise<McpJsonRpcResponse> {
    this.requests.push(request);
    return await new Promise<McpJsonRpcResponse>((resolve) => {
      this._waiters.push(resolve);
    });
  }

  resolveNext(response: McpJsonRpcResponse): void {
    const resolve = this._waiters.shift();
    if (!resolve) throw new Error("No deferred request is pending");
    resolve(response);
  }
}

class DeferredInspectTransport implements McpTransport {
  readonly requests: McpJsonRpcRequest[] = [];
  readonly contexts: McpTransportContext[] = [];
  private _resolveReady: (() => void) | null = null;
  readonly ready = new Promise<void>((resolve) => {
    this._resolveReady = resolve;
  });

  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    this.requests.push(request);
    this.contexts.push(context);
    await this.ready;
    return okResponse(request.id, {
      method: request.method,
      params: request.params,
      context,
    });
  }

  release(): void {
    const resolve = this._resolveReady;
    if (!resolve) throw new Error("Deferred inspect transport already released");
    this._resolveReady = null;
    resolve();
  }
}

function okResponse(id: McpJsonRpcRequest["id"], result: unknown = {}): McpJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

async function expectRejects(label: string, run: () => Promise<unknown>, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

async function verifyMethodAndToolAllowlists(): Promise<void> {
  section("1. Method and Tool Allowlists");

  const inner = new StaticTransport(okResponse(1, { ok: true }));
  const guarded = new GuardedMcpTransport(inner, {
    allowedMethods: ["initialize", "tools/list", "tools/call"],
    allowedTools: ["safe_tool"],
  });

  const safe = await guarded.send({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "safe_tool", arguments: {} },
  });
  assertEqual(safe.result && (safe.result as { ok?: boolean }).ok, true, "Allowed tools/call reaches inner transport");
  assertEqual(inner.requests.length, 1, "Allowed request is forwarded exactly once");

  await expectRejects(
    "Disallowed MCP method is rejected before inner transport",
    () => guarded.send({ jsonrpc: "2.0", id: 2, method: "prompts/list", params: {} }),
    (error) => error.message.includes("not allowed"),
  );
  await expectRejects(
    "Disallowed MCP tool is rejected before inner transport",
    () => guarded.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "danger_tool", arguments: {} },
    }),
    (error) => error.message.includes("not allowed"),
  );
  assertEqual(inner.requests.length, 1, "Rejected allowlist requests do not reach inner transport");
}

async function verifyBoundsAndSanitizedFailures(): Promise<void> {
  section("2. Bounds and Sanitized Failures");

  const requestBounded = new GuardedMcpTransport(new StaticTransport(okResponse(1)), {
    maxRequestBytes: 160,
    maxJsonDepth: 5,
  });
  await expectRejects(
    "Oversized request envelope is rejected",
    () => requestBounded.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { blob: "x".repeat(500) },
    }),
    (error) => error.message.includes("request too large"),
  );

  const protoRequestInner = new StaticTransport(okResponse(11));
  const protoRequestBounded = new GuardedMcpTransport(protoRequestInner, {
    maxRequestBytes: 120,
  });
  const protoRequestPayload: Record<string, unknown> = {};
  Object.defineProperty(protoRequestPayload, "__proto__", {
    enumerable: true,
    value: { hidden: "x".repeat(1_000) },
  });
  await expectRejects(
    "__proto__ request payloads cannot hide oversized subtrees from byte bounds",
    () => protoRequestBounded.send({
      jsonrpc: "2.0",
      id: 11,
      method: "initialize",
      params: protoRequestPayload,
    }),
    (error) => error.message.includes("request too large"),
  );
  assertEqual(protoRequestInner.requests.length, 0, "__proto__ oversized request does not reach inner transport");

  await expectRejects(
    "Over-depth request envelope is rejected",
    () => requestBounded.send({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { a: { b: { c: { d: { e: { f: "too deep" } } } } } },
    }),
    (error) => error.message.includes("request too deep"),
  );

  const responseBounded = new GuardedMcpTransport(new StaticTransport(okResponse(3, {
    blob: "secret=SHOULD_NOT_LEAK_TOKEN_12345".repeat(20),
  })), {
    maxResponseBytes: 120,
  });
  await expectRejects(
    "Oversized response envelope is rejected without leaking response content",
    () => responseBounded.send({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }),
    (error) => error.message.includes("response too large") && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  const protoResponseResult: Record<string, unknown> = {};
  Object.defineProperty(protoResponseResult, "__proto__", {
    enumerable: true,
    value: { hidden: "secret=SHOULD_NOT_LEAK_TOKEN_12345".repeat(30) },
  });
  const protoResponseBounded = new GuardedMcpTransport(new StaticTransport(okResponse(12, protoResponseResult)), {
    maxResponseBytes: 120,
  });
  await expectRejects(
    "__proto__ response payloads cannot hide oversized subtrees from byte bounds",
    () => protoResponseBounded.send({ jsonrpc: "2.0", id: 12, method: "initialize", params: {} }),
    (error) => error.message.includes("response too large") && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  const inheritedToJson = { jsonrpc: "2.0", id: 4, method: "initialize", params: {} } as McpJsonRpcRequest;
  try {
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      value: function inheritedToJsonHook(this: unknown): unknown {
        return this;
      },
    });
    await expectRejects(
      "Request envelopes with inherited toJSON hooks are rejected before serialization",
      () => requestBounded.send(inheritedToJson),
      (error) => error.message.includes("JSON-compatible"),
    );
  } finally {
    delete (Object.prototype as { toJSON?: unknown }).toJSON;
  }

  const proxyParams = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("secret=SHOULD_NOT_LEAK_TOKEN_12345");
    },
  });
  await expectRejects(
    "Proxy trap errors are sanitized by the guarded boundary",
    () => requestBounded.send({
      jsonrpc: "2.0",
      id: 13,
      method: "initialize",
      params: proxyParams,
    }),
    (error) => error.message.includes("MCP guarded transport failed")
      && !error.message.includes("SHOULD_NOT_LEAK_TOKEN_12345"),
  );
}

async function verifyTimeoutAndConcurrency(): Promise<void> {
  section("3. Timeout and Concurrency Guards");

  const never = new DeferredTransport();
  const timeoutGuarded = new GuardedMcpTransport(never, {
    timeoutMs: 5,
  });
  await expectRejects(
    "Timed-out transport request rejects with sanitized timeout error",
    () => timeoutGuarded.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    (error) => error.message.includes("timed out") && !error.message.includes("secret"),
  );

  const deferred = new DeferredTransport();
  const concurrencyGuarded = new GuardedMcpTransport(deferred, {
    maxConcurrent: 1,
    timeoutMs: 1_000,
  });
  const first = concurrencyGuarded.send({ jsonrpc: "2.0", id: 10, method: "initialize", params: {} });
  await expectRejects(
    "Second concurrent request is rejected before inner transport",
    () => concurrencyGuarded.send({ jsonrpc: "2.0", id: 11, method: "initialize", params: {} }),
    (error) => error.message.includes("concurrency limit"),
  );
  assertEqual(deferred.requests.length, 1, "Concurrency rejection does not reach inner transport");
  deferred.resolveNext(okResponse(10, { ok: true }));
  const resolved = await first;
  assertEqual((resolved.result as { ok?: boolean }).ok, true, "First in-flight request still resolves");
}

async function verifyContextPolicy(): Promise<void> {
  section("4. Context Policy Guards");

  const trustedContext: McpTransportContext = {
    transportKind: "plugin",
    origin: "https://trusted.example",
    pluginId: "trusted-plugin",
    clientId: "phase67-client",
    bearerToken: "token_ok",
  };
  const inner = new StaticTransport(okResponse(1, { ok: true }));
  const guarded = new GuardedMcpTransport(inner, {
    allowedOrigins: ["https://trusted.example"],
    allowedPluginIds: ["trusted-plugin"],
    requiredBearerToken: "token_ok",
  });

  const trusted = await guarded.send(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    trustedContext,
  );
  assertEqual((trusted.result as { ok?: boolean }).ok, true, "Trusted context reaches inner transport");
  assertEqual(inner.requests.length, 1, "Trusted context forwards one request");

  await expectRejects(
    "Untrusted origin is rejected before inner transport",
    () => guarded.send(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: {} },
      { ...trustedContext, origin: "https://evil.example" },
    ),
    (error) => error.message.includes("origin") && !error.message.includes("evil.example"),
  );
  await expectRejects(
    "Untrusted plugin id is rejected before inner transport",
    () => guarded.send(
      { jsonrpc: "2.0", id: 3, method: "initialize", params: {} },
      { ...trustedContext, pluginId: "unknown-plugin" },
    ),
    (error) => error.message.includes("plugin") && !error.message.includes("unknown-plugin"),
  );
  await expectRejects(
    "Missing bearer token is rejected before inner transport",
    () => guarded.send(
      { jsonrpc: "2.0", id: 4, method: "initialize", params: {} },
      { ...trustedContext, bearerToken: undefined },
    ),
    (error) => error.message.includes("authentication") && !error.message.includes("token_ok"),
  );
  await expectRejects(
    "Wrong bearer token is rejected without leaking supplied or expected token",
    () => guarded.send(
      { jsonrpc: "2.0", id: 5, method: "initialize", params: {} },
      { ...trustedContext, bearerToken: "wrong_secret_token" },
    ),
    (error) => error.message.includes("authentication")
      && !error.message.includes("token_ok")
      && !error.message.includes("wrong_secret_token"),
  );
  assertEqual(inner.requests.length, 1, "Rejected context requests do not reach inner transport");

  const proxyContext = Object.create(null) as McpTransportContext;
  Object.defineProperty(proxyContext, "origin", {
    enumerable: true,
    get() {
      throw new Error("secret=SHOULD_NOT_LEAK_TOKEN_12345");
    },
  });
  await expectRejects(
    "Context proxy trap errors are sanitized by the guarded boundary",
    () => guarded.send(
      { jsonrpc: "2.0", id: 6, method: "initialize", params: {} },
      proxyContext,
    ),
    (error) => error.message.includes("MCP guarded transport failed")
      && !error.message.includes("SHOULD_NOT_LEAK_TOKEN_12345"),
  );
}

async function verifyCloneIsolation(): Promise<void> {
  section("5. Clone Isolation");

  const deferred = new DeferredInspectTransport();
  const guarded = new GuardedMcpTransport(deferred, {
    allowedMethods: ["initialize"],
    maxRequestBytes: 160,
    timeoutMs: 1_000,
  });
  const request: McpJsonRpcRequest = {
    jsonrpc: "2.0",
    id: 20,
    method: "initialize",
    params: { safe: true },
  };
  const pending = guarded.send(request);
  request.method = "tools/call";
  request.params = { blob: "x".repeat(1_000) };
  deferred.release();
  const result = await pending;
  assertEqual((result.result as { method?: string }).method, "initialize", "Inner transport receives validated request clone");
  assertEqual(deferred.requests[0]?.method, "initialize", "Stored inner request is isolated from caller mutation");

  const mutableResponse = okResponse(21, { safe: true });
  const responseGuarded = new GuardedMcpTransport(new StaticTransport(mutableResponse), {
    maxResponseBytes: 160,
  });
  const guardedResponse = await responseGuarded.send({ jsonrpc: "2.0", id: 21, method: "initialize", params: {} });
  mutableResponse.result = { blob: "x".repeat(1_000) };
  assertEqual((guardedResponse.result as { safe?: boolean }).safe, true, "Caller receives validated response clone");

  const contextDeferred = new DeferredInspectTransport();
  const contextGuarded = new GuardedMcpTransport(contextDeferred, {
    allowedOrigins: ["https://trusted.example"],
    timeoutMs: 1_000,
  });
  const context: McpTransportContext = { origin: "https://trusted.example" };
  const pendingContext = contextGuarded.send(
    { jsonrpc: "2.0", id: 22, method: "initialize", params: {} },
    context,
  );
  context.origin = "https://evil.example";
  contextDeferred.release();
  const contextResult = await pendingContext;
  assertEqual(
    ((contextResult.result as { context?: McpTransportContext }).context)?.origin,
    "https://trusted.example",
    "Inner transport receives validated context clone",
  );
  assertEqual(
    contextDeferred.contexts[0]?.origin,
    "https://trusted.example",
    "Stored inner context is isolated from caller mutation",
  );
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 67 Verification (MCP Guarded Transport Boundary)\n");

  await verifyMethodAndToolAllowlists();
  await verifyBoundsAndSanitizedFailures();
  await verifyTimeoutAndConcurrency();
  await verifyContextPolicy();
  await verifyCloneIsolation();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 67: MCP guarded transport boundary is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
