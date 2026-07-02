# Plan Sketches — Canonical Manifest

This document is the **single source of truth** for the deterministic plan-stage sketches
system. Three representations reference this document:

1. **This file** (`docs/plan-sketches.md`) — canonical definitions, classification schema,
   fidelity ceilings, representation ceilings, per-type applicability, and the
   sketch-vs-spec-seed reconciliation rule.
2. **`agents/architect.md`** — an agent-readable trigger→required-set table and skeleton
   templates embedded inline so the architect can emit the correct files without reading
   an arbitrary repo path mid-dispatch.
3. **`hooks/sketch-guard.sh`** — the hardcoded manifest mapping used by the gate script
   (a bash script cannot reliably parse markdown at runtime). A structural drift test in
   `tests/test_agent_structure.py` (Suite 82) asserts all three representations agree.

---

## 1. Purpose

The plan stage declares a **result-defining sketch set** — lightweight, plan-resident
documents (`sketches/{type}.md`) that show WHAT will be delivered (functional + non-functional)
so the final result is determinable before a line is implemented. The goal is **contract
determinism, not content determinism**: the same input type produces a predictable,
verifiable SET of artifacts in a fixed shape. LLM prose varies; the envelope (what exists,
what fields, what passed) is deterministic.

**Fidelity ceiling:** inside the dev pipeline, sketches are LOW-fidelity and
changed-surface-only. They are throwaway decision aids, not production polish.

