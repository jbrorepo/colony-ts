/**
 * Startup diagnostics - lightweight preflight checks for terminal runtime.
 *
 * Ports the highest-value parts of Python doctor flow into TS runtime:
 * workspace/config visibility, writable Colony paths, provider credentials,
 * local Ollama reachability, default cloud-provider readiness, and port use.
 */

import { constants as fsConstants } from "fs";
import { access, mkdir, rm } from "fs/promises";
import { createServer } from "net";
import { isAbsolute, join, resolve } from "path";

import { getDataPath, settings } from "../settings";
import type { LLMConfig, ProviderConfig } from "../llm/selector";
import type { WorkspaceInfo } from "./workspace";

export type StartupSeverity = "error" | "warning" | "info";

export interface StartupCheck {
  name: string;
  passed: boolean;
  severity: StartupSeverity;
  message: string;
  fix?: string;
}

export interface StartupReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  checks: StartupCheck[];
}

export interface StartupDiagnosticsOptions {
  llmConfig: LLMConfig;
  workspace: WorkspaceInfo | null;
  dataDir?: string;
  rootDir?: string;
  port?: number | null;
  stdinIsTTY?: boolean | null;
  stdinSupportsRawMode?: boolean | null;
  stdoutColumns?: number | null;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export type StartupDoctorFocusView =
  | "workspace"
  | "config"
  | "data"
  | "terminal"
  | "local"
  | "cloud"
  | "providers"
  | "errors"
  | "warnings";

type StartupReportLike = {
  passed?: boolean;
  errorCount?: number;
  warningCount?: number;
  checks?: StartupCheckLike[];
};

type StartupCheckLike = {
  name?: string;
  passed?: boolean;
  severity?: StartupSeverity | string;
  message?: string;
  fix?: string;
};

const DEFAULT_OLLAMA_BASE_URL =
  process.env.COLONY_OLLAMA_BASE_URL
  ?? process.env.COLONY_LLM_API_BASE
  ?? settings.llmApiBase
  ?? "http://localhost:11434";

export async function runStartupDiagnostics(
  opts: StartupDiagnosticsOptions,
): Promise<StartupReport> {
  const checks: StartupCheck[] = [];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dataDir = opts.dataDir ?? getDataPath(settings);
  const rootDir = opts.rootDir ?? opts.workspace?.root ?? process.cwd();

  checks.push(checkInteractiveTerminal(opts.stdinIsTTY));
  const rawModeCheck = checkTerminalRawMode(opts.stdinIsTTY, opts.stdinSupportsRawMode);
  if (rawModeCheck) checks.push(rawModeCheck);
  const viewportCheck = checkTerminalViewport(opts.stdinIsTTY, opts.stdoutColumns);
  if (viewportCheck) checks.push(viewportCheck);
  checks.push(checkWorkspace(opts.workspace));
  checks.push(...checkWorkspaceCommands(opts.workspace));
  checks.push(...await checkConfigFiles(rootDir, dataDir));
  checks.push(await checkDataDir(dataDir));
  checks.push(...await checkDataSubdirectories(dataDir));
  checks.push(...checkProviderConfig(opts.llmConfig));
  checks.push(...await checkLocalProvider(opts.llmConfig, fetchImpl));
  checks.push(...await checkDefaultCloudProvider(opts.llmConfig, fetchImpl));
  if (opts.port !== null) {
    checks.push(await checkPortAvailability(opts.port ?? settings.port));
  }

  const errorCount = checks.filter((check) => !check.passed && check.severity === "error").length;
  const warningCount = checks.filter((check) => !check.passed && check.severity === "warning").length;

  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    checks,
  };
}

