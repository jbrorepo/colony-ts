# The Colony Method Framework Bible

> A portable agent operating methodology for implementing The Colony's caste,
> approval, workflow, memory, and Antelligence design principles in Microsoft
> Agent Framework or any comparable multi-agent framework.

## 1. Purpose

This document is a copy-adapted version of The Colony Bible. It is intended for
another AI or engineering team that needs to implement the Colony methodology as
a reusable framework, especially inside Microsoft Agent Framework.

The goal is not to clone The Colony product. The goal is to preserve the method:

- separate agents with specialized responsibilities;
- explicit workflow graphs connecting those agents;
- conservative approval gates before risky action;
- exact transcript truth separated from summaries;
- evidence-backed decisions;
- secure tool and MCP governance;
- Antelligence as the operating model for discovery, delivery, quality, and
  scaling.

Microsoft Agent Framework is currently a public preview platform. Treat concrete
API names as implementation details that may change. Treat the architectural
mapping in this document as the durable part.

## 2. Adaptation Rules

Any implementation that claims to follow the Colony Method must obey these
rules:

1. The caste system must be implemented as distinct agents, not only as prompt
   labels.
2. Workflows must define the allowed execution paths between agents.
3. Risky actions must pass through approval gates before execution.
4. Mutating tools must be governed more strictly than read-only tools.
5. Tool calls, agent decisions, workflow state, and approvals must be auditable.
6. Canonical transcript truth must remain separate from derived summaries,
   embeddings, memories, or compacted notes.
7. Parallelism is allowed only when tasks are independent and permissions allow
   it.
8. Human review must be required for irreversible, high-risk, ambiguous, or
   policy-sensitive action.
9. Evidence must drive gates. A gate fails when evidence is missing,
   contradictory, stale, or unsafe.
10. Summaries may guide agents, but they must never replace durable source
    truth.

## 3. Core Philosophy

The Colony Method exists to bridge fast AI execution and operational
reliability. A single unconstrained agent can be useful, but it is difficult to
govern. The Colony Method replaces the monolithic agent with a structured
superorganism:

- specialized agents hold different duties and trust levels;
- workflows define how work moves;
- gates prevent unsafe shortcuts;
- memory preserves both exact records and useful abstractions;
- observability keeps the human aware of what happened and why;
- Antelligence turns signals into adaptive coordination.

The implementation should feel like a disciplined operating system, not a chat
wrapper.

## 4. Microsoft Agent Framework Mapping

The Colony Method maps naturally onto Microsoft Agent Framework concepts.

| Colony Method Concept | Agent Framework Primitive |
| --- | --- |
| Caste | Individual specialized agent |
| Swarm | Concurrent or magentic multi-agent orchestration |
| Pheromone routing | Conditional workflow edges and routing executors |
| Champion gates | Workflow executors plus middleware checks |
| Human approval | Human-in-the-loop request and response flow |
| Tool permission checker | Function calling middleware |
| Security mesh | Agent run middleware, function middleware, and chat client middleware |
| MemPalace | Context providers, session state, persistence, and external stores |
| Exact transcript truth | Agent session history and append-only audit log |
| Derived memories | Context provider summaries, retrieval indexes, and notes |
| Tool registry | Agent tools and MCP clients |
| Agent loop | Agent run plus workflow execution cycle |
| Cost and provenance ledger | Ledger agent plus middleware telemetry |
| Ant Farm transparency | Streaming workflow events and operator UI |
| Release gates | Workflow checkpoints and evidence-based approval executors |

Use agents when the model may decide how to perform a bounded role. Use
workflows when the system must control order, branching, approval, parallelism,
checkpointing, or recovery.

## 5. The 12-Caste Agent System

The caste system is the heart of the method. In Microsoft Agent Framework, each
caste should be implemented as a distinct agent with its own instructions,
tools, memory scope, middleware policy, and workflow position.

The current method names are canonical for public and operator-facing language:
Queen, Eldest, Assist-Ant, Command-ant, Vigil-ant, Develop-ant, Logist-ant,
Consult-ant, Inform-ant, Cogniz-ant, Account-ant, and Oper-ant. Older Python
runtime names remain compatibility aliases for persisted session state and
migration, not preferred display language.

Compatibility aliases:

