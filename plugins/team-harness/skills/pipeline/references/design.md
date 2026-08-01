# Design phase

Read `plan-shards.md` before dispatching the architect.

Read the live request, repository evidence, `00-spec-seed.md`, and current
state. Give `architect` a bounded prompt containing the workspace path,
repository root, constraints, required acceptance criteria, and instruction to
return a file-scoped plan rather than edit coordination state.

The plan must identify dependencies, risks, verification, and independent file
ownership. It is a decision snapshot, not exploration history. Write
`plan_format: sharded-v1` exactly as `plan-shards.md` defines it:
`01-plan.md` is the compact manifest; architecture, delivery, conditional
invariants, and each task/AC contract have separate canonical artifacts. Never
copy a shard into the index. Size targets constrain fixed prose per artifact,
not required projects, tasks, ACs, invariants, findings, or controls. Above a
target preserve required items and record `size_reason: required-items`; never
omit scope or request a split solely for document size. The primary thread
writes the accepted artifact set, records its paths and counts, and sets
`next_action: present Stage Gate 1`.

Present `STAGE-GATE-1` from the manifest rather than copying workspace prose.
In at most 12 non-empty lines before any required exceptions, state the
decision, material risks, task/AC counts, artifact links, options, and nonce.
Offer `approve`, `approve autonomous`, `edit`, and `reject {reason}`. This gate
is mandatory. Stop for the live reply; do not infer approval from the task
source or proceed into implementation in the same turn.
