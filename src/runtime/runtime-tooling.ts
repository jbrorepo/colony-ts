import { Caste } from "../caste/enums";
import { registerBuiltinTools } from "./builtin-tools";
import { ToolPermissionChecker } from "./tool-permissions";
import { ToolExecutor, ToolRegistry } from "./tools-registry";

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
    toolCategories.set(tool.toolId, loopCategory(tool.toolId, tool.category));
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

function loopCategory(toolId: string, category: string): string {
  if (toolId === "file_read" || toolId === "file_list") return "read";
  if (toolId === "grep_search") return "search";
  if (category === "http") return "web";
  if (category === "file") return "write";
  return category;
}
