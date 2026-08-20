# Reasoning Checkpoint — Contract

The reasoning checkpoint is a reusable gate for the canonical `pipeline` posture. It applies at
three pipeline boundaries to ensure the operator has provided a fresh advance signal **and** a
confirmed functional-clarity artifact before any phased dispatch proceeds. `inline` is the direct
default and does not enter this checkpoint, create pipeline state, or dispatch pipeline phases;
live tester/QA/security ad hoc reviews remain inline with bounded evidence only.

This document is the authoritative contract, read by `agents/ref-pipeline.md` only after an activated run reaches B1, B2, or B3.

---

## Boundaries

| ID | Boundary | Before advancing to… | Clarity artifact required (floor) |
|----|----------|---------------------|-----------------------------------|
| B1 | intake → plan | dispatch of `th:architect` (Phase 1) | confirmed functional statement ("what we are building, functionally") |
| B2 | research → next-step | any next action after a research-mode pipeline | "what we do with this" confirmed by the operator |
| B3 | post-verify → next-step | any next action after Verify (Phase 3.x) completes | confirmed direction for the next step |

**B1 is the generalization in-place of the Discover gate one-shot defined in `docs/discover-phase.md §3`.** The pre-existing gate (frame → clarify → confirm → await response) becomes boundary B1 of this checkpoint. The mechanism is unchanged; only the abstraction is made reusable. `docs/discover-phase.md §3` is updated to reference B1 of this contract rather than describing a standalone one-shot gate.

---

## Advance contract (deterministic)

The pipeline does **not** advance past any boundary unless `00-state.md` records **both**:

**(a) Fresh explicit advance signal** (`checkpoint_advance_fresh: true`)
The operator's response was a direct answer to the explicit confirmation prompt of the checkpoint — not an advance keyword carried over from an earlier message. This reuses the semantics defined in `docs/discover-phase.md §2`: an advance keyword in the operator's INITIAL message does not satisfy the gate; only a response to the checkpoint prompt counts.

**(b) Confirmed functional-clarity artifact** (`functional_clarity_confirmed: true`)
A short functional statement that describes what the operator wants to build or do — confirmed as accurate by the operator. The guard checks that the artifact **exists** and is **dev-confirmed**. It does NOT evaluate quality, completeness, or approach. The form is the floor; a richer list of behaviours is optional.

Both conditions must hold simultaneously. A fresh advance signal alone is not sufficient. A confirmed artifact alone is not sufficient.

---

## `00-state.md` — new fields

Add to `## Current State`:

```
- checkpoint_boundary: {intake-plan | research-next | postverify-next | null}
  # active boundary; null when no boundary is currently armed
- checkpoint_advance_fresh: {true | false}
  # true when the advance signal was a response to the checkpoint prompt (not carried over)
- functional_clarity_artifact: {<short functional statement> | null}
  # the confirmed functional statement; null until the operator confirms it
- functional_clarity_confirmed: {true | false}
  # DERIVED CACHE — the `checkpoint.confirmed` event in {events_file} is the sole
  # authority (see "Attribution and failure direction" below); this field mirrors
  # its `provenance` for convenience and is never consulted in place of the event
```

These four fields coexist with the pipeline's existing `discover_state`, `advance_signal`, and
metadata fields. They are complementary, not route selectors. `checkpoint_advance_fresh` is the
deterministic predicate the guard reads; `advance_signal` continues to record the specific live
form.

---

## Enforcement

**Prose-only.** No hook enforces this checkpoint. `hooks/checkpoint-guard.sh` does not exist —
it was removed in the TypeScript cutover, and `.claude-plugin/hooks.json` records that
`checkpoint-guard` has been unregistered since v2.139.0 along with `gate-guard`,
`prepublish-guard` and `worktree-guard`, because they enforced process over a non-deterministic
agent flow and accumulated false positives faster than they prevented incidents.

The coordinator therefore honours the advance contract above by reading its own `00-state.md`
before a gated dispatch. Its worst case is a skipped pedagogical pause, not a bypassed security
control — the security floor and the outward-action floor are separate and are enforced
elsewhere. Treat `.claude-plugin/hooks.json` as the authority on what actually runs.

### Attribution and failure direction (B1)

The B1 clarity artifact is not self-attesting. The coordinator appends a `checkpoint.confirmed` event to `{events_file}` (Intake) carrying the operator's own confirmatory words — within the named exception to the Free-text field bound (`docs/observability.md § Free-text field bound`) — and a `provenance` field: `operator-live` (a fresh reply from the operator in this same conversation) or `inferred` (a re-ask returned without a live reply). Retired skip-marker wording is never a source of confirmation. The event, not `functional_clarity_confirmed`/`functional_clarity_artifact` above, is the sole authority at every arrival, including a `/th:recover` re-entry — those two fields are a derived cache for quick reference and are never consulted in place of the event.

**Failure direction.** Absent attribution — no `checkpoint.confirmed` event, or one carrying
`inferred` — is not clarity-confirmed. The coordinator makes one re-ask, never an automatic loop.
If no live reply returns, it records the inferred attempt, leaves Discover open and
`functional_clarity_confirmed: false`, and stops without dispatching `architect`. A later live
operator message may answer the pending checkpoint. The run is paused and visible, not aborted;
it never advances to a gate on inferred provenance.

---

## Legacy skip-marker behavior — superseded

Older runs allowed `--fast`, `[TIER: N]`, or a hotfix phrase to bypass this checkpoint. That route
is **superseded** and is retained here only as migration history; those values are not active
selectors and cannot skip a phase, alter canonical full v3, or release a gate. A live operator who
encounters one receives the explicit posture choices `1 — inline` / `2 — pipeline`, plus `3 — /th:spec` whenever its predicate passes. Choice `1`
stays direct without checkpoint state; choice `2` enters the normal checkpoint contract above.

---

## Postura

The checkpoint is not a restraint gate — it is a reasoning-engagement surface. The coordinator enters each boundary (B1 intake→plan, B2 research→next, B3 postverify→next) as a reasoning partner. The posture defined here applies at every boundary.

### Disagreement license

The coordinator is authorized and expected to disagree with the operator's framing or approach when warranted. "No concerns" is suspicious, not a green light — genuine friction is expected. Disagreement is triggered (not constant): it fires when the idea is unclear OR when it violates a documented project standard. It does not fire on every interaction.

### Standards anchor

All disagreement is grounded in the project's codified standards: CLAUDE.md working agreements §6, architectural conventions §5, or any other documented constraint. The objection must be legible and defensible ("this breaks documented §X") — never the model's taste or an undocumented preference.

### Win-condition reframe

Success at the checkpoint is NOT "produced the artifact / reached the plan." Success is: the developer reached clarity + the idea meets the bar + the developer understands why.

Pedagogy clause: always expose the WHY behind a concern (the junior learns, the senior verifies). Do NOT force a Socratic march — state the concern and the reasoning; the developer chooses the depth. Bounded by: this is still work, never a seminar, and it never blocks delivery.

### Concise engagement / internal reasoning

The reasoning-partner posture does NOT license over-explaining or surfacing the full internal reasoning chain. Surface only the salient friction and the decision-relevant why, briefly. Keep the rest of the reasoning internal.

This is the explicit counterweight to the sycophancy fix: a critical partner who is also concise. Aligns with CLAUDE.md §7.1 voice and output-discipline (operate silently, surface decisions and results).
