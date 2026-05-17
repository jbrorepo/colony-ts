export type GstackInspiredCapabilityStatus =
  | "planned"
  | "foundation"
  | "in_progress"
  | "shipped";

export interface GstackInspiredCapability {
  id: string;
  title: string;
  status: GstackInspiredCapabilityStatus;
  priority: number;
  rationale: string;
  colonyFit: string;
  nextSlice: string;
  guardrails: string[];
  sourceSignals: string[];
}

const CAPABILITIES: GstackInspiredCapability[] = [
  {
    id: "browser-sidecar",
    title: "Persistent Browser Sidecar",
    status: "planned",
    priority: 1,
    rationale:
      "GStack's strongest product advantage is the persistent Chromium daemon with fast command latency, refs, screenshots, logs, and scoped remote pairing.",
    colonyFit:
      "Colony should model this as an approval-gated local sidecar/plugin boundary, not as browser code inside the core AgentLoop.",
    nextSlice:
      "Add descriptor-only browser sidecar contracts and a /browser operator view that names local-only daemon, token-scope, and no-default-tunnel invariants.",
    guardrails: [
      "No default listener startup.",
      "No credential or cookie persistence in Colony core.",
      "No public tunnel without explicit high-risk approval.",
      "All page-derived output must be redacted and marked as untrusted.",
    ],
    sourceSignals: [
      "gstack browse daemon",
      "ref-based interaction",
      "dual-listener tunnel split",
      "prompt-injection browser defenses",
    ],
  },
  {
    id: "generated-skill-docs",
    title: "Generated Skill Documentation",
    status: "planned",
    priority: 2,
    rationale:
      "GStack keeps SKILL.md command references fresh by generating docs from source metadata instead of hand-maintaining command tables.",
    colonyFit:
      "Colony already has a SkillCatalog and tool definitions; generated previews can reduce drift without changing skill trust or lifecycle rules.",
    nextSlice:
      "Add pure generated-doc helpers and a /skills docs-preview view over loaded skills and active tool metadata.",
    guardrails: [
      "Preview-only until an explicit approved promotion path exists.",
      "Never execute helper scripts while generating docs.",
      "Keep source metadata and approval requirements visible.",
    ],
    sourceSignals: [
      "gstack SKILL.md.tmpl generation",
      "command registry validation",
      "host-specific frontmatter transforms",
    ],
  },
  {
    id: "workflow-recipes",
    title: "Named Workflow Recipes",
    status: "planned",
    priority: 3,
    rationale:
      "GStack's operator ergonomics come from named rituals like review, qa, ship, investigate, and document-release.",
    colonyFit:
      "Colony has stronger workflow primitives; the missing layer is productized recipes that stay honest about approvals and host handoffs.",
    nextSlice:
      "Define read-only recipe descriptors for review, qa, ship, investigate, and document-release over the existing workflow engine.",
    guardrails: [
      "No live GitHub, browser, deploy, or channel mutation by default.",
      "Risky steps must be approval checkpoints or host-owned handoffs.",
      "Recipe status must distinguish descriptor-only from executable.",
    ],
    sourceSignals: [
      "gstack /review",
      "gstack /qa",
      "gstack /ship",
      "gstack /investigate",
    ],
  },
  {
    id: "trace-to-skill",
    title: "Tool Trace To Skill Codification",
    status: "planned",
    priority: 4,
    rationale:
      "GStack's scrape/skillify loop compresses a successful exploratory browser flow into a reusable deterministic browser-skill.",
    colonyFit:
      "Colony can generalize this to approved tool traces while preserving exact transcript truth separately from derived skill artifacts.",
    nextSlice:
      "Build a pure proposal generator that extracts final-attempt tool traces and returns a reviewable skill proposal without writing files.",
    guardrails: [
      "Exact transcript text remains canonical and separate.",
      "Mutating traces require stronger approval classification.",
      "Generated proposals are inert until explicit promotion approval.",
    ],
    sourceSignals: [
      "gstack /scrape",
      "gstack /skillify",
      "browser-skills tiering",
      "atomic temp-dir promotion",
    ],
  },
  {
    id: "host-adapters",
    title: "External Host Adapter Registry",
    status: "planned",
    priority: 5,
    rationale:
      "GStack supports many coding hosts through declarative host configs and host-specific generated skill output.",
    colonyFit:
      "Colony can represent external clients and host surfaces as read-only descriptors before any installation, connector, or plugin execution path.",
    nextSlice:
      "Add read-only host descriptors for Claude Code, Codex, OpenClaw, Cursor, and generic local shell targets.",
    guardrails: [
      "No host install or file writes from descriptor views.",
      "No adapter implies trusted execution.",
      "All future activation must pass existing approval and plugin trust boundaries.",
    ],
    sourceSignals: [
      "gstack hosts/*.ts",
      "Codex/OpenClaw generation",
      "host-specific frontmatter rules",
    ],
  },
];

export function listGstackInspiredCapabilities(): GstackInspiredCapability[] {
  return CAPABILITIES
    .map(cloneCapability)
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function getGstackInspiredCapability(id: string): GstackInspiredCapability | null {
  const normalized = normalizeCapabilityId(id);
  const capability = CAPABILITIES.find((candidate) => normalizeCapabilityId(candidate.id) === normalized);
  return capability ? cloneCapability(capability) : null;
}

export function nextGstackInspiredCapability(): GstackInspiredCapability | null {
  return listGstackInspiredCapabilities().find((capability) => capability.status !== "shipped") ?? null;
}

function normalizeCapabilityId(id: string): string {
  return id.trim().toLowerCase();
}

function cloneCapability(capability: GstackInspiredCapability): GstackInspiredCapability {
  return {
    ...capability,
    guardrails: [...capability.guardrails],
    sourceSignals: [...capability.sourceSignals],
  };
}
