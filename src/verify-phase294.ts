import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new BrowserSidecarRuntime({
  driver: {
    async click(selector) {
      return { selector, summary: "clicked" };
    },
    async type(selector, text) {
      return { selector, textPreview: text, summary: "typed" };
    },
  },
});
runtime.start({ approved: true, approvedBy: "tester" });
assert((await runtime.click("#submit", {})).status === "blocked", "click requires approval");
const click = await runtime.click("#submit", { approved: true, approvedBy: "tester" });
assert(click.status === "clicked", "approved click succeeds");
assert(click.receipt.action === "click", "click receipt records action");
const typed = await runtime.type("#token", "ghp_secret123456", { approved: true, approvedBy: "tester" });
assert(typed.status === "typed", "approved type succeeds");
assert(!String(typed.receipt.inputPreview ?? "").includes("ghp_secret"), "type receipt redacts typed secret");
assert(runtime.writeReceipts().length === 2, "write receipts are retained");

console.log("Phase 294: browser write-action approval and receipts are GREEN.");
