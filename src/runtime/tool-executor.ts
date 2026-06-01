/**
 * ToolExecutor — pluggable backend for running tool subprocesses.
 *
 * Today most Colony tool execution happens through `runProcess()` in
 * builtin-tools.ts, which calls `Bun.spawn` directly. That works for
 * the local-trusted-developer model, but for environments where:
 *
 *   - the operator wants an isolation boundary even with policy gates
 *   - the workspace mounts a checkout from an untrusted contributor
 *   - the deployment is multi-tenant and needs per-session sandboxing
 *
 * ...the policy engine alone is insufficient. This module introduces a
 * pluggable executor interface so the same call sites can run host-native
 * or docker-isolated without touching the calling code.
 *
 * The default executor remains the host — Docker is opt-in.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ToolExecutorOptions {
  /** Working directory for the command. */
  cwd: string;
  /** Wall-clock timeout in seconds. The executor MUST enforce this. */
  timeoutSeconds: number;
  /** Cap on captured stdout/stderr characters. Default: implementation-defined. */
  maxOutputChars?: number;
  /** Extra environment variables. Merged on top of the inherited env. */
  env?: Record<string, string>;
}

export interface ToolExecutorResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  truncated: boolean;
  /** Non-empty when the executor itself failed to spawn the process. */
  spawnError?: string;
}

export interface ToolExecutorDescription {
  name: string;
  kind: string;
  ready: boolean;
  imageName?: string;
  containerId?: string;
  workspaceMount?: string;
  warnings?: string[];
}

export interface ToolExecutor {
  readonly name: string;
  readonly kind: "host" | "docker" | string;
  /** Execute a single command. Argv form, no shell parsing. */
  execute(args: string[], options: ToolExecutorOptions): Promise<ToolExecutorResult>;
  /** Optional one-time setup. Idempotent. */
  start?(): Promise<void>;
  /** Optional cleanup. Idempotent. */
  stop?(): Promise<void>;
  /** Returns diagnostic info for /executor status displays. */
  describe?(): ToolExecutorDescription;
}

// ---------------------------------------------------------------------------
// Host executor — wraps Bun.spawn (default behaviour)
// ---------------------------------------------------------------------------

export interface HostToolExecutorOptions {
  /** Defaults to 1 MiB per stream. */
  defaultMaxOutputChars?: number;
}

export class HostToolExecutor implements ToolExecutor {
  readonly name = "host";
  readonly kind = "host" as const;
  private readonly _defaultMaxOutputChars: number;

  constructor(options: HostToolExecutorOptions = {}) {
    this._defaultMaxOutputChars = options.defaultMaxOutputChars ?? 1_048_576;
  }

