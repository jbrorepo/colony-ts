import { buildDoctorCommandPayload, parseDoctorArgs } from "./gateway-doctor";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const report = {
  passed: false,
  errorCount: 1,
  warningCount: 0,
  checks: [
    {
      name: "Provider config",
      passed: false,
      severity: "error",
      message: "Missing provider setup.",
      fix: "Run bun run alpha0:provider-check.",
    },
  ],
};

function renderDoctor(args: string[]) {
  const spec = parseDoctorArgs(args);
  return buildDoctorCommandPayload({
    report,
    mode: spec.mode,
    query: spec.query,
    visibleChecks: report.checks,
    focusProvider: null,
    providerDiagnosticsLines: [],
    firstRunLines: [],
    inspectHints: [],
  });
}

const flagOnly = renderDoctor(["--approved"]);
assert(flagOnly.output.includes("Startup Diagnostics:"), "flag-only doctor renders diagnostics");
assert(!flagOnly.output.includes("Search:"), "flag-only doctor does not render a search");
assert(!flagOnly.output.includes("--approved"), "flag-only doctor does not echo stray flag");
assert(flagOnly.data?.query === null, "flag-only doctor stores no query");

const flaggedErrors = renderDoctor(["errors", "--approved"]);
assert(flaggedErrors.output.includes("Mode: errors"), "flagged doctor preserves requested mode");
assert(!flaggedErrors.output.includes("Search:"), "flagged doctor mode does not render a flag search");
assert(!flaggedErrors.output.includes("--approved"), "flagged doctor mode does not echo stray flag");

const secretSearch = renderDoctor(["ghp_DOCTOR_SHOULD_NOT_LEAK12345678"]);
assert(secretSearch.output.includes("Search: [REDACTED]"), "secret-shaped doctor query renders redacted search");
assert(!secretSearch.output.includes("DOCTOR_SHOULD_NOT_LEAK"), "secret-shaped doctor query redacts token body");
assert(!secretSearch.output.includes("ghp_"), "secret-shaped doctor query redacts token prefix");
assert(secretSearch.data?.query === "[REDACTED]", "secret-shaped doctor query stores only redacted data");

const validSearch = renderDoctor(["provider"]);
assert(validSearch.output.includes("Search: provider"), "valid doctor query still renders");
assert(validSearch.data?.query === "provider", "valid doctor query still stores normalized query");

console.log("Phase 339: doctor queries ignore flags and redact secrets.");