| Legacy runtime value | Canonical method caste |
| --- | --- |
| `root_queen` | Queen |
| `eldest_architect` | Eldest |
| `assist_ant` | Assist-Ant |
| `shield_generals` | Vigil-ant |
| `forge_carvers` | Develop-ant |
| `core_shapers` | Logist-ant |
| `watcher_swarm` | Consult-ant |
| `liaison_ants` | Inform-ant |
| `lore_burrow` | Cogniz-ant |
| `ledger_ants` | Account-ant |
| `nameless_swarm` | Oper-ant |

### 5.1 Queen

Role: sovereign coordinator and final authority.

Responsibilities:

- accept or reject final plans and outputs;
- resolve conflicting caste recommendations;
- authorize high-risk transitions;
- define system-level priorities;
- terminate unsafe or unproductive workflow runs.

Trust level: highest, but still auditable. The Queen may approve broad
action, but should not silently bypass security middleware.

Recommended tools:

- workflow control;
- audit inspection;
- cost and state summaries;
- approval decision tools;
- final response or dispatch tools.

### 5.2 Eldest

Role: planner, decomposer, and scope controller.

Responsibilities:

- turn user intent into bounded plans;
- identify required castes;
- define workflow paths;
- split large work into reversible slices;
- declare assumptions, constraints, risks, and acceptance criteria.

Trust level: broad reasoning authority, limited direct mutation authority.

Recommended workflow position:

- after Assist-Ant intake;
- before Vigil-ant gate;
- before Develop-ant execution.

### 5.3 Assist-Ant

Role: user-facing intake and translation agent.

Responsibilities:

- receive user intent;
- clarify goals when needed;
- translate informal requests into structured task briefs;
- keep the user informed;
- preserve user-facing tone and context.

Trust level: low mutation authority. Assist-Ant should not execute risky tools.

Recommended workflow position:

- entry point for most human requests;
- final explanation path after Queen approval.

### 5.4 Command-ant

Role: workflow command, routing, and coordination agent.

Responsibilities:

- translate approved plans into workflow steps;
- route work to the correct caste without executing it directly;
- coordinate fanout briefs and aggregation requests;
- keep mutation paused until human approval and Vigil-ant clearance exist;
- preserve narrow task boundaries for Oper-ant workers.

Trust level: planning and command authority only. Command-ant should not mutate
files, run shell commands, or bypass approval gates by default.

Recommended workflow position:

- after Eldest planning;
- before Vigil-ant policy classification;
- before swarm fanout coordination.

### 5.5 Vigil-ant

Role: security, policy, and approval enforcement agents.

Responsibilities:

- classify risk;
- validate tool calls;
- enforce security policy;
- review plans before mutation;
- require human approval when needed;
- block forbidden or ambiguous operations.

Trust level: high veto authority. Vigil-ant should be able to stop
workflow progression.

Recommended tools:

- path validation;
- command classification;
- URL and SSRF checks;
- secret scanning;
- policy catalog lookup;
- approval request tools.

### 5.6 Consult-ant

Role: observation, diagnostics, telemetry, and verification.

Responsibilities:

- inspect state without mutating it;
- collect logs, metrics, traces, and test evidence;
- monitor workflow progress;
- detect stalls, regressions, and unexpected behavior;
- report evidence to Account-ant and Queen.

Trust level: read-only by default.

Recommended orchestration:

- concurrent execution with builders when observation is independent;
- post-execution verification before release gates.

### 5.7 Develop-ant

Role: builders and implementation agents.

Responsibilities:

- produce concrete artifacts;
- make code or configuration changes after approval;
- run local implementation loops;
- fix defects found by Consult-ant or Vigil-ant.

Trust level: controlled mutation authority. Develop-ant may mutate only after
scope and tool gates pass.

Required guardrails:

- plan must be approved before mutation;
- high-risk tool calls must be intercepted;
- output must return through verification gates.

### 5.8 Logist-ant

Role: infrastructure, deployment, runtime, and operations agents.

Responsibilities:

- handle CI/CD, hosting, infrastructure, deployment, and runtime operations;
- maintain golden paths;
- reason about reliability, rollback, observability, and scaling;
- coordinate production-readiness tasks.

Trust level: high operational risk. Mutating production-like environments
requires explicit approval.

### 5.9 Inform-ant

Role: external integration and API agents.

Responsibilities:

- call external APIs;
- manage MCP client interactions;
- normalize third-party responses;
- enforce domain allowlists;
- separate read-only fetches from mutating requests.

