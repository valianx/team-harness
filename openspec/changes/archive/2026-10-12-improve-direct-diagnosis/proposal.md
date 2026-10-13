## Why

Audit and find-bugs already require contextual evidence, but their guidance can make capability outcomes, data/state causes and remaining uncertainty more useful to the operator. The selected REA research ideas can improve these direct TH methods without adding a dependency.

## What Changes

- Make audit coverage start from a selected user/system outcome and expose its entry, configuration, component/dependency handoffs and resulting behavior in the existing report.
- Strengthen functional investigation with a concrete behavioral question and a causal data/state path to the downstream symptom. Treat relevant version differences as leads whose correctness and origin need evidence.
- Reuse applicable diagnostic evidence, renew affected evidence after changes and identify the missing observation behind material uncertainty.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `quality-diagnosis`: Strengthen capability coverage, concrete bug investigation and evidence applicability in direct audit/find-bugs.

## Non-Goals

- REA discovery, preparation, invocation or result consumption in either direct mode.
- A new scanner, schema, checklist framework, mandatory version diff or whole-history review.
- Repairs, PR review, a broader architecture rewrite or claims that static reasoning reproduces runtime behavior.

## Impact

Canonical audit and find-bugs skills, audit coverage reference, the architect's existing Audit Mode report guidance, generated distributions and the quality-diagnosis living spec. Validation uses existing distribution suites and focused source review; no prose-presence tests or live model benchmark is planned. This change shares the research-app PR and workspace while keeping dependency selection independent.
