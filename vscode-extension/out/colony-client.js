"use strict";
// Thin client for the Colony daemon REST API.
//
// Wraps the v1 endpoints shipped in src/daemon/web-ui.ts:
//   GET    /api/v1/health
//   GET    /api/v1/sessions
//   POST   /api/v1/sessions
//   GET    /api/v1/swarm/runs
//   POST   /api/v1/swarm/runs
//   GET    /api/v1/swarm/runs/:id
//   POST   /api/v1/swarm/runs/:id/cancel
//   POST   /api/v1/diffs/preview
//   GET    /api/v1/mcp/servers
//
// Transport: global `fetch`. No axios / node-fetch — matches Colony's
// "no vendor SDKs in production paths" rule.
//
// Auth: bearer token from VS Code's SecretStorage (managed by extension.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColonyClient = exports.ColonyDaemonUnreachableError = exports.ColonyDaemonError = void 0;
exports.askColony = askColony;
const DEFAULT_DAEMON_URL = "http://127.0.0.1:7878";
// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
class ColonyDaemonError extends Error {
    status;
    endpoint;
    constructor(message, opts) {
        super(message);
        this.name = "ColonyDaemonError";
        this.status = opts.status ?? null;
        this.endpoint = opts.endpoint;
    }
}
exports.ColonyDaemonError = ColonyDaemonError;
class ColonyDaemonUnreachableError extends ColonyDaemonError {
    constructor(endpoint, cause) {
        super(`Colony daemon not reachable at ${endpoint}. Start it with: bun run scripts/start-daemon.ts`, { endpoint });
        this.name = "ColonyDaemonUnreachableError";
        this.cause = cause;
    }
}
exports.ColonyDaemonUnreachableError = ColonyDaemonUnreachableError;
class ColonyClient {
    _baseUrl;
    _getBearerToken;
    _fetch;
    constructor(options = {}) {
        this._baseUrl = (options.daemonUrl ?? DEFAULT_DAEMON_URL).replace(/\/+$/, "");
        this._getBearerToken = options.getBearerToken ?? (async () => undefined);
        this._fetch = options.fetchImpl ?? fetch;
    }
    get baseUrl() {
        return this._baseUrl;
    }
    async health() {
        return await this._get("/api/v1/health");
    }
    async listSwarmRuns() {
        const data = await this._get("/api/v1/swarm/runs");
        return data.runs ?? [];
    }
    async inspectSwarmRun(runId) {
        const data = await this._get(`/api/v1/swarm/runs/${encodeURIComponent(runId)}`);
        return data.run;
    }
    async startSwarmRun(input) {
        const data = await this._post("/api/v1/swarm/runs", input);
        return data.run;
    }
    async cancelSwarmRun(runId, reason) {
        const data = await this._post(`/api/v1/swarm/runs/${encodeURIComponent(runId)}/cancel`, { reason });
        return data.run;
    }
    async previewDiff(input) {
        const data = await this._post("/api/v1/diffs/preview", input);
        return data.diff;
    }
    async listMcpServers() {
        const data = await this._get("/api/v1/mcp/servers");
        return data.servers ?? [];
    }
    // -------------------------------------------------------------------------
    async _get(path) {
        return await this._request(path, { method: "GET" });
    }
    async _post(path, body) {
        return await this._request(path, {
            method: "POST",
            body: JSON.stringify(body ?? {}),
            headers: { "content-type": "application/json" },
        });
    }
    async _request(path, init) {
        const url = `${this._baseUrl}${path}`;
        const token = await this._getBearerToken();
        const headers = {
            accept: "application/json",
            ...(init.headers ?? {}),
        };
        if (token)
            headers.authorization = `Bearer ${token}`;
        let response;
        try {
            response = await this._fetch(url, { ...init, headers });
        }
        catch (err) {
            if (isConnectionError(err)) {
                throw new ColonyDaemonUnreachableError(this._baseUrl, err);
            }
            throw new ColonyDaemonError(`Request to ${path} failed: ${err instanceof Error ? err.message : String(err)}`, { endpoint: url });
        }
        if (!response.ok) {
            let detail = "";
            try {
                const errBody = (await response.json());
                detail = errBody.error ?? "";
            }
            catch {
                // ignore
            }
            throw new ColonyDaemonError(`HTTP ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`, { status: response.status, endpoint: url });
        }
        return (await response.json());
    }
}
exports.ColonyClient = ColonyClient;
async function askColony(options) {
    const client = new ColonyClient({
        daemonUrl: options.daemonUrl,
        getBearerToken: options.getBearerToken,
    });
    try {
        const run = await client.startSwarmRun({
            objective: options.prompt,
            title: "VS Code: Ask About Selection",
            detached: true,
        });
        options.onChunk([
            `Swarm run started: ${run.runId}`,
            `Status: ${run.status}`,
            ``,
            `Poll for progress with: "Colony: List Swarm Runs"`,
        ].join("\n"));
    }
    catch (err) {
        if (err instanceof ColonyDaemonUnreachableError) {
            options.onChunk(`Colony daemon not running at ${err.endpoint}.\n` +
                "Start it with: bun run scripts/start-daemon.ts\n" +
                "Or use: Colony: New Session In Terminal");
            return;
        }
        throw err;
    }
}
function isConnectionError(err) {
    if (!(err instanceof Error))
        return false;
    const code = err.code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNRESET") {
        return true;
    }
    const cause = err.cause;
    if (cause && typeof cause === "object") {
        const causeCode = cause.code;
        if (causeCode === "ECONNREFUSED" || causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN" || causeCode === "ECONNRESET") {
            return true;
        }
    }
    return err.name === "TypeError" && /fetch failed/i.test(err.message);
}
//# sourceMappingURL=colony-client.js.map