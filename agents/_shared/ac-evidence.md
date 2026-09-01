# Acceptance evidence (v5)

Acceptance evidence travels only inside a result envelope as contained paths,
hash-bound artifacts, structured findings, and closure evidence. Main accepts it
once through a `result_accepted` control event and derives the human-readable
acceptance view. A report, receipt, checklist, or projection is not authority.

Every changed Freeze requires an independent fresh QA result. Security evidence
is fresh when the impact predicate is true or unknown. Missing, stale,
identity-mismatched, or incomplete evidence remains an open finding and cannot
be hidden by a projection counter.
