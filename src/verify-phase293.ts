import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";
import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new BrowserSidecarRuntime({
  driver: {
    async open(url) {
      return { url, title: "Shot", text: "screen" };
    },
    async screenshot() {
      return { artifactId: "browser_artifact_1", name: "shot.png", mimeType: "image/png", bytes: 12345, uri: "colony://artifacts/shot.png" };
    },
  },
});

runtime.start({ approved: true, approvedBy: "tester" });
await runtime.open("https://example.com", { approved: true, approvedBy: "tester" });
assert((await runtime.screenshot({})).status === "blocked", "screenshot requires approval");
const shot = await runtime.screenshot({ approved: true, approvedBy: "tester" });
assert(shot.status === "screenshot", "approved screenshot succeeds");
assert(shot.artifact.untrusted === true, "screenshot artifact is untrusted");
assert(!JSON.stringify(shot.artifact).includes("sk-"), "screenshot metadata is redacted");
assert(runtime.artifacts().length === 1, "runtime stores artifact metadata");

const parser = new SlashCommandParser({ browser: { runtime } });
assert(parser.tryHandle("/browser artifacts").output.includes("browser_artifact_1"), "/browser artifacts renders metadata");

console.log("Phase 293: browser screenshot/artifact safety is GREEN.");
