## Context

Existing diagnosis already requires consumer tracing, contextual scanner dispositions and evidence limitations. Strengthen those paths rather than create another method. The implementation shares a PR with `add-research-app-rea` but has no dependency on REA.

## Decisions

- Extend `skills/audit/references/coverage-method.md` with outcome-led capability tracing and applicability/uncertainty. Keep the audit skill and `agents/ref-architect-modes.md` report guidance pointing to that one method.
- Extend `skills/find-bugs/SKILL.md` within its existing contextual investigation: behavioral question, relevant data/state causal chain, optional history leads and explicit missing observations. No fixed list of bug types or required diff is introduced.
- Source observations remain source facts; predicted runtime behavior remains inferred until exercised. A supported inferred defect can be reported with its evidence status without inventing reproduction or origin.
- Reuse evidence whose question, source, environment and configuration still apply; refresh only affected evidence after changes. Preserve completed independent analysis and unresolved limits.
- Synchronize skills and role projections using existing tools. Validate machine distribution with maintained suites and inspect scenario fidelity manually; no automated model-compliance or prompt-wording test is claimed.

## Acceptance examples and risks

- A workflow entry crosses an adapter and workspace boundary: distinguish inspected source, inferred outcome and an unverified destination handoff.
- A cache key omits a tenant: connect request inputs, key construction, stored state and the consuming response, distinguishing reproduction from static inference.
- An earlier version filters cancelled records: use the difference to inspect the current contract; keep defect/regression origin unresolved when unsupported.
- A resumed analysis reuses a valid scan; a changed cache implementation renews its affected evidence while unrelated completed analysis remains applicable.

The main risk is inflating evidence into a runtime guarantee. Independent source review checks the integrated guidance and the REA boundary; real distribution checks do not establish model behavior.
