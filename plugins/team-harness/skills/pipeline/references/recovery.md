# Recovery (v5)

Replay the valid control-log prefix and rebuild projections before routing.
Preserve valid progress, prove the prior writer terminal and exclusive ownership
safe, then call causal recovery with authority, semantic identities, immutable
inputs, context, failed-action identity, safe-action identity, prerequisites,
and independent-lens impact.

Reuse the same lease/session only when those identities are unchanged, context
is verifiable, and changed evidence supports a different safe action. Replace a
session for unverifiable context or an independent-lens change. Pause on unsafe
ownership, broken integrity, unavailable prerequisites, or repeated causal
identity. Obtain a live decision for changed intent, scope, acceptance,
security authority, or outward effect.

Liveness supplies delivery, acknowledgement, terminality, progress, and
interruption facts only. Counts, ordinals, elapsed time, tokens, tool calls, and
telemetry never select a route. A changed candidate receives one fresh
independent verifier; a separate tester is risk-derived, and security is fresh
when impact is true or unknown.

A workspace without `control/control.jsonl` has nothing to replay. Close it
administratively through the packaged helper, which appends one `pipeline.close`
entry and refuses a symlinked `control/` path, then offer inline continuation or
a fresh run. Ambiguous authority or mixed writable schemas fails closed.
