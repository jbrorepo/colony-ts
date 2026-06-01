# Colony vs Alternatives

Honest comparison with the agent runtimes and IDE assistants Colony is
most often weighed against. Updated 2026-05-30.

We've tried to be specific and current. If something here is wrong or
out of date, please [open an issue](https://github.com/jbrorepo/colony-ts/issues/new).

---

## TL;DR by use case

| You want… | Best fit |
|---|---|
| The most polished IDE-native autocomplete + chat | **Cursor** |
| A free, fast IDE assistant with multi-step planning | **Windsurf** |
| Open-source IDE assistant with strong VS Code presence | **Cline** or **Continue.dev** |
| Async PR-completion autonomy | **Devin** (closed) or **OpenHands** (open) |
| Git-aware terminal-based pair programmer | **Aider** |
| Anthropic's first-party reference implementation | **Claude Code** |
| **A local-first agent runtime with caste-based RBAC, default-deny, and an auditable approval flow that your security team will actually approve** | **Colony** |

---

## Feature matrix

|  | Colony | Claude Code | Cursor | Cline | Aider | Devin | OpenHands |
|---|---|---|---|---|---|---|---|
| **License** | MIT | Closed | Closed | MIT | Apache-2 | Closed | MIT |
| **Runtime** | Local | Local | Local + cloud | Local | Local | Cloud | Local + cloud |
| **Surface** | CLI + Web + VS Code | CLI + VS Code | IDE | VS Code | CLI | Web | Web + CLI |
| **Multi-provider** | ✓ 4 families | Anthropic only | ✓ | ✓ BYOK | ✓ | Anthropic | ✓ |
| **No vendor LLM SDKs** | ✓ pure fetch | (built in) | n/a | uses SDKs | uses SDK | n/a | uses SDKs |
| **Default-deny security** | ✓ | partial | ✗ | partial | partial | ✗ | partial |
| **Caste-based RBAC** | ✓ 7 castes | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Path traversal hardening** | ✓ in code + tests | ✓ | ✓ | partial | basic CWD | ✓ | ✓ |
| **Approval gates (signed)** | ✓ | ✓ | ✗ | ✓ | optional | ✓ | ✓ |
| **Audit trail (capped log)** | ✓ ring buffer | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ |
| **MCP first-class registry** | ✓ persistent + CLI + REST | ✓ stdio config | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Pluggable sandbox interface** | ✓ Host + Docker | ✗ | ✗ | ✗ | ✗ | ✓ cloud only | ✓ Docker |
| **Async / detached runs** | ✓ REST | ✓ agents | composer-style | ✗ | ✗ | ✓ end-to-end | ✓ |
| **Real-time SSE/WS** | partial (SSE stub) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Inline diff apply (IDE)** | ✗ preview only | ✓ | ✓ best-in-class | ✓ | n/a | n/a | partial |
| **Webview chat in VS Code** | ✗ planned | ✓ | ✓ | ✓ | n/a | n/a | n/a |
| **Voice input** | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **Image input** | ✗ planned | ✓ | ✓ | ✓ | ✗ | ✗ | partial |
| **Published SWE-bench Verified** | ✗ harness ready | n/a | ✗ | ✗ | ✓ (~80%) | ✓ (~70%) | ✓ (~50%) |
| **Plugin registry** | ✓ JSON + search client | ✓ skills | ✗ | partial | ✗ | ✗ | partial |
| **Self-hostable** | ✓ runs anywhere | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| **Multi-tenancy primitives** | ✓ tenant scopes | ✗ | partial | ✗ | ✗ | partial | ✓ |
| **Production REST API** | ✓ documented | ✗ SDK only | ✗ | partial | ✗ | partial | ✓ |
| **Public docs site** | ✗ Markdown in repo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Community size** | ⚠ new | very large | very large | large | medium | medium | growing |

Legend: ✓ shipped · partial = some but not all · ✗ missing · n/a = not
applicable to that product shape.

---

## Where Colony wins

1. **Security model.** No other agent runtime has caste-based RBAC,
   path validator with this coverage, signed-approval audit log, AND
   pluggable Docker sandbox in one shipped product.
2. **MCP server management.** Persistent registry + CLI + REST + trust
   lifecycle. Other tools either treat MCP as raw config files or
   don't support it at all.
3. **Multi-tenancy.** Tenant scoping is a first-class concept on every
   command. Most competitors are single-user.
4. **Pure-fetch LLM layer.** No vendor SDKs anywhere — smaller attack
   surface, easier audit, no transitive supply chain risk.
5. **Detached-by-default REST.** `POST /api/v1/swarm/runs` returns a
   `runId` immediately. Closest "Devin-style" surface in any
   open-source project.

## Where Colony loses

1. **No webview chat in VS Code yet.** The extension is functional but
   minimal compared to Cursor's Composer or Cline's task panel.
2. **No public benchmark numbers.** Harness exists, real numbers don't.
   Aider's 80% SWE-bench Verified is a much stronger sales line.
3. **No marketplace presence yet.** Not on npm. Not on VS Code
   Marketplace. Not on a docs site. Hard to discover.
4. **No SSE streaming yet for runs.** Polling works but real-time would
   be better.
5. **Community size.** New project. Discord, discussions, contributor
   base all near zero. Cursor and Aider have years of head start here.

## How we'd recommend choosing

- **You're using VS Code daily and want code completions:** Cursor or
  Windsurf. Colony is a complement, not a replacement here.
- **You want a free IDE assistant with strong tool support:** Continue.dev
  or Cline.
- **You want async tasks completing PRs while you sleep:** Devin if you
  can afford it; OpenHands if you can't.
- **You want a terminal-first git-aware pair programmer:** Aider.
- **You want Anthropic's first-party reference implementation:** Claude
  Code.
- **You're at a regulated company that needs RBAC, approval gates, full
  audit log, and the option to sandbox tool execution in Docker:**
  Colony. Nothing else combines these.
- **You're building agent infrastructure on top of an agent runtime:**
  Colony. Our REST API surface and pluggable sandbox interface are
  intentionally designed for this.

## See also

- [`README.md`](../README.md) — what Colony is
- [`documentation/security.md`](security.md) — the security model in detail
- [`COMPETITIVE_GAPS_PLAN.md`](../COMPETITIVE_GAPS_PLAN.md) — internal
  view of what we're still missing