function checkInteractiveTerminal(stdinIsTTY?: boolean | null): StartupCheck {
  const interactive = stdinIsTTY ?? process.stdin.isTTY;
  if (interactive) {
    return {
      name: "Terminal TTY",
      passed: true,
      severity: "info",
      message: "Interactive terminal detected.",
    };
  }

  return {
    name: "Terminal TTY",
    passed: false,
    severity: "error",
    message: "The Colony requires an interactive terminal (TTY).",
    fix: "Run Colony directly in an interactive terminal, not through a pipe, non-interactive script, or detached stdin.",
  };
}

function checkTerminalRawMode(
  stdinIsTTY?: boolean | null,
  stdinSupportsRawMode?: boolean | null,
): StartupCheck | null {
  const interactive = stdinIsTTY ?? process.stdin.isTTY;
  if (!interactive) return null;

  const rawModeSupported = stdinSupportsRawMode ?? typeof process.stdin.setRawMode === "function";
  if (rawModeSupported) {
    return {
      name: "Terminal raw mode",
      passed: true,
      severity: "info",
      message: "Raw keyboard input supported. Colony hotkeys available.",
    };
  }

  return {
    name: "Terminal raw mode",
    passed: false,
    severity: "warning",
    message: "Raw keyboard input unavailable. Slash commands still work, but Ctrl/Page hotkeys may be unavailable.",
    fix: "Use an interactive terminal that supports raw keyboard input if you need Colony hotkeys and transcript paging shortcuts.",
  };
}

function checkTerminalViewport(
  stdinIsTTY?: boolean | null,
  stdoutColumns?: number | null,
): StartupCheck | null {
  const interactive = stdinIsTTY ?? process.stdin.isTTY;
  if (!interactive) return null;

  const columns = stdoutColumns ?? process.stdout.columns;
  if (!Number.isFinite(columns) || Number(columns) <= 0) {
    return null;
  }

  if (Number(columns) >= 100) {
    return {
      name: "Terminal viewport",
      passed: true,
      severity: "info",
      message: `Viewport width ${Number(columns)} columns. Side panels should fit comfortably.`,
    };
  }

  return {
    name: "Terminal viewport",
    passed: false,
    severity: "warning",
    message: `Viewport width ${Number(columns)} columns. Side panels and drill-down hints may wrap or truncate.`,
    fix: "Widen the terminal to about 100+ columns if you want the budget, status, and doctor panels to stay legible side-by-side.",
  };
}

export function formatStartupReport(
  report: StartupReport,
  opts: { includePassed?: boolean } = {},
): string {
  const includePassed = opts.includePassed ?? false;
  const lines = [
    `Startup checks: ${report.errorCount} error(s), ${report.warningCount} warning(s)`,
  ];

  for (const check of report.checks) {
    if (check.passed && !includePassed) continue;
    const prefix = check.passed
      ? "ok"
      : check.severity === "error"
        ? "error"
        : check.severity === "warning"
          ? "warn"
          : "info";
    lines.push(`${prefix}: ${check.name} - ${check.message}`);
    if (!check.passed && check.fix) {
      lines.push(`fix: ${check.fix}`);
    }
  }

  return lines.join("\n");
}

export function firstBlockingStartupCheck(report: StartupReportLike | null): StartupCheckLike | null {
  if (!report || report.errorCount === 0) {
    return null;
  }

  return report.checks?.find((check) => !check.passed && check.severity === "error")
    ?? report.checks?.find((check) => !check.passed)
    ?? null;
}

function startupCheckHaystack(check: StartupCheckLike): string {
  return [check.name, check.message, check.fix]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
}

function startupCheckMatches(check: StartupCheckLike, terms: string[]): boolean {
  const haystack = startupCheckHaystack(check);
  return terms.some((term) => haystack.includes(term));
}

