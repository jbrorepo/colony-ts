function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export {};

const packageJsonText = await Bun.file("package.json").text();
const packageJson = JSON.parse(packageJsonText) as {
  scripts?: Record<string, string>;
};
const verifyAll = packageJson.scripts?.["verify:all"];
assert(typeof verifyAll === "string", "package.json has verify:all script string");
assert(verifyAll!.includes("verify:phase384"), "verify:all chain contains verify:phase384");
assert(verifyAll!.trimEnd().endsWith("tsc --noEmit"), "verify:all chain still ends with tsc --noEmit");

const truthFiles: Array<{ path: string; staleClaim: string }> = [
  { path: "AGENTS.md", staleClaim: "currently through `verify:phase381`" },
  { path: "docs/PROJECT_STATE.md", staleClaim: "through `verify:phase381`" },
  { path: "docs/CLAUDE_CODE_REVIEW_CONTEXT.md", staleClaim: "through `verify:phase381`" },
];

for (const { path, staleClaim } of truthFiles) {
  const text = await Bun.file(path).text();
  assert(text.includes("phase384"), `${path} names phase384 as current verification frontier`);
  assert(
    !text.includes(staleClaim),
    `${path} does not keep stale '${staleClaim}' current-frontier wording`,
  );
}

const agents = await Bun.file("AGENTS.md").text();
assert(
  agents.includes("Phases 279 through 384"),
  "AGENTS.md summarizes the 279 through 384 rolling status range",
);

console.log("Phase 386: verify chain, source-of-truth docs, and rolling-status range stay aligned to phase384.");
