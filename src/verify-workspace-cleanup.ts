import { readFile } from "fs/promises";

const requiredFiles = [
  "docs/release/WORKSPACE_INVENTORY.md",
  "docs/release/COMMIT_BUCKETS.md",
  "docs/release/tracked-change-inventory.txt",
  "docs/release/tracked-change-stat.txt",
  "docs/release/workspace-status.txt",
  "docs/release/ALPHA_0_RELEASE_NOTES.md",
  "docs/release/ALPHA_0_RELEASE_READINESS.md",
  "docs/release/ALPHA_0_PROVIDER_SMOKE.md",
  "docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md",
  "docs/release/ALPHA_0_DEPENDENCY_RISK.md",
  "docs/release/BUCKET_2_REVIEW.md",
  "docs/release/BUCKET_3_REVIEW.md",
  "docs/release/BUCKET_4_REVIEW.md",
  "docs/release/BUCKET_5_REVIEW.md",
  "docs/release/BUCKET_6_REVIEW.md",
  "docs/release/BUCKET_7_REVIEW.md",
  "docs/release/BUCKET_8_REVIEW.md",
  "docs/release/BUCKET_9_REVIEW.md",
  "docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md",
  "docs/release/RC_EXACT_STAGING_MANIFEST.md",
  "docs/release/COMPETITOR_COMPLETION_BOARD.md",
  "docs/PROJECT_STATE.md",
  "docs/COLONY_BIBLE.md",
  "docs/BENCHMARK_BOARD.md",
  "docs/ROADMAP.md",
  "docs/DECISIONS.md",
  "docs/LAUNCH_ALPHA_0.md",
  "README.md",
];

for (const file of requiredFiles) {
  const content = await readFile(file, "utf8");
  if (content.trim().length === 0) {
    throw new Error(`${file} is empty`);
  }
}

const publicDocs = [
  await readFile("README.md", "utf8"),
  await readFile("docs/PROJECT_STATE.md", "utf8"),
  await readFile("docs/LAUNCH_ALPHA_0.md", "utf8"),
].join("\n");

const projectState = await readFile("docs/PROJECT_STATE.md", "utf8");
const colonyBible = await readFile("docs/COLONY_BIBLE.md", "utf8");
const benchmarkBoard = await readFile("docs/BENCHMARK_BOARD.md", "utf8");
const roadmap = await readFile("docs/ROADMAP.md", "utf8");
const decisions = await readFile("docs/DECISIONS.md", "utf8");
const launchAlpha0 = await readFile("docs/LAUNCH_ALPHA_0.md", "utf8");
const alpha0ReleaseNotes = await readFile("docs/release/ALPHA_0_RELEASE_NOTES.md", "utf8");
const alpha0ReleaseReadiness = await readFile("docs/release/ALPHA_0_RELEASE_READINESS.md", "utf8");
const readme = await readFile("README.md", "utf8");
const bucket2Review = await readFile("docs/release/BUCKET_2_REVIEW.md", "utf8");
const bucket3Review = await readFile("docs/release/BUCKET_3_REVIEW.md", "utf8");
const bucket4Review = await readFile("docs/release/BUCKET_4_REVIEW.md", "utf8");
const bucket5Review = await readFile("docs/release/BUCKET_5_REVIEW.md", "utf8");
const bucket6Review = await readFile("docs/release/BUCKET_6_REVIEW.md", "utf8");
const bucket7Review = await readFile("docs/release/BUCKET_7_REVIEW.md", "utf8");
const bucket8Review = await readFile("docs/release/BUCKET_8_REVIEW.md", "utf8");
const bucket9Review = await readFile("docs/release/BUCKET_9_REVIEW.md", "utf8");
const rcCleanCheckoutRehearsal = await readFile("docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md", "utf8");
const rcExactStagingManifest = await readFile("docs/release/RC_EXACT_STAGING_MANIFEST.md", "utf8");
const antelligenceReleaseReadinessChecklist = await readFile(
  "docs/templates/antelligence/release-readiness-checklist.md",
  "utf8",
);