  async execute(
    args: string[],
    options: ToolExecutorOptions,
  ): Promise<ToolExecutorResult> {
    if (args.length === 0) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        timedOut: false,
        truncated: false,
        spawnError: "HostToolExecutor: empty argv",
      };
    }

    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      // Always merge process.env so the child inherits PATH and friends.
      // Bun's spawn does not auto-inherit when *any* env override is given,
      // and the safest cross-platform contract is "child sees parent env".
      const mergedEnv = options.env
        ? { ...process.env, ...options.env }
        : { ...process.env };
      proc = Bun.spawn(args, {
        cwd: options.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: mergedEnv as Record<string, string>,
      });
    } catch (error) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        timedOut: false,
        truncated: false,
        spawnError: `Failed to spawn ${args[0]}: ${(error as Error).message}`,
      };
    }

    return await runSubprocess(proc, options, this._defaultMaxOutputChars);
  }

  describe(): ToolExecutorDescription {
    return {
      name: this.name,
      kind: this.kind,
      ready: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Docker executor — runs each command via `docker exec` in a persistent
// per-session container.
// ---------------------------------------------------------------------------

export interface DockerToolExecutorOptions {
  /** Image to run, e.g. "node:20-alpine" or "ubuntu:22.04". Required. */
  image: string;
  /**
   * Container name. Will be created with `docker run -d --name <name> ...`.
   * Caller is responsible for uniqueness — typically `colony-<sessionId>`.
   */
  containerName: string;
  /**
   * Absolute host path to mount into the container as the working dir.
   * Mounted read-write by default; set readOnlyMount=true to make it ro.
   */
  workspaceHostPath: string;
  /** Path inside the container where the workspace mounts. Default: /workspace. */
  workspaceContainerPath?: string;
  /** When true, the workspace mount is read-only. Default: false. */
  readOnlyMount?: boolean;
  /** Docker binary. Default: "docker". */
  dockerBin?: string;
  /** Extra args passed to `docker run` on container start. */
  extraRunArgs?: string[];
  /** Network mode passed to `docker run --network`. Default: "none" (no network). */
  network?: string;
  /** Default max output chars (per stream). */
  defaultMaxOutputChars?: number;
}

export class DockerToolExecutor implements ToolExecutor {
  readonly name: string;
  readonly kind = "docker" as const;
  private readonly _options: Required<
    Omit<DockerToolExecutorOptions, "extraRunArgs">
  > & { extraRunArgs: string[] };
  private _started = false;

  constructor(options: DockerToolExecutorOptions) {
    if (!options.image || !options.image.trim()) {
      throw new Error("DockerToolExecutor: image is required");
    }
    if (!options.containerName || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(options.containerName)) {
      throw new Error(
        `DockerToolExecutor: containerName must match ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$ (got ${JSON.stringify(options.containerName)})`,
      );
    }
    if (!options.workspaceHostPath || !options.workspaceHostPath.trim()) {
      throw new Error("DockerToolExecutor: workspaceHostPath is required");
    }
    this.name = `docker:${options.containerName}`;
    this._options = {
      image: options.image,
      containerName: options.containerName,
      workspaceHostPath: options.workspaceHostPath,
      workspaceContainerPath: options.workspaceContainerPath ?? "/workspace",
      readOnlyMount: options.readOnlyMount ?? false,
      dockerBin: options.dockerBin ?? "docker",
      extraRunArgs: options.extraRunArgs ?? [],
      network: options.network ?? "none",
      defaultMaxOutputChars: options.defaultMaxOutputChars ?? 1_048_576,
    };
  }

  /** Spin up the container. Idempotent within a single instance. */
  async start(): Promise<void> {
    if (this._started) return;
    const opts = this._options;
    const mountFlag = opts.readOnlyMount ? "ro" : "rw";

    const runArgs = [
      "run",
      "-d",
      "--rm",
      "--name", opts.containerName,
      "--network", opts.network,
      "--workdir", opts.workspaceContainerPath,
      "-v", `${opts.workspaceHostPath}:${opts.workspaceContainerPath}:${mountFlag}`,
      ...opts.extraRunArgs,
      opts.image,
      // Sleep infinity so the container stays up for subsequent `docker exec`s.
      "sleep", "infinity",
    ];

    const result = await this._runDockerCli(runArgs, {
      cwd: opts.workspaceHostPath,
      timeoutSeconds: 30,
    });

    if (result.spawnError) {
      throw new Error(`DockerToolExecutor.start: docker binary not found: ${result.spawnError}`);
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `DockerToolExecutor.start: failed to start container '${opts.containerName}' (exit ${result.exitCode}): ${result.stderr.trim()}`,
      );
    }
    this._started = true;
  }

  /** Stop and remove the container. Idempotent. */
  async stop(): Promise<void> {
    if (!this._started) return;
    const opts = this._options;
    // --rm on `docker run` removes the container when it stops, so we just stop.
    await this._runDockerCli(["stop", opts.containerName], {
      cwd: opts.workspaceHostPath,
      timeoutSeconds: 15,
    });
    this._started = false;
  }

  async execute(
    args: string[],
    options: ToolExecutorOptions,
  ): Promise<ToolExecutorResult> {
    if (args.length === 0) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        timedOut: false,
        truncated: false,
        spawnError: "DockerToolExecutor: empty argv",
      };
    }
    if (!this._started) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        timedOut: false,
        truncated: false,
        spawnError: "DockerToolExecutor: container not started (call start() first)",
      };
    }

    const opts = this._options;
    // Translate the host cwd into the container's workspace mount.
    const containerCwd = mapHostPathToContainer(
      options.cwd,
      opts.workspaceHostPath,
      opts.workspaceContainerPath,
    );

    const envFlags: string[] = [];
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envFlags.push("-e", `${key}=${value}`);
      }
    }

    const execArgs = [
      "exec",
      "--workdir", containerCwd,
      ...envFlags,
      opts.containerName,
      ...args,
    ];

    return await this._runDockerCli(execArgs, options);
  }

  describe(): ToolExecutorDescription {
    return {
      name: this.name,
      kind: this.kind,
      ready: this._started,
      imageName: this._options.image,
      containerId: this._options.containerName,
      workspaceMount: `${this._options.workspaceHostPath} → ${this._options.workspaceContainerPath} (${this._options.readOnlyMount ? "ro" : "rw"})`,
      warnings: this._started
        ? []
        : ["Container not started; call start() before execute()."],
    };
  }

  // -------------------------------------------------------------------------

  private async _runDockerCli(
    dockerArgs: string[],
    options: ToolExecutorOptions,
  ): Promise<ToolExecutorResult> {
    const fullArgs = [this._options.dockerBin, ...dockerArgs];

    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(fullArgs, {
        cwd: options.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        timedOut: false,
        truncated: false,
        spawnError: `Failed to spawn docker: ${(error as Error).message}`,
      };
    }

    return await runSubprocess(proc, options, this._options.defaultMaxOutputChars);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type ToolExecutorConfig =
  | { kind: "host"; options?: HostToolExecutorOptions }
  | { kind: "docker"; options: DockerToolExecutorOptions };

export function createToolExecutor(config: ToolExecutorConfig): ToolExecutor {
  switch (config.kind) {
    case "host":
      return new HostToolExecutor(config.options ?? {});
    case "docker":
      return new DockerToolExecutor(config.options);
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown ToolExecutor kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared subprocess driver
// ---------------------------------------------------------------------------

async function runSubprocess(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
  options: ToolExecutorOptions,
  defaultMaxOutputChars: number,
): Promise<ToolExecutorResult> {
  const maxOutput = options.maxOutputChars ?? defaultMaxOutputChars;
  let timedOut = false;
  let killedForOutputLimit = false;

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, Math.max(1, options.timeoutSeconds) * 1000);

  const stopForOutputLimit = (): void => {
    if (killedForOutputLimit) return;
    killedForOutputLimit = true;
    proc.kill();
  };

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readBoundedStream(proc.stdout, maxOutput, stopForOutputLimit),
      readBoundedStream(proc.stderr, maxOutput, stopForOutputLimit),
      proc.exited,
    ]);

    return {
      stdout: stdout.text,
      stderr: stderr.text,
      exitCode,
      timedOut,
      truncated: stdout.truncated || stderr.truncated || killedForOutputLimit,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maxChars: number,
  onLimit: () => void,
): Promise<{ text: string; truncated: boolean }> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (text.length + chunk.length > maxChars) {
        text += chunk.slice(0, maxChars - text.length);
        truncated = true;
        onLimit();
        break;
      }
      text += chunk;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
  return { text, truncated };
}

