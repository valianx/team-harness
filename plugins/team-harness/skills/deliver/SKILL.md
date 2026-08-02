---
name: deliver
description: Complete standard delivery after an accepted pipeline receives a valid Gate 3 ship release. This skill does not activate the pipeline; without active Team Harness state, use normal direct Codex behavior.
---

# Deliver

Use only the exact `00-state.md` already selected by the current pipeline thread
or by an explicit validated feature argument. Never scan for an arbitrary
`activation: explicit` snapshot and never choose by mtime. Require the canonical
state path to remain below its resolved workspace root and require its
`repo_root`, `workspace`, `working_branch`, and current checkout to match the
active run. If no exact state is available, do not create pipeline state or
gates; read `../init/references/configuration.md`, resolve persistent settings,
and continue in ordinary direct mode while obeying normal runtime approvals.

For that exact active pipeline, read
`../pipeline/references/state-and-gates.md` and
`../pipeline/references/delivery.md`. Require passing acceptance evidence and a
valid dual-record `STAGE-GATE-3: ship` release whose event carries the consumed
nonce from this run's current presentation. Require `phase: delivery`, `status:
in_progress`, and unchanged `delivery_preview` paths/digests before any write.
Require a clean worktree and exact equality of current `HEAD`/`HEAD^{tree}` to
the recorded `validated_commit_sha`/`validated_tree_sha`. That live reply is the
single operator decision for the feature-branch push and draft PR
creation/update. Do not ask again between those steps. Do not fetch/reconcile
the default branch, run tests, edit version/changelog, stage, commit, merge, or
rebase during delivery. Before push, recompute the non-blocking default-base status with
`git ls-remote`, compare it with `verification_base_ref`, and report `current`, `moved`, or
`unknown` without mutating refs or the validated commit. Native Codex tool approval may still be surfaced as a technical
runtime boundary; it is not another Team Harness decision or gate. Merge, tag,
release, publication, force-push, and broader scope remain excluded.
