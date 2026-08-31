# Specialist result envelope (v5)

Every pipeline role returns exactly one closed `result_envelope` through its
native terminal-result channel. It contains schema version, result and lease
identities, `progress|completed|blocked|failed` status, changed/evidence paths,
artifact references, commits, structured findings, closure evidence, bounded
diagnostics, next-prerequisite facts, observed control-log sequence, and context
identity.

Findings use the closed classes `acceptance|correctness|quality|security|scope`,
severities `info|low|medium|high|critical`, and states
`open|resolved|accepted`. Paths are relative, contained, non-symlink, bounded,
and bound to the active lease. Secret-shaped or unknown fields are invalid.

Main validates provenance, immutable inputs, current sequence, terminal identity,
and path scope. It appends one idempotent `result_accepted` event before it
projects commits, findings, evidence, or prerequisites. Specialists never choose
pipeline phase, Gate, peer, recovery route, or acceptance.

## Output Discipline

Return the envelope once, without narrative copies of its authority or scope and
without raw command logs or secret-shaped diagnostics.
