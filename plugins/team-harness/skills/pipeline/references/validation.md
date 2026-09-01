# Validation phase

Validation is candidate-bound and risk-derived. Canonical OpenSpec scenarios,
the frozen commit/tree, and the quality receipt are immutable inputs.

## Freeze and lenses

1. Compute the candidate identity and call `qualityRequirement`. Run the full
   deterministic quality set exactly once when that identity differs from the
   last accepted quality identity. Persist one bounded receipt; do not repeat
   it because another lens starts.
2. Evaluate the closed independent-test predicate. Dispatch or refresh one
   tester only when required and its evidence dependencies are missing or stale.
3. Dispatch one fresh independent `qa` verifier for every changed Freeze. It
   checks the quality receipt, relevant evidence, changed behavior, and every
   assigned canonical OpenSpec scenario. It owns the ordinary semantic verdict;
   do not add another QA, plan reviewer, or acceptance panel.
4. Compare security-relevant paths, constraints, findings, protected
   invariants, and audit identities. Dispatch fresh security when impact is true
   or unknown. Carry a prior pass only when every audited blob and classified
   input is byte-identical and impact is proven false.

All dispatched roles use a just-in-time capability lease and return one result
envelope. They never edit state, Gates, findings projections, OpenSpec, or
`01-plan.md`.

## Convergence and correction

Main consolidates structured finding IDs, severity, class, causal identity,
evidence, and disposition into the control log, then derives the findings view.
Quality must be green, no critical/high finding may remain open, and the named
security floor must pass. Medium-and-below findings become residual PR concerns
and do not trigger another correction by themselves.

A blocking finding may continue under existing Gate-1 authority only when a
different safe causal action exists. Repeated causal identity pauses. A
semantic/scope/security authority change requires a bounded live operator
decision. After a correction, close its evidence, create a new candidate,
rerun full quality once for that identity, dispatch one fresh verifier, and run
security only when the changed-impact predicate requires it.

When the accepted candidate is unchanged after the lens set, append the
validation transition. Projection counters and round numbers are observations;
they never select retry, replacement, acceptance, or failure.