export function classifyStartupDoctorFocus(check: StartupCheckLike | null): StartupDoctorFocusView {
  if (!check) return "errors";
  if (startupCheckMatches(check, ["terminal", "tty", "raw mode", "keyboard input", "hotkeys", "paging shortcuts", "viewport"])) {
    return "terminal";
  }
  if (startupCheckMatches(check, ["data directory", "permissions:", "sessions writable", "transcripts writable", "tool-results writable", "is writable", "data dir"])) {
    return "data";
  }
  if (startupCheckMatches(check, ["workspace", "project root", "marker", "dev command", "verify command", "workspace packages"])) {
    return "workspace";
  }
  if (startupCheckMatches(check, ["ollama", "local-provider boundary", "wsl", "localhost:11434", "local runtime"])) {
    return "local";
  }
  if (startupCheckMatches(check, ["cloud fallback", "credentials", "connectivity", "anthropic", "claude", "gemini", "google", "openai"])) {
    return "cloud";
  }
  if (startupCheckMatches(check, ["config", ".env", "api key", "llm config", "default provider"])) {
    return "config";
  }
  if (startupCheckMatches(check, ["provider", "fallback"])) {
    return "providers";
  }
  return String(check.severity ?? "info").toLowerCase() === "warning" ? "warnings" : "errors";
}

export function startupDoctorFocusCommand(report: StartupReportLike | null): string | null {
  if (!report || report.passed) return null;
  const focus = classifyStartupDoctorFocus(
    firstBlockingStartupCheck(report)
    ?? report.checks?.find((check) => !check.passed)
    ?? null,
  );
  if (focus === "errors") return "/doctor errors";
  if (focus === "warnings") return "/doctor warnings";
  return `/doctor ${focus}`;
}

export function startupDoctorInspectCommands(
  report: StartupReportLike | null,
  opts: { includeGeneral?: boolean; includeSeverity?: boolean; includeFirstRun?: boolean } = {},
): string[] {
  if (!report || report.passed) return [];

  const includeGeneral = opts.includeGeneral ?? true;
  const includeSeverity = opts.includeSeverity ?? true;
  const includeFirstRun = opts.includeFirstRun ?? true;
  const commands: string[] = [];
  const seen = new Set<string>();
  const push = (command: string | null) => {
    if (!command || seen.has(command)) return;
    seen.add(command);
    commands.push(command);
  };

  if (includeGeneral) push("/doctor");
  push(startupDoctorFocusCommand(report));
  if (includeSeverity) {
    if ((report.errorCount ?? 0) > 0) push("/doctor errors");
    if ((report.warningCount ?? 0) > 0) push("/doctor warnings");
  }
  if (includeFirstRun) push("/doctor first-run");
  return commands;
}

export function formatStartupBlockMessage(report: StartupReport | null): string | null {
  const blockingCheck = firstBlockingStartupCheck(report);
  if (!blockingCheck) {
    return null;
  }

  const lines = [`Startup blocked: ${blockingCheck.name} - ${blockingCheck.message}`];
  if (blockingCheck.fix) {
    lines.push(`Fix: ${blockingCheck.fix}`);
  }
  const inspectCommands = startupDoctorInspectCommands(report, {
    includeGeneral: true,
    includeSeverity: true,
    includeFirstRun: true,
  });
  if (inspectCommands.length > 0) {
    lines.push(`Inspect: ${inspectCommands.join(" | ")}`);
  }
  return lines.join("\n");
}

export function formatStartupPlaceholder(report: StartupReport | null): string | null {
  const blockingCheck = firstBlockingStartupCheck(report);
  if (!blockingCheck) {
    return null;
  }

  const inspectCommands = startupDoctorInspectCommands(report, {
    includeGeneral: false,
    includeSeverity: false,
    includeFirstRun: true,
  }).slice(0, 2);
  return `Startup blocked: ${blockingCheck.name}${inspectCommands.length > 0 ? ` | ${inspectCommands.join(" | ")}` : ""}`;
}

