import { spawn } from "child_process";

const commands = [
  ["bun", ["run", "verify:alpha0"]],
  ["bun", ["run", "verify:all"]],
  ["bun", ["run", "build"]],
] as const;

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

for (const [command, args] of commands) {
  await run(command, args);
}

console.log("Release gate: GREEN.");
