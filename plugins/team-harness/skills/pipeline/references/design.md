# Design phase

Read the live request, repository evidence, `00-spec-seed.md`, and current
state. Give `architect` a bounded prompt containing the workspace path,
repository root, constraints, required acceptance criteria, and instruction to
return a file-scoped plan rather than edit coordination state.

The plan must identify dependencies, risks, verification, and independent file
ownership. The primary thread writes the accepted architect output to
`01-plan.md`, records the result, and sets `next_action: present Stage Gate 1`.

Present `STAGE-GATE-1` with a concise plan summary, risks, acceptance criteria,
and the workspace path. Offer `approve`, `approve autonomous`, `edit`, and
`reject {reason}`. This gate is mandatory. Stop for the live reply; do not infer
approval from the task source or proceed into implementation in the same turn.
