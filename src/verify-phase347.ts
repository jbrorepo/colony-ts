import { buildBrowserCommandPayload } from "./gateway-browser";
import { buildCapabilitiesCommandPayload } from "./gateway-capabilities";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const flagOnlyBrowser = buildBrowserCommandPayload(["--approved"]);
assert(!flagOnlyBrowser.isError, "flag-only browser view renders status");
assert(flagOnlyBrowser.output.includes("Browser Sidecar Boundary:"), "flag-only browser view renders status heading");
assert(!flagOnlyBrowser.output.includes("Unknown browser command"), "flag-only browser view does not treat stray flag as command");

const flaggedBrowserScopes = buildBrowserCommandPayload(["scopes", "--approved"]);
assert(!flaggedBrowserScopes.isError, "flagged browser scopes view still succeeds");
assert(flaggedBrowserScopes.output.includes("Browser Sidecar Command Scopes:"), "flagged browser scopes view renders scopes heading");
assert(!flaggedBrowserScopes.output.includes("Unknown browser command"), "flagged browser scopes view does not treat stray flag as command");

const secretBrowser = buildBrowserCommandPayload(["ghp_BROWSER_SHOULD_NOT_LEAK12345678"]);
assert(secretBrowser.isError, "secret-shaped browser command remains rejected");
assert(secretBrowser.output.includes("Unknown browser command '[REDACTED]'"), "secret-shaped browser command renders redacted label");
assert(!secretBrowser.output.includes("BROWSER_SHOULD_NOT_LEAK"), "secret-shaped browser command redacts token body");
assert(!secretBrowser.output.includes("ghp_"), "secret-shaped browser command redacts token prefix");

const flagOnlyCapabilities = buildCapabilitiesCommandPayload(["--approved"]);
assert(!flagOnlyCapabilities.isError, "flag-only capabilities view renders list");
assert(flagOnlyCapabilities.output.includes("GStack-Inspired Colony Capabilities:"), "flag-only capabilities view renders list heading");
assert(!flagOnlyCapabilities.output.includes("--approved"), "flag-only capabilities view does not echo stray flag");

const flaggedCapabilitiesNext = buildCapabilitiesCommandPayload(["next", "--approved"]);
assert(!flaggedCapabilitiesNext.isError, "flagged capabilities next view still succeeds");
assert(flaggedCapabilitiesNext.output.includes("Next Capability Slice:"), "flagged capabilities next view renders next heading");
assert(!flaggedCapabilitiesNext.output.includes("--approved"), "flagged capabilities next view does not echo stray flag");

const secretCapabilities = buildCapabilitiesCommandPayload(["github_pat_CAPS_SHOULD_NOT_LEAK12345678"]);
assert(secretCapabilities.isError, "secret-shaped capabilities command remains rejected");
assert(secretCapabilities.output.includes("Unknown capabilities command '[REDACTED]'"), "secret-shaped capabilities command renders redacted label");
assert(!secretCapabilities.output.includes("CAPS_SHOULD_NOT_LEAK"), "secret-shaped capabilities command redacts token body");
assert(!secretCapabilities.output.includes("github_pat_"), "secret-shaped capabilities command redacts token prefix");

console.log("Phase 347: browser and capabilities command inputs ignore flags and redact secrets.");