Trust level: medium. Network access must be constrained by domain, method, and
credential policy.

### 5.10 Account-ant

Role: cost, audit, provenance, and decision accounting agents.

Responsibilities:

- track model usage and tool cost;
- preserve approval records;
- maintain artifact provenance;
- enforce budget thresholds;
- produce audit summaries;
- record workflow checkpoints.

Trust level: audit authority, not broad mutation authority.

### 5.11 Cogniz-ant

Role: memory, documentation, and knowledge circulation agents.

Responsibilities:

- store exact transcript truth;
- create derived summaries;
- maintain documentation;
- index useful memories;
- retrieve relevant context;
- mark uncertainty and source links.

Trust level: memory authority. Cogniz-ant may summarize, but cannot overwrite
canonical truth.

### 5.12 Oper-ant

Role: sandboxed parallel worker agents.

Responsibilities:

- perform bounded subtasks;
- inspect assigned material;
- produce narrow outputs;
- support map-reduce style fanout;
- return evidence, not decisions.

Trust level: lowest. Oper-ant agents should have minimal tools,
restricted context, no broad shell access, and no authority to approve or
release work.

## 6. Caste Permission Matrix

Each caste needs an explicit policy. A receiving implementation should define
permissions at least across these dimensions:

- tool access;
- shell or process access;
- file read paths;
- file write paths;
- HTTP methods;
- allowed domains;
- MCP server access;
- credential access;
- memory read scope;
- memory write scope;
- workflow transition authority;
- approval authority.

Recommended defaults:

| Caste | Read Tools | Mutating Tools | Network | Approval Authority |
| --- | --- | --- | --- | --- |
| Queen | broad | approval-bound | broad | final |
| Eldest | broad | limited | broad read | plan approval recommendation |
| Assist-Ant | limited | denied by default | limited | none |
| Command-ant | planning read | denied by default | coordination allowlist | route recommendation |
| Vigil-ant | broad inspection | policy tools only | security allowlist | veto and escalation |
| Consult-ant | read-only | denied | observability allowlist | evidence only |
| Develop-ant | scoped | approval-bound | scoped | none |
| Logist-ant | scoped | approval-bound | infra allowlist | operations recommendation |
| Inform-ant | scoped | approval-bound | integration allowlist | none |
| Account-ant | audit read | ledger append only | billing/audit allowlist | budget gate |
| Cogniz-ant | memory/doc read | memory/doc append | retrieval allowlist | memory gate |
| Oper-ant | minimal | denied | explicit allowlist only | none |

Permission resolution should be deterministic:

1. workflow gate policy;
2. human approval decision;
3. agent-specific override;
4. caste policy;
5. tool policy;
6. global default deny.

When policies conflict, the stricter policy wins unless Queen and human
approval explicitly authorize an exception.

## 7. Workflow Architecture

Workflows are the enforcement layer. Do not rely on a model to remember the
correct order. Encode the order in the graph.

### 7.1 Standard Task Workflow

Default path:

```text
Assist-Ant
  -> Eldest
  -> Command-ant
  -> Vigil-ant
  -> Account-ant
  -> Develop-ant
  -> Consult-ant
  -> Vigil-ant
  -> Cogniz-ant
  -> Queen
  -> Assist-Ant
```

Meaning:

1. Assist-Ant captures intent.
2. Eldest creates a bounded plan.
3. Command-ant translates the plan into workflow routing without mutation.
4. Vigil-ant classifies risk and policy.
5. Account-ant estimates cost and records the plan.
6. Develop-ant performs approved work.
7. Consult-ant verifies behavior and collects evidence.
8. Vigil-ant reviews resulting risk.
9. Cogniz-ant records truth and derived knowledge.
10. Queen approves final output or sends it back.
11. Assist-Ant explains the result to the user.

### 7.2 High-Risk Mutation Workflow

Use this when the task mutates files, external systems, production state,
credentials, money, user data, or irreversible resources.

```text
Assist-Ant
  -> Eldest
  -> Command-ant
  -> Vigil-ant
  -> Human Approval
  -> Account-ant
  -> Develop-ant or Logist-ant
  -> Consult-ant
  -> Vigil-ant
  -> Human Approval if residual risk remains
  -> Queen
```

The workflow must pause before mutation. Human approval should include:

