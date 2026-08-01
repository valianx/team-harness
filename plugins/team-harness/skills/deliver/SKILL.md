---
name: deliver
description: Complete standard delivery after an accepted pipeline receives a valid Gate 3 ship release. This skill does not activate the pipeline; without active Team Harness state, use normal direct Codex behavior.
---

# Deliver

Locate state whose `activation` is `explicit`. If none exists, do not create
pipeline state or gates; read `../init/references/configuration.md`, resolve the
persistent settings, and continue in ordinary direct mode while obeying normal
runtime approvals.

For an active pipeline, read
`../pipeline/references/state-and-gates.md` and
`../pipeline/references/delivery.md`. Require passing acceptance evidence and a
valid dual-record `STAGE-GATE-3: ship` release. That live reply is the single
operator decision for standard delivery through version/changelog, commit,
feature-branch push, and draft PR creation/update. Do not ask again between
those steps. Native Codex tool approval may still be surfaced as a technical
runtime boundary; it is not another Team Harness decision or gate. Merge, tag,
release, publication, force-push, and broader scope remain excluded.