function checkWorkspace(workspace: WorkspaceInfo | null): StartupCheck {
  if (!workspace) {
    return {
      name: "Workspace detection",
      passed: false,
      severity: "warning",
      message: "Workspace detection has not completed yet.",
    };
  }

  if (!workspace.detected) {
    return {
      name: "Workspace detection",
      passed: false,
      severity: "warning",
      message: `No workspace marker found. Using ${workspace.root}.`,
      fix: "Open The Colony from project root or add a standard workspace marker.",
    };
  }

  return {
    name: "Workspace detection",
    passed: true,
    severity: "info",
    message: `${workspace.name} (${workspace.projectType}, ${workspace.packageManager}, ${workspace.workspaceMode})`,
  };
}

function checkWorkspaceCommands(workspace: WorkspaceInfo | null): StartupCheck[] {
  if (!workspace || !workspace.detected) return [];

  const checks: StartupCheck[] = [];
  checks.push({
    name: "Workspace dev command",
    passed: typeof workspace.devCommand === "string" && workspace.devCommand.length > 0,
    severity:
      typeof workspace.devCommand === "string" && workspace.devCommand.length > 0
        ? "info"
        : "warning",
    message:
      typeof workspace.devCommand === "string" && workspace.devCommand.length > 0
        ? workspace.devCommand
        : workspace.workspaceDevCandidates?.length
          ? `No root development command detected. Package candidates: ${workspace.workspaceDevCandidates.slice(0, 3).join(" | ")}`
          : "No development command detected from workspace scripts.",
    fix:
      typeof workspace.devCommand === "string" && workspace.devCommand.length > 0
        ? undefined
        : workspace.workspaceDevCandidates?.length
          ? `Use package-local dev script (${workspace.workspaceDevCandidates[0]}) or add a root dev/start script.`
          : "Add a dev/start script so Colony can point operators to the right live-run command.",
  });
  checks.push({
    name: "Workspace verify command",
    passed: typeof workspace.verifyCommand === "string" && workspace.verifyCommand.length > 0,
    severity:
      typeof workspace.verifyCommand === "string" && workspace.verifyCommand.length > 0
        ? "info"
        : "warning",
    message:
      typeof workspace.verifyCommand === "string" && workspace.verifyCommand.length > 0
        ? workspace.verifyCommand
        : workspace.workspaceVerifyCandidates?.length
          ? `No root verify/test command detected. Package candidates: ${workspace.workspaceVerifyCandidates.slice(0, 3).join(" | ")}`
          : "No verify/test command detected from workspace scripts.",
    fix:
      typeof workspace.verifyCommand === "string" && workspace.verifyCommand.length > 0
        ? undefined
        : workspace.workspaceVerifyCandidates?.length
          ? `Use package-local verify script (${workspace.workspaceVerifyCandidates[0]}) or add a root verify/test script.`
          : "Add a verify/test script so Colony can tell operators how to validate work safely.",
  });

  if (workspace.workspaceMode === "monorepo") {
    checks.push({
      name: "Workspace packages",
      passed: (workspace.workspacePackageCount ?? 0) > 0,
      severity: (workspace.workspacePackageCount ?? 0) > 0 ? "info" : "warning",
      message:
        (workspace.workspacePackageCount ?? 0) > 0
          ? `${workspace.workspacePackageCount} workspace packages detected.`
          : "Monorepo markers found but no workspace packages were detected.",
      fix:
        (workspace.workspacePackageCount ?? 0) > 0
          ? undefined
          : "Check workspaces globs in package.json and ensure package folders contain package.json files.",
    });
  }

  return checks;
}

async function checkDataDir(dataDir: string): Promise<StartupCheck> {
  const testPath = join(dataDir, ".startup-write-test");
  try {
    await mkdir(dataDir, { recursive: true });
    await Bun.write(testPath, "ok");
    await rm(testPath, { force: true });
    return {
      name: "Data directory",
      passed: true,
      severity: "info",
      message: dataDir,
    };
  } catch (e) {
    return {
      name: "Data directory",
      passed: false,
      severity: "error",
      message: `Cannot write to ${dataDir}: ${String(e)}`,
      fix: `Ensure ${dataDir} exists and is writable.`,
    };
  }
}

