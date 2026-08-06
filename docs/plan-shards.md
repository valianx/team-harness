# Sharded plan contract

New Tier 2-4 workspaces use `plan_format: sharded-v1`. The plan is a set of
small canonical artifacts, not a monolith copied between roles:

| Artifact | Canonical content | Normal readers |
|---|---|---|
| `01-plan.md` | operator summary, review attestation, classification, and manifest | operator, orchestrator, plan panel |
| `plan/architecture.md` | decisions, services, assessments, and file-level work plan | architect, plan panel; referenced slices for implementer/security |
| `plan/delivery.md` | task ordering, dependencies, branches, bases, and PR grouping | orchestrator, delivery |
| `plan/invariants.md` | cross-project or multi-site invariants; omit when none | affected implementers, security, delivery |
| `plan/tasks/Task-N.md` | one task's scope, files, seams, dispatch declarations, functional ACs, technical constraints, and AC checkboxes | assigned implementer, tester, QA |

`01-plan.md` begins with `**Plan format:** sharded-v1` and contains a
`## Plan Manifest` table with one row per artifact. Its task index contains the
task ID, service, status, functional AC count, technical-constraint count, and
exact task-shard path. Task status is canonical in the index; task scope,
constraint set, and AC state are canonical in the task shard. Do not repeat
architecture, task prose, constraint prose, or AC text in the index.

Every new task shard separates these three concerns:

```markdown
## Acceptance Criteria
- [ ] **AC-1**: Given {context}, When {action}, Then {observable result}.

## Technical Constraints
- **TC-1**: {mandatory internal mechanism or engineering invariant}.

## Verification
- **Pre-implementation test:** required | not-applicable — {reason when not applicable}
- {tests, commands, or inspections that can prove ACs and TCs}
```

`AC-N` is reserved for observable behavior. Private files, functions, classes,
frameworks, mocks, internal symbols, and test mechanics are prohibited in AC
prose unless the named element is itself part of a supported public contract.
Technical precision belongs in `TC-N`, task scope/notes, shared invariants, or
verification. `VERIFY:` is accepted only when recovering an older workspace;
new plans never emit it inside `## Acceptance Criteria`.

`Pre-implementation test` is a required routing field, not a requirement. It is
`required` when the repository quality manifest declares `test_contract` and
the task changes observable runtime behavior. It is `not-applicable` for docs,
assets, comments, or other no-behavior work, and when the repository has not
adopted the manifest contract; the shard records the concrete reason. This
keeps the plan functional while letting implementation select the deterministic
test-first checkpoint without inferring behavior from file extensions alone.

## Read routing

Read `01-plan.md` once to resolve paths, then open only the artifact and heading
required by the dispatch. A role must not preload every shard:

- implementer: assigned task shard plus only its named architecture or
  invariant anchors;
- tester: assigned task shard, including ACs and TCs, plus the verification packet;
- QA: assigned task shard's ACs plus the verification packet and TC evidence needed to interpret behavior;
- explicitly requested standalone security design review: classification, security assessment, affected
  invariants, and security-relevant task shards;
- delivery: delivery shard, invariant shard when present, and accepted evidence
  pointers;
- recovery: index plus the single shard named by `next_action`.

Plan-panel roles may inspect all shards because completeness is their explicit
job. Prefer deterministic structure checks over loading prose when a path,
heading, ID, or count can be checked mechanically.

## Dispatch completeness

Every task shard must declare all three fields in its `## Dispatch anchors`
block:

```text
required_invariants: [I...]
required_evidence_anchors: [A...]
cross_runtime_preservation: <non-empty preservation statement>
```

The dispatch preflight reads that exact shard once and fails closed if any
field is absent, malformed, or omits an obligation applicable to the assigned
files. An empty list is valid only when no invariant or evidence anchor applies;
`cross_runtime_preservation` is always non-empty. It resolves only the named
anchors into the role packet. Never compensate for a missing declaration by
attaching Main's transcript, a sibling task shard, or the full plan set.

## Write and size rules

Each fact has one canonical home. Writers edit the smallest owning artifact;
they never regenerate the whole plan set. Review history remains in
`reviews/01-plan-review.md`, with only the current findings plus a compact
round table.

Budgets apply per artifact and to fixed prose, never to the number of approved
projects, tasks, ACs, TCs, invariants, findings, or controls. The ordinary targets
are: index 80 lines/12 KB, architecture 120 lines/20 KB, delivery 80 lines/12
KB, invariant prose at most two lines per invariant, and task fixed prose 30
lines plus at most two prose lines per AC or TC. When required items exceed a target,
keep them and record `size_reason: required-items` in the index.

## Operator voice

Gates and progress updates synthesize the current manifest; they do not paste
workspace sections. A gate contains the decision, material risks, task/AC
counts, evidence links, options, and nonce in at most 12 non-empty lines before
any required itemized exceptions. Routine phase updates use at most five lines:
outcome, changed state, blocker or risk, next action, and artifact link. Omit
chronology, greetings, repeated context, and conclusions.

## Legacy workspaces

A workspace without `**Plan format:** sharded-v1` is `monolith-v1`. Recovery
may read its existing `01-plan.md` by the old section locators, but must not
migrate it implicitly. New plans never use the legacy layout. In older
documentation, `01-plan.md § Architecture` and `01-plan.md § Task List` are
logical locators: under `sharded-v1`, Architecture resolves to
`plan/architecture.md`; Task List resolves to the task index,
`plan/delivery.md`, and only the addressed task shards. A reader must not use
the logical locator as permission to preload every shard.
