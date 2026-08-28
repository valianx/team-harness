# Coordinator causal recovery
<!-- Single source of truth for post-failure routing in an active pipeline.
     Phase, role, state, and liveness contracts point here and do not restate
     retry counts, replacement allowances, or correction budgets. -->

## Purpose and hard boundaries

Main continues approved work until acceptance closes. A failed, blocked,
interrupted, stale, or malformed attempt is evidence to diagnose; its ordinal
never revokes Gate 1, closes the pipeline, or discards progress.

Recovery may proceed without new operator authority only while all of these
remain true:

- the live Gate-1 authority and approved intent, scope, ACs, and security floor
  still validate;
- every prior writer for the same worktree and scope is terminal;
- repository, worktree, capsule, source, evidence, and Freeze identities are
  either valid or mechanically restorable from unchanged canonical evidence;
- writes remain inside the original role and path ownership; and
- the resulting candidate must still pass the required quality, acceptance,
  and security checks before publication.

A scope, intent, AC, security-obligation, or outward-effect decision uses its
existing live gate/decision contract. Native sandbox, credentials, network, and
other external prerequisites remain technical boundaries. No retry history is
authority for either route.

## One recovery rule

After any non-success Main:

1. confirms the prior writer is terminal and audits only its declared owned and
   evidence paths;
2. preserves valid commits, staged state, diffs, and artifacts; Main never
   rewrites specialist-owned product work merely to make recovery convenient;
3. classifies the observable cause and binds its bounded evidence;
4. repairs coordinator-owned mechanical defects directly, or chooses the
   appropriate fresh specialist for product, test, acceptance, or security work;
5. records one causal recovery identity over the role, immutable scope identity,
   strategy identity, failure-evidence hash, recovery kind, and recovery-evidence
   hash; and
6. resumes or redispatches with a fresh correlation token, exclusive write
   ownership, unchanged semantic authority, and the required downstream checks.

The same causal recovery identity must not be dispatched again after it
reproduces the same failure. Another dispatch is legal when current verifiable
evidence proves a material change, such as a repaired runtime or adapter,
recompiled contract/capsule, restored dependency, corrected evidence binding,
different diagnostic hypothesis, or preserved-progress handoff. This is a
causal guard, not a numeric budget: new evidence may produce as many recovery
actions as the work requires.

Mechanical defects found before repository work begins consume no functional
attempt and no new authority. Main fixes or recompiles the canonical artifact,
reruns the deterministic preflight, and dispatches only after it passes.

## Observability and stopping conditions

Attempt, interruption, correction, continuation, and iteration ordinals are
append-only observations derived from events. They may trigger diagnostics or
operator-visible health warnings, but never select, deny, or exhaust a route.

Pause with the exact missing condition in `next_action` only when no verifiable
recovery is currently available: authority is required, another writer may be
active, integrity cannot be restored without semantic change, an external
prerequisite is unavailable, or every known strategy would repeat the same
causal identity. A pause preserves the workspace, Gate 1, scope, commits, and
evidence and is recoverable when the condition changes.

Only `phase/status: complete|aborted` closes the pipeline. Specialist
`failed|blocked|interrupted` results are terminal for that specialist execution,
not for the pipeline.
