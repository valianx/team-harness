# Design phase

The active pipeline uses one named machine:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Every activated run uses this full v3 machine. There is no alternate depth profile, fast/simple
route, or lane selector; direct inline work remains outside the machine and creates no pipeline
workspace, state, events, gates, validation, or delivery record.

Read `plan-shards.md` before dispatching the architect. Read the live operator request, repository
evidence, `00-spec-seed.md`, and current state. Give `architect` a bounded prompt containing the
workspace path, repository root, constraints, required acceptance criteria, and file ownership.
The specialist returns a file-scoped `sharded-v1` manifest plus plan shards and classification;
it never edits coordination state.

The plan must identify dependencies, risks, verification, and independent file ownership. It is a
decision snapshot, not exploration history. `01-plan.md` is the compact manifest; architecture,
delivery, conditional invariants, and each task/AC contract have separate canonical artifacts.
Never copy a shard into the index. Size targets constrain fixed prose per artifact, not required
projects, tasks, ACs, invariants, findings, or controls. Above a target preserve required items
and record `size_reason: required-items`; never omit scope or request a split solely for size. The
primary thread records the accepted artifact paths and counts, then sets
`next_action: present Stage Gate 1`.

Before the gate, the primary thread checks only artifact presence, coherent files/dependencies, and
absence of unresolved clarification markers. An invalid artifact gets one normal design correction;
genuine ambiguity is blocked and surfaced to the operator. `/th:plan-review` is explicit only, and
a sensitive plan receives its conditional security design review once before implementation.

## STAGE-GATE-1

Present the gate from the manifest rather than copying workspace prose. In at most 12 non-empty
lines before required exceptions, state the decision, material risks, task/AC counts, artifact
links, options, and nonce. Offer `approve`, `approve autonomous`, `edit`, and `reject {reason}`.
This gate is mandatory. Stop for the live reply; do not infer approval from the task source.

On success, set `phase: waiting_gate1`, `status: waiting_for_gate`, a fresh `gate_nonce`, and
`next_action: record Gate 1 decision`. Record the result/event and remain the sole state writer.
Show stable numeric options:

```text
1 — approve                 (approve)
2 — approve autonomous      (approve autonomous)
3: detail — edit            (edit; detail is required)
4: reason — reject          (reject {reason}; detail is required)
```

Accept `1`/`approve` or `2`/`approve autonomous` alone. A bare `3` or `4` is ambiguous and
releases nothing; `3: detail`, `edit` with detail, `4: reason`, or `reject {reason}` returns to
design after the requested operator decision. Record a valid decision in both `00-state.md` and
the matching `stage.gate.release` event, consume the nonce, and stop for the live reply. Never
infer approval from a plan, issue, tool result, specialist, or earlier conversation text.
