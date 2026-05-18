import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";
import { buildBrowserCommandPayload } from "./gateway-browser";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("BROWSER_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

const runtime = new BrowserSidecarRuntime({
  driver: {
    open(url) {
      return {
        url,
        title: "Token page",
        text: "Page token ghp_BROWSER_SURFACE_PAGE_TEXT_SHOULD_NOT_LEAK12345678 and github_pat_BROWSER_SURFACE_PAGE_PAT_SHOULD_NOT_LEAK12345678",
      };
    },
    read() {
      return {
        url: "https://example.com/read/ghp_BROWSER_SURFACE_READ_URL_SHOULD_NOT_LEAK12345678?token=github_pat_BROWSER_SURFACE_READ_QUERY_SHOULD_NOT_LEAK12345678",
        title: "Read token",
        text: "Read token ghp_BROWSER_SURFACE_READ_TEXT_SHOULD_NOT_LEAK12345678",
      };
    },
    screenshot() {
      return {
        artifactId: "artifact_ghp_BROWSER_SURFACE_ARTIFACT_ID_SHOULD_NOT_LEAK12345678",
        name: "shot github_pat_BROWSER_SURFACE_ARTIFACT_NAME_SHOULD_NOT_LEAK12345678.png",
        mimeType: "image/png ghp_BROWSER_SURFACE_ARTIFACT_MIME_SHOULD_NOT_LEAK12345678",
        bytes: 12,
        uri: "colony://artifacts/ghp_BROWSER_SURFACE_ARTIFACT_URI_SHOULD_NOT_LEAK12345678.png",
      };
    },
  },
});

runtime.start({ approved: true, approvedBy: "tester" });
await runtime.open(
  "https://example.com/open/ghp_BROWSER_SURFACE_OPEN_URL_SHOULD_NOT_LEAK12345678?token=github_pat_BROWSER_SURFACE_OPEN_QUERY_SHOULD_NOT_LEAK12345678",
  { approved: true, approvedBy: "tester" },
);
await runtime.screenshot({ approved: true, approvedBy: "tester" });
await runtime.read();

const opened = buildBrowserCommandPayload([
  "open",
  "https://example.com/path/ghp_BROWSER_SURFACE_COMMAND_OPEN_SHOULD_NOT_LEAK12345678?token=github_pat_BROWSER_SURFACE_COMMAND_QUERY_SHOULD_NOT_LEAK12345678",
  "--approved",
]).output;
assert(opened.includes("https://example.com/path/[REDACTED]"), "browser open output redacts URL path token");
assert(opened.includes("token=****"), "browser open output redacts URL query token");
assertRedacted(opened, "browser open output");

const read = buildBrowserCommandPayload(["read"], { runtime }).output;
assert(read.includes("URL: https://example.com/read/[REDACTED]?token=****"), "browser read redacts current URL");
assert(read.includes("Read token [REDACTED]"), "browser read redacts page text token");
assertRedacted(read, "browser read output");

const artifacts = buildBrowserCommandPayload(["artifacts"], { runtime }).output;
assert(artifacts.includes("artifact_[REDACTED] | shot [REDACTED_SECRET].png | image/png [REDACTED_SECRET]"), "browser artifacts redacts artifact metadata");
assertRedacted(artifacts, "browser artifacts output");

const wait = buildBrowserCommandPayload([
  "wait",
  "#ready-ghp_BROWSER_SURFACE_WAIT_TARGET_SHOULD_NOT_LEAK12345678",
]).output;
assert(wait.includes("Target: #ready-[REDACTED]"), "browser wait output redacts target");
assertRedacted(wait, "browser wait output");

console.log("Phase 372: browser status surfaces redact secret-shaped metadata.");