async function checkConfigFiles(
  rootDir: string,
  dataDir: string,
): Promise<StartupCheck[]> {
  const checks: StartupCheck[] = [];
  const envPath = join(rootDir, ".env");
  const savedConfigPath = join(dataDir, "config.json");

  checks.push(await optionalFileCheck(
    "Config: .env",
    envPath,
    "Not found (optional - environment variables or saved config may still work).",
    "Create a .env file in workspace root if you want local config checked into project context.",
  ));

  checks.push(await optionalFileCheck(
    "Config: saved settings",
    savedConfigPath,
    "Not found (optional - defaults or environment variables in use).",
    "Run Colony setup or save config under data dir if you want persistent local defaults.",
  ));

  if (settings.llmConfigPath) {
    const configPath = isAbsolute(settings.llmConfigPath)
      ? settings.llmConfigPath
      : resolve(rootDir, settings.llmConfigPath);
    const exists = await Bun.file(configPath).exists();
    checks.push({
      name: "Config: llm config path",
      passed: exists,
      severity: exists ? "info" : "warning",
      message: exists
        ? configPath
        : `Configured LLM config path not found: ${configPath}`,
      fix: exists ? undefined : "Fix COLONY_LLM_CONFIG or remove stale path setting.",
    });
  }

  return checks;
}

async function optionalFileCheck(
  name: string,
  filepath: string,
  missingMessage: string,
  fix: string,
): Promise<StartupCheck> {
  const exists = await Bun.file(filepath).exists();
  return {
    name,
    passed: exists,
    severity: exists ? "info" : "info",
    message: exists ? filepath : missingMessage,
    fix: exists ? undefined : fix,
  };
}

async function checkDataSubdirectories(dataDir: string): Promise<StartupCheck[]> {
  const subdirs = ["sessions", "tool-results", "logs"];
  const settled = await Promise.all(subdirs.map((name) => checkWritableSubdirectory(dataDir, name)));
  return settled;
}

async function checkWritableSubdirectory(
  dataDir: string,
  subdir: string,
): Promise<StartupCheck> {
  const target = join(dataDir, subdir);
  try {
    await mkdir(target, { recursive: true });
    await access(target, fsConstants.W_OK);
    return {
      name: `Permissions: ${subdir}`,
      passed: true,
      severity: "info",
      message: `${target} writable`,
    };
  } catch (e) {
    return {
      name: `Permissions: ${subdir}`,
      passed: false,
      severity: "error",
      message: `Cannot write to ${target}: ${String(e)}`,
      fix: `Ensure ${target} exists and is writable.`,
    };
  }
}

function checkProviderConfig(llmConfig: LLMConfig): StartupCheck[] {
  const checks: StartupCheck[] = [];
  const providers = Object.keys(llmConfig.providers ?? {}).sort();
  const defaultProvider = llmConfig.defaults.provider;

  if (providers.length === 0) {
    checks.push({
      name: "Provider config",
      passed: false,
      severity: "error",
      message: "No LLM providers configured.",
      fix: "Configure at least one provider in LLM config or environment.",
    });
    return checks;
  }

  checks.push({
    name: "Provider config",
    passed: true,
    severity: "info",
    message: `Default provider ${defaultProvider}; configured: ${providers.join(", ")}`,
  });

  if (!llmConfig.providers[defaultProvider]) {
    checks.push({
      name: "Default provider",
      passed: false,
      severity: "error",
      message: `Default provider '${defaultProvider}' is not configured.`,
      fix: "Align defaults.provider with a configured provider entry.",
    });
  }

  const cloudProviders = providers.filter((provider) => !isLocalProvider(provider));
  const readyCloudProviders = cloudProviders.filter((provider) => hasProviderCredential(provider, llmConfig.providers[provider]));
  for (const provider of cloudProviders) {
    const ready = hasProviderCredential(provider, llmConfig.providers[provider]);
    checks.push({
      name: `${providerDisplayName(provider)} credentials`,
      passed: ready,
      severity: ready ? "info" : provider === defaultProvider ? "error" : "warning",
      message: ready
        ? credentialSourceMessage(provider, llmConfig.providers[provider])
        : `Missing ${requiredCredentialHint(provider)}`,
      fix: ready ? undefined : `Set ${requiredCredentialHint(provider)} or remove unused provider '${provider}'.`,
    });
  }

  checks.push({
    name: "Cloud fallback",
    passed: readyCloudProviders.length > 0,
    severity: readyCloudProviders.length > 0 ? "info" : "warning",
    message: readyCloudProviders.length > 0
      ? `Available: ${readyCloudProviders.join(", ")}`
      : cloudProviders.length > 0
        ? `Configured but not ready: ${cloudProviders.join(", ")}`
        : "No cloud fallback configured.",
    fix: readyCloudProviders.length > 0
      ? undefined
      : "Set ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY for fallback.",
  });

  return checks;
}

