# Author review

Independent reviewers help the coordinator find defects and challenge
assumptions before delivery. Use them where they add value to spec, direct, or
pipeline work, respecting an explicit operator preference about review.

Select the useful lenses for the change: behavior and acceptance, tests,
security, or adversarial failure cases. Security-sensitive changes benefit from
security expertise; the selection remains a reasoned workflow choice, not an
automatic publication gate. A small mechanical correction may reuse existing
review evidence.

Give each reviewer the same identified candidate, intended behavior, scope and
relevant acceptance sources. `review-fan.mjs package` in the verify skill can
prepare immutable Git evidence when a committed candidate is available. Follow
the current verify skill for its interface. Use native read-only reviewer roles;
report any unavailable lens or missing coverage honestly.

Keep findings, severity, supporting evidence, coverage limits and disagreements.
The coordinator has the user's broader context and decides which findings need
correction, which proposals to adapt, and which concerns to accept with reasons.
Missing output is not a pass, and a historical failure does not automatically
veto a candidate whose underlying defect has been fixed and verified.

After repairs, identify the changed candidate and validate affected behavior.
Request a focused follow-up when the original concern or coverage warrants it.
Do not repeat an entire review solely to change an old verdict label.

When the objective and relevant validation are satisfied, use the existing
authorization and `create-pr` to deliver. Neither a helper's summary nor a
reviewer grants push, PR or merge permission; those remain with the operator's
request and the native runtime.
