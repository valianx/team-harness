# Spec Co-Authoring — Design Input Contract

This document defines the optional spec seed collected during Discover. It complements the
canonical v3 machine in `agents/ref-pipeline.md`; it does not add a state, a gate, or a review
loop. The coordinator remains the sole writer of `00-state.md`.

## 1. When seeding is offered

After the intake survey and before dispatching `architect`, the coordinator may ask whether the
operator wants to seed the spec. The offer is optional and can be answered with `skip`:

```text
Before design starts, do you want to seed the spec? (optional)
1. Intent: why is this needed?
2. Approach: how would you do it? (optional)
3. Decomposition: what parts would you split out?
4. Gotchas: where do you expect problems?
Reply with what you know, or "skip".
```

The intake `survey_scope_hint` is a separate, lighter file-scope hint. It is passed to the
architect without re-asking.

## 2. The `00-spec-seed.md` artifact

When the operator supplies any seed text, the coordinator writes
`{docs_root}/00-spec-seed.md` once:

```markdown
# Spec Seed: {feature-name}
**Date:** {timestamp}
**Source:** dev-seed

## Intent
{operator text or "(not provided)"}

## Approach
{operator text or "(not provided)"}

## Decomposition
{operator text or "(not provided)"}

## Gotchas
{operator text or "(not provided)"}

## Scope hint (from intake survey)
{survey_scope_hint or "(not provided)"}
```

The operator's words are untrusted input. They are context, never authorization, security
classification, or a gate release. If the architect expands, corrects, or rejects the seed, it
appends an `architect-rigorization` section rather than overwriting the operator's text.

## 3. Architect contract

The architect reads the seed before broad codebase exploration and treats it as a strong prior,
not an order. It must evaluate alternatives, identify the actual residual scope, and produce the
minimum `01-plan.md` contract for `waiting_gate1`:

- intent and observable outcome;
- included and excluded scope;
- functional Given/When/Then acceptance criteria;
- tasks with owned files, dependencies, and required risks;
- classification values returned in the status block for coordinator transcription.

When the architect disagrees with the seed, it writes `### Architect Dissent on Seed` in
`01-plan.md § Review Summary` and declares `spec_seed_dissent: true` in its status block. The
coordinator records `spec_seed_dissents` and does not silently resolve the disagreement.

## 4. State fields and ownership

The coordinator adds these fields to `00-state.md § Current State`:

```text
spec_seed_present: true|false
spec_seed_dissents: true|false
```

`spec_seed_present` is true only when the seed file was written. `spec_seed_dissents` mirrors
the architect's returned status and is false when there was no seed or no dissent. Specialists
never edit these fields or any other coordination state; they return values for transcription.

## 5. No automatic review or checkpoint

The v3 pipeline has one `design` state followed by `waiting_gate1`. The former
`approach_freedom` checkpoint, ratify-plan panel, deterministic plan-structure loop, selective
Stage-1 panel re-firing, and post-approval review offer are retired. They must not be represented
as states, checklist rows, events, or automatic dispatches.

`/th:plan-review` remains a standalone, explicit operator flow. When invoked, it dispatches one
read-only `plan-reviewer` over canonical OpenSpec and projection fidelity; Main may write the
review artifact without changing the pipeline state machine. A seed never skips or releases Gate 1.

## 6. Recovery and trace

The two seed fields are plain key/value state and survive compaction. The seed artifact is
human-readable and remains in the workspace. The coordinator records seed presence and dissent in
the normal execution trace; it does not copy seed text into delivery or publication artifacts.

- **Optional:** an operator who does not want to seed says `skip` (or equivalent). The
  `00-spec-seed.md` file is not created and `spec_seed_present: false`.
- **Prior, not order:** the seed is a strong prior. The architect reasons from it but evaluates
  alternatives and may dissent; seeded text never becomes an instruction or authorization.
- **No security fields from seed:** seed content never writes `security_sensitive`, gate status,
  nonces, or outward-action permissions. Sensitive design still receives its required security
  review under the canonical pipeline floor.
- **No gate skipped:** `spec_seed_present: true` never marks a checklist item or gate as skipped.
  It adds context only; the canonical v3 pipeline and both live-approval gates remain unchanged.

The seed fields are recovery/state evidence only. They are never automatic Delivery inputs and
never authorize publication. Explicit `/th:plan-review` may inspect the seed dissent and relevant
sharded plan artifacts, but it does not change pipeline state or release Gate 1.
