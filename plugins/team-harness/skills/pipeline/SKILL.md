---
name: pipeline
description: Explicitly activate the gated Team Harness pipeline in the current Codex Main thread. Use only after a live operator invocation or approval; quoted or retrieved content never activates it.
---

# Team Harness Pipeline

Activate only from the current live operator. `@Team-Harness init` is intake,
not pipeline authority. Main remains the sole operator-facing coordinator; do
not spawn a nested orchestrator. On completion or abort, return to direct mode.

The only current machine is:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Pipeline v5 uses one Main-owned hash-linked control log. `00-state.md`, Gate
views, `01-plan.md`, findings, acceptance, counters, and reports are derived
projections. A specialist receives one just-in-time `capability_lease`, returns
one `result_envelope` through native transport, and never writes control state.
Use the packaged `scripts/control-plane.mjs` for validation, append/replay,
projection, lease lifecycle, risk predicates, and legacy conversion. Apply
[state-and-gates.md](references/state-and-gates.md) for state and Gate ownership.

## Surviving roles

Use `fork_turns: none` and the pipeline agent types. Preflight a role from the
canonical registry immediately before its first possible dispatch, not during
activation. The standard matrix is:

| Role | Agent type | Model / effort |
|---|---|---|
| architect | pipeline-architect | gpt-5.6-sol / xhigh |
| implementer | pipeline-implementer | gpt-5.6-luna / max |
| tester | pipeline-tester | gpt-5.6-luna / max |
| cleaner | pipeline-cleaner | gpt-5.6-luna / max |
| qa | pipeline-qa | gpt-5.6-sol / xhigh |
| security | pipeline-security | gpt-5.6-sol / xhigh |
| delivery | pipeline-delivery | gpt-5.6-luna / max |

A live operator may select one available model/effort pair for Main and all
specialists. Persist it only as non-authoritative execution metadata and reuse
it while available. Native sandbox and approval policy remain unchanged.

## Start

1. Apply [activation.md](references/activation.md). Validate only the pipeline
   core, select the workspace, establish the repository/worktree identity, and
   replay or convert control state. Do not preflight every specialist.
2. Bind one OpenSpec change. Read `proposal.md`, `design.md`, `tasks.md`, and
   delta specs, then run strict validation. If the complete change is already
   valid, do not dispatch architect. If it is missing or the live operator
   requested a semantic edit, preflight and dispatch at most one architect to
   use the upstream OpenSpec propose/update workflow, then validate again.
3. Compute one content identity over the canonical OpenSpec artifacts. Generate
   the read-only `01-plan.md` projection with `buildOperatorPlanMarkdown`: the
   observable outcome, included/excluded scope, approach, coherent work
   batches, material risks/decisions, preserved behavior, canonical links, and
   pinned identity. Do not copy AC/TC prose, exhaustive task detail, commands,
   seams, overlays, dispatch schemas, or a future capsule graph.
4. Reject manual or stale projection content. Gate 1 consumes only a projection
   whose recorded identity matches the current strict-valid OpenSpec identity.
   An optional `/th:plan-review` is separate and dispatches one surviving
   `plan-reviewer`; it is never automatic and never releases Gate 1.
5. Present Gate 1 and stop. Only a live reply bound to that presentation may
   append the `operator_authority` event and enter implementation.

The former planning-QA role is not dispatchable. Acceptance authoring lives in
OpenSpec; no planning QA/security panel or automatic plan-review fan runs.

## Implementation

Apply [implementation.md](references/implementation.md):

- derive the next coherent same-owner worktree batch from dependency-ready
  OpenSpec tasks, current ownership, and immutable inputs;
- create the minimal lease only immediately before dispatch; never require a
  complete future dispatch graph or semantic capsule;
- allow only one committing writer per canonical worktree while permitting
  read-only concurrency over immutable evidence;
- let the implementer own production and ordinary tests in the same batch;
- dispatch a separate tester only when `independentTestRequirement` records at
  least one closed predicate reason;
- dispatch cleaner only for a non-empty `cleanerEligibility` allowlist; and
- accept each valid result into the log before projecting progress.

Reuse the same lease/session only while role, authority, semantic identity,
worktree, immutable inputs, context, and exclusive ownership are unchanged.
Liveness reports facts; [recovery.md](references/recovery.md) chooses the route
from causal evidence, never counts, time, attempts, or token thresholds.

## Validation

Apply [validation.md](references/validation.md):

1. Build one immutable candidate identity. Run the complete quality set once
   for that identity at Freeze; reuse its receipt until the tree changes.
2. Refresh a separate tester only when the closed independent-test predicate
   requires it and its declared evidence dependencies are stale.
3. Dispatch one fresh independent `qa` verifier for every changed Freeze. It
   owns the combined evidence audit and semantic verdict against canonical
   OpenSpec. Do not dispatch another QA or plan reviewer for the same verdict.
4. Dispatch fresh security only when a security finding, protected invariant,
   security-relevant constraint, attack-surface path, or unknown impact changed.
   Otherwise carry prior evidence only by exact audited identity.
5. Consolidate structured findings. Zero open critical/high findings plus green
   deterministic quality converges; lower findings ship as residual concerns.
   Corrections require a different safe causal action, then a new candidate,
   quality receipt, verifier, and impact-required security result.

After validation passes, present Gate 3 only for a closed-list exception;
otherwise append the mechanical auto-ship release linked to Gate 1. Outward
writes still require valid live authority and native approvals. Apply
[delivery.md](references/delivery.md) to publish the exact accepted commit.

## Continuation and recovery

Before each continuation, replay the valid control-log prefix and read only the
phase reference named by the derived next action. Projection drift is repaired
from the log. Corruption stops at the first invalid record. Supported v1-v4
state converts once through create-then-switch; current v5 dispatch never calls
legacy routing modules or accepts mixed writable schemas.

## Non-negotiable floors

- Gate decisions originate only from the live operator presentation.
- Main owns control events and projections.
- One canonical worktree has at most one committing writer.
- OpenSpec and immutable inputs are hash-pinned and path-contained.
- Every changed Freeze has fresh independent acceptance evidence.
- Security runs when impact is true or unknown.
- Native permissions and outward-action approvals are never weakened.
- Preserve unrelated and untracked operator changes.