// ---------------------------------------------------------------------------
// Path mapping for Docker (host → container)
// ---------------------------------------------------------------------------

/**
 * Translates a host-side absolute path into the container-side path,
 * assuming the workspace is mounted at the documented location.
 * If the host path is outside the workspace mount, returns the container
 * workspace root (sandbox containment — never escape the mount).
 */
export function mapHostPathToContainer(
  hostPath: string,
  workspaceHostRoot: string,
  workspaceContainerRoot: string,
): string {
  // Normalize separators to forward slashes for the container side
  const hostNorm = hostPath.replace(/\\/g, "/");
  const rootNorm = workspaceHostRoot.replace(/\\/g, "/");
  const containerNorm = workspaceContainerRoot.replace(/\\/g, "/");

  // Case-insensitive comparison on Windows hosts (drive letters)
  const isWindowsHost = /^[A-Za-z]:\//.test(hostNorm) || /^[A-Za-z]:\//.test(rootNorm);
  const eq = (a: string, b: string): boolean =>
    isWindowsHost ? a.toLowerCase() === b.toLowerCase() : a === b;
  const startsWith = (a: string, b: string): boolean =>
    isWindowsHost ? a.toLowerCase().startsWith(b.toLowerCase()) : a.startsWith(b);

  if (eq(hostNorm, rootNorm)) return containerNorm;
  const rootWithSlash = rootNorm.endsWith("/") ? rootNorm : `${rootNorm}/`;
  if (startsWith(hostNorm, rootWithSlash)) {
    return `${containerNorm}/${hostNorm.slice(rootWithSlash.length)}`;
  }
  // Sandbox containment: host paths outside the mount fall back to workspace root.
  return containerNorm;
}