**Representation ceiling (global):** token-cheap text that renders in Obsidian with zero
dependency — Mermaid / ASCII / markdown tables / fenced code. **No verbose machine-JSON
formats (Excalidraw / D2 / LikeC4 graph JSON).** Concise JSON example payloads ARE
permitted for the api-contract and event-contract sketches (fenced ` ```json ` block, body +
headers only — not the full machine schema). **Mermaid is the ONLY render library**
(data-model ER only; native Obsidian + GitHub render, no CLI); JSON examples are fenced
text, not a render library. **Excalidraw / D2 / LikeC4 are NOT in the sketch set** — they
stay in the durable `/th:docs` lane (post-completion, never gated into development).

---

## 2. Classification Schema

The architect records a bounded **classification block** of yes/no facts in `00-state.md §
Current State` (the verifier's authority) and mirrors it in `01-plan.md § Review Summary →
### Classification block` (the human-facing mirror).

### The eight booleans

| Boolean | Meaning |
|---------|---------|
| `touches_http_api` | The task adds or changes HTTP endpoint routes, controllers, or OpenAPI spec |
| `touches_ui` | The task adds or changes a UI component, page, or visual layout |
| `touches_data_model` | The task adds or changes database tables, schema, or ORM models |
| `touches_cli` | The task adds or changes CLI commands, flags, or their output |
| `touches_public_lib_api` | The task adds or changes a public function, method, or type signature exposed to callers |
| `touches_async_messaging` | The task adds or changes event, message, or queue payloads |
| `destructive` | The task involves data migration, deletion, or irreversible schema change |
| `spans_multiple_services` | The task involves a synchronous service-to-service call flow across ≥2 services (one service calls another's endpoint as part of the delivered behavior) |

**Recording format (in `00-state.md § Current State`):**

```
- touches_http_api: true|false
- touches_ui: true|false
- touches_data_model: true|false
- touches_cli: true|false
- touches_public_lib_api: true|false
- touches_async_messaging: true|false
- destructive: true|false
- spans_multiple_services: true|false
```

The verifier reads these with strict line-token parsing (same as `checkpoint-guard.sh:97-102`).
`00-state.md` is the **verifier's authority**. `01-plan.md § Review Summary → ### Classification
block` is the **human-facing mirror** — it repeats the same values so the human sees them at
STAGE-GATE-1 and `plan-reviewer` Rule 11 can audit consistency.

---

## 3. The 9 Sketches

### Always (every task with a workspace)

| Sketch | Trigger | Format | Tool | Fidelity ceiling | Representation ceiling | Home |
|--------|---------|--------|------|-----------------|----------------------|------|
| Functional acceptance criteria | always | Given/When/Then text | none | per-task AC, no implementation detail | markdown | collapses into `01-plan.md § Task List` per-task AC block (no standalone file) |
| Non-functional notes | always | bullet list (auth, perf, rate-limit, errors; a11y if frontend) | none | bullets only, no design | markdown | collapses into `01-plan.md § Architecture` Security/Performance Assessment (no standalone file) |

The two always-sketches collapse into existing surfaces and are NOT separate files.
Every plan has a `§ Task List` AC block and a `§ Architecture` Security/Performance section,
so no standalone `sketches/*.md` files are needed for the always-pair.

### Conditional (on classification booleans)

| Sketch | Trigger boolean | Format | Tool | Fidelity ceiling | Representation ceiling | File |
|--------|----------------|--------|------|-----------------|----------------------|------|
| API contract | `touches_http_api` | `METHOD /path` header + JSON request/response body examples + optional field-notes table | none | changed endpoints only; body + headers only | fenced ` ```json ` examples — no machine schema | `sketches/api-contract.md` |
| UI wireframe | `touches_ui` | ASCII layout + component legend + states | none | layout+components+states; NO styling | monospace fence in `.md` | `sketches/ui-wireframe.md` |
| Data model sketch | `touches_data_model` | `erDiagram`, touched tables only | **Mermaid** (native Obsidian render) | touched tables only; no full schema | inline ` ```mermaid ` fence | `sketches/data-model.md` |
| CLI surface | `touches_cli` | command/flag table + example invocations | none | changed commands only | markdown table | `sketches/cli-surface.md` |
| Public API surface | `touches_public_lib_api` | signatures + one usage example | none | changed signatures only | fenced code block | `sketches/public-api.md` |
| Event/message contract | `touches_async_messaging` | example payload (JSON/YAML) + field table + topic/queue | none | one example payload, not the full schema | fenced + markdown table | `sketches/event-contract.md` |
| Data migration plan | `touches_data_model` AND `destructive` | forward steps + rollback note | none | steps + rollback; no scripts | markdown table/list | `sketches/data-migration.md` |
| Service interaction | `spans_multiple_services` | Mermaid `sequenceDiagram`, changed call paths only | **Mermaid** (native Obsidian render) | changed call paths only; low-fidelity | inline ` ```mermaid ` fence | `sketches/service-interaction.md` |

### Sketch quality bar

Fidelity and representation ceilings cap *effort and format*; the quality bar caps *contract correctness*. A sketch that is low-fidelity is still wrong if it models the wrong shape.

**api-contract sketch — three quality requirements:**
1. **Conform to REST conventions.** Each changed endpoint is headed `METHOD /resource/path` (resource-oriented: `POST /transactions`, `PUT /transactions/{id}`); HTTP verbs map to operations (POST=create, PUT/PATCH=update, DELETE=delete, GET=read). Avoid action/RPC-style endpoints (`/sync`, `/process`, `/doStuff`) UNLESS an action endpoint is the deliberate, stated design (note it explicitly in `## Notes`).
2. **Completeness within the changed surface.** Model EVERY distinct operation the change introduces as its own `METHOD /path` block. Do not collapse distinct CRUD operations (create + update, or create + delete) into a single multiplexing endpoint that switches on a discriminator field. Create and update are distinct operations — each gets its own modeled block — unless a single endpoint genuinely IS the design (stated, not implied).
3. **Body-shape specificity for the changed surface.** A contract that shows its changed request/response bodies as an opaque placeholder is not a contract. Every object the change introduces or modifies must show its actual nested fields with real example values in the JSON example. An opaque `{}` or a `"...": "object"` placeholder on a changed field is PROHIBITED — it conveys no contract to the implementer, tester, or reviewer. Respect the fidelity ceiling: show the fields the change introduces or touches with concrete example values; unchanged nested DTOs MAY be shown abbreviated or referenced by name rather than fully expanded, but a changed field is never left opaque.

**Cross-cutting (all contract sketches):** model the COMPLETE changed surface and follow the domain's conventions. The same logic applies to the event-contract sketch (model every distinct event the change introduces; follow the messaging platform's naming) and the public-api sketch (model every distinct changed signature; follow the language's API conventions). State a deliberate departure from convention explicitly; never let it be the silent default.

---

## 4. Layout

### Single-project layout — `sketches/` folder

```
workspace/{feature}/
  01-plan.md                             ← work plan (HOW), milestones
  sketches/                              ← only triggered sketches created (WHAT)
    api-contract.md
    ui-wireframe.md
    data-model.md
    cli-surface.md
    public-api.md
    event-contract.md
    data-migration.md
    service-interaction.md               ← only when spans_multiple_services: true
    index.md  (optional)                 ← index that embeds the others with ![[sketches/...]] for one Obsidian view
```

- **One document per sketch**, inside a `sketches/` subfolder. The folder name carries the
  "sketch" context; no `01-sketch-` prefix needed.
- **Optional `sketches/index.md`** uses Obsidian embeds (`![[sketches/api-contract]]`) to
  transclude all triggered sketches into one scrollable note (operator-optional).
- **Only triggered sketches are created** — if no boolean is true, no conditional
  `sketches/*.md` files are produced. This is a valid, normal outcome (e.g., a docs-only
  task or a task that triggers only the always-pair).

### Multi-project consolidated layout

When a multi-project initiative is active (`initiative != null`, parent `overview.md` exists at the initiative root), sketch files consolidate into a shared `sketches/` folder at the overview root:

```
{YYYY-MM-DD}_{initiative}/
  overview.md
  sketches/                                   ← consolidated folder, overview root
    payment-gateway-api-contract.md           ← project-prefixed per-project sketch
    payment-gateway-data-model.md
    transactions-api-contract.md
    transactions-data-model.md
    backoffice-ui-wireframe.md
    service-interaction.md                    ← shared cross-project sketch, NOT prefixed
  payment-gateway/   00-state.md  01-plan.md ...
  transactions/      00-state.md  01-plan.md ...
  backoffice/        00-state.md  01-plan.md ...
```

**Rules for the consolidated layout:**
- Per-project conditional sketches use the `{project}-` prefix to disambiguate when multiple projects trigger the same sketch type (e.g., `payment-gateway-api-contract.md`).
- The shared `service-interaction.md` is un-prefixed — it describes a cross-project call flow that belongs to no single project.
- `00-state.md` and `01-plan.md` remain in each project's own folder (unchanged from `docs/discover-phase.md § 11`). Only the sketch files consolidate.
- `hooks/sketch-guard.sh` detects the consolidated layout by checking for a parent `overview.md`. When found, it resolves sketch paths to `{overview_root}/sketches/{project}-{sketch_file}` (and `{overview_root}/sketches/service-interaction.md` for the shared sketch). Absent `overview.md` → `sketches/` subfolder within the single-project workspace. Ambiguity → `sketches/` path + concerns, never fail.

---

## 5. Enforcement

The gate blocks plan approval if the work triggers a sketch and it is missing. Detection
is bounded booleans, not judgment.

**Gate script:** `hooks/sketch-guard.sh` is invoked by the orchestrator at STAGE-GATE-1.
It is an orchestrator-invoked gate script (like the TS-based `notify-stage` hook,
run via `hooks/run-ts-hook.sh notify-stage`), NOT a `PreToolUse` event hook. Do NOT
add it to `.claude-plugin/hooks.json`.

**Fail-OPEN:** the verifier fails safe-allow (same pattern as `checkpoint-guard.sh:20-22`).
This is a completeness gate, not a security gate. The plan-reviewer (agent) and the human
at STAGE-GATE-1 are the backstops. A missing sketch surfaces as a `concerns`-level finding
the human sees — never a hard block that strands the pipeline on a parsing edge case.

**Anti-gaming check (concerns-only):** if the plan's `Files:` touch contract-surface
keywords (route, controller, handler, endpoint, schema, migration, component, etc.) but the
matching boolean is `false`, the verifier emits a `concerns`-level consistency finding. This
is a backstop, not the sole control — `plan-reviewer` Rule 11 and the human at STAGE-GATE-1
also see the classification block and the diff signal. The check is `concerns`-severity
(surface to human), never `fail`.

---

## 6. Lifecycle

| Phase | Who | Action |
|-------|-----|--------|
| Stage 1 Design (alongside `01-plan.md`) | architect | Records the classification block in each project's `00-state.md` (required for every project including all-false); produces exactly the manifest-required `sketches/*.md` files |
| Phase 1.5 (Plan Ratification) | qa-plan | Checks sketch↔AC consistency (functional-acceptance sketch matches `§ Task List` AC) |
| Phase 1.6 (Plan Review) | plan-reviewer | Rule 11 — sketch completeness per-project (shape-only, fail-OPEN parity); each project's block audited independently in multi-project dispatch |
| STAGE-GATE-1 | orchestrator | Invokes `sketch-guard.sh`; folds its verdict into the combined verdict; human reviews sketches |
| Stage 2 Implementation | implementer | **Required reading:** reads every triggered `sketches/*.md` file (or consolidated `{overview_root}/sketches/` paths in multi-project workspaces) before writing any code; builds the delivered surface TO the sketch contracts; emits `sketches_read` in status block |
| Stage 2 Test Authoring | tester | **Required reading:** reads the triggered `sketches/*.md` files; derives test cases from each declared contract surface (endpoint, table, call-hop, etc.) in addition to the per-task AC; emits `sketches_read` in status block |
| Phase 3 Validation | qa | **Required reading:** reads the triggered `sketches/*.md` files; cross-checks the delivered API/data/UI/call-flow against the corresponding sketch contract as part of AC validation; emits `sketches_read` in status block |
| Phase 3 Code Review | reviewer | **Required reading:** reads the triggered `sketches/*.md` files; confirms the diff matches the sketch contracts; flags a delivered surface that silently diverges from the api-contract or service-interaction sketch |
| Phase 3.6 (Acceptance Check) | acceptance-checker | **Required reading:** reads every triggered `sketches/*.md` file (required, not optional); diffs the delivered surface against each sketch; includes service-interaction diff row when `spans_multiple_services: true`; resolves consolidated `{overview_root}/sketches/` paths in multi-project workspaces |
| Direct-entry skills | `/th:review-pr`, `/th:validate` | Run `sketch-guard.sh` as a prerequisite probe; **required reading:** reads the triggered sketch files when entering mid-pipeline before the consuming pass begins |

---

## 7. Per-Type Applicability

| Type / Tier | Classification block produced? | Always-sketches | Conditional sketches | Verifier runs? |
|-------------|-------------------------------|-----------------|---------------------|---------------|
| `feature` / `refactor` / `enhancement` | Yes (architect, Stage 1) | yes (collapsed surfaces) | per booleans | Yes, at STAGE-GATE-1 |
| `fix` Tier 2-4 | Yes (architect root-cause mode records the block in `00-state.md`) | yes (AC in § Task List) | only if the fix touches a contract surface (rare); booleans default false | Yes, at STAGE-GATE-1 |
| `fix` Tier 1 / `hotfix` | No architect → orchestrator records all-false block when it self-authors `01-plan.md` | yes (minimum 4-line AC) | none (all false) | Yes — no-op pass (all-false → empty required set) |
| `fix` Tier 0 / `docs` Tier 0 | **Exempt** — no workspace exists (CLAUDE.md §5 observability exemption) | n/a | n/a | Not invoked (no `00-state.md`) |
| `docs` flow (Tier ≥1) | architect docs research → orchestrator records all-false block (docs do not touch product contracts) | yes | none | Yes — no-op pass |

---

## 8. Sketch-vs-Spec-Seed Reconciliation

| Artifact | Carries | Lifecycle | Handoff rule |
|----------|---------|-----------|-------------|
| `00-spec-seed.md` | Functional INTENT from E2 co-authoring (developer's settled intent, dissent record) | Produced pre-Design; a strong prior | The functional-acceptance sketch (per-task AC) DERIVES from the spec-seed's functional surface when a seed exists |
| `sketches/*.md` | Result CONTRACTS (checkable: what API, what tables, what payload) | Produced by architect in Design, alongside `01-plan.md` | Conditional sketches (API/UI/data/...) have NO spec-seed counterpart; they stand alone. No duplication: the seed states intent in prose, the sketch states the contract in a fixed shape. |

**When a spec-seed exists**, the architect adds a one-line provenance note to the
functional-acceptance AC block: `Provenance: derived from 00-spec-seed.md § <section>`.
**When no seed exists**, the AC block is authored from `01-plan.md § Review Summary` as
today. The two artifacts never restate each other.

---

## 9. Manifest Consistency Guard

The three representations of the manifest (this file, the agent-readable table in
`agents/architect.md`, and the hardcoded mapping in `hooks/sketch-guard.sh`) are kept
consistent by a structural drift test in `tests/test_agent_structure.py` (Suite 82). The
test parses the trigger→sketch mapping from each representation and asserts they agree.

Run it with:
```
python3 tests/test_agent_structure.py
```

or via the full suite:
```
bash tests/run-all.sh
```

---

## 10. Workspace–Repository Boundary

**Sketch conventions govern only the workspace.** Sketches (`sketches/*.md`) are throwaway
decision aids produced for a single pipeline run. Their format, layout, and naming
conventions are workspace-internal and do not carry forward into the repository.

**Repository files follow the repository's own conventions.** When an agent writes or
updates a repository file — source code, configuration, or an existing spec — it follows
the repository's established format, filename, and structure for that file.

**OpenAPI spec format is preserved as-is.** A repository's own `openapi/openapi.{yaml,yml,json}`
keeps its existing format, filename, and structure. An agent must preserve the existing
format when reading and updating the spec. The JSON api-contract sketch (`sketches/api-contract.md`)
is a workspace decision aid; it is never a template that dictates the format or filename
of a repository's own OpenAPI file. A repository whose spec is `openapi.json` keeps `.json`;
a repository whose spec is `openapi.yaml` or `openapi.yml` keeps `.yaml`/`.yml`.

This boundary invariant is referenced by format-preservation guards in:
- `agents/implementer.md` — Phase 0 Step 3b
- `agents/delivery.md` — Step 8 (Update OpenAPI)
- `agents/architect.md` — api-contract skeleton quality note
