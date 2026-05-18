import { readFile } from "fs/promises";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };
for (let phase = 292; phase <= 312; phase += 1) {
  assert(pkg.scripts[`verify:phase${phase}`], `package script verify:phase${phase} exists`);
  assert(pkg.scripts["verify:all"].includes(`verify:phase${phase}`), `verify:all includes phase${phase}`);
}
assert(pkg.scripts["verify:market-parity"], "verify:market-parity exists");
assert(pkg.scripts["release:market-gate"], "release:market-gate exists");

console.log("Phase 312: market release gate wiring is GREEN.");
