# Plan Sketches — Optional Planning Guidance

This document is the **single source of truth** for the optional plan-stage
sketch guidance. The coordinator reads it directly when a design aid would
make the changed surface easier to understand or verify:

1. **This file** (`docs/plan-sketches.md`) — canonical definitions, surface-selection hints,
   fidelity ceilings, representation ceilings, per-type applicability, and the
   sketch-vs-spec-seed reconciliation rule.
2. **The current OpenSpec plan and task list** — the source for which surface is
   actually in scope. No retired architect table or fixed projection is needed.
3. **Optional local checks** — a coordinator may inspect selected sketch files
   or use a best-effort helper, but neither is a permission gate or a second
   source of truth.

---

## 1. Purpose

When a coordinator chooses sketch-based planning, the plan stage may declare a
**result-defining sketch set** — lightweight, plan-resident documents
(`sketches/{type}`) that show WHAT will be delivered (functional + non-functional)
so the final result is easier to check before a line is implemented. The goal is
**contract determinism, not content determinism**: the same input type produces
a predictable, verifiable SET of artifacts in a fixed shape. LLM prose varies;
the envelope (what exists, what fields, what passed) is deterministic.

**Fidelity ceiling:** inside the canonical pipeline, sketches are LOW-fidelity and
changed-surface-only. They are throwaway decision aids, not production polish.

When used, sketches are workspace decision aids. Inline direct work and live ad
hoc tester/QA/security reviews do not create or require a sketch set; if an
operator explicitly requests a standalone sketch, it is bounded evidence rather
than pipeline state.

