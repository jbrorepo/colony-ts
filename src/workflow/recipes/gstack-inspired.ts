export type WorkflowRecipeStepKind =
  | "task"
  | "approval_checkpoint"
  | "host_handoff"
  | "verification"
  | "artifact";

export interface WorkflowRecipeStep {
  id: string;
  title: string;
  kind: WorkflowRecipeStepKind;
  description: string;
}

export interface WorkflowRecipeDescriptor {
  id: string;
  title: string;
  status: "descriptor_only";
  priority: number;
  riskyActionsDefaultLive: false;
  summary: string;
  approvalCheckpoints: string[];
  verification: string[];
  steps: WorkflowRecipeStep[];
}

const RECIPES: WorkflowRecipeDescriptor[] = [
  recipe("review", "Review", 1, "Inspect code changes, identify risks, and produce review findings."),
  recipe("qa", "QA", 2, "Run focused verification and summarize behavioral confidence."),
  recipe("ship", "Ship", 3, "Prepare release evidence, build artifacts, and approval handoffs."),
  recipe("investigate", "Investigate", 4, "Gather bounded evidence for a bug, incident, or regression."),
  recipe("document-release", "Document Release", 5, "Refresh operator-facing release notes and claim-safety docs."),
];

export function listWorkflowRecipes(): WorkflowRecipeDescriptor[] {
  return RECIPES.map(cloneRecipe).sort((left, right) => left.priority - right.priority);
}

export function getWorkflowRecipe(id: string): WorkflowRecipeDescriptor | null {
  const normalized = id.trim().toLowerCase();
  const recipe = RECIPES.find((candidate) => candidate.id === normalized);
  return recipe ? cloneRecipe(recipe) : null;
}

function recipe(id: string, title: string, priority: number, summary: string): WorkflowRecipeDescriptor {
  return {
    id,
    title,
    status: "descriptor_only",
    priority,
    riskyActionsDefaultLive: false,
    summary,
    approvalCheckpoints: [
      "Before host mutation",
      "Before external publication",
      "Before credential-dependent action",
    ],
    verification: ["focused phase verifier", "tsc --noEmit", "verify:all when batched"],
    steps: [
      { id: `${id}:scope`, title: "Scope", kind: "task", description: "Resolve objective, repo state, and required evidence." },
      { id: `${id}:approval`, title: "Approval", kind: "approval_checkpoint", description: "Pause before risky host-owned or mutating work." },
      { id: `${id}:handoff`, title: "Host handoff", kind: "host_handoff", description: "Describe external work without executing it by default." },
      { id: `${id}:verify`, title: "Verify", kind: "verification", description: "Run recipe-specific checks and record evidence." },
      { id: `${id}:artifact`, title: "Artifact", kind: "artifact", description: "Produce bounded summary output for the operator." },
    ],
  };
}

function cloneRecipe(recipe: WorkflowRecipeDescriptor): WorkflowRecipeDescriptor {
  return {
    ...recipe,
    approvalCheckpoints: [...recipe.approvalCheckpoints],
    verification: [...recipe.verification],
    steps: recipe.steps.map((step) => ({ ...step })),
  };
}