- intended action;
- affected resources;
- risk classification;
- rollback path;
- expected cost;
- evidence that lower-risk alternatives were considered.

### 7.3 Parallel Swarm Workflow

Use this when independent subtasks can run safely in parallel.

```text
Command-ant
  -> Vigil-ant
  -> Oper-ant fanout
  -> Consult-ant aggregation
  -> Eldest synthesis
  -> Vigil-ant review
  -> Queen decision
```

Rules:

- each Oper-ant worker gets a narrow brief;
- each worker gets only the context required for its task;
- workers do not approve, mutate, or decide final direction;
- synthesis must cite worker outputs and uncertainty;
- conflicting outputs trigger review, not silent averaging.

### 7.4 External Integration Workflow

Use this when MCP servers, third-party APIs, webhooks, or vendor tools are
involved.

```text
Assist-Ant
  -> Eldest
  -> Inform-ant
  -> Vigil-ant
  -> Human Approval for mutating calls
  -> Inform-ant execution
  -> Account-ant audit
  -> Consult-ant verification
  -> Cogniz-ant memory
```

Rules:

- read-only calls may be parallelized when policy allows;
- mutating calls execute sequentially;
- secrets must be referenced, not exposed;
- raw responses over the configured size limit must be externalized;
- private data must be redacted before durable persistence.

## 8. Approval Gates

Approval gates are the Colony Method's strongest safety feature. They should be
implemented with workflow executors, human-in-the-loop requests, and middleware.

### 8.1 Intent Gate

Question: Is this request allowed?

Reject or escalate when:

- the goal is unsafe;
- the user intent is ambiguous;
- policy boundaries are unclear;
- the request requires credentials or private data not yet authorized.

Primary castes: Assist-Ant, Vigil-ant.

### 8.2 Scope Gate

Question: Is the task bounded enough to execute?

Reject or return to planning when:

- the plan is too broad;
- success criteria are missing;
- no rollback path exists for mutation;
- dependencies are unknown;
- the task should be decomposed first.

Primary castes: Eldest, Vigil-ant.

### 8.3 Tool Gate

Question: Is this tool call allowed for this caste, workflow, and context?

Checks:

- tool name;
- arguments;
- paths;
- network destination;
- HTTP method;
- credentials;
- expected output size;
- mutability;
- reversibility.

Primary castes: Vigil-ant, Account-ant.

Implementation point: function calling middleware.

### 8.4 Cost Gate

Question: Is this worth the budget?

Checks:

- model cost;
- tool cost;
- external API cost;
- time budget;
- retry budget;
- expected value of the action.

Primary caste: Account-ant.

### 8.5 Mutation Gate

Question: Should state change now?

Require human approval when:

- files will be overwritten;
- external systems will be changed;
- messages will be sent;
- money may move;
- credentials may be touched;
- production-like systems are involved;
- rollback is uncertain.

Primary castes: Vigil-ant, Queen, human.

### 8.6 Release Gate

Question: Is the result ready to return, deploy, publish, or persist?

Required evidence:

- tests or equivalent checks;
- security review when applicable;
- audit record;
- known limitations;
- rollback or recovery path for releases;
- human decision if risk remains.

Primary castes: Consult-ant, Vigil-ant, Account-ant, Queen.

### 8.7 Memory Gate

Question: What should be remembered, and in what form?

Rules:

- exact transcript truth is append-only;
- summaries must link back to source truth;
- sensitive data must be redacted or excluded;
- uncertainty must be marked;
- derived memory must not be treated as canonical.

Primary caste: Cogniz-ant.

## 9. Middleware Design

Middleware should enforce rules that must hold regardless of which agent is
running.

### 9.1 Agent Run Middleware

Use for:

- request classification;
- caste metadata injection;
- transcript capture;
- workflow run ID propagation;
- policy context;
- response auditing;
- cancellation and timeout checks.

### 9.2 Function Calling Middleware

Use for:

- tool permission checks;
- argument validation;
- shell command classification;
- path validation;
- SSRF prevention;
- secret redaction;
- human approval pauses;
- result size checks;
- mutation sequencing.

Function middleware is the natural home for Colony's approval structure because
it can intercept actions before execution.

### 9.3 Chat Client Middleware

Use for:

- model routing;
- cost tracking;
- request logging;
- provider failover;
- prompt redaction;
- cache policy;
- token and budget enforcement.

