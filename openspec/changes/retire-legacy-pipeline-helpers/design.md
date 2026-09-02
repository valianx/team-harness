## Context

See [proposal.md](proposal.md). After #631 the live pipeline reads `agents/ref-pipeline.md` (1,612 words), `agents/_shared/orchestrator-state.md`, and `skills/pipeline/scripts/control-plane.mjs`. A reference scan of `agents/**` and every `SKILL.md` finds no call to the eleven pre-v5 helpers; only tests and three docs name them. This change is a deletion with a spec reconciliation, not a redesign.

## Goals / Non-Goals

**Goals:**

- The tree contains only helpers a live contract names.
- The main specs describe one dispatch model after the completed changes are archived.
- Recovery has one path.

**Non-Goals:**

- Judging the v5 control plane. That judgment needs the real-run baseline; this change removes what v5 already replaced.
- Touching any helper with a live reference.

## Decisions

### 1. Delete by reference count, not by opinion

A helper is deleted when `grep` over `agents/**`, `skills/**` (excluding `scripts/`), `plugins/team-harness/agents/**`, and `plugins/team-harness/skills/**` (excluding `scripts/`) returns zero hits. The eleven named in the proposal meet that test today; `specialist-liveness.mjs` has one hit in `ref-pipeline.md § Failures` as a failure-kind name, not an invocation, and is deleted with the prose pointing at the v5 liveness facts instead. Any helper with a live hit stays, whatever its age.

### 2. Reconcile specs after archive, in one delta

`right-size-pipeline-contracts` archives the six completed changes. Only then do `harden-multi-repo-coordination-contract`'s eight requirements and v5's four additions coexist in `openspec-design-orchestration`. This change removes the eight and restates "Planning inputs are pinned for Gate 1" with v5's single content identity, keeping every scenario name the current text has so archive can apply the delta. Reconciling before archive was rejected: the delta would target requirements the main spec does not yet contain.

### 3. Remove the converter now

`convertLegacyWorkspace` and the `Recovery and legacy state` conversion prose serve workspaces created before #631. The vault holds none in a resumable state. A workspace without `control/control.jsonl` gets an administrative close event and the inline-or-fresh offer. Keeping the converter "just in case" was rejected: it is a second recovery path with no producer, exactly the shape `right-size-pipeline-contracts` exists to prevent.

### 4. Packaged mirrors go with their sources

`plugins/team-harness/skills/pipeline/scripts/` mirrors every helper byte for byte; the projection suite fails on drift. Deleting a source without its mirror fails that suite, so both go in the same commit.

## Risks / Trade-offs

- **A deleted helper turns out to be invoked dynamically** → `test_pipeline_helper_entrypoints.mjs` enumerates the CLI entrypoints; the deletion updates that list, and the behavioral suite runs the live pipeline path. A dynamic invocation with no test and no contract mention is itself the defect.
- **An operator has a pre-v5 workspace mid-run** → none exists in the configured vault; if one appears, the administrative close preserves its events and git history for inline completion.
- **Archive order matters** → stated as a dependency; task 1.1 verifies the archive happened before any spec edit.