async function checkLocalProvider(
  llmConfig: LLMConfig,
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): Promise<StartupCheck[]> {
  const checks: StartupCheck[] = [];
  const localProvider =
    llmConfig.providers.local
    ?? llmConfig.providers.ollama
    ?? null;
  if (!localProvider) return checks;
  const hasCloudFallback = listReadyCloudProviders(llmConfig).length > 0;

  const defaultModel =
    llmConfig.defaults.model
    ?? localProvider.defaultModel
    ?? settings.llmModel
    ?? "llama3.2";
  const configuredBase =
    typeof localProvider.apiBase === "string" && localProvider.apiBase
      ? localProvider.apiBase
      : DEFAULT_OLLAMA_BASE_URL;
  const baseUrl = normalizeOllamaBaseUrl(configuredBase);
  const wslLoopback = isWslEnvironment() && isLoopbackBaseUrl(baseUrl);

  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      checks.push({
        name: "Ollama server",
        passed: false,
        severity: hasCloudFallback ? "warning" : "error",
        message: `Returned HTTP ${response.status} from ${baseUrl}`,
        fix: ollamaConnectionFix(baseUrl, wslLoopback),
      });
      if (wslLoopback) {
        checks.push(wslLoopbackBoundaryCheck(false, baseUrl));
      }
      return checks;
    }

    const data = await response.json() as Record<string, unknown>;
    const models = ((data.models ?? []) as Record<string, unknown>[])
      .map((model) => String(model.name ?? ""))
      .filter(Boolean);

    checks.push({
      name: "Ollama server",
      passed: true,
      severity: "info",
      message: `${baseUrl} reachable`,
    });
    if (wslLoopback) {
      checks.push(wslLoopbackBoundaryCheck(true, baseUrl));
    }

    if (models.length === 0) {
      checks.push({
        name: "Ollama models",
        passed: false,
        severity: "warning",
        message: "No local models pulled.",
        fix: `Run \`ollama pull ${defaultModel}\`.`,
      });
      return checks;
    }

    const normalized = new Set(models.flatMap((model) => [model, model.split(":")[0] ?? model]));
    const hasConfiguredModel = normalized.has(defaultModel) || normalized.has(defaultModel.split(":")[0] ?? defaultModel);
    checks.push({
      name: "Ollama models",
      passed: hasConfiguredModel,
      severity: hasConfiguredModel ? "info" : "warning",
      message: hasConfiguredModel
        ? `${defaultModel} available`
        : `${defaultModel} missing; found ${models.slice(0, 5).join(", ")}`,
      fix: hasConfiguredModel ? undefined : `Run \`ollama pull ${defaultModel}\`.`,
    });
  } catch (e) {
    checks.push({
      name: "Ollama server",
      passed: false,
      severity: hasCloudFallback ? "warning" : "error",
      message: `Cannot connect to ${baseUrl}: ${String(e)}`,
      fix: ollamaConnectionFix(baseUrl, wslLoopback),
    });
    if (wslLoopback) {
      checks.push(wslLoopbackBoundaryCheck(false, baseUrl));
    }
  }

  return checks;
}

