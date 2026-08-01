# Delivery phase

Before Gate 3, require passing acceptance evidence and a current Freeze anchor. The primary
thread deterministically computes the version/changelog preview, changed-file summary, standard
delivery actions, and relevant security findings. Present them once with:

```text
1 — ship    (ship)
2 — amend   (amend)
3 — abort   (abort)
```

Stop for the live reply even when Gate 1 granted `approve autonomous`. `amend` returns to the
smallest affected implementation delta, rebuilds Freeze, reruns validation, and presents a fresh
Gate 3 nonce. `abort` stops without delivery or push.

After a valid dual-record `gate3_release: ship`, do not ask the operator for another delivery
decision. Delegate the bounded prose package using `plan/delivery.md`, conditional
`plan/invariants.md`, and accepted evidence pointers only. Request the changelog/PR-body prose,
acceptance matrix, and review evidence; never attach unrelated task or architecture shards.

The primary thread then applies the previewed version/changelog, stages and commits the frozen
scope, pushes the feature branch, and creates or updates its draft PR. Native Codex tool approval
may still appear for a command or connector call, but it is a technical runtime boundary—not a
new Team Harness question, gate, or operator decision. Never ask separately for version, commit,
push, or draft PR after `ship`.

Keep the delivery artifact at ≤60 lines and ≤12 KB and point to canonical evidence. Never
force-push or publish broader scope than the approved frozen tree. Merge, tag, release, and
publication require a separate explicit live request and are not part of `ship`. Set
`phase: complete` only after the terminal delivery artifacts/events and draft PR are present;
otherwise record the precise failure and recover without replaying completed phases.
