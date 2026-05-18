import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";
import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new BrowserSidecarRuntime({
  driver: {
    async open(url) {
      return { url, title: "Example", text: "hello sk-secret123456 user@example.com" };
    },
    async read() {
      return { url: "https://example.com", title: "Example", text: "hello sk-secret123456 user@example.com" };
    },
  },
});

assert(runtime.snapshot().browserSpawned === false, "browser does not spawn by default");
assert((await runtime.open("https://example.com", {})).status === "blocked", "open requires approval");
runtime.start({ approved: true, approvedBy: "tester" });
const opened = await runtime.open("https://example.com", { approved: true, approvedBy: "tester" });
assert(opened.status === "opened", "approved open succeeds through injected driver");
assert(runtime.snapshot().currentUrl === "https://example.com/", "snapshot tracks current URL");
const read = await runtime.read();
assert(read.status === "read", "read returns page preview");
assert(read.preview.untrusted === true, "page text is marked untrusted");
assert(!read.preview.text.includes("sk-secret"), "page text redacts API-like secrets");
assert(!read.preview.text.includes("user@example.com"), "page text redacts emails");

const parser = new SlashCommandParser({ browser: { runtime } });
const output = await parser.tryHandle("/browser read").output;
assert(output.includes("Browser Page:"), "/browser read renders page output");

console.log("Phase 292: browser startup/navigation/read is GREEN.");
