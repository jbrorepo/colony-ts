/**
 * Phase 10 Verification Script - P1 Security Foundations
 *
 * Covers async path validation, path-key safety, secret scanning/redaction,
 * and security audit trail integrity/persistence.
 *
 * Run: bun run src/verify-phase10.ts
 */

import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";

import {
  PathTraversalError,
  PathValidator,
  sanitizePathKey,
  validateTeamMemKey,
  VIOLATION_NULL_BYTE,
  VIOLATION_OUTSIDE_WORKSPACE,
  VIOLATION_TRAVERSAL,
} from "./security/path-validator";
import { registerBuiltinTools } from "./runtime/builtin-tools";
import { createApprovalDecision, ToolApprovalService } from "./runtime/approval";
import { createMemoryLogger } from "./runtime/logger";
import { ToolExecutor, ToolRegistry } from "./runtime/tools-registry";
import {
  PolicyDecision,
  SecurityPolicyEngine,
  createDefaultSecurityPolicyEngine,
  defaultSecurityPolicyRules,
} from "./security/policy";
import { SecretScanner } from "./security/secret-scanner";
import {
  SecurityAuditTrail,
  SecurityEventType,
} from "./security/audit-trail";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function assertThrows(fn: () => unknown, label: string): void {
  try {
    fn();
    assert(false, label);
  } catch (e) {
    assert(e instanceof PathTraversalError, label);
  }
}

