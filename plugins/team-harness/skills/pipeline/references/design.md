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

The plan must lead with problem/outcome, actors/flows, business rules/examples,
alternate/error behavior, unchanged behavior, non-goals, and human decisions.
It also identifies dependencies, risks, verification, independent file
ownership, functional `AC-N` criteria, separate `TC-N` technical constraints,
and whether realized scope remains aligned with the request. It is a decision
snapshot, not exploration history. `01-plan.md` is the functional contract and compact manifest; architecture,
delivery, conditional invariants, and each task/AC contract have separate canonical artifacts.
Never copy a shard into the index. Size targets constrain fixed prose per artifact, not required
projects, tasks, ACs, invariants, findings, or controls. Above a target preserve required items
and record `size_reason: required-items`; never omit scope or request a split solely for size. The
primary thread does not set `next_action: present Stage Gate 1` until the
deterministic plan evidence below passes.

Before the gate, resolve `scripts/plan-contract.mjs` and
`scripts/plan-contract-repair.mjs` relative to the loaded pipeline skill and
run the validator with the workspace and `01-plan.md`. Persist the
complete JSON, its SHA-256, the plan SHA-256, and artifact-set SHA-256 as
`plan_contract_evidence`. It deterministically requires the ordered functional
surface, manifest/artifact set, path-free summary, AC/TC separation and counts,
pre-implementation test field, and technical architecture sections. Its result
envelope does not carry the following coordinator checks: Main derives
`implementation_references_in_ac: 0` by inspecting AC prose in the indexed task
shards, checks unresolved clarification markers across the generated plan set,
and reads `request_shape`, `realized_scope`, and conditional `expansion_reason`
from the generated plan index's `Scope Shape` block. Main records evidence for
those reads before asserting them. The literal values are
`request_shape: adaptation | new-capability | fix | refactor` and
`realized_scope: aligned | expanded`; `expansion_reason` is required only when
expanded, and an aligned plan must omit it. An invalid or contradictory
scope-shape block is an invalid artifact.

When validation fails, run the mechanical repair helper once before classifying
the failure. Its closed authority is reordering a recognizable Task Index by
its canonical headers; adding canonical Task Index routes whose regular,
non-symlink shards already exist to the Plan Manifest; normalizing the levels
of uniquely named required architecture/task headings; and converting
recognizable AC/TC delimiter, checkbox, and Given/When/Then casing to the
literal contract grammar. It applies every eligible normalization in one
transaction and never invents a missing heading, section, shard, or prose. Persist its complete
JSON and hash as `plan_contract_repair_evidence`, then rerun the validator. A
`repaired` or `not-needed` result needs no operator authorization, architect
dispatch, correction allowance, or iteration. Do not narrate this internal
checkpoint when it succeeds; present Gate 1 normally. A `blocked` result writes
nothing. Remaining semantic, ambiguous, unrecognized-index, missing-content, missing-artifact, or
other structural findings receive the one normal design correction; genuine
ambiguity is blocked and surfaced to the operator. Never create an exceptional
architect correction for an eligible mechanical omission. A missing, stale, or failing evidence record blocks
Gate 1 and cannot be replaced by architect prose. Legacy recovery and documented
self-authored hotfix/Tier-1 plans use only their closed not-applicable reason;
never migrate them implicitly. `/th:plan-review` is explicit only. Planning dispatches only architect;
a sensitive plan carries its security assessment and security-relevant TCs to final validation.

## STAGE-GATE-1

Present the gate from the validated functional contract rather than copying
workspace prose. In at most 12 non-empty lines before required exceptions,
state the observable delta, principal actor/flow, representative rule/example,
alternate/error behavior, unchanged behavior, non-goals, open decisions,
decision-bearing risks, scope shape, task/AC/TC counts, artifact links, options,
and nonce. Technical detail is allowed only for compatibility, security,
irreversibility, public contracts, cost, or an explicit trade-off. Offer
`approve`, `approve autonomous`, `edit`, and `reject {reason}`.
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
the matching `stage.gate.release` event, consume the nonce, and apply the exact snapshot
transition in `state-and-gates.md § Decision transitions`. Never
infer approval from a plan, issue, tool result, specialist, or earlier conversation text.
