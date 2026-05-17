import { Caste } from "../caste/enums";
import { registerBuiltinTools } from "./builtin-tools";
import { ToolPermissionChecker } from "./tool-permissions";
import { ToolExecutor, ToolRegistry, type ToolDefinition } from "./tools-registry";

export interface RuntimeTooling {
  workspaceRoot: string;
  registry: ToolRegistry;
  executor: ToolExecutor;
  activeToolIds: string[];
  permittedToolIds: string[];
  toolCategories: Map<string, string>;
}

export function resolveRuntimeWorkspaceRoot(workspaceRoot?: string | null): string {
  if (typeof workspaceRoot === "string" && workspaceRoot.trim().length > 0) {
    return workspaceRoot;
  }
  return process.cwd();
}

export function buildRuntimeTooling(
  agentId: string,
  caste: Caste | string,
  workspaceRoot?: string | null,
): RuntimeTooling {
  const resolvedWorkspaceRoot = resolveRuntimeWorkspaceRoot(workspaceRoot);
  const registry = new ToolRegistry();
  registerBuiltinTools(registry, {
    workspace: resolvedWorkspaceRoot,
    enforcePathValidation: true,
  });

  const permittedToolIds = getPermittedToolIds(registry, agentId, caste);
  const activeToolIds = permittedToolIds;
  const toolCategories = new Map<string, string>();
  for (const tool of registry.listTools()) {
    toolCategories.set(tool.toolId, deriveToolLoopCategory(tool));
  }

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    registry,
    executor: new ToolExecutor(registry),
    activeToolIds,
    permittedToolIds,
    toolCategories,
  };
}

function getPermittedToolIds(
  registry: ToolRegistry,
  agentId: string,
  caste: Caste | string,
): string[] {
  const checker = new ToolPermissionChecker();
  const permissions = checker.getEffectivePermissions(agentId, String(caste));

  return registry
    .listTools()
    .map((tool) => tool.toolId)
    .filter((toolId) => {
      if (permissions.denylist.includes(toolId)) return false;
      if (permissions.allowlist.length > 0 && !permissions.allowlist.includes(toolId)) return false;
      return true;
    })
    .sort();
}

export function deriveToolLoopCategory(tool: ToolDefinition): string {
  if (tool.metadata.concurrency === "parallel_safe") {
    if (tool.metadata.search.indexed) return "search";
    if (tool.metadata.readOnly) return tool.category === "http" ? "web" : "read";
  }
  if (tool.metadata.readOnly && tool.category === "file") return "read_exclusive";
  if (tool.metadata.readOnly && tool.category === "http") return "web_exclusive";
  if (tool.category === "file") return "write";
  if (tool.category === "http") return "web";
  return tool.category;
}
