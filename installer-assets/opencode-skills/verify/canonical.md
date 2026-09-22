
# Verify

Review the operator's immutable committed target without activating a pipeline
or publishing anything. Main coordinates independent reviewers and judges their
evidence under the [inline review contract](../../agents/_shared/inline-review-contract.md).
That contract owns target identity, native read-only dispatch, coverage and
return handling; this skill does not restate those procedures.

## Prepare and review

In [the four-phase development flow](../spec/references/development-phases.md),
this is the independent candidate review within Validation. Reuse the effort's
workspace, selected lens decision and applicable project/provider evidence. Keep
reviewed and corrected candidates distinct and return findings and closure to
the same plan before Publication; a direct verify request remains review-only.

Use `scripts/review-fan.mjs` from this selected skill installation. When developing
TH itself, use the repository's canonical copy. Do not select a helper from another
runtime's cache or an unbound newer directory.

Build the package with `review-fan.mjs package`, the canonical repository,
committed range and requested lenses. Bind an authored OpenSpec change through
`--change`, using its exact `archive/YYYY-MM-DD-<change>` location when archived.
The helper supplies changed-surface risk signals, the explicitly requested lens
set, coverage and prerequisite diagnostics. Risk signals are recommendations for
Main's reviewer selection; they do not add mandatory lenses or grant authority.
Repair a reported operational prerequisite within the authorized scope; do not
substitute an unbound manual result for missing evidence.

Use the emitted package for every lens, following the shared contract's selected
profile and activation checks. A checker-verified empty review surface needs no
reviewer dispatch; report the actual checker evidence. Missing selected coverage
or unavailable native activation is a limitation, never an inferred pass.

## Decide and report

Collect the original returns and run `review-fan.mjs summary` (`gate` remains a
compatibility alias). Report findings, coverage limits and factual observations
against the reviewed revision. The summary is evidence for Main and the operator;
it does not grant or deny publication. Preserve the result after repairs; a
subsequent spec-author publication follows
[author-review closure](../spec/references/author-review.md) with a separately
identified corrected head and evidence for each disposition.

The first review uses full scope. A requested review of fixes uses the shared
contract's prior-anchor delta path; it is not an automatic second round. Security
and adversary coverage selected by the operator or Main remains applicable. Main must close
actual blockers and explain residual concerns rather than treating a reviewer's
verdict as a new source of operator authority.
