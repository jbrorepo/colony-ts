import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const missingOpen = parser.tryHandle("/browser open --approved");
assert(missingOpen.isError, "missing browser open URL is rejected");
assert(missingOpen.action?.kind !== "browser_open", "missing browser open emits no runtime action");
assert(missingOpen.output.includes("Browser URL required."), "missing browser open explains URL requirement");

const unsafeOpen = parser.tryHandle("/browser open http://example.com --approved");
assert(unsafeOpen.isError, "unsafe browser open URL is rejected");
assert(unsafeOpen.action?.kind !== "browser_open", "unsafe browser open emits no runtime action");
assert(unsafeOpen.output.includes("Browser navigation allows only HTTPS or localhost URLs by default."), "unsafe browser open explains URL policy");

const privateOpen = parser.tryHandle("/browser open https://192.168.1.20 --approved");
assert(privateOpen.isError, "private-network browser open URL is rejected");
assert(privateOpen.output.includes("Private-network browser navigation is blocked by default."), "private browser open explains private-network policy");

const missingClick = parser.tryHandle("/browser click --approved");
assert(missingClick.isError, "missing browser click selector is rejected");
assert(missingClick.action?.kind !== "browser_click", "missing browser click emits no runtime action");
assert(missingClick.output.includes("Browser selector required."), "missing browser click explains selector requirement");

const missingTypeText = parser.tryHandle("/browser type #q --approved");
assert(missingTypeText.isError, "missing browser type text is rejected");
assert(missingTypeText.action?.kind !== "browser_type", "missing browser type emits no runtime action");
assert(missingTypeText.output.includes("Browser type text required."), "missing browser type explains text requirement");

const validOpen = parser.tryHandle("/browser open https://example.com --approved");
assert(!validOpen.isError, "safe browser open URL is accepted");
assert(validOpen.action?.kind === "browser_open", "safe browser open emits runtime action");
assert(validOpen.action && "url" in validOpen.action && validOpen.action.url === "https://example.com", "safe browser open preserves display URL");

const validClick = parser.tryHandle("/browser click #submit --approved");
assert(!validClick.isError, "safe browser click selector is accepted");
assert(validClick.action?.kind === "browser_click", "safe browser click emits runtime action");

const validType = parser.tryHandle("/browser type #q hello world --approved");
assert(!validType.isError, "safe browser type text is accepted");
assert(validType.action?.kind === "browser_type", "safe browser type emits runtime action");
assert(validType.action && "text" in validType.action && validType.action.text === "hello world", "safe browser type preserves text");

console.log("Phase 325: browser command arguments are required and policy-checked.");
