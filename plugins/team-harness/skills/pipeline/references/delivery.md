# Delivery phase

Enter only after the canonical v3 validation passes and the state is at `waiting_gate3` with its
evidence and Freeze anchor current. Require passing acceptance evidence. Delegate local delivery
preparation with `plan/delivery.md`, conditional `plan/invariants.md`, and accepted evidence
pointers only; do not attach architecture or task shards unless a named delivery fact is absent.
Request version/changelog proposal, commit and PR-body draft, changed-file summary, acceptance
matrix, and review evidence. Preparation must not push, create or mutate a PR, merge, tag, release,
or publish.

Keep the delivery artifact at ≤60 lines and ≤12 KB. Point at canonical diff, test, and review
evidence instead of restating it. The primary thread consolidates the final diff and presents
`STAGE-GATE-3` with a concise delivery summary, version/changelog preview, relevant security
findings, and these stable options:

```text
1 — ship    (ship)
2 — amend   (amend)
3 — abort   (abort)
```

```text
1 — ship    (ship)
2 — amend   (amend)
3 — abort   (abort)
```

Stop for the live operator reply even when Gate 1 granted `approve autonomous`.
Only a valid dual-record `gate3_release: ship` permits the specifically
previewed outward actions, and each action still requires normal Codex/runtime
approval. An `amend` decision returns to the smallest affected implementation
delta, rebuilds Freeze, reruns validation, and presents Gate 3 with a fresh
nonce; old delivery evidence is invalid. An `abort` stops without delivery or
push.

Never force-push or publish broader scope than the approved, frozen tree. After
successful local delivery, set `phase: complete` only after the terminal
artifacts and events are present; otherwise record the failure and resume from
the precise `next_action` without replaying completed states.
