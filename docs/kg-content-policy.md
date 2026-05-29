# Knowledge Graph Content Policy

**Scope.** This policy governs what may be stored in the Knowledge Graph (KG) of the `team-harness` system — in each developer's local KG (`~/.claude/chromadb/`) and in any export shared with the team.

**Guiding principle.** The KG is **technical memory intended to be shareable**. Everything that goes in must be useful to another developer on the team and safe to circulate between machines.

---

## Entity & Relation Types

The KG stores entities and relations. The system uses a fixed vocabulary so semantic searches stay predictable (the backend stores `entityType` and `relationType` as free-text metadata, regardless of which backend is active).

**Entity types (9).**

| Type | Meaning | Naming convention |
|---|---|---|
| `pattern` | Reusable code or architecture pattern | kebab-case, descriptive |
| `error` | Bug or failure mode + fix | kebab-case, technology-prefixed (`prisma-sqlite-...`) |
| `constraint` | Technical limitation discovered | kebab-case |
| `decision` | Key technical decision + rationale | kebab-case |
| `tool-gotcha` | Library or tool pitfall | kebab-case, technology-prefixed |
| `process-insight` | Pipeline or process learning | kebab-case |
| `project` | Repository-level inventory | bare repo name (e.g. `zippy-backoffice`) |
| `service` | Deployable inside a project | bare service name (e.g. `payment-gateway`) |
| `stack-profile` | Reusable tech-stack combination for an archetype | kebab-case, archetype-suffixed (e.g. `b2b-saas-stack`) |

**Relation types (5).**

| Type | From → To | Meaning |
|---|---|---|
| `relates_to` | any → any | Generic edge (legacy; prefer specific types when possible) |
| `belongs-to` | service → project | Service ownership |
| `calls` | service → service | Runtime cross-service IO (HTTP, RPC, queue message) |
| `uses-stack` | project → stack-profile | Project adopts a stack profile |
| `depends-on` | service → service | Build or deploy ordering (distinct from runtime `calls`) |

Anything outside this vocabulary should not be created until the policy is updated in this file.

---

## ✅ Allowed

- **Reusable code patterns** (framework conventions, recurring solutions).
- **Gotchas and pitfalls** of libraries, runtimes, or tools (`pnpm`, `Supabase`, `shadcn`, `Drizzle`, etc.).
- **Architectural decisions** with technical rationale (why X over Y, with observed technical constraints).
- **Technical inventories** of a project (service listings, ports, public endpoints, folder structure).
- **Useful commands** specific to a stack (builds, migrations, debugging).
- **Technical conventions** of a project (naming, layout, testing).

## ❌ Forbidden