const forbidden = [
  /default live (Slack|Discord|Telegram)/i,
  /persists? credentials/i,
  /automatic(?:ally)? creates? (?:remote )?(?:PR|pull request)/i,
  /default public hosting is shipped/i,
];

for (const pattern of forbidden) {
  if (pattern.test(publicDocs)) {
    throw new Error(`Forbidden public claim matched ${pattern}`);
  }
}

const agentGuidance = await readFile("AGENTS.md", "utf8");
if (!agentGuidance.includes("verify:phase282")) {
  throw new Error("AGENTS.md must name the active verify:phase282 frontier");
}
if (/currently through `verify:phase27[0-9]`/.test(agentGuidance)) {
  throw new Error("AGENTS.md must not advertise an older Phase 270-series verification frontier");
}

if (!projectState.includes("Last Updated: 2026-05-14")) {
  throw new Error("docs/PROJECT_STATE.md must carry the current 2026-05-14 source-of-truth date");
}
if (!projectState.includes("verify:phase282")) {
  throw new Error("docs/PROJECT_STATE.md must name the active verify:phase282 frontier");
}
if (!projectState.includes("12-caste method framework compatibility")) {
  throw new Error("docs/PROJECT_STATE.md must record the 12-caste method compatibility rollout");
}
if (!projectState.includes("legacy Python caste values remain accepted")) {
  throw new Error("docs/PROJECT_STATE.md must preserve legacy caste compatibility truth");
}

if (/11-Phase QA Cycle|Before `Forge`|`Vanguard`|`Guardian`/.test(colonyBible)) {
  throw new Error("docs/COLONY_BIBLE.md must prefer the 12-caste method workflow over stale Forge-era QA wording");
}
if (!colonyBible.includes("12-caste method framework")) {
  throw new Error("docs/COLONY_BIBLE.md must document the 12-caste method framework");
}

