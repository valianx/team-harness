# Acceptance evidence (v5)

Acceptance evidence travels only inside a result envelope as contained paths,
hash-bound artifacts, structured findings, and closure evidence. Main accepts it
once through a `result_accepted` control event and derives the human-readable
acceptance view. A report, receipt, checklist, or projection is not authority.

Every changed Freeze requires one fresh independent QA verifier that owns the
combined evidence audit and semantic OpenSpec verdict. A separate tester runs
only for the closed independent-test predicate: bug reproduction, migration or
data safety, public compatibility, security-control change, stale independently
authored evidence, or an explicit operator request. Security evidence is fresh
when changed impact is true or unknown. Missing, stale,
identity-mismatched, or incomplete evidence remains an open finding and cannot
be hidden by a projection counter.