**Representation ceiling (global):** token-cheap text that renders in Obsidian with zero
dependency — Mermaid / ASCII / markdown tables / fenced code. **No verbose machine-JSON
formats (Excalidraw / D2 / LikeC4 graph JSON).** Concise JSON example payloads ARE
permitted for the api-contract and event-contract sketches (fenced ` ```json ` block, body +
headers only — not the full machine schema). **Mermaid is the ONLY render library**
(data-model ER only; native Obsidian + GitHub render, no CLI); JSON examples are fenced
text, not a render library. **Excalidraw / D2 / LikeC4 are NOT in the sketch set** — they
stay in the durable `/th:docs` mode (post-completion, never gated into development).

**Narrowly-scoped exception — UI wireframe.** The UI wireframe sketch alone is delivered as
a standalone, self-contained HTML file (`sketches/ui-wireframe.html`) instead of the zero-
dependency text formats above. It embeds a fixed grayscale wireframe stylesheet inline
(no `<script>`, no external resources — CDN, remote images, remote stylesheets are all
prohibited) and renders via any browser or an Obsidian HTML-render community plugin. The
fidelity ceiling is unchanged (layout + components + states, no product styling) and is
preserved by construction: the embedded stylesheet is fixed, so the architect cannot escape
into product-level styling even when writing HTML. This exception is scoped strictly to
ui-wireframe — the zero-dependency, text-only rule stands for the other 8 sketches.

---

## 2. Surface selection

Use the current OpenSpec proposal, deltas, tasks and affected paths to identify
the delivered surface. A coordinator or architect may summarize these hints in
the plan when that helps reviewers choose a sketch; no fixed field, state file,
architect return schema or security classification is required. The plan and
task acceptance remain authoritative.

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

When a plan records the selection, a compact section such as this is enough:

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

Keep the section in `01-plan.md` or the current workspace plan when it is
useful; omit it for a small task whose acceptance already makes the surface
clear. A reviewer can compare the hints with the proposal, task paths and
implementation diff. The hints select optional sketches only and do not
replace the repository's or runtime's security review.

---

## 3. The 9 Sketches

### Shared plan surfaces (when a plan uses sketches)

| Sketch | Trigger | Format | Tool | Fidelity ceiling | Representation ceiling | Home |
|--------|---------|--------|------|-----------------|----------------------|------|
| Functional acceptance criteria | when selected | Given/When/Then text | none | per-task AC, no implementation detail | markdown | canonical in the affected `plan/tasks/Task-N.md` |
| Non-functional notes | when selected | bullet list (auth, perf, rate-limit, errors; a11y if frontend) | none | bullets only, no design | markdown | canonical in `plan/architecture.md` Security/Performance Assessment |

The two shared surfaces collapse into existing OpenSpec or plan content and are
NOT separate files. A plan that opts into sketches can keep its `§ Task List` AC
block and `§ Architecture` Security/Performance section without creating
standalone `sketches/*` files for this pair.

### Conditional (on the selected surface)

| Sketch | Trigger boolean | Format | Tool | Fidelity ceiling | Representation ceiling | File |
|--------|----------------|--------|------|-----------------|----------------------|------|
| API contract | `touches_http_api` | `METHOD /path` header + JSON request/response body examples + optional field-notes table | none | changed endpoints only; body + headers only | fenced ` ```json ` examples — no machine schema | `sketches/api-contract.md` |
| UI wireframe | `touches_ui` | semantic HTML + fixed wireframe stylesheet embedded | none | layout+components+states; NO styling | standalone HTML, embedded stylesheet | `sketches/ui-wireframe.html` |
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

**ui-wireframe sketch — HTML quality requirements:**
1. **Semantic structure.** Use semantic HTML elements (`<h1>`/`<h2>`, `<table>`, meaningful class names) instead of `<div>` soup — the sketch must be legible as a document, not only as a rendered page.
2. **Fixed stylesheet, no product styling.** The embedded `<style>` block is the fixed grayscale wireframe stylesheet — neutral rgba grays, dashed/solid borders, `color-scheme: light dark`. The architect never introduces brand colors, custom fonts, or product-level polish.
3. **Script-free and network-free.** No `<script>` tag and no reference to an external resource (CDN, remote image, remote stylesheet). The file is fully self-contained so it is safe to render inside the operator's vault.
4. **States + legend.** Include a component legend and the relevant state
   table (loading/empty/error and any domain-specific state) when those states
   affect the requested behavior; do not invent states unrelated to the task.

---

## 4. Layout

### Single-project layout — `sketches/` folder

```
workspace/{feature}/
  01-plan.md                             ← work plan (HOW), milestones
  sketches/                              ← only triggered sketches created (WHAT)
    api-contract.md
    ui-wireframe.html
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
  `sketches/*` files are produced. This is a valid, normal outcome (e.g., a docs-only
  task or a task that uses only the shared plan surfaces).

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
    backoffice-ui-wireframe.html
    service-interaction.md                    ← shared cross-project sketch, NOT prefixed
  payment-gateway/   01-plan.md ...
  transactions/      01-plan.md ...
  backoffice/        01-plan.md ...
```

**Rules for the consolidated layout:**
- Per-project conditional sketches use the `{project}-` prefix to disambiguate when multiple projects trigger the same sketch type (e.g., `payment-gateway-api-contract.md`).
- The shared `service-interaction.md` is un-prefixed — it describes a cross-project call flow that belongs to no single project.
- `01-plan.md` remains linked to the relevant project or shared plan; no state
  file is required for sketches. Only the sketch files consolidate.
- When a coordinator deliberately uses a shared `overview.md`, it resolves
  sketch paths to `{overview_root}/sketches/{project}-{sketch_file}` (and
  `{overview_root}/sketches/service-interaction.md` for the shared sketch).
  Without an overview, use the `sketches/` subfolder of the current workspace.
  Record the chosen path in the plan so a reviewer can find it; ambiguity is a
  reportable concern, never a reason to block unrelated work.

---

## 5. Optional verification probe

When a coordinator chooses to inspect sketches, resolve their paths from the
current plan and compare them with the proposal, task acceptance and changed
surface. Report missing or mismatched design evidence only when it affects the
ability to understand or validate the requested behavior. Sketches are optional
workspace decision aids; their absence does not create a pipeline gate or block
validation.

For each sketch that exists, perform the smallest useful check for its format:

- Confirm the file is readable, the expected fence or document structure is
  present, and the content covers the changed surface named by the plan.
- For Mermaid data-model or service-interaction diagrams, check balanced fences
  and recognizable diagram declarations. If a Mermaid renderer is available,
  render the diagram; otherwise report that rendering was unavailable and keep
  the structural check result.
- For the HTML wireframe, check semantic structure, the fixed neutral style,
  absence of scripts and external resources, and the loading/empty/error states
  when those states are relevant to the task.

Record each failure with the sketch path, format or renderer, and a concise
error or line reference. A malformed optional sketch is a review concern; it
does not authorize a new gate or stop unrelated implementation. If the sketch
is the only evidence for an acceptance decision, the coordinator records the
missing evidence and obtains a better source before claiming that decision is
verified.

The legacy `hooks/sketch-guard.sh` may be used as a best-effort compatibility
probe for workspaces that still provide its expected inputs. It is not required
for the current method, is not a `PreToolUse` event hook, and must not be added
to `.claude-plugin/hooks.json`. Its output is advisory and never a permission
or publication decision.

---

## 6. Lifecycle

| Phase | Who | Action |
|-------|-----|--------|
| `design` | Main, or an architect when the objective benefits from design help | Selects sketches from the current proposal, tasks and changed surface; records their paths in the plan when used |
| `implementation` | implementer + tester | Reads applicable sketches before writing code or evidence when they clarify the changed contract |
| `validation` | qa or another selected reviewer | Reads applicable sketches when present and checks the delivered surface against the corresponding contracts |
| Explicit `/th:plan-review` | plan-reviewer | May inspect the current plan and any sketches as part of the operator-requested review; never runs automatically |
| Pipeline-attached entry skills | `/th:review-pr`, `/th:validate` | May read existing sketches or run the optional probe when the workspace supplies them; standalone inline reviews do not create or require a sketch set |

---

## 7. Per-Type Applicability

| Changed surface in current plan | Useful design aid | What it shows | Optional probe use |
|----------------------------------|-------------------|---------------|-------------------|
| HTTP/API or public library contract | API contract or public API surface | only the changed operations/signatures | When a reviewer needs a structural check |
| UI or interaction states | UI wireframe | changed layout and states | When visual states affect acceptance |
| Data model or destructive migration | Data model and, when useful, migration plan | touched tables and rollback behavior | When schema compatibility needs a check |
| CLI or asynchronous messaging | CLI surface or event contract | changed flags or payloads | When consumers need an explicit example |
| Multiple services | Service interaction | changed call paths | When dependency order or failure behavior is unclear |
| Documentation-only or another surface | None unless a concrete decision aid helps | existing acceptance text | Usually unnecessary |

Old workspaces may lack sketches. That historical absence is useful migration
context, but it does not require the current workflow to create a fixed sketch
set. Create or inspect only the design aids that clarify the current surface.

---

## 8. Sketch-vs-Spec-Seed Reconciliation

| Artifact | Carries | Lifecycle | Handoff rule |
|----------|---------|-----------|-------------|
| `00-spec-seed.md` | Functional intent from earlier co-authoring | Optional prior linked from the current plan | Use it to clarify acceptance when it still matches the current proposal; reconcile conflicts before relying on it |
| `sketches/*` | Result contracts (checkable API, tables, payloads or states) | Produced by the coordinator or an architect when the plan chooses a sketch | Conditional sketches have no required seed counterpart; they stand alone and should describe only the changed surface |

When a spec-seed exists, link the relevant section from the current plan or
acceptance text and record any reconciliation. When no seed exists, author
acceptance from the current proposal and tasks. The two artifacts should not
silently disagree or restate one another.

---

## 9. Optional quality and error reporting

This document is the maintained guidance for sketch selection and shape. There
is no required architect table or generated classification projection to keep
in sync. If a repository retains a compatibility probe, review its output
against the current plan rather than treating its mapping as authoritative.

For a useful bounded check, report:

- the selected sketch paths and the proposal/task surface they cover;
- diagram syntax or renderer errors with the file and line when available;
- missing contract fields or states that prevent a reviewer from checking the
  changed behavior; and
- unavailable optional tooling separately from a malformed sketch.

Run the repository's ordinary tests when the implementation or a maintained
checker changes. A sketch concern alone does not require a new test suite,
gate, helper invocation, or durable execution log.

---

## 10. Workspace–Repository Boundary

**Sketch conventions govern only the workspace.** Sketches (`sketches/*`) are throwaway
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

Apply this distinction when turning a sketch into implementation or comparing
it with the delivered repository files.