if (!benchmarkBoard.includes("Last Updated: 2026-05-14")) {
  throw new Error("docs/BENCHMARK_BOARD.md must carry the current 2026-05-14 source-of-truth date");
}
if (!benchmarkBoard.includes("verify:phase282")) {
  throw new Error("docs/BENCHMARK_BOARD.md must name the active verify:phase282 frontier");
}
if (/verify:phase278` plus `tsc --noEmit`/.test(benchmarkBoard)) {
  throw new Error("docs/BENCHMARK_BOARD.md must not advertise the old verify:phase278 frontier");
}
if (!benchmarkBoard.includes("12-caste method framework")) {
  throw new Error("docs/BENCHMARK_BOARD.md must record 12-caste method compatibility as truth-sync work");
}

if (!roadmap.includes("Last Updated: 2026-05-14")) {
  throw new Error("docs/ROADMAP.md must carry the current 2026-05-14 source-of-truth date");
}
if (!roadmap.includes("verify:phase282")) {
  throw new Error("docs/ROADMAP.md must name the active verify:phase282 frontier");
}
if (/Verification phases `1\.\.277` plus `phase19a`/.test(roadmap)) {
  throw new Error("docs/ROADMAP.md must not advertise the old 1..277 plus phase19a baseline");
}
if (!roadmap.includes("12-caste method framework")) {
  throw new Error("docs/ROADMAP.md must record 12-caste method compatibility as current truth");
}

if (!decisions.includes("**Last Updated:** May 14, 2026")) {
  throw new Error("docs/DECISIONS.md must carry the current May 14, 2026 source-of-truth date");
}
if (!decisions.includes("12-caste method framework with legacy runtime aliases")) {
  throw new Error("docs/DECISIONS.md must preserve the 12-caste compatibility decision");
}
if (/`verify-phase1\.ts` through `verify-phase7\.ts`/.test(decisions)) {
  throw new Error("docs/DECISIONS.md must not describe verification as only phase1 through phase7");
}
if (!decisions.includes("verify:phase282")) {
  throw new Error("docs/DECISIONS.md must name the active verify:phase282 frontier");
}

if (!launchAlpha0.includes("Last Updated: 2026-05-14")) {
  throw new Error("docs/LAUNCH_ALPHA_0.md must carry the current 2026-05-14 source-of-truth date");
}
if (!launchAlpha0.includes("12-caste method framework")) {
  throw new Error("docs/LAUNCH_ALPHA_0.md must name the 12-caste method framework as an Alpha 0 compatibility claim");
}
if (!launchAlpha0.includes("legacy persisted caste values remain compatibility aliases")) {
  throw new Error("docs/LAUNCH_ALPHA_0.md must preserve legacy caste compatibility truth");
}

if (!alpha0ReleaseNotes.includes("12-caste method framework display compatibility")) {
  throw new Error("docs/release/ALPHA_0_RELEASE_NOTES.md must name 12-caste display compatibility as shipped Alpha 0 scope");
}
if (!alpha0ReleaseNotes.includes("legacy persisted caste values remain compatibility aliases")) {
  throw new Error("docs/release/ALPHA_0_RELEASE_NOTES.md must preserve legacy caste compatibility truth");
}
if (!alpha0ReleaseReadiness.includes("12-caste method framework compatibility")) {
  throw new Error("docs/release/ALPHA_0_RELEASE_READINESS.md must record the 12-caste compatibility evidence gate");
}

if (!readme.includes("12-caste method framework display compatibility")) {
  throw new Error("README.md must name 12-caste display compatibility as Alpha 0 scope");
}
if (!readme.includes("legacy persisted caste values remain compatibility aliases")) {
  throw new Error("README.md must preserve legacy caste compatibility truth");
}
if (!antelligenceReleaseReadinessChecklist.includes("Identity compatibility evidence exists")) {
  throw new Error("Antelligence release-readiness template must include identity compatibility evidence");
}

if (!bucket2Review.includes("Command-ant") || !bucket2Review.includes("Oper-ant") || !bucket2Review.includes("Consult-ant")) {
  throw new Error("Bucket 2 review must record current method-caste swarm role routing");
}
if (!bucket2Review.includes("verify:phase233")) {
  throw new Error("Bucket 2 review must record the current swarm hardening evidence gate");
}
if (!bucket3Review.includes("Latest automation preflight remains BLOCKED")) {
  throw new Error("Bucket 3 review must preserve latest provider preflight blocker truth");
}
if (!bucket3Review.includes("interactive terminal outside this automation shell")) {
  throw new Error("Bucket 3 review must preserve manual terminal UI smoke blocker truth");
}
if (!bucket3Review.includes("must not be used as a substitute for terminal swarm evidence")) {
  throw new Error("Bucket 3 review must separate provider preflight from terminal swarm evidence");
}
if (!bucket4Review.includes("Latest automation guardrail refresh")) {
  throw new Error("Bucket 4 review must preserve latest GitHub guardrail refresh truth");
}
if (!bucket4Review.includes("exact approval-gated local branch/worktree execution")) {
  throw new Error("Bucket 4 review must preserve exact approval-gated local execution truth");
}
if (!bucket4Review.includes("no default push, no default PR creation, and no credential persistence")) {
  throw new Error("Bucket 4 review must preserve no default remote mutation and credential boundaries");
}
if (!bucket4Review.includes("verify:phase230")) {
  throw new Error("Bucket 4 review must record the verification-to-PR handoff evidence gate");
}
if (!bucket5Review.includes("Latest automation guardrail refresh")) {
  throw new Error("Bucket 5 review must preserve latest web-control guardrail refresh truth");
}
if (!bucket5Review.includes("local-only authenticated operator shell")) {
  throw new Error("Bucket 5 review must preserve local-only authenticated operator shell truth");
}
if (!bucket5Review.includes("web.read and web.mutate scoped access")) {
  throw new Error("Bucket 5 review must preserve scoped web-control authorization truth");
}
if (!bucket5Review.includes("no default public listener, no hosted control plane, and no direct mutation execution")) {
  throw new Error("Bucket 5 review must preserve no default public hosting and no direct mutation boundaries");
}
if (!bucket5Review.includes("verify:phase231")) {
  throw new Error("Bucket 5 review must record the local web-control UX evidence gate");
}
if (!bucket6Review.includes("Latest automation guardrail refresh")) {
  throw new Error("Bucket 6 review must preserve latest release-candidate guardrail refresh truth");
}
if (!bucket6Review.includes("verify:phase282")) {
  throw new Error("Bucket 6 review must name the current verify:phase282 frontier");
}
if (!bucket6Review.includes("bun run release:gate")) {
  throw new Error("Bucket 6 review must preserve the release gate evidence command");
}
if (!bucket6Review.includes("manual terminal UI smoke remains the explicit Alpha 0 release blocker")) {
  throw new Error("Bucket 6 review must preserve the manual terminal UI smoke blocker truth");
}
if (!bucket6Review.includes("no tag, commit, push, PR, listener startup, external-service mutation, or credential persistence")) {
  throw new Error("Bucket 6 review must preserve release-candidate non-mutation boundaries");
}
if (!bucket7Review.includes("Latest automation guardrail refresh")) {
  throw new Error("Bucket 7 review must preserve latest swarm hardening guardrail refresh truth");
}
if (!bucket7Review.includes("verify:phase233")) {
  throw new Error("Bucket 7 review must record the Beta 1 swarm hardening evidence gate");
}
if (
  !bucket7Review.includes(
    "stage timeline, retry history, redacted artifact review, interrupted-stage resume, and persisted approval-wait preservation",
  )
) {
  throw new Error("Bucket 7 review must preserve the shipped swarm inspection and resume-hardening truth");
}
if (!bucket7Review.includes("restart-safe cancellation preservation")) {
  throw new Error("Bucket 7 review must preserve restart-safe cancellation truth");
}
if (!bucket7Review.includes("without changing public hosting, credentials, channel delivery, or remote mutation boundaries")) {
  throw new Error("Bucket 7 review must preserve non-hosting and non-remote-mutation boundaries");
}
if (!bucket8Review.includes("Latest automation guardrail refresh")) {
  throw new Error("Bucket 8 review must preserve latest MCP/plugin guardrail refresh truth");
}
if (!bucket8Review.includes("verify:phase234") || !bucket8Review.includes("verify:phase278")) {
  throw new Error("Bucket 8 review must record the Beta 2 MCP/plugin evidence range");
}
if (!bucket8Review.includes("approval-gated plugin package install/update execution receipts")) {
  throw new Error("Bucket 8 review must preserve approval-gated plugin package execution truth");
}
if (!bucket8Review.includes("read-only plugin marketplace lifecycle operator UX")) {
  throw new Error("Bucket 8 review must preserve read-only marketplace lifecycle UX truth");
}
if (!bucket8Review.includes("injected executor and injected supervisor boundaries")) {
  throw new Error("Bucket 8 review must preserve injected host-execution boundaries");
}
if (
  !bucket8Review.includes(
    "no default registry fetch, package install, package-code execution, sidecar start, catalog mutation, or credential persistence",
  )
) {
  throw new Error("Bucket 8 review must preserve default-deny plugin execution boundaries");
}
if (!bucket9Review.includes("Latest automation guardrail refresh")) {
  throw new Error("Bucket 9 review must preserve latest channel/media guardrail refresh truth");
}
if (!bucket9Review.includes("verify:phase119") || !bucket9Review.includes("verify:phase225")) {
  throw new Error("Bucket 9 review must record the host-owned media transfer evidence range");
}
if (!bucket9Review.includes("host-owned external media transfer/manual-reinvoke chain")) {
  throw new Error("Bucket 9 review must preserve host-owned media transfer truth");
}
if (!bucket9Review.includes("signed and host-authenticated webhook foundations")) {
  throw new Error("Bucket 9 review must preserve signed webhook foundation truth");
}
if (
  !bucket9Review.includes(
    "no default live inbound delivery, public hosting, credential persistence, background retry worker, automatic vendor retry, or raw host-data persistence",
  )
) {
  throw new Error("Bucket 9 review must preserve default-deny channel/media boundaries");
}
if (!rcCleanCheckoutRehearsal.includes("Status: blocked before final rehearsal")) {
  throw new Error("RC clean-checkout rehearsal must preserve the current blocked-before-final-rehearsal truth");
}
if (!rcCleanCheckoutRehearsal.includes("current committed `HEAD` (`71461f1`)")) {
  throw new Error("RC clean-checkout rehearsal must record the current HEAD preflight target");
}
if (
  !rcCleanCheckoutRehearsal.includes("`96` untracked") ||
  !rcCleanCheckoutRehearsal.includes("release-critical paths")
) {
  throw new Error("RC clean-checkout rehearsal must record untracked release-critical path evidence");
}
if (
  !rcCleanCheckoutRehearsal.includes("clean clone or archive of `HEAD`") ||
  !rcCleanCheckoutRehearsal.includes("would\nnot include the release gate docs")
) {
  throw new Error("RC clean-checkout rehearsal must explain why HEAD-only rehearsal would test stale truth");
}
if (!rcCleanCheckoutRehearsal.includes("Support owner: local release owner")) {
  throw new Error("RC clean-checkout rehearsal must preserve support owner truth");
}
if (!rcCleanCheckoutRehearsal.includes("Incident owner: local release owner")) {
  throw new Error("RC clean-checkout rehearsal must preserve incident owner truth");
}
if (
  !rcCleanCheckoutRehearsal.includes("do not expand public claims") ||
  !rcCleanCheckoutRehearsal.includes("enable default public listeners") ||
  !rcCleanCheckoutRehearsal.includes("persist credentials") ||
  !rcCleanCheckoutRehearsal.includes("mutate external services") ||
  !rcCleanCheckoutRehearsal.includes("create remote PRs")
) {
  throw new Error("RC clean-checkout rehearsal must preserve support triage non-expansion guardrails");
}
if (!rcExactStagingManifest.includes("Never use `git add .` for this release candidate")) {
  throw new Error("RC exact staging manifest must preserve the no git-add-dot rule");
}
if (!rcExactStagingManifest.includes("git add -- AGENTS.md package.json")) {
  throw new Error("RC exact staging manifest must stage Bucket 0 by exact pathspec");
}
if (!rcExactStagingManifest.includes("git add -- README.md docs/LAUNCH_ALPHA_0.md")) {
  throw new Error("RC exact staging manifest must stage Bucket 1 by exact pathspec");
}
if (!rcExactStagingManifest.includes("git add -- src/orchestrator src/gateway-swarm.ts src/verify-phase226.ts")) {
  throw new Error("RC exact staging manifest must stage Bucket 2 by exact pathspec");
}
if (!rcExactStagingManifest.includes("git add -- src/alpha0-provider-readiness.ts src/verify-alpha0.ts")) {
  throw new Error("RC exact staging manifest must stage Bucket 3 by exact pathspec");
}
if (!rcExactStagingManifest.includes("git add -- src/github-local-workspace-executor.ts src/github-pr-handoff.ts")) {
  throw new Error("RC exact staging manifest must stage Bucket 4 by exact pathspec");
}
if (!rcExactStagingManifest.includes("git add -- src/web-control.ts src/daemon")) {
  throw new Error("RC exact staging manifest must stage Bucket 5 by exact pathspec");
}
if (!rcExactStagingManifest.includes("git add -- docs/release/BUCKET_6_REVIEW.md")) {
  throw new Error("RC exact staging manifest must stage Bucket 6 by exact pathspec");
}
if (!rcExactStagingManifest.includes("No commit, tag, push, PR, worktree prune, or worktree deletion without")) {
  throw new Error("RC exact staging manifest must preserve non-mutation guardrails");
}

console.log("Workspace cleanup docs: GREEN.");