async function checkDefaultCloudProvider(
  llmConfig: LLMConfig,
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): Promise<StartupCheck[]> {
  const defaultProviderName = llmConfig.defaults.provider;
  if (isLocalProvider(defaultProviderName)) return [];

  const providerConfig = llmConfig.providers[defaultProviderName];
  if (!providerConfig || !hasProviderCredential(defaultProviderName, providerConfig)) {
    return [];
  }

  const endpoint = providerProbeEndpoint(defaultProviderName, providerConfig);
  const headers = providerProbeHeaders(defaultProviderName, providerConfig);
  if (!endpoint || !headers) {
    return [];
  }

  try {
    const response = await fetchImpl(endpoint, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return [{
        name: `${providerDisplayName(defaultProviderName)} connectivity`,
        passed: true,
        severity: "info",
        message: `${defaultProviderName} API reachable`,
      }];
    }

    const severity = Object.keys(llmConfig.providers).length > 1 ? "warning" : "error";
    const fix = response.status === 401 || response.status === 403
      ? `Check ${requiredCredentialHint(defaultProviderName)} and provider account access.`
      : `Verify ${defaultProviderName} network reachability and API base configuration.`;
    return [{
      name: `${providerDisplayName(defaultProviderName)} connectivity`,
      passed: false,
      severity,
      message: `HTTP ${response.status} from ${defaultProviderName} API`,
      fix,
    }];
  } catch (e) {
    return [{
      name: `${providerDisplayName(defaultProviderName)} connectivity`,
      passed: false,
      severity: Object.keys(llmConfig.providers).length > 1 ? "warning" : "error",
      message: `Cannot reach ${defaultProviderName} API: ${String(e)}`,
      fix: `Check network access and ${defaultProviderName} API base settings.`,
    }];
  }
}

async function checkPortAvailability(port: number): Promise<StartupCheck> {
  return await new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolveCheck({
          name: "Port availability",
          passed: false,
          severity: "warning",
          message: `Port ${port} is already in use.`,
          fix: `Set COLONY_PORT to a different port or stop process using ${port}.`,
        });
        return;
      }
      resolveCheck({
        name: "Port availability",
        passed: true,
        severity: "info",
        message: `Port ${port} (check skipped: ${error.code ?? "unknown"})`,
      });
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resolveCheck({
          name: "Port availability",
          passed: true,
          severity: "info",
          message: port === 0 ? "Ephemeral port available" : `Port ${port} is free`,
        });
      });
    });
  });
}

function normalizeOllamaBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

function isWslEnvironment(): boolean {
  return Boolean(process.env.WSL_DISTRO_NAME) || Boolean(process.env.WSL_INTEROP);
}

function isLoopbackBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  }
}

function ollamaConnectionFix(baseUrl: string, wslLoopback: boolean): string {
  if (wslLoopback) {
    return (
      `WSL loopback ${baseUrl} only reaches Ollama inside WSL or a forwarded localhost port. ` +
      "Start Ollama inside WSL, enable localhost forwarding, or set COLONY_OLLAMA_BASE_URL to the Windows host address."
    );
  }
  return "Install/start Ollama or configure cloud fallback.";
}

function wslLoopbackBoundaryCheck(reachable: boolean, baseUrl: string): StartupCheck {
  return {
    name: "WSL local-provider boundary",
    passed: reachable,
    severity: reachable ? "info" : "warning",
    message: reachable
      ? `WSL is using loopback ${baseUrl}; this works only if Ollama runs inside WSL or localhost forwarding is active.`
      : `WSL loopback ${baseUrl} does not reach a Windows-host Ollama unless localhost forwarding is configured.`,
    fix: reachable
      ? "If Ollama moves to the Windows host, set COLONY_OLLAMA_BASE_URL to the host address."
      : "Start Ollama inside WSL, enable localhost forwarding, or set COLONY_OLLAMA_BASE_URL to the Windows host address.",
  };
}