- **Personal data**: person names (including the developer's own), roles, responsibilities, personal preferences.
- **Personalized feedback**: instructions directed at a specific user ("Mario prefers that…").
- **Credentials and secrets**: tokens, API keys, URLs of private services, internal IPs, absolute paths with user names (`C:/Users/<name>/...`, `/mnt/c/Users/<name>/...`, `/home/<name>/...`).
- **Client / stakeholder data**: client company names, contacts, agreements, contractual information.
- **Volatile temporal references**: ticket numbers, specific PR numbers, issue numbers, commit SHAs longer than 7 chars, incidents tied to in-flight releases. Describe the change by date + capability instead (e.g. "2026-04 currency-per-country migration in backoffice").
- **Organizational information**: hierarchy, internal policies, non-technical discussions.

### Concrete examples seen in past violations

| What appeared in the KG | Why it is forbidden | Fix |
|---|---|---|
| `Path: C:/Users/<name>/zippy/merchants. Versión: 1.3.1.` | Absolute path with user identifier; not portable. | `Repo: zippy-merchants. Versión: 1.3.1.` |
| `Merge order: #52 -> Apigee re-sync -> #323 -> #53 -> Apigee re-sync -> rebase + #324.` | Volatile PR numbers that mean nothing once the PRs are gone. | `Order: deploy commission-service first, then re-sync Apigee, then ship the dependent backoffice change, then rebase the follow-up.` |
| `mario-user-profile` — entity describing "developer fullstack, active projects: …" | Personal profile of an individual developer. | Drop the entity entirely; the KG is not a CRM. |
| `[pattern] zippy-nest-template — Path: C:/Users/<name>/zippy/nest-template.` | Embedded user path inside a reusable pattern. | `[pattern] zippy-nest-template — Bare-repo NestJS template used by every Zippy backend service.` |

## ⚠️ Gray area — requires judgment

- **Business inventories**: internal services described by technical function (OK) vs. described by their relationship to clients or regulation (not OK).
- **Project names**: public or open-source names (OK) vs. confidential internal products (not OK).
- **Metrics**: performance / throughput without business context (OK) vs. revenue, users, KPIs (not OK).

When in doubt, the agent must **omit**. Adding content later is cheap; extracting it from an already-distributed KG is expensive.

---

## 🕓 Volatility avoidance (forbidden — added 2026-05-21)

Observations rot when they encode "current state" without a date anchor. A reader six months later cannot tell whether "currently a template only" is still true. The following volatile constructions are **forbidden**:

| Forbidden phrasing | Why it rots | Fix |
|---|---|---|
| `currently a template only` | "currently" has no date — meaning shifts with time | `As of 2026-05-18, the repo is a template only with the fictional acme-pay demo` |
| `recently renamed from X` | "recently" anchors to write time, not read time | `Renamed from X to Y on 2026-05-18` |
| `as of writing` / `at the time of writing` | self-referential to a moment no reader knows | `As of 2026-05-18, ...` |
| `latest version` / `current version` of a library | the version shifts faster than the observation | `Pinned to v5.2.0 (2026-04, see go.mod)` |
| `last updated 6 months ago` | the math is wrong the moment you read it | drop the relative time, or write `last updated 2025-11-21` |
| `temporarily authorized` / `for now` / `until further notice` | scope is anchored to an undefined "now" | `Authorized 2026-05-18 through next major release; revisit after first real PSP integration ships` |
| `roadmap item — to be done next` | no completion date; gets stale | drop the line, or write `Planned: <YYYY-MM>; cancelled if not started by <YYYY-MM>` |

**Rule:** every claim about state, version, or scope MUST carry an explicit date (YYYY-MM-DD or YYYY-MM precision is fine). If you cannot date-anchor a claim, it is too fuzzy to persist — rewrite it as a stable invariant or drop it.

**Example seen in current KG** (`providers-bridge`, 2026-05-18):
- ❌ `Current state (2026-05-18): single-adapter template.` — borderline; the date is there but "current state" implies the reader should re-derive freshness.
- ✅ `As of 2026-05-18, the repo is a single-adapter template; the 23 prior PSP adapters were removed in the same week.` — same fact, explicit anchor.

---

## 👥 Multi-tenant additions (added 2026-05-21)

When the MCP backend serves >1 developer, the content-policy stakes change. The guiding principle remains "technical memory shareable across the team", but new failure modes appear:

### Forbidden in multi-tenant mode

- **Team-member handles as primary entities.** No `dev-john-permissions-cheat-sheet`, no `@mario-mcp-token-format`. Personal context belongs in the developer's own notes, not the shared KG. (Existing forbidden rule on "Personal data" already covers names — this restates it for clarity at the entity-name level.)
- **Preferences without technical rationale.** Bad: `team-prefers-tabs-over-spaces`. Good: `tabs-required-by-eslint-config (zippy-payments — `.editorconfig` v0.3+ enforces).` The first encodes taste; the second cites enforcement.
- **Vendor account names / tenant IDs / customer-specific configurations.** Even if "the technical pattern is reusable", account-specific configs leak who-uses-what.

### Required in multi-tenant mode

- **Author attribution on `[decision]` nodes.** Decisions are the highest-stakes type — readers need to know whose call it was. Promote `Decided by: <author-or-team>, <date>` to a required observation on every `[decision]` entry. The `session_start` / `session_end` tools provide the author proxy via `session_id`; orchestrator Phase 6 attaches the session_id to the `create_nodes` call.
- **Project tag on every node.** The MCP's `project` field on nodes (set via `mark_superseded.project` etc.) becomes the namespace for multi-tenant scoping. Single-operator KG can leave it at `global`; team KG must set it explicitly. Recommendation: use the bare repo slug (e.g., `zippy-payments`, `team-harness`, `context-harness-mcp`). Cross-cutting constraints (PR-hygiene, branching conventions) stay at `global`.

### When in doubt — split the deployment

If a developer's work spans contexts that should not cross-leak (e.g., a personal side project + an employer's codebase), the cheapest fix is not policy — it is **two MCP deployments**. The bearer token + URL in `~/.claude.json` is the access boundary; provisioning a second `context-harness-mcp` instance and pointing the corporate workspace at it eliminates cross-context bleed at the storage layer. This is the recommended approach for any operator handling >1 employer or >1 trust boundary.

---

## How the policy is applied

- **At write time**: the `orchestrator` (and any agent that persists to the KG) must filter content against this policy before calling `create_entities` / `add_observations`. If an observation falls in the forbidden zone, it is omitted silently; if it falls in the gray zone, it is omitted by default. Write-time filter coverage spans three sites: Phase 6 (Knowledge Save), delivery Step 11.5 (passive process-insight capture), and `KG-write-on-security-findings` (Phase 3 — orchestrator writes Critical/High security findings from `security`'s `kg_save_candidates`). All three are governed by this policy; the filter logic is the same at each site.
- **On export**: `export.py` trusts that the local KG already complies — it performs no curation of its own.
- **On import**: `import.py` trusts that the source file already complies — no filtering either.

The filter lives **in one place only**: at write time.

## What to do when a violation is detected

- **In your KG**: delete the offending entity / observation directly against the MCP backend. For `context-harness-mcp`: open the public viewer at `<your-mcp-url>/viewer/`, or run admin SQL via the underlying Postgres (soft-delete via `UPDATE nodes SET deleted_at = now() WHERE name = '...'`).
- **In an agent's prompt**: open a PR adjusting the agent's prompt to comply.

## Language convention

All KG content is written in **English**, regardless of the conversation language. This aligns with the system's existing convention and makes sharing across teams easier.

---

## Status

**Version**: 0.1 (initial draft, 2026-04-22).

**Implementation status**:
- ✅ Filter wired into `orchestrator.md` Phase 6 (Knowledge Save).
- ✅ Backend-agnostic — applies to any MCP server registered as `mcpServers.memory`. For `context-harness-mcp`: the server-side `internal/validate/` Content Filter enforces a subset (size + secrets + taxonomy) at write time as defense-in-depth.

This policy is **normative for humans and agents**. The orchestrator's filter is the first line of defense at write time.
