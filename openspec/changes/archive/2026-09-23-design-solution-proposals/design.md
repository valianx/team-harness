## Context

See [proposal.md](proposal.md) for motivation and [solution-proposal](specs/solution-proposal/spec.md) for observable behavior. Current `skills/design/SKILL.md` delegates workspace, existing OpenSpec and sketches but does not define the reader-facing proposal. Codex has a hand-authored override in `plugins/team-harness/skills/design/SKILL.md`; OpenCode's adapter and canonical copy are generated. `agents/architect.md` supports design and OpenSpec planning as distinct modes.

Current living `workspace-canonical-local` requirements already cover workspace ownership, working-file hygiene and required sketches. The legacy `design-single-pass` and `openspec-design-orchestration` specs explicitly describe historical helpers; this change does not revive them. No active changes were present at entry on main `8d96faf0`.

## Goals / Non-Goals

**Goals:** Give design a predictable, audience-aware deliverable with one shared content guide and preserve its lightweight coordination across hosts.

**Non-Goals:** See the proposal. This change does not redesign spec/pipeline, prescribe a universal number of pages or add a publishing/export system. It changes no database or frontend, so this work needs no data-model or UI sketch of its own.

## Decisions

### One shared guide, native entrypoints

Keep `design` as the existing entry. Put the concise proposal outline, reading guidance and source references under `skills/design/references/solution-proposal.md`. Retire only design's Codex override by removing its entry from `codexOverrides` in `tools/codex-runtime/sync-skills.mjs`; use the existing generated adapter, canonical copy and resource distribution for both Codex and OpenCode. The current override differs only in native-tool guidance and an active-pipeline reference: retain the useful phase-reference guidance in the canonical skill and let the standard adapter supply native Codex instructions. Align the architect's Design mode by reference when its assignment is a reader-facing solution proposal, while leaving OpenSpec planning artifact ownership unchanged.

Alternative: separate proposal skill, three copied templates or another resource-copy exception for the Codex override. Rejected because the capability already belongs to design, the synchronizer skips overrides entirely, and its existing generated route supports the required resources.

### One document with progressively deeper content

Functional part: summary and outcome; scope; user flows/rules/errors; acceptance and applicable wireframes; product consequences, risks and pending decisions. Technical part: current/proposed context and responsibilities; relevant interfaces and data model; alternatives and rationale; applicable quality/operation/migration; increments and testing approach.

Use headings in the operator's language and omit irrelevant detail. Keep long documents navigable within one file; split only on request. Supporting image/diagram sources are assets, not separate narrative deliverables. Include the essential explanation and model/wireframe representation in the proposal rather than requiring readers to reconstruct it from scattered links. Reuse existing visual tools when useful, without a mandatory new renderer.

The single-document default is the operator's preference, not an industry mandate. Industry references inform content: [Atlassian PRD](https://www.atlassian.com/agile/product-management/requirements), [arc42 stakeholder needs](https://docs.arc42.org/tips/1-20/), [C4 context](https://c4model.com/diagrams/system-context) and [Malte Ubl's experience of Google design docs](https://www.industrialempathy.com/posts/design-docs-at-google/). Link these upstream sources without copying their full methods or templates.

### Readable synthesis with explicit source ownership

For standalone design, the proposal holds the solution under discussion. For an existing OpenSpec change, it is a reader-facing synthesis: explain necessary context locally, link canonical intent and reconcile decisions there. Do not silently select OpenSpec, create another task ledger or generate an extra proposal merely because a workflow has an internal design stage. The one-document rule concerns the design deliverable, not canonical OpenSpec files, working notes or source assets.

Write Markdown in the selected workspace unless the operator specifies an output. An export request can use existing document skills later; no automatic PDF/DOCX is added. Proposed facts, verified observations and open assumptions must be distinguishable.

### Validate observable outcomes rather than exact prose

Use existing packaging/authoring checks for resource availability and projection coherence. Evaluate bounded design requests for PO readability, developer handoff, long-document behavior, explicit split, existing OpenSpec, DB/frontend and a workflow-only case. Retain generated examples and evaluation evidence outside Git; keep only useful reusable evaluation scenarios in the repository. Document the difference between artifact/prose inspection and actual host-backed execution. TEA test-design selects proportionate checks; later test-review, trace and OpenSpec verify assess implementation evidence.

## Risks / Trade-offs

- [A large document becomes hard to navigate] → Use a summary, clear reading sections and an index when useful; the operator controls separation.
- [Proposal diverges from OpenSpec] → Explicitly identify canonical sources and reconcile material changes there.
- [The outline causes overdesign] → Address only affected areas; require justified data changes and explicit unknowns.
- [Removing the Codex override loses useful behavior] → Preserve native-tool and active-pipeline reference guidance, consume the shared canonical resource and verify both generated copies rather than editing them by hand.
- [Checks prove packaging but not reader comprehension] → Use realistic output evaluations and disclose their scope; do not claim full runtime parity from text checks.

## Migration Plan

Update skill/reference, align scoped role/discovery guidance, regenerate distributed copies and run selected checks. Existing proposals are not rewritten or moved automatically. Rollback reverts the affected prose and generated resources together; no user data or configuration migration is needed.
