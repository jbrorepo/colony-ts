import { describe, test, expect } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import {
  HostToolExecutor,
  DockerToolExecutor,
  createToolExecutor,
  mapHostPathToContainer,
} from "../../runtime/tool-executor";

// ---------------------------------------------------------------------------
// HostToolExecutor — real subprocesses (no Docker needed)
// ---------------------------------------------------------------------------

describe("HostToolExecutor", () => {
  test("name and kind are stable", () => {
    const exec = new HostToolExecutor();
    expect(exec.name).toBe("host");
    expect(exec.kind).toBe("host");
  });

  test("describe() reports ready=true with no warnings", () => {
    const exec = new HostToolExecutor();
    const desc = exec.describe();
    expect(desc.ready).toBe(true);
    expect(desc.kind).toBe("host");
  });

  test("runs a simple command and captures stdout", async () => {
    const exec = new HostToolExecutor();
    // Bun runs cross-platform; `bun --version` is reliably present.
    const result = await exec.execute(["bun", "--version"], {
      cwd: tmpdir(),
      timeoutSeconds: 10,
    });
    expect(result.spawnError).toBeUndefined();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("captures non-zero exit codes", async () => {
    const exec = new HostToolExecutor();
    const result = await exec.execute(["bun", "-e", "process.exit(7)"], {
      cwd: tmpdir(),
      timeoutSeconds: 10,
    });
    expect(result.spawnError).toBeUndefined();
    expect(result.exitCode).toBe(7);
  });

  test("returns spawnError when argv is empty", async () => {
    const exec = new HostToolExecutor();
    const result = await exec.execute([], { cwd: tmpdir(), timeoutSeconds: 5 });
    expect(result.spawnError).toBeDefined();
    expect(result.exitCode).toBe(-1);
  });

  test("returns spawnError when binary doesn't exist", async () => {
    const exec = new HostToolExecutor();
    const result = await exec.execute(["this-binary-definitely-does-not-exist-zzz"], {
      cwd: tmpdir(),
      timeoutSeconds: 5,
    });
    expect(result.spawnError).toBeDefined();
  });

  test("respects timeoutSeconds — kills slow commands", async () => {
    const exec = new HostToolExecutor();
    // Use bun's sleep via -e to keep cross-platform
    const result = await exec.execute(
      ["bun", "-e", "await new Promise(r => setTimeout(r, 5000))"],
      { cwd: tmpdir(), timeoutSeconds: 1 },
    );
    expect(result.timedOut).toBe(true);
  }, 10000);
});

// ---------------------------------------------------------------------------
// DockerToolExecutor — constructor validation + describe (no docker call)
// ---------------------------------------------------------------------------

describe("DockerToolExecutor — construction", () => {
  const VALID_OPTS = {
    image: "alpine:latest",
    containerName: "colony-test-1",
    workspaceHostPath: "/tmp/colony-workspace",
  };

  test("constructs with valid options", () => {
    const exec = new DockerToolExecutor(VALID_OPTS);
    expect(exec.name).toBe("docker:colony-test-1");
    expect(exec.kind).toBe("docker");
  });

  test("rejects empty image", () => {
    expect(() => new DockerToolExecutor({ ...VALID_OPTS, image: "" }))
      .toThrow(/image is required/);
  });

  test("rejects invalid container name (contains slash)", () => {
    expect(() => new DockerToolExecutor({ ...VALID_OPTS, containerName: "bad/name" }))
      .toThrow(/containerName must match/);
  });

  test("rejects container name starting with hyphen", () => {
    expect(() => new DockerToolExecutor({ ...VALID_OPTS, containerName: "-bad" }))
      .toThrow(/containerName must match/);
  });

  test("rejects empty workspaceHostPath", () => {
    expect(() => new DockerToolExecutor({ ...VALID_OPTS, workspaceHostPath: "" }))
      .toThrow(/workspaceHostPath is required/);
  });

  test("describe() reports ready=false before start", () => {
    const exec = new DockerToolExecutor(VALID_OPTS);
    const desc = exec.describe();
    expect(desc.ready).toBe(false);
    expect(desc.kind).toBe("docker");
    expect(desc.imageName).toBe("alpine:latest");
    expect(desc.containerId).toBe("colony-test-1");
    expect(desc.workspaceMount).toContain("/tmp/colony-workspace");
    expect(desc.warnings?.length).toBeGreaterThan(0);
  });

  test("describe() reflects the read-only mount flag", () => {
    const exec = new DockerToolExecutor({ ...VALID_OPTS, readOnlyMount: true });
    expect(exec.describe().workspaceMount).toContain("(ro)");
  });

  test("describe() defaults to rw mount", () => {
    const exec = new DockerToolExecutor(VALID_OPTS);
    expect(exec.describe().workspaceMount).toContain("(rw)");
  });

  test("execute() before start() returns spawnError", async () => {
    const exec = new DockerToolExecutor(VALID_OPTS);
    const result = await exec.execute(["echo", "hi"], {
      cwd: VALID_OPTS.workspaceHostPath,
      timeoutSeconds: 5,
    });
    expect(result.spawnError).toBeDefined();
    expect(result.spawnError).toContain("not started");
  });

  test("execute() with empty argv returns spawnError", async () => {
    const exec = new DockerToolExecutor(VALID_OPTS);
    const result = await exec.execute([], {
      cwd: VALID_OPTS.workspaceHostPath,
      timeoutSeconds: 5,
    });
    expect(result.spawnError).toContain("empty argv");
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe("createToolExecutor", () => {
  test("creates a HostToolExecutor for kind=host", () => {
    const exec = createToolExecutor({ kind: "host" });
    expect(exec.kind).toBe("host");
    expect(exec).toBeInstanceOf(HostToolExecutor);
  });

  test("creates a DockerToolExecutor for kind=docker", () => {
    const exec = createToolExecutor({
      kind: "docker",
      options: {
        image: "alpine:latest",
        containerName: "colony-factory-test",
        workspaceHostPath: tmpdir(),
      },
    });
    expect(exec.kind).toBe("docker");
    expect(exec).toBeInstanceOf(DockerToolExecutor);
  });
});

// ---------------------------------------------------------------------------
// Path mapping
// ---------------------------------------------------------------------------

describe("mapHostPathToContainer", () => {
  test("maps the workspace root to the container root", () => {
    expect(mapHostPathToContainer("/host/work", "/host/work", "/workspace")).toBe("/workspace");
  });

  test("maps a sub-path under the workspace", () => {
    expect(
      mapHostPathToContainer("/host/work/src/foo.ts", "/host/work", "/workspace"),
    ).toBe("/workspace/src/foo.ts");
  });

  test("handles trailing slash on workspace root", () => {
    expect(
      mapHostPathToContainer("/host/work/src", "/host/work/", "/workspace"),
    ).toBe("/workspace/src");
  });

  test("contains escape attempts — paths outside mount fall back to root", () => {
    expect(
      mapHostPathToContainer("/etc/passwd", "/host/work", "/workspace"),
    ).toBe("/workspace");
  });

  test("normalizes Windows backslashes for the container side", () => {
    expect(
      mapHostPathToContainer("D:\\colony\\work\\src", "D:\\colony\\work", "/workspace"),
    ).toBe("/workspace/src");
  });

  test("Windows drive letter case-insensitive matching", () => {
    expect(
      mapHostPathToContainer("d:\\Colony\\Work\\file.txt", "D:\\colony\\work", "/workspace"),
    ).toBe("/workspace/file.txt");
  });

  test("custom workspace mount path", () => {
    expect(
      mapHostPathToContainer("/host/code/src", "/host/code", "/app"),
    ).toBe("/app/src");
  });
});

// ---------------------------------------------------------------------------
// HostToolExecutor — env propagation
// ---------------------------------------------------------------------------

describe("HostToolExecutor — env handling", () => {
  test("custom env vars are visible to the subprocess", async () => {
    const exec = new HostToolExecutor();
    const result = await exec.execute(
      ["bun", "-e", "console.log(process.env.COLONY_TEST_VAR || 'unset')"],
      {
        cwd: tmpdir(),
        timeoutSeconds: 10,
        env: { COLONY_TEST_VAR: "test-value-xyz" },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("test-value-xyz");
  });

  test("inherits parent env when no env option given", async () => {
    process.env.COLONY_PARENT_TEST = "from-parent";
    try {
      const exec = new HostToolExecutor();
      const result = await exec.execute(
        ["bun", "-e", "console.log(process.env.COLONY_PARENT_TEST || 'missing')"],
        { cwd: tmpdir(), timeoutSeconds: 10 },
      );
      expect(result.stdout.trim()).toBe("from-parent");
    } finally {
      delete process.env.COLONY_PARENT_TEST;
    }
  });
});

// ---------------------------------------------------------------------------
// Output limit
// ---------------------------------------------------------------------------

describe("HostToolExecutor — output limits", () => {
  test("truncates stdout when maxOutputChars is exceeded", async () => {
    const exec = new HostToolExecutor();
    // Write 100k chars; cap to 1k
    const result = await exec.execute(
      ["bun", "-e", "process.stdout.write('x'.repeat(100000))"],
      {
        cwd: tmpdir(),
        timeoutSeconds: 10,
        maxOutputChars: 1000,
      },
    );
    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1000);
  });
});
