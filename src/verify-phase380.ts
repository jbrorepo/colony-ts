import {
  doctorProviderDiagnosticsLines,
  renderDoctorFirstRunLines,
  renderDoctorView,
  type GatewayDoctorCheck,
} from "./gateway-doctor";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("DOCTOR_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
  assert(!output.includes("sk-ant-"), `${label} redacts Anthropic token prefix`);
}

const checks: GatewayDoctorCheck[] = [
  {
    prefix: "error ghp_DOCTOR_SURFACE_PREFIX_SHOULD_NOT_LEAK12345678",
    name: "Provider github_pat_DOCTOR_SURFACE_NAME_SHOULD_NOT_LEAK12345678",
    passed: false,
    severity: "error",
    message: "Missing token ghp_DOCTOR_SURFACE_MESSAGE_SHOULD_NOT_LEAK12345678",
    fix: "Set key sk-ant-DOCTOR_SURFACE_FIX_SHOULD_NOT_LEAK1234567890",
  },
];

const firstRunLines = renderDoctorFirstRunLines({
  workspaceChecks: checks,
  terminalChecks: checks,
  configChecks: checks,
  dataChecks: checks,
  providerChecks: checks,
  localChecks: checks,
  workspaceDetected: true,
  workspaceFallback: "workspace github_pat_DOCTOR_SURFACE_FALLBACK_SHOULD_NOT_LEAK12345678",
  devCommand: "bun run dev --token ghp_DOCTOR_SURFACE_DEV_COMMAND_SHOULD_NOT_LEAK12345678",
  verifyCommand: "bun run verify --key github_pat_DOCTOR_SURFACE_VERIFY_COMMAND_SHOULD_NOT_LEAK12345678",
});

const providerLines = doctorProviderDiagnosticsLines(
  "openai ghp_DOCTOR_SURFACE_FOCUS_SHOULD_NOT_LEAK12345678",
  {
    provider: "openai",
    providerHealth: {
      "openai github_pat_DOCTOR_SURFACE_HEALTH_PROVIDER_SHOULD_NOT_LEAK12345678": {
        state: "open ghp_DOCTOR_SURFACE_HEALTH_STATE_SHOULD_NOT_LEAK12345678",
        failureCount: 1,
      },
    },
    recentFailovers: [
      {
        fromProvider: "openai",
        fromModel: "gpt ghp_DOCTOR_SURFACE_FROM_MODEL_SHOULD_NOT_LEAK12345678",
        toProvider: "anthropic",
        toModel: "claude github_pat_DOCTOR_SURFACE_TO_MODEL_SHOULD_NOT_LEAK12345678",
        errorType: "AuthError ghp_DOCTOR_SURFACE_ERROR_TYPE_SHOULD_NOT_LEAK12345678",
        errorMessage: "Bearer sk-ant-DOCTOR_SURFACE_ERROR_MESSAGE_SHOULD_NOT_LEAK1234567890",
        timestamp: 1_700_000_000_000,
      },
    ],
  },
  { checks },
  {
    expandFailovers: true,
    formatProviderHealthSummary: () => "openai github_pat_DOCTOR_SURFACE_HEALTH_SUMMARY_SHOULD_NOT_LEAK12345678: open",
    latestFailoverSummary: () => "latest ghp_DOCTOR_SURFACE_LATEST_SHOULD_NOT_LEAK12345678",
    formatFailoverEventLine: () => "event github_pat_DOCTOR_SURFACE_EVENT_SHOULD_NOT_LEAK12345678",
    providerRecoveryHints: () => [
      "rotate sk-ant-DOCTOR_SURFACE_RECOVERY_SHOULD_NOT_LEAK1234567890",
    ],
  },
);

const output = renderDoctorView({
  passed: false,
  errorCount: 1,
  warningCount: 0,
  mode: "first-run",
  query: "ghp_DOCTOR_SURFACE_QUERY_SHOULD_NOT_LEAK12345678",
  allCheckCount: 1,
  visibleChecks: checks,
  providerMode: false,
  failoverMode: false,
  firstRunMode: true,
  firstRunLines,
  inspectHints: [
    "/doctor ghp_DOCTOR_SURFACE_HINT_SHOULD_NOT_LEAK12345678",
  ],
  providerDiagnosticsLines: providerLines,
});

assert(output.includes("Search: [REDACTED]"), "doctor view redacts search query");
assert(output.includes("Workspace: error | Missing token ****"), "doctor first-run redacts check message");
assert(output.includes("Project commands: dev: bun run dev --token **** | verify: bun run verify --key [REDACTED]"), "doctor first-run redacts project commands");
assert(output.includes("Focus: openai [REDACTED]"), "doctor provider diagnostics redacts focus provider");
assert(output.includes("Observed health: openai [REDACTED]: open"), "doctor provider diagnostics redacts health summary");
assert(output.includes("Latest failover: latest [REDACTED]"), "doctor provider diagnostics redacts latest failover");
assert(output.includes("Failover: event [REDACTED]"), "doctor provider diagnostics redacts expanded failover");
assert(output.includes("Recovery: rotate [REDACTED_SECRET]"), "doctor provider diagnostics redacts recovery hints");
assertRedacted(output, "doctor first-run/provider output");

const details = renderDoctorView({
  passed: false,
  errorCount: 1,
  warningCount: 0,
  mode: "errors",
  query: "",
  allCheckCount: 1,
  visibleChecks: checks,
  providerMode: false,
  failoverMode: false,
  firstRunMode: false,
  firstRunLines: [],
  inspectHints: ["/doctor config ghp_DOCTOR_SURFACE_DETAIL_HINT_SHOULD_NOT_LEAK12345678"],
  providerDiagnosticsLines: [],
});

assert(details.includes("error [REDACTED]: Provider [REDACTED] - Missing token ****"), "doctor detail redacts check line");
assert(details.includes("fix: Set key [REDACTED_SECRET]"), "doctor detail redacts fix line");
assert(details.includes("Inspect: /doctor config [REDACTED]"), "doctor detail redacts inspect hints");
assertRedacted(details, "doctor detail output");

console.log("Phase 380: doctor onboarding and provider diagnostics surfaces redact secret-shaped metadata.");