async function verifyPathValidator(): Promise<void> {
  section("1. Path Validator");

  const workspace = await mkdtemp(join(tmpdir(), "colony-path-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "colony-path-outside-"));
  const allowedExternal = await mkdtemp(join(tmpdir(), "colony-path-allowed-"));
  try {
    await mkdir(join(workspace, "src"), { recursive: true });
    await writeFile(join(workspace, "src", "notes.txt"), "hello", "utf-8");
    await writeFile(join(outside, "secret.txt"), "secret", "utf-8");

    const validator = new PathValidator({ workspace });
    const inside = await validator.validate("src/notes.txt");
    assert(inside.allowed, "Relative path inside workspace allowed");
    assertEqual(inside.resolvedPath, resolve(workspace, "src", "notes.txt"), "Inside path resolved");

    const future = await validator.validate("src/future.txt");
    assert(future.allowed, "Missing future file inside workspace allowed");

    const traversal = await validator.validate("../escape.txt");
    assert(!traversal.allowed, "Parent traversal blocked");
    assertEqual(traversal.violationType, VIOLATION_TRAVERSAL, "Traversal violation typed");

    const absoluteOutside = await validator.validate(join(outside, "secret.txt"));
    assert(!absoluteOutside.allowed, "Absolute outside path blocked");
    assertEqual(absoluteOutside.violationType, VIOLATION_OUTSIDE_WORKSPACE, "Outside violation typed");

    const nullByte = await validator.validate("src/notes.txt\0.png");
    assert(!nullByte.allowed, "Null byte path blocked");
    assertEqual(nullByte.violationType, VIOLATION_NULL_BYTE, "Null byte violation typed");

    const withExtra = new PathValidator({ workspace, extraAllowedDirs: [allowedExternal] });
    await writeFile(join(allowedExternal, "ok.txt"), "ok", "utf-8");
    const externalAllowed = await withExtra.validate(join(allowedExternal, "ok.txt"));
    assert(externalAllowed.allowed, "Extra allowed directory accepted");

    const many = await validator.validateMany(["src/notes.txt", "../escape.txt"]);
    assertEqual(many.length, 2, "validateMany returns one result per path");
    assert(many[0].allowed && !many[1].allowed, "validateMany preserves decisions");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    await rm(allowedExternal, { recursive: true, force: true });
  }
}

async function verifyPathKeys(): Promise<void> {
  section("2. Path Key Safety");

  const teamRoot = await mkdtemp(join(tmpdir(), "colony-team-mem-"));
  const windowsHome = await mkdtemp(join(tmpdir(), "colony-win-home-"));
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  try {
    assertEqual(sanitizePathKey("notes/project.md"), "notes/project.md", "Safe relative path key allowed");
    assertThrows(() => sanitizePathKey("../secret"), "Parent segment in key blocked");
    assertThrows(() => sanitizePathKey("..%2Fsecret"), "URL-encoded traversal key blocked");
    assertThrows(() => sanitizePathKey("notes\\secret"), "Backslash key blocked");
    assertThrows(() => sanitizePathKey("C:\\secret"), "Windows absolute key blocked");
    assertThrows(() => sanitizePathKey("\uFF0E\uFF0E/secret"), "Unicode-normalized traversal key blocked");

    const resolved = await validateTeamMemKey("projects/notes.md", teamRoot);
    assertEqual(resolved, join(teamRoot, "projects", "notes.md"), "Team memory key resolves under root");

    let blocked = false;
    try {
      await validateTeamMemKey("../secret", teamRoot);
    } catch (e) {
      blocked = e instanceof PathTraversalError;
    }
    assert(blocked, "Team memory traversal key rejected");

    delete process.env.HOME;
    process.env.USERPROFILE = windowsHome;
    const defaultRoot = join(windowsHome, ".colony", "memory", "team");
    await mkdir(defaultRoot, { recursive: true });
    const defaultResolved = await validateTeamMemKey("windows/notes.md");
    assertEqual(
      defaultResolved,
      join(defaultRoot, "windows", "notes.md"),
      "Team memory default root falls back to USERPROFILE when HOME is missing",
    );
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    await rm(teamRoot, { recursive: true, force: true });
    await rm(windowsHome, { recursive: true, force: true });
  }
}

async function verifyBuiltinToolPathBoundary(): Promise<void> {
  section("3. Built-in Tool Path Boundary");

  const workspace = await mkdtemp(join(tmpdir(), "colony-tool-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "colony-tool-outside-"));
  try {
    await writeFile(join(workspace, "inside.txt"), "inside\nmatch\n", "utf-8");
    await writeFile(join(outside, "secret.txt"), "secret", "utf-8");

    const registry = new ToolRegistry();
    registerBuiltinTools(registry, { workspace, enforcePathValidation: true });
    const executor = new ToolExecutor(registry);

    const readInside = await executor.execute("file_read", { path: join(workspace, "inside.txt") });
    assertEqual(readInside.error, null, "Registered file_read inside workspace succeeds");
    assert(readInside.output.includes("inside"), "Registered file_read returns content");

    const readOutside = await executor.execute("file_read", { path: join(outside, "secret.txt") });
    assertEqual(readOutside.error, null, "Path-denied tool returns normal tool result");
    assert(readOutside.output.includes("Path validation failed"), "Registered file_read blocks outside workspace");

    const writeOutside = await executor.execute("file_write", {
      path: join(outside, "new.txt"),
      content: "nope",
    });
    assert(writeOutside.output.includes("Path validation failed"), "Registered file_write blocks outside workspace");

    const grepInside = await executor.execute("grep_search", {
      pattern: "match",
      path: workspace,
    });
    assert(grepInside.output.includes("inside.txt"), "Registered grep_search can search workspace");

    const grepOutside = await executor.execute("grep_search", {
      pattern: "secret",
      path: outside,
    });
    assert(grepOutside.output.includes("Path validation failed"), "Registered grep_search blocks outside workspace");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}

async function verifySecretScanner(): Promise<void> {
  section("4. Secret Scanner");

  const scanner = new SecretScanner();

  const aws = scanner.scan("AWS key AKIAABCDEFGHIJKLMNOP here");
  assert(aws.hasSecrets, "AWS access key detected");
  assertEqual(aws.findings[0]?.severity, "critical", "AWS severity critical");
  assert(aws.redactedText.includes("[REDACTED:aws_access_key]"), "AWS access key redacted");
  assert(!aws.redactedText.includes("AKIAABCDEFGHIJKLMNOP"), "AWS secret removed from text");

  const github = scanner.scan(`token ghp_${"A".repeat(36)}`);
  assert(github.findings.some((finding) => finding.patternName === "github_pat"), "GitHub PAT detected");

  const anthropic = scanner.scan(`ANTHROPIC_API_KEY=sk-ant-${"x".repeat(24)}`);
  assert(anthropic.findings.some((finding) => finding.patternName === "anthropic_key"), "Anthropic key detected");

  const stripe = scanner.scan(`stripe=sk_live_${"a".repeat(24)}`);
  assert(stripe.findings.some((finding) => finding.patternName === "stripe_secret_key"), "Stripe secret detected");

  const db = scanner.scan("DATABASE_URL=postgres://user:pass@example.com:5432/db");
  assert(db.findings.some((finding) => finding.patternName === "postgres_uri"), "Postgres URI detected");

  const generic = scanner.scan(`api_key=${"b".repeat(24)}`);
  assert(generic.findings.some((finding) => finding.patternName === "generic_api_key"), "Generic API key detected");

  const jwt = scanner.scan(`jwt=eyJ${"a".repeat(12)}.eyJ${"b".repeat(12)}.${"c".repeat(12)}`);
  assert(jwt.findings.some((finding) => finding.patternName === "jwt"), "JWT detected");

  const entropy = scanner.scan("token ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789AAAA");
  assert(entropy.findings.some((finding) => finding.patternName === "high_entropy_token"), "High entropy token detected");

  const clean = scanner.scan("normal project note with no credentials");
  assert(!clean.hasSecrets, "Clean text has no findings");
  assertEqual(clean.redactedText, "normal project note with no credentials", "Clean text unchanged");

  const overlap = scanner.scan("api_key=AKIAABCDEFGHIJKLMNOP");
  assertEqual(overlap.findingCount, 1, "Overlapping secret ranges deduplicated");

  const messageScan = scanner.scanMessages([
    { role: "user", content: `password="${"p".repeat(10)}"` },
    { role: "assistant", content: "safe" },
  ]);
  assertEqual(messageScan.findings.length, 1, "scanMessages returns findings");
  assert(String(messageScan.messages[0].content).includes("[REDACTED:password_assignment]"), "scanMessages redacts content");

  scanner.addPattern({
    name: "custom_colony_secret",
    pattern: /COLONY_SECRET_[A-Z0-9]{8}/g,
    severity: "high",
  });
  assert(scanner.scan("COLONY_SECRET_ABCD1234").findings.some((finding) => finding.patternName === "custom_colony_secret"), "Custom pattern works");

  const stats = scanner.getStats();
  assert(stats.scanCount >= 11, "Scanner stats count scans");
  assert(stats.totalFindings >= 10, "Scanner stats count findings");
  assert(stats.patternCount > 10, "Scanner reports pattern count");
}

function verifyStructuredLoggerSecretBridge(): void {
  section("5. Structured Logger Secret Bridge");

  const { logger, lines, records } = createMemoryLogger();
  const githubPat = `ghp_${"A".repeat(36)}`;
  logger.info("secret_scan", {
    sessionId: "ses_secret",
    credential: githubPat,
  });

  assertEqual(lines.length, 1, "Logger emits one sanitized line");
  assert(!lines[0].includes(githubPat), "Logger line redacts scanner-only secret");
  assert(lines[0].includes("[REDACTED:github_pat]"), "Logger line includes scanner redaction marker");
  assert(!JSON.stringify(records[0]).includes(githubPat), "Logger sink record is sanitized");
}

async function verifySecurityPolicyEngine(): Promise<void> {
  section("6. Security Policy Engine");

  assertEqual(defaultSecurityPolicyRules().length, 25, "Default policy rule count matches Python source");

  const defaults = createDefaultSecurityPolicyEngine();
  assertEqual(defaults.getRules().length, 25, "Default policy engine loads rules");

  const root = defaults.evaluate({
    actorCaste: "root_queen",
    actorAgentId: "queen",
    action: "anything.at.all",
    resource: "system",
  });
  assertEqual(root.decision, PolicyDecision.ALLOW, "Root Queen default allow-all");
  assertEqual(root.matchedRule, "root_queen.allow_all", "Root Queen matched allow-all rule");

  const assistShell = defaults.evaluate({
    actorCaste: "assist_ant",
    actorAgentId: "assist",
    action: "tool.shell.execute",
    resource: "*",
  });
  assertEqual(assistShell.decision, PolicyDecision.DENY, "Global shell deny beats Assist tool allow");
  assertEqual(assistShell.matchedRule, "global.deny_shell_unprivileged", "Highest priority deny wins");

  const assistRead = defaults.evaluate({
    actorCaste: "assist_ant",
    actorAgentId: "assist",
    action: "tool.file.read",
    resource: "README.md",
  });
  assertEqual(assistRead.decision, PolicyDecision.ALLOW, "Assist tool read allowed by tool glob");

  const nameless = defaults.evaluate({
    actorCaste: "nameless_swarm",
    actorAgentId: "nameless",
    action: "tool.file.read",
    resource: "sandbox/file.txt",
  });
  assertEqual(nameless.decision, PolicyDecision.AUDIT, "Nameless tool use is audit decision");

  const noRule = defaults.evaluate({
    actorCaste: "watcher_swarm",
    actorAgentId: "watcher",
    action: "memory.write",
    resource: "notes",
  });
  assertEqual(noRule.decision, PolicyDecision.DENY, "No match uses default deny");
  assertEqual(noRule.matchedRule, null, "Default deny has no matched rule");

  const custom = new SecurityPolicyEngine({ maxRules: 10 });
  custom.addRule({
    name: "allow.docs",
    actionPattern: "tool.file.*",
    resourcePattern: "docs/*",
    casteList: ["assist_ant"],
    decision: PolicyDecision.ALLOW,
    priority: 10,
  });
  custom.addRule({
    name: "deny.secret.docs",
    actionPattern: "tool.file.read",
    resourcePattern: "docs/secret*",
    casteList: ["assist_ant"],
    decision: PolicyDecision.DENY,
    priority: 20,
  });
  assertEqual(custom.getRules("assist_ant")[0].name, "deny.secret.docs", "Rules sort by priority");
  assertEqual(custom.getRules("root_queen").length, 0, "Caste filter excludes unrelated rules");
  assertEqual(custom.evaluate({
    actorCaste: "assist_ant",
    actorAgentId: "assist",
    action: "tool.file.read",
    resource: "docs/secret.md",
  }).decision, PolicyDecision.DENY, "Custom higher-priority deny wins");
  assertEqual(custom.evaluate({
    actorCaste: "assist_ant",
    actorAgentId: "assist",
    action: "tool.file.write",
    resource: "docs/public.md",
  }).decision, PolicyDecision.ALLOW, "Custom glob allow works");

  custom.addRule({
    name: "disabled.allow",
    actionPattern: "memory.*",
    resourcePattern: "*",
    decision: PolicyDecision.ALLOW,
    priority: 100,
    enabled: false,
  });
  assertEqual(custom.evaluate({
    actorCaste: "assist_ant",
    actorAgentId: "assist",
    action: "memory.read",
    resource: "x",
  }).decision, PolicyDecision.DENY, "Disabled rule ignored");
  assert(custom.removeRule("disabled.allow"), "removeRule returns true for existing rule");
  assert(!custom.removeRule("missing"), "removeRule returns false for missing rule");

  const log = custom.getEvaluationLog();
  assert(log.length >= 3, "Policy evaluation log records decisions");
  custom.clearEvaluationLog();
  assertEqual(custom.getEvaluationLog().length, 0, "Policy evaluation log clears");

  const capped = new SecurityPolicyEngine({ maxRules: 1 });
  capped.addRule({ name: "one" });
  let maxRuleBlocked = false;
  try {
    capped.addRule({ name: "two" });
  } catch {
    maxRuleBlocked = true;
  }
  assert(maxRuleBlocked, "Policy maxRules enforced");

  const denyEngine = createDefaultSecurityPolicyEngine();
  denyEngine.addRule({
    name: "assist.deny.secret.write.path",
    actionPattern: "tool.file.write",
    resourcePattern: "secret/*",
    casteList: ["assist_ant"],
    decision: PolicyDecision.DENY,
    priority: 1200,
  });

  let resolverCalled = false;
  const denyAuditTrail = new SecurityAuditTrail({ persist: false });
  const approval = new ToolApprovalService({
    securityPolicy: denyEngine,
    auditTrail: denyAuditTrail,
    resolver: async (request) => {
      resolverCalled = true;
      return createApprovalDecision(request.requestId, "once");
    },
  });
  const denied = await approval.evaluate(
    { id: "call-policy-deny", name: "file_write", arguments: { path: "secret/key.txt", content: "x" } },
    { sessionId: "ses", agentId: "assist", caste: "assist_ant", category: "write" },
  );
  assert(!denied.approved, "Approval service denies security-policy blocked call");
  assert(denied.deniedBeforePrompt, "Security-policy deny happens before prompt");
  assert(!resolverCalled, "Security-policy deny does not call resolver");
  assertEqual(denyAuditTrail.query({ eventTypes: [SecurityEventType.POLICY_DENY] }).length, 1, "Policy deny writes audit event");

  const auditEngine = createDefaultSecurityPolicyEngine();
  auditEngine.addRule({
    name: "assist.audit.readme",
    actionPattern: "tool.file.read",
    resourcePattern: "README.md",
    casteList: ["assist_ant"],
    decision: PolicyDecision.AUDIT,
    priority: 1200,
  });
  const allowAuditTrail = new SecurityAuditTrail({ persist: false });
  const auditApproval = new ToolApprovalService({
    securityPolicy: auditEngine,
    auditTrail: allowAuditTrail,
    resolver: async (request) => createApprovalDecision(request.requestId, "once"),
  });
  const audited = await auditApproval.evaluate(
    { id: "call-policy-audit", name: "file_read", arguments: { path: "README.md" } },
    { sessionId: "ses", agentId: "assist", caste: "assist_ant", category: "read" },
  );
  assert(audited.approved, "Policy audit decision still allows approval flow");
  assert(audited.request.warnings.some((warning) => warning.includes("Security policy audit")), "Policy audit warning attached");
  assertEqual(allowAuditTrail.query({ eventTypes: [SecurityEventType.POLICY_AUDIT] }).length, 1, "Policy audit writes audit event");
  assertEqual(allowAuditTrail.query({ eventTypes: [SecurityEventType.PERMISSION_GRANTED] }).length, 1, "Approved decision writes grant audit event");
}

async function verifyAuditTrail(): Promise<void> {
  section("7. Security Audit Trail");

  const auditDir = await mkdtemp(join(tmpdir(), "colony-audit-"));
  try {
    const trail = new SecurityAuditTrail({
      storageDir: auditDir,
      fileName: "security.jsonl",
      persist: true,
    });

    const first = await trail.record({
      eventType: SecurityEventType.AUTH_SUCCESS,
      actorCaste: "assist_ant",
      actorAgentId: "agent-1",
      action: "login",
      resource: "session",
      outcome: "success",
      sessionId: "session-1",
      details: { ip: "127.0.0.1" },
    });
    assert(first.id.length > 0, "Audit event gets ID");
    assertEqual(first.checksum.length, 64, "Audit event gets SHA-256 checksum");

    await trail.record({
      eventType: SecurityEventType.PERMISSION_DENIED,
      actorCaste: "assist_ant",
      actorAgentId: "agent-1",
      action: "shell_exec",
      resource: "tool",
      outcome: "denied",
      details: { reason: "needs approval" },
    });
    await trail.record({
      eventType: SecurityEventType.SECRET_ACCESS,
      actorCaste: "root_queen",
      actorAgentId: "agent-2",
      action: "read",
      resource: "vault",
      outcome: "success",
      details: { key: "AKIAABCDEFGHIJKLMNOP" },
    });
    await trail.record({
      eventType: SecurityEventType.DATA_REDACTED,
      actorCaste: "shield_general",
      actorAgentId: "agent-3",
      action: "redact",
      resource: "prompt",
      outcome: "success",
    });
    await trail.record({
      eventType: SecurityEventType.AUTH_FAILURE,
      actorCaste: "unknown",
      actorAgentId: "agent-4",
      action: "login",
      resource: "session",
      outcome: "failure",
    });

    assertEqual(trail.query({ eventTypes: [SecurityEventType.PERMISSION_DENIED] }).length, 1, "Query by event type works");
    assertEqual(trail.query({ actorCaste: "assist_ant" }).length, 2, "Query by caste works");
    assertEqual(trail.query({ actorAgentId: "agent-2" }).length, 1, "Query by actor works");
    assertEqual(trail.query({ outcome: "success" }).length, 3, "Query by outcome works");
    assertEqual(trail.query({ limit: 2 }).length, 2, "Query limit works");

    const integrity = trail.verifyIntegrity();
    assert(integrity.verified, "Hash chain verifies");
    assertEqual(integrity.eventsChecked, 5, "Integrity checks all events");

    const stats = trail.getStats();
    assertEqual(stats.totalEvents, 5, "Stats count events");
    assertEqual(stats.eventsByCaste.assist_ant, 2, "Stats count by caste");
    assertEqual(stats.eventsByOutcome.success, 3, "Stats count by outcome");

    const report = trail.generateReport(24);
    assertEqual(report.totalEvents, 5, "Report counts recent events");
    assertEqual(report.deniedActions, 1, "Report counts denied actions");
    assertEqual(report.failedAuths, 1, "Report counts failed auths");
    assertEqual(report.secretsAccessed, 1, "Report counts secret access");
    assertEqual(report.dataRedactions, 1, "Report counts redactions");
    assert(report.integrityVerified, "Report includes integrity status");
    assert(report.findings.some((finding) => finding.includes("authentication failure")), "Report emits auth finding");

    const persisted = await Bun.file(join(auditDir, "security.jsonl")).text();
    assert(persisted.split("\n").filter(Boolean).length === 5, "Audit JSONL persists events");
    assert(!persisted.includes("AKIAABCDEFGHIJKLMNOP"), "Audit persistence sanitizes secrets");
    assert(persisted.includes("AKIA****"), "Audit persistence keeps sanitized marker");

    trail.tamperForTest(1, { action: "tampered" });
    const tampered = trail.verifyIntegrity();
    assert(!tampered.verified, "Tampered hash chain fails verification");
    assert(tampered.firstInvalid !== null, "Tamper reports first invalid event");
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 10 Verification (P1 Security Foundations)\n");

  await verifyPathValidator();
  await verifyPathKeys();
  await verifyBuiltinToolPathBoundary();
  await verifySecretScanner();
  verifyStructuredLoggerSecretBridge();
  await verifySecurityPolicyEngine();
  await verifyAuditTrail();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 10 verification FAILED. Fix issues above.");
    process.exit(1);
  }

  console.log("\nPhase 10: P1 security foundations are GREEN.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
