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
documents (`01-sketch-*.md`) that show WHAT will be delivered (functional + non-functional)
so the final result is determinable before a line is implemented. The goal is **contract
determinism, not content determinism**: the same input type produces a predictable,
verifiable SET of artifacts in a fixed shape. LLM prose varies; the envelope (what exists,
what fields, what passed) is deterministic.

**Fidelity ceiling:** inside the dev pipeline, sketches are LOW-fidelity and
changed-surface-only. They are throwaway decision aids, not production polish.

**Representation ceiling (global):** token-cheap text that renders in Obsidian with zero
dependency — OpenAPI-YAML / Mermaid / ASCII / markdown tables / fenced code. **No verbose
JSON formats. Mermaid is the ONLY render library** (data-model ER only; native Obsidian +
GitHub render, no CLI). **Excalidraw / D2 / LikeC4 are NOT in the sketch set** — they stay
in the durable `/th:docs` lane (post-completion, never gated into development).

---

## 2. Classification Schema

The architect records a bounded **classification block** of yes/no facts in `00-state.md §
Current State` (the verifier's authority) and mirrors it in `01-plan.md § Review Summary →
### Classification block` (the human-facing mirror).

### The seven booleans

| Boolean | Meaning |
|---------|---------|
| `touches_http_api` | The task adds or changes HTTP endpoint routes, controllers, or OpenAPI spec |
| `touches_ui` | The task adds or changes a UI component, page, or visual layout |
| `touches_data_model` | The task adds or changes database tables, schema, or ORM models |
| `touches_cli` | The task adds or changes CLI commands, flags, or their output |
| `touches_public_lib_api` | The task adds or changes a public function, method, or type signature exposed to callers |
| `touches_async_messaging` | The task adds or changes event, message, or queue payloads |
| `destructive` | The task involves data migration, deletion, or irreversible schema change |

**Recording format (in `00-state.md § Current State`):**

```
- touches_http_api: true|false
- touches_ui: true|false
- touches_data_model: true|false
- touches_cli: true|false
- touches_public_lib_api: true|false
- touches_async_messaging: true|false
- destructive: true|false
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
| Functional acceptance criteria | always | Given/When/Then text | none | per-PR AC, no implementation detail | markdown | collapses into `01-plan.md § Task List` per-PR AC block (no standalone file) |
| Non-functional notes | always | bullet list (auth, perf, rate-limit, errors; a11y if frontend) | none | bullets only, no design | markdown | collapses into `01-plan.md § Architecture` Security/Performance Assessment (no standalone file) |

The two always-sketches collapse into existing surfaces and are NOT separate files.
Every plan has a `§ Task List` AC block and a `§ Architecture` Security/Performance section,
so no standalone `01-sketch-*.md` files are needed for the always-pair.

### Conditional (on classification booleans)

| Sketch | Trigger boolean | Format | Tool | Fidelity ceiling | Representation ceiling | File |
|--------|----------------|--------|------|-----------------|----------------------|------|
| API contract | `touches_http_api` | OpenAPI fragment, changed endpoints only | OpenAPI (YAML, inline fence) | changed paths only; no full spec | inline ` ```yaml ` fence — no external `.yaml` | `01-sketch-api-contract.md` |
| UI wireframe | `touches_ui` | ASCII layout + component legend + states | none | layout+components+states; NO styling | monospace fence in `.md` | `01-sketch-ui-wireframe.md` |
| Data model sketch | `touches_data_model` | `erDiagram`, touched tables only | **Mermaid** (native Obsidian render) | touched tables only; no full schema | inline ` ```mermaid ` fence | `01-sketch-data-model.md` |
| CLI surface | `touches_cli` | command/flag table + example invocations | none | changed commands only | markdown table | `01-sketch-cli-surface.md` |
| Public API surface | `touches_public_lib_api` | signatures + one usage example | none | changed signatures only | fenced code block | `01-sketch-public-api.md` |
| Event/message contract | `touches_async_messaging` | example payload (JSON/YAML) + field table + topic/queue | none | one example payload, not the full schema | fenced + markdown table | `01-sketch-event-contract.md` |
| Data migration plan | `touches_data_model` AND `destructive` | forward steps + rollback note | none | steps + rollback; no scripts | markdown table/list | `01-sketch-data-migration.md` |

---

## 4. Layout — Flat `01-sketch-*.md` Prefix

```
workspace/{feature}/
  01-plan.md                       ← work plan (HOW), milestones
  01-sketch-api-contract.md        ← only triggered sketches created (WHAT)
  01-sketch-ui-wireframe.md
  01-sketch-data-model.md
  01-sketch-cli-surface.md
  01-sketch-public-api.md
  01-sketch-event-contract.md
  01-sketch-data-migration.md
  01-sketches.md  (optional)       ← index that embeds the others with ![[...]] for one Obsidian view
```

- **One document per sketch**, flat prefix `01-sketch-*.md`. The repo milestone standard
  prohibits stage subfolders — the flat prefix is the confirmed layout.
- **Optional `01-sketches.md` index** uses Obsidian embeds (`![[01-sketch-api-contract]]`) to
  transclude all triggered sketches into one scrollable note (operator-optional).
- **Only triggered sketches are created** — if no boolean is true, no conditional
  `01-sketch-*.md` files are produced. This is a valid, normal outcome (e.g., a docs-only
  task or a task that triggers only the always-pair).

---

## 5. Enforcement

The gate blocks plan approval if the work triggers a sketch and it is missing. Detection
is bounded booleans, not judgment.

**Gate script:** `hooks/sketch-guard.sh` is invoked by the orchestrator at STAGE-GATE-1.
It is an orchestrator-invoked gate script (like `notify-stage.sh`), NOT a `PreToolUse`
event hook. Do NOT add it to `hooks/config.json` or `.claude-plugin/hooks.json`.

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
| Stage 1 Design (alongside `01-plan.md`) | architect | Records the classification block; produces exactly the manifest-required `01-sketch-*.md` files |
| Phase 1.5 (Plan Ratification) | qa-plan | Checks sketch↔AC consistency (functional-acceptance sketch matches `§ Task List` AC) |
| Phase 1.6 (Plan Review) | plan-reviewer | Rule 11 — sketch completeness (shape-only, fail-OPEN parity) |
| STAGE-GATE-1 | orchestrator | Invokes `sketch-guard.sh`; folds its verdict into the combined verdict; human reviews sketches |
| Stage 2 Implementation | implementer | Builds TO the sketches |
| Stage 2 Test Authoring | tester | Derives tests from the AC sketch and non-functional notes |
| Phase 3.6 (Acceptance Check) | acceptance-checker | Diffs the delivered surface against each sketch (delivered API vs `01-sketch-api-contract.md`, etc.) |
| Direct-entry skills | `/th:review-pr`, `/th:deliver`, `/th:validate` | Run `sketch-guard.sh` as a prerequisite probe when entering mid-pipeline |

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
| `00-spec-seed.md` | Functional INTENT from E2 co-authoring (developer's settled intent, dissent record) | Produced pre-Design; a strong prior | The functional-acceptance sketch (per-PR AC) DERIVES from the spec-seed's functional surface when a seed exists |
| `01-sketch-*.md` | Result CONTRACTS (checkable: what API, what tables, what payload) | Produced by architect in Design, alongside `01-plan.md` | Conditional sketches (API/UI/data/...) have NO spec-seed counterpart; they stand alone. No duplication: the seed states intent in prose, the sketch states the contract in a fixed shape. |

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
