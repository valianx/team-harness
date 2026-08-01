# Delivery phase

Before Gate 3, require passing acceptance evidence and a current Freeze anchor. The primary
thread deterministically computes the version preview, changed-file summary, standard delivery
actions, and relevant security findings, then delegates the bounded prose preview. Validate its
workspace-only outputs and bind their exact paths and SHA-256 digests to `delivery_preview`.
Present the title, artifact paths/digests, and delivery summary once with:

```text
1 — ship    (ship)
2 — amend   (amend)
3 — abort   (abort)
```

Stop for the live reply even when Gate 1 granted `approve autonomous`. `amend` returns to the
smallest affected implementation delta, rebuilds Freeze, reruns validation, and presents a fresh
Gate 3 nonce. `abort` stops without delivery or push.

After a valid dual-record `gate3_release: ship`, do not ask the operator for another delivery
decision and do not regenerate prose. Re-read every preview artifact, require its path and
SHA-256 to match `delivery_preview`, and require each path to be the canonical non-symlink
filename under the selected workspace's `inputs/` directory. Materialize the exact approved
changelog draft at its validated `changelog.d/{slug}.md` target when applicable. Immediately
before a PR create/update, revalidate the exact recorded PR title, body path, and body digest.
Any missing, changed, or out-of-scope artifact blocks and requires a fresh Gate 3 presentation;
never silently recompose it.

Immediately before staging, require that the checked-out branch is non-default, is not `main` or
`master`, and starts with one of the repository's allowed delivery prefixes: `feature/`, `fix/`,
`hotfix/`, `refactor/`, `docs/`, `test/`, or `chore/`. An absent, detached, default, or otherwise
unapproved branch blocks delivery before any commit, push, or PR mutation.

The primary thread then applies the previewed version/changelog, stages and commits the frozen
scope, pushes the feature branch, and creates or updates its draft PR using the exact approved
body. Native Codex tool approval
may still appear for a command or connector call, but it is a technical runtime boundary—not a
new Team Harness question, gate, or operator decision. Never ask separately for version, commit,
push, or draft PR after `ship`.

Keep the delivery artifact at ≤60 lines and ≤12 KB and point to canonical evidence. Never
force-push or publish broader scope than the approved frozen tree. Merge, tag, release, and
publication require a separate explicit live request and are not part of `ship`. Set
`phase: complete` only after the terminal delivery artifacts/events and draft PR are present;
otherwise record the precise failure and recover without replaying completed phases.