## 10. Antelligence Design Layer

Antelligence is the operating model that determines how the caste system should
think about product, platform, and organizational work.

### 10.1 Scouting

Scouting is discovery. Agents gather signals before committing to build.

Signals include:

- user requests;
- research notes;
- usage data;
- support tickets;
- incidents;
- security findings;
- cost data;
- operational friction;
- market or stakeholder feedback.

Primary castes: Assist-Ant, Eldest, Inform-ant, Consult-ant.

### 10.2 Trail Reinforcement

Trails are evidence paths. A request becomes more important when multiple
signals support it.

Workflow implication:

- weak evidence returns to discovery;
- strong evidence moves to planning;
- conflicting evidence triggers review;
- stale evidence decays.

Primary castes: Eldest, Account-ant, Cogniz-ant.

### 10.3 The Nest

The nest is the platform and golden path.

In implementation terms, the nest includes:

- reusable workflow templates;
- approved tool bundles;
- MCP server configurations;
- safe deployment paths;
- documentation templates;
- observability defaults;
- security policy;
- memory stores;
- operator UI.

Primary castes: Logist-ant, Cogniz-ant, Vigil-ant.

### 10.4 The Immune System

The immune system prevents harm and detects regressions.

It includes:

- approval gates;
- tests;
- security scans;
- privacy checks;
- accessibility checks;
- cost checks;
- policy validation;
- rollback plans;
- incident review.

Primary castes: Vigil-ant, Consult-ant, Account-ant.

### 10.5 Trophallaxis

Trophallaxis is knowledge circulation.

In implementation terms:

- agents must share relevant context through state and memory;
- private scratchpads should not become the only source of truth;
- summaries must cite canonical records;
- decisions should become searchable artifacts;
- post-run learning should update future retrieval.

Primary caste: Cogniz-ant.

### 10.6 Fission

Fission is controlled scaling. Do not create more agents, tools, or workflows
just because the framework allows it.

Scale when:

- a workflow is repeatable;
- gates are known;
- evidence criteria are stable;
- the current agent has too many responsibilities;
- parallelism reduces latency without reducing safety.

Do not scale when:

- the process is still unclear;
- accountability is ambiguous;
- agents duplicate each other;
- the cost of coordination exceeds the benefit.

## 11. Memory and Context Rules

The Colony Method requires two separate memory classes.

### 11.1 Canonical Truth

Canonical truth is the exact record.

Examples:

- user messages;
- assistant messages;
- tool call arguments;
- tool results;
- approval decisions;
- workflow checkpoints;
- files or artifacts produced;
- errors and retries.

Rules:

- append-only where practical;
- timestamped;
- linked to workflow run IDs;
- redacted before durable persistence when required;
- never overwritten by summaries.

### 11.2 Derived Memory

Derived memory is interpretation.

Examples:

- summaries;
- embeddings;
- extracted facts;
- task notes;
- preference memories;
- risk profiles;
- reusable lessons.

Rules:

- must reference canonical source when possible;
- must mark uncertainty;
- must be invalidated when source truth changes;
- must not include secrets;
- must be scoped to the right caste, user, tenant, and workflow.

### 11.3 Caste-Aware Memory Scope

Each caste should receive only the context it needs.

Examples:

- Assist-Ant receives user-facing history and current workflow status.
- Vigil-ant receive policy context, proposed actions, and evidence.
- Develop-ant receive scoped implementation context.
- Oper-ant receives narrow task packets.
- Cogniz-ant receives full memory management context.

Memory minimization improves safety, cost, and reasoning quality.

## 12. Tool and MCP Governance

Tools are power. MCP servers are tool bundles. Both require explicit policy.

Every tool should declare:

- name;
- description;
- owning caste or allowed castes;
- read-only or mutating classification;
- argument schema;
- risk class;
- approval requirement;
- output sensitivity;
- maximum durable result size;
- retry policy;
- rollback or compensating action where relevant.

Every MCP server should declare:

- source and trust level;
- exposed tools;
- credential requirements;
- network destinations;
- data handling rules;
- allowed workflow contexts;
- audit requirements.

Read-only tools may run in parallel when independent. Mutating tools should run
sequentially unless a specific workflow proves safe concurrency.

## 13. Execution Semantics

The receiving AI should implement a disciplined loop around workflow execution.

For each task:

