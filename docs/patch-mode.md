# Patch Mode — Final-Result Correction Contract

Patch mode defines how a v3 pipeline responds when validation finds a bounded defect. It is a
correction path inside the canonical machine, not an additional state or gate:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
                         ▲                    │
                         └──── in-scope defect┘
```

The coordinator remains the only writer of `00-state.md`, events, decisions, and gate releases.
Specialists return a finding and a correction target; they never repair coordination state.

## 1. Finding classification

Validation reports one of these outcomes:

| Finding | Route | Design re-open? |
|---|---|---|
| Code, test, or documentation defect inside approved scope | implementation executor | no |
| Missing or invalid evidence | tester | no |
| Correctable security finding in the changed diff | implementation, then delta audit | no |
| Observation that does not violate AC or the security floor | preserve for Gate 3 disposition | no |
| Contradiction between intent, scope fence, and AC | operator decision | only after explicit decision |

Never rewrite an acceptance criterion to manufacture PASS. A structural contradiction is not a
bounded patch: the operator decides whether design reopens, the architect produces a revised
plan, and the coordinator presents a fresh Gate 1. This is the only route back to `design` from
`validation`.

## 2. Bounded patch contract

The finding owner declares a bounded target in its report (AC identifier, task, file, or function)
and states the cause, evidence, and required correction. When the target is uncertain, the owner
declares the finding structural and the coordinator does not narrow it.

The implementation executor then:

1. edits only the named implementation/test/documentation surface;
2. records the root cause and changed files in the implementation artifact;
3. preserves the approved scope and AC text; and
4. returns a status block with the affected ACs and evidence needed for revalidation.

The coordinator reruns the deterministic checks and the smallest affected validation delta. Any
tree change after Freeze reopens Freeze and the affected validation before Gate 3. A sensitive
finding receives a fresh audit of the changed delta; this is not a waiver or a design loop.

## 3. Evidence and iteration budget

Tester owns evidence gaps. QA owns functional and hygiene findings. Adversary owns adversarial
findings when the security floor applies, but a correctable finding is still routed to the
implementation executor. Each correction consumes the shared implementation/validation budget
defined in `agents/ref-pipeline.md`; transport, invalid-return, artifact-missing, build/lint,
contradiction, and reclassification failures use their named budgets instead.

The coordinator may run a deterministic test command before a reasoning lens (R0), then the
finding owner (R1), then the other affected lens (R2). This ordering reduces repeated work; it
does not change the route, the acceptance criteria, or the final combined verdict. A structural
finding runs the complete affected verifier set and never uses a localized shortcut.

## 4. Freeze and staleness

Validation consumes the immutable tree and verification baseline recorded at implementation
close. A patch, operator-directed amend, or any other tree change invalidates that snapshot.
The coordinator rebuilds Freeze, evidence, and the verification packet, then reruns validation
over the new tree. No result from an older tree can release Gate 3.

## 5. Gate interaction

Patch mode does not add an intermediate operator stop. After a correctable finding is fixed and
the affected validation passes, the machine advances to `waiting_gate3`. Gate 3 remains the final
operator decision with stable numeric options: `1 ship`, `2 amend`, `3 abort`. `amend` returns to
implementation and repeats the Freeze/validation freshness barrier; `abort` records the decision
and closes the run. The dual record, fresh nonce, and live approval rules are unchanged.

## 6. Explicit plan review

The former Stage-1 selective panel re-firing and approach/structure loops are retired. A plan
finding is not automatically re-reviewed. If the operator explicitly invokes `/th:plan-review`,
the standalone skill dispatches the requested lenses over the complete current sharded plan:
the compact manifest plus architecture, delivery, conditional invariants, and every task-contract
shard. Its result does not create a pipeline state or release a gate.

## 7. Recovery

`failure-brief.md`, validation reports, and `00-state.md` retain the correction target and the
next action. On `/th:recover`, the coordinator reads the state and current artifact pointers,
checks the tree anchor, and resumes the named state. It never infers a gate release from a
finding, repairs a missing gate field, or silently reopens design.
