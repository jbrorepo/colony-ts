import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  PathValidator,
  sanitizePathKey,
  PathTraversalError,
  VIOLATION_NULL_BYTE,
  VIOLATION_TRAVERSAL,
  VIOLATION_OUTSIDE_WORKSPACE,
} from "../../security/path-validator";

// ---------------------------------------------------------------------------
// Fixtures — created once per test run in a temp directory
// ---------------------------------------------------------------------------

let base: string;
let workspace: string;
let outsideDir: string;

beforeAll(async () => {
  base = join(tmpdir(), `colony-path-validator-${Date.now()}`);
  workspace = join(base, "workspace");
  outsideDir = join(base, "outside");

  await mkdir(workspace, { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await writeFile(join(workspace, "readme.txt"), "hello");
  await mkdir(join(workspace, "sub"), { recursive: true });
  await writeFile(join(workspace, "sub", "nested.txt"), "nested");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// PathValidator.validate — happy-path containment
// ---------------------------------------------------------------------------

describe("PathValidator.validate — within workspace", () => {
  test("allows a relative file path that exists", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate("readme.txt");
    expect(result.allowed).toBe(true);
    expect(result.violationType).toBe("");
    expect(result.reason).toBe("");
  });

  test("allows a nested relative path", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate("sub/nested.txt");
    expect(result.allowed).toBe(true);
  });

  test("allows an absolute path that is inside the workspace", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate(join(workspace, "readme.txt"));
    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toContain("readme.txt");
  });

  test("allows a non-existent relative path that would land inside workspace", async () => {
    const v = new PathValidator({ workspace });
    // The file does not exist but the path is within workspace — still allowed
    const result = await v.validate("future-file.md");
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PathValidator.validate — violation detection
// ---------------------------------------------------------------------------

describe("PathValidator.validate — violation detection", () => {
  test("null_byte_injection: rejects paths containing \\0", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate("safe\x00malicious");
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe(VIOLATION_NULL_BYTE);
    expect(result.resolvedPath).toBe("");
  });

  test("directory_traversal: rejects relative path with .. that escapes workspace", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate("../outside/secret");
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe(VIOLATION_TRAVERSAL);
  });

  test("directory_traversal: rejects nested traversal (sub/../../outside)", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate("sub/../../outside/secret");
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe(VIOLATION_TRAVERSAL);
  });

  test("outside_workspace: rejects absolute path to sibling directory", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate(outsideDir);
    expect(result.allowed).toBe(false);
    expect(result.violationType).toBe(VIOLATION_OUTSIDE_WORKSPACE);
  });

  test("outside_workspace: denied reason includes resolvedPath and workspace", async () => {
    const v = new PathValidator({ workspace });
    const result = await v.validate(outsideDir);
    expect(result.reason).toContain(workspace);
  });
});

// ---------------------------------------------------------------------------
// PathValidator — extraAllowedDirs
// ---------------------------------------------------------------------------

describe("PathValidator — extraAllowedDirs", () => {
  test("allows paths in an extra-allowed directory", async () => {
    const v = new PathValidator({ workspace, extraAllowedDirs: [outsideDir] });
    const result = await v.validate(outsideDir);
    expect(result.allowed).toBe(true);
  });

  test("does not affect paths entirely outside both workspace and extra dirs", async () => {
    const anotherOutside = join(tmpdir(), `colony-unrelated-${Date.now()}`);
    const v = new PathValidator({ workspace, extraAllowedDirs: [outsideDir] });
    const result = await v.validate(anotherOutside);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PathValidator.validateMany
// ---------------------------------------------------------------------------

describe("PathValidator.validateMany", () => {
  test("returns one result per path, in order", async () => {
    const v = new PathValidator({ workspace });
    const results = await v.validateMany(["readme.txt", "sub/nested.txt"]);
    expect(results).toHaveLength(2);
    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(true);
  });

  test("validates mixed allowed/denied in a single call", async () => {
    const v = new PathValidator({ workspace });
    const results = await v.validateMany(["readme.txt", "../outside/secret"]);
    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(false);
    expect(results[1].violationType).toBe(VIOLATION_TRAVERSAL);
  });

  test("empty array returns empty array", async () => {
    const v = new PathValidator({ workspace });
    const results = await v.validateMany([]);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sanitizePathKey — pure function, no filesystem
// ---------------------------------------------------------------------------

describe("sanitizePathKey — valid inputs", () => {
  test("passes through a simple alphanumeric key", () => {
    expect(sanitizePathKey("hello")).toBe("hello");
    expect(sanitizePathKey("my-key_123")).toBe("my-key_123");
  });

  test("passes through keys with forward slashes (relative sub-path)", () => {
    expect(sanitizePathKey("agents/config.json")).toBe("agents/config.json");
  });

  test("passes through keys with dots that are not traversal", () => {
    expect(sanitizePathKey("file.txt")).toBe("file.txt");
    expect(sanitizePathKey("a.b.c/metadata.json")).toBe("a.b.c/metadata.json");
  });
});

describe("sanitizePathKey — injection attacks", () => {
  test("throws PathTraversalError on empty string", () => {
    expect(() => sanitizePathKey("")).toThrow(PathTraversalError);
  });

  test("throws on null byte", () => {
    expect(() => sanitizePathKey("key\x00inject")).toThrow(PathTraversalError);
  });

  test("throws on backslash (Windows separator injection)", () => {
    expect(() => sanitizePathKey("path\\traversal")).toThrow(PathTraversalError);
  });

  test("throws on absolute Unix path", () => {
    expect(() => sanitizePathKey("/etc/passwd")).toThrow(PathTraversalError);
  });

  test("throws on Windows drive-letter prefix", () => {
    expect(() => sanitizePathKey("C:/Windows")).toThrow(PathTraversalError);
    expect(() => sanitizePathKey("c:/etc/passwd")).toThrow(PathTraversalError);
  });

  test("throws on traversal segment in middle of path (a/../b)", () => {
    expect(() => sanitizePathKey("a/../b")).toThrow(PathTraversalError);
  });

  test("throws on bare double-dot (..) as entire key", () => {
    expect(() => sanitizePathKey("..")).toThrow(PathTraversalError);
  });

  test("throws on URL-encoded slash traversal (%2F)", () => {
    // decodeURIComponent("a%2F..%2Fb") === "a/../b" → contains "/"
    expect(() => sanitizePathKey("a%2F..%2Fb")).toThrow(PathTraversalError);
  });

  test("throws on URL-encoded dot-dot (%2E%2E)", () => {
    // decodeURIComponent("%2E%2E") === ".." → decoded contains ".."
    expect(() => sanitizePathKey("%2E%2E")).toThrow(PathTraversalError);
  });
});