1. capture user intent;
2. create a structured task brief;
3. classify risk;
4. choose workflow template;
5. route to required caste agents;
6. evaluate gates before action;
7. execute approved read-only actions in parallel where safe;
8. execute approved mutations sequentially;
9. record tool results and approvals;
10. verify outputs;
11. update memory;
12. produce a user-facing final response.

Termination conditions should be explicit:

- complete;
- blocked by missing approval;
- blocked by policy;
- blocked by insufficient evidence;
- failed verification;
- exceeded budget;
- exceeded retry limit;
- cancelled by human;
- timed out.

## 14. Verification Requirements

A Colony Method implementation is not complete because agents exist. It is
complete only when the workflows and gates are verified.

Minimum verification cases:

1. Assist-Ant can convert informal user intent into a task brief.
2. Eldest can create a bounded plan with acceptance criteria.
3. Vigil-ant can block a forbidden tool call.
4. Vigil-ant can require human approval for a risky mutation.
5. Account-ant can record cost and approval provenance.
6. Develop-ant cannot mutate before the mutation gate passes.
7. Consult-ant can verify output and report evidence.
8. Cogniz-ant can store canonical truth and derived summary separately.
9. Oper-ant workers receive restricted context and tools.
10. Parallel read-only work completes without changing state.
11. Mutating tools execute sequentially.
12. A failed gate stops the workflow.
13. Human denial stops the workflow.
14. Workflow checkpointing can resume without losing audit state.
15. Final output is approved by Queen or equivalent final authority.

## 15. Implementation Checklist

Use this checklist when adapting the method into Microsoft Agent Framework.

- [ ] Define all 11 caste agents as separate agents.
- [ ] Give each caste its own system instructions.
- [ ] Give each caste a specific tool policy.
- [ ] Create a shared caste permission matrix.
- [ ] Implement agent run middleware for run metadata and audit.
- [ ] Implement function calling middleware for tool gates.
- [ ] Implement chat client middleware for model, budget, and redaction policy.
- [ ] Define standard, high-risk, swarm, and external integration workflows.
- [ ] Add human-in-the-loop approval requests for mutation gates.
- [ ] Add checkpointing for long-running workflows.
- [ ] Add canonical transcript storage.
- [ ] Add derived memory storage with source references.
- [ ] Add tool result externalization for large outputs.
- [ ] Add read-only parallelism and mutating sequential execution.
- [ ] Add verification tests for every gate.
- [ ] Add operator-facing transparency for workflow events.
- [ ] Document all known limitations.

## 16. Anti-Patterns

Avoid these failures:

- implementing castes only as prompt text;
- letting a model choose whether approval is required;
- giving all agents the same tools;
- storing summaries as if they were exact records;
- allowing workers to approve their own output;
- allowing builders to bypass security review;
- parallelizing mutating tools by default;
- hiding tool calls from the operator;
- treating MCP servers as trusted just because they are configured;
- scaling to many agents before workflow boundaries are clear;
- treating Antelligence as branding instead of evidence-based governance.

## 17. Minimal Viable Colony Method

If the full 12-caste system is too large for the first implementation, start
with this minimum viable version while preserving the expansion path:

1. Assist-Ant for intake.
2. Eldest for planning.
3. Command-ant for workflow routing and coordination.
4. Vigil-ant for policy and approval.
5. Develop-ant for building.
6. Consult-ant for verification.
7. Cogniz-ant for memory.
8. Account-ant for audit and budget.
9. Queen for final decision.

Do not remove approval gates, memory separation, or workflow enforcement. Those
are not optional.

## 18. Source Alignment

This framework adapts The Colony Bible into a portable methodology and maps it
to current Microsoft Agent Framework concepts:

- agents for specialized LLM actors;
- tools and MCP clients for external capabilities;
- middleware for cross-cutting security, logging, validation, and control;
- workflows for graph-based orchestration;
- human-in-the-loop for approval gates;
- sessions, context providers, persistence, and checkpointing for state and
  memory.

The method should remain useful even if exact framework APIs evolve.

## 19. Final Principle

The Colony Method is not "many agents talking." It is controlled coordination:
specialized agents, explicit workflows, conservative gates, auditable memory,
and evidence-backed adaptation.

When in doubt:

1. stop the workflow;
2. state the uncertainty;
3. preserve the evidence;
4. ask for human review.