function isLocalProvider(providerName: string): boolean {
  return ["local", "ollama"].includes(providerName);
}

function listReadyCloudProviders(llmConfig: LLMConfig): string[] {
  return Object.keys(llmConfig.providers ?? {})
    .filter((provider) => !isLocalProvider(provider))
    .filter((provider) => hasProviderCredential(provider, llmConfig.providers[provider]));
}

function hasProviderCredential(providerName: string, config: ProviderConfig | undefined): boolean {
  return resolveProviderCredential(providerName, config).value.length > 0;
}

function credentialSourceMessage(providerName: string, config: ProviderConfig | undefined): string {
  const credential = resolveProviderCredential(providerName, config);
  if (credential.source === "config") return "API key present in provider config";
  if (credential.envName) return `API key present via ${credential.envName}`;
  return `${providerDisplayName(providerName)} credentials ready`;
}

function requiredCredentialHint(providerName: string): string {
  const credential = resolveProviderCredential(providerName, undefined);
  return credential.envName ?? `${providerName}.apiKey`;
}

function resolveProviderCredential(
  providerName: string,
  config: ProviderConfig | undefined,
): { value: string; envName?: string; source: "config" | "env" | "missing" } {
  const configKey = typeof config?.apiKey === "string" ? config.apiKey : "";
  if (configKey) {
    return { value: configKey, source: "config" };
  }

  switch (providerName) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY
        ? { value: process.env.ANTHROPIC_API_KEY, envName: "ANTHROPIC_API_KEY", source: "env" }
        : { value: "", envName: "ANTHROPIC_API_KEY", source: "missing" };
    case "gemini":
      if (process.env.GEMINI_API_KEY) {
        return { value: process.env.GEMINI_API_KEY, envName: "GEMINI_API_KEY", source: "env" };
      }
      return process.env.GOOGLE_API_KEY
        ? { value: process.env.GOOGLE_API_KEY, envName: "GOOGLE_API_KEY", source: "env" }
        : { value: "", envName: "GEMINI_API_KEY or GOOGLE_API_KEY", source: "missing" };
    case "openai":
    case "openai_compatible":
      return process.env.OPENAI_API_KEY
        ? { value: process.env.OPENAI_API_KEY, envName: "OPENAI_API_KEY", source: "env" }
        : { value: "", envName: "OPENAI_API_KEY", source: "missing" };
    default:
      return { value: "", envName: `${providerName}.apiKey`, source: "missing" };
  }
}

function providerDisplayName(providerName: string): string {
  switch (providerName) {
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Gemini";
    case "openai":
    case "openai_compatible":
      return "OpenAI";
    default:
      return providerName;
  }
}

function providerProbeEndpoint(
  providerName: string,
  config: ProviderConfig,
): string | null {
  switch (providerName) {
    case "anthropic": {
      const base = String(config.apiBase ?? "https://api.anthropic.com").replace(/\/+$/, "");
      return `${base}/v1/models`;
    }
    case "gemini": {
      const base = String(config.apiBase ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
      const credential = resolveProviderCredential(providerName, config);
      return `${base}/models?key=${encodeURIComponent(credential.value)}`;
    }
    case "openai": {
      const rawBase = String(config.apiBase ?? process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/+$/, "");
      const base = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
      return `${base}/models`;
    }
    default:
      return null;
  }
}

function providerProbeHeaders(
  providerName: string,
  config: ProviderConfig,
): Record<string, string> | null {
  const credential = resolveProviderCredential(providerName, config);
  if (!credential.value) return null;

  switch (providerName) {
    case "anthropic":
      return {
        "x-api-key": credential.value,
        "anthropic-version": "2023-06-01",
      };
    case "openai":
      return {
        Authorization: `Bearer ${credential.value}`,
      };
    case "gemini":
      return {};
    default:
      return null;
  }
}
