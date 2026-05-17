import type { WorkflowDefinition, WorkflowValidationResult } from "./types";

export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();

  if (!definition.id.trim()) errors.push("Workflow id is required");
  if (!definition.title.trim()) errors.push("Workflow title is required");
  if (definition.steps.length === 0) errors.push("Workflow must contain at least one step");

  for (const step of definition.steps) {
    if (!step.id.trim()) errors.push("Workflow step id is required");
    if (!step.title.trim()) errors.push(`Workflow step ${step.id || "<missing>"} title is required`);
    if (ids.has(step.id)) duplicateIds.add(step.id);
    ids.add(step.id);
    if (step.maxAttempts != null && (!Number.isInteger(step.maxAttempts) || step.maxAttempts < 1)) {
      errors.push(`Step ${step.id} maxAttempts must be a positive integer`);
    }
  }

  for (const id of duplicateIds) {
    errors.push(`Duplicate step id: ${id}`);
  }

  for (const step of definition.steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        errors.push(`Step ${step.id} depends on unknown step: ${dependency}`);
      }
      if (dependency === step.id) {
        errors.push(`Step ${step.id} cannot depend on itself`);
      }
    }
  }

  const order = topologicalOrder(definition, errors);
  return { ok: errors.length === 0, errors, order: errors.length === 0 ? order : [] };
}

function topologicalOrder(definition: WorkflowDefinition, errors: string[]): string[] {
  const stepsById = new Map(definition.steps.map((step) => [step.id, step]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of definition.steps) {
    indegree.set(step.id, 0);
    dependents.set(step.id, []);
  }

  for (const step of definition.steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!stepsById.has(dependency)) continue;
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
      dependents.get(dependency)?.push(step.id);
    }
  }

  const sourceIndex = new Map(definition.steps.map((step, index) => [step.id, index]));
  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort((left, right) => (sourceIndex.get(left) ?? 0) - (sourceIndex.get(right) ?? 0));
  const order: string[] = [];

  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);

    const nextIds = dependents.get(id) ?? [];
    for (const nextId of nextIds) {
      const count = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, count);
      if (count === 0) {
        ready.push(nextId);
        ready.sort((left, right) => (sourceIndex.get(left) ?? 0) - (sourceIndex.get(right) ?? 0));
      }
    }
  }

  if (order.length !== definition.steps.length && !errors.some((error) => error.includes("unknown step"))) {
    errors.push("Workflow DAG contains a cycle");
  }

  return order;
}
