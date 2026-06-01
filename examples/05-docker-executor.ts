/**
 * Use the Docker tool executor to run commands in a sandboxed container.
 *
 * Prerequisites:
 *   - Docker installed and the daemon running
 *   - The image must already be pulled (or pullable)
 *
 * Run:
 *   bun run examples/05-docker-executor.ts
 */

import { createToolExecutor } from "../src/runtime/tool-executor";
import { tmpdir } from "os";
import { join } from "path";

async function main(): Promise<void> {
  // Use a unique container name to avoid collisions
  const containerName = `colony-example-${Date.now()}`;
  const workspace = tmpdir();

  const executor = createToolExecutor({
    kind: "docker",
    options: {
      image: "alpine:3.20",
      containerName,
      workspaceHostPath: workspace,
      workspaceContainerPath: "/work",
      readOnlyMount: true,        // prevent the container from writing to host
      network: "none",            // no network access
      extraRunArgs: [
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--user=1000:1000",
        "--memory=256m",
        "--pids-limit=64",
      ],
    },
  });

  console.log(`==> Starting container: ${containerName}`);
  try {
    await executor.start();
    console.log("Container started");

    console.log("\n==> Running: uname -a");
    const a = await executor.execute(["uname", "-a"], {
      cwd: workspace,
      timeoutSeconds: 10,
    });
    console.log(`stdout: ${a.stdout.trim()}`);
    console.log(`exitCode: ${a.exitCode}`);

    console.log("\n==> Running: ls /work");
    const b = await executor.execute(["ls", "-la", "/work"], {
      cwd: workspace,
      timeoutSeconds: 10,
    });
    console.log(b.stdout.split("\n").slice(0, 10).join("\n"));

    console.log("\n==> Verify network is disabled");
    const c = await executor.execute(
      ["sh", "-c", "wget --timeout=2 -q -O - http://example.com || echo 'BLOCKED (good)'"],
      { cwd: workspace, timeoutSeconds: 5 },
    );
    console.log(`stdout: ${c.stdout.trim()}`);
  } finally {
    console.log(`\n==> Stopping container: ${containerName}`);
    await executor.stop();
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
