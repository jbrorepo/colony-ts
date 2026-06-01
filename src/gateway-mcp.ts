/**
 * /mcp slash command payload builder.
 *
 * Subcommands:
 *   /mcp                — list configured servers
 *   /mcp list           — list configured servers (explicit)
 *   /mcp status         — same as list with extra health column
 *   /mcp show <id>      — inspect one server
 *   /mcp trust <id>     — mark a server as user-approved
 *   /mcp untrust <id>   — revoke approval
 *
 * Add/remove operations are deliberately routed through the REST API and
 * config file, NOT through this slash command — that path requires JSON
 * envelopes that don't fit a chat-line interface cleanly. The CLI surface
 * here is the read/inspect path.
 */

import type { GatewayBasicCommandPayload } from "./gateway-basic";
import type { McpServerEntry, McpServerRegistrySnapshot } from "./mcp/server-registry";

export interface GatewayMcpContext {
  /** Snapshot from McpServerRegistry.snapshot(). Pass null when registry is not configured. */
  registry?: McpServerRegistrySnapshot | null;
}

export function buildMcpCommandPayload(
  args: string[],
  context: GatewayMcpContext = {},
): GatewayBasicCommandPayload {
  if (!context.registry) {
    return {
      output: [
        "MCP server registry is not configured.",
        "",
        "Start the daemon with --mcp-config or call DaemonControlPlaneHost with a mcpServerRegistry option.",
      ].join("\n"),
      isError: true,
      data: { action: "mcp_unconfigured" },
    };
  }

  const command = (args[0] ?? "list").trim().toLowerCase();

  if (command === "list" || command === "" || command === "status") {
    return renderList(context.registry, command === "status");
  }
  if (command === "show") {
    const id = args[1];
    if (!id) return missingArg("/mcp show <id>");
    return renderShow(context.registry, id);
  }
  if (command === "trust") {
    const id = args[1];
    if (!id) return missingArg("/mcp trust <id>");
    return {
      output: [
        `Trust request queued for: ${safeId(id)}`,
        "",
        "Run this through the REST API to apply: POST /api/v1/mcp/servers/" + safeId(id) + "/trust",
      ].join("\n"),
      data: { action: "mcp_trust_request", serverId: safeId(id) },
    };
  }
  if (command === "untrust") {
    const id = args[1];
    if (!id) return missingArg("/mcp untrust <id>");
    return {
      output: [
        `Untrust request queued for: ${safeId(id)}`,
        "",
        "Run this through the REST API to apply: DELETE /api/v1/mcp/servers/" + safeId(id) + "/trust",
      ].join("\n"),
      data: { action: "mcp_untrust_request", serverId: safeId(id) },
    };
  }
  if (command === "help" || command === "--help" || command === "-h") {
    return renderHelp();
  }

  return {
    output: [
      `Unknown /mcp subcommand: ${command}`,
      "",
      "Usage: /mcp [list|status|show <id>|trust <id>|untrust <id>]",
      "",
      "To add a new server: POST /api/v1/mcp/servers",
      "To remove a server:  DELETE /api/v1/mcp/servers/<id>",
    ].join("\n"),
    isError: true,
    data: { action: "mcp_unknown_subcommand" },
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderList(
  snapshot: McpServerRegistrySnapshot,
  showStatus: boolean,
): GatewayBasicCommandPayload {
  if (snapshot.count === 0) {
    return {
      output: [
        "No MCP servers configured.",
        "",
        "Add one with: POST /api/v1/mcp/servers",
        snapshot.configPath ? `Config file: ${snapshot.configPath}` : "Registry is in-memory only.",
      ].join("\n"),
      data: { action: "mcp_list_empty" },
    };
  }

  const lines: string[] = [
    `MCP servers (${snapshot.count}):`,
    "",
  ];

  for (const server of snapshot.servers) {
    const trustBadge = server.trusted ? "[trusted]" : "[untrusted]";
    const kindBadge = `[${server.kind}]`;
    const statusBadge =
      showStatus && server.lastStatus
        ? ` [${server.lastStatus}]`
        : "";
    lines.push(`  ${server.id} ${kindBadge} ${trustBadge}${statusBadge}`);
    lines.push(`    ${server.description || "(no description)"}`);
    lines.push(`    endpoint: ${redactEndpoint(server.endpoint)}`);
    if (server.allowedTools.length > 0) {
      lines.push(`    allowed tools: ${server.allowedTools.slice(0, 8).join(", ")}${server.allowedTools.length > 8 ? " ..." : ""}`);
    }
    if (server.tags.length > 0) {
      lines.push(`    tags: ${server.tags.join(", ")}`);
    }
    if (showStatus && server.lastCheckedAt) {
      lines.push(`    last checked: ${server.lastCheckedAt}${server.lastError ? " (error: " + server.lastError + ")" : ""}`);
    }
    lines.push("");
  }

  lines.push("Inspect one: /mcp show <id>");

  return {
    output: lines.join("\n").trimEnd(),
    data: {
      action: "mcp_list",
      count: snapshot.count,
      serverIds: snapshot.servers.map((s) => s.id),
    },
  };
}

function renderShow(
  snapshot: McpServerRegistrySnapshot,
  rawId: string,
): GatewayBasicCommandPayload {
  const id = safeId(rawId);
  const server = snapshot.servers.find((s) => s.id === id);
  if (!server) {
    return {
      output: [
        `MCP server not found: ${id}`,
        "",
        "List configured servers: /mcp list",
      ].join("\n"),
      isError: true,
      data: { action: "mcp_show_not_found", serverId: id },
    };
  }

  return {
    output: formatServer(server),
    data: {
      action: "mcp_show",
      serverId: id,
      trusted: server.trusted,
      lastStatus: server.lastStatus ?? null,
    },
  };
}

function renderHelp(): GatewayBasicCommandPayload {
  return {
    output: [
      "MCP server registry commands",
      "",
      "  /mcp                   list configured servers",
      "  /mcp list              list configured servers (explicit)",
      "  /mcp status            list with health check status",
      "  /mcp show <id>         inspect one server",
      "  /mcp trust <id>        mark a server as user-approved",
      "  /mcp untrust <id>      revoke approval",
      "  /mcp help              show this message",
      "",
      "Mutations (add/remove) go through the REST API:",
      "  POST   /api/v1/mcp/servers            { id, kind, endpoint, ... }",
      "  DELETE /api/v1/mcp/servers/<id>",
      "  POST   /api/v1/mcp/servers/<id>/trust",
      "  DELETE /api/v1/mcp/servers/<id>/trust",
    ].join("\n"),
    data: { action: "mcp_help" },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatServer(server: McpServerEntry): string {
  const lines: string[] = [
    `MCP server: ${server.id}`,
    "",
    `Kind:        ${server.kind}`,
    `Description: ${server.description || "(none)"}`,
    `Endpoint:    ${redactEndpoint(server.endpoint)}`,
    `Trusted:     ${server.trusted ? "yes" : "no"}`,
    `Added:       ${server.addedAt}`,
  ];
  if (server.lastStatus) {
    lines.push(`Status:      ${server.lastStatus}`);
  }
  if (server.lastCheckedAt) {
    lines.push(`Checked:     ${server.lastCheckedAt}`);
  }
  if (server.lastError) {
    lines.push(`Last error:  ${server.lastError}`);
  }
  if (server.allowedTools.length > 0) {
    lines.push("");
    lines.push(`Allowed tools (${server.allowedTools.length}):`);
    for (const tool of server.allowedTools) {
      lines.push(`  - ${tool}`);
    }
  }
  if (server.tags.length > 0) {
    lines.push("");
    lines.push(`Tags: ${server.tags.join(", ")}`);
  }
  return lines.join("\n");
}

function redactEndpoint(endpoint: string): string {
  // For stdio (path), redact home directory; for http, redact auth fragments
  if (endpoint.startsWith("https://") || endpoint.startsWith("http://")) {
    try {
      const url = new URL(endpoint);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "<invalid>";
    }
  }
  return endpoint;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80) || "<invalid>";
}

function missingArg(usage: string): GatewayBasicCommandPayload {
  return {
    output: [`Missing required argument.`, "", `Usage: ${usage}`].join("\n"),
    isError: true,
    data: { action: "mcp_missing_arg" },
  };
}
