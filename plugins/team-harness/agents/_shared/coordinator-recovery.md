# Coordinator causal recovery (v5)

Recovery begins by preserving valid progress and proving that the prior writer
is terminal and the canonical worktree has one committing owner. Main then
compares authority, intent/scope/security, immutable inputs, context, ownership,
failed-action identity, safe-next-action identity, and independent-lens needs.

- Continue the same lease and session when all identities and exclusive
  ownership remain valid, context is verifiable, and changed evidence supports
  a safe action with a different causal identity.
- Replace the session only when the lease remains valid but context cannot be
  verified or an independent lens must change.
- Pause when ownership/integrity/prerequisites cannot be proven or every known
  action repeats the same causal identity.
- Obtain a live decision when approved meaning, scope, security authority, or an
  outward effect changes.

Counts, ordinals, elapsed time, token use, tool calls, and telemetry never select
these routes. A changed candidate always receives fresh QA. Security is fresh
when impact is true or cannot be proven false. The executable classifier is
`decideCausalRecovery` in `skills/pipeline/scripts/control-plane.mjs`.
