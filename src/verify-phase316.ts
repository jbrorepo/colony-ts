import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";
import { executeCommand, SlashCommandParser, type CommandExecutionHandlers } from "./gateway";
import { createBrowserExecutionHandlers } from "./gateway-market-handoffs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseHandlers(messages: string[], errors: string[]): CommandExecutionHandlers {
  return {
    submitChat: () => {},
    exitApp: () => {},
    resetSession: () => {},
    requestCompaction: () => {},
    setBudgetCap: () => {},
    showSystemMessage: (message) => messages.push(message),
    showErrorMessage: (message) => errors.push(message),
  };
}

const runtime = new BrowserSidecarRuntime();
const parser = new SlashCommandParser({ browser: { runtime } });

const startCommand = parser.tryHandle("/browser start --approved");
assert(startCommand.action?.kind === "browser_start", "approved browser start returns typed action");
assert(runtime.snapshot().status === "available", "browser start parsing does not mutate runtime");

const messages: string[] = [];
const errors: string[] = [];
await executeCommand(startCommand, {
  ...baseHandlers(messages, errors),
  ...createBrowserExecutionHandlers(runtime),
});
assert(runtime.snapshot().status === "active", "browser start execution mutates runtime through handler");
assert(messages.some((message) => message.includes("Browser runtime started.")), "browser start handler output is shown");
assert(errors.length === 0, "browser start execution emits no errors");

const stopCommand = parser.tryHandle("/browser stop");
assert(stopCommand.action?.kind === "browser_stop", "browser stop returns typed action");
assert(runtime.snapshot().status === "active", "browser stop parsing does not mutate runtime");

await executeCommand(stopCommand, {
  ...baseHandlers(messages, errors),
  ...createBrowserExecutionHandlers(runtime),
});
assert(runtime.snapshot().status === "available", "browser stop execution mutates runtime through handler");
assert(messages.some((message) => message.includes("Browser runtime stopped.")), "browser stop handler output is shown");

const blockedRuntime = new BrowserSidecarRuntime();
const blockedParser = new SlashCommandParser({ browser: { runtime: blockedRuntime } });
const blockedStart = blockedParser.tryHandle("/browser start");
assert(blockedStart.isError, "unapproved browser start remains blocked");
assert(blockedStart.action?.kind === "display", "unapproved browser start has no mutation action");
assert(blockedRuntime.snapshot().status === "available", "unapproved browser start parsing does not mutate runtime");

console.log("Phase 316: browser lifecycle command handoffs are GREEN.");
