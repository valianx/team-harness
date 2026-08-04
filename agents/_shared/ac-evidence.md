# Acceptance Criteria and Evidence Contract

This file is the canonical contract shared by `qa-plan`, `tester`, `qa`, and the
orchestrator's acceptance gate.

## Acceptance criteria

An `AC-N` describes an observable functional outcome in Given/When/Then form.
The observer may be a user, API consumer, operator, or another system. Public
routes, request fields, status codes, accessibility behavior, and externally
meaningful security or performance outcomes may appear when they are part of
the supported contract.

An AC is never an implementation instruction. Private files, classes, methods,
dependencies, frameworks, mocks, internal symbols, test mechanics, and
literal-text presence do not belong in AC prose. Neither "implement X", "use
Zod", "call function Y", nor "the code compiles" is a sound AC.

## Technical constraints

A `TC-N` records a meaningful implementation or engineering constraint when the
operator, public contract, repository convention, security, performance,
compatibility, or data-integrity requirement makes the mechanism itself
mandatory. Examples include preserving a shared authorization guard, forbidding
client-side sorting of a paginated slice, or keeping a multi-site literal in
sync. Technical constraints live in the task shard's separate
`## Technical Constraints` section; they never use `VERIFY:` inside
`## Acceptance Criteria` and never contribute to the AC count presented at a
gate.

Every TC remains an implementation and evidence obligation. Tester records
evidence for ACs and TCs; QA returns criterion verdicts for ACs; the security
lens also evaluates every security-relevant TC. Exact files, commands, and test
mechanics stay in task scope, notes, invariants, or verification rather than in
acceptance prose.

## Evidence types

Every AC and TC needs appropriate evidence, not necessarily a newly authored
test.

| Type | Use when | Minimum record |
|---|---|---|
| `test` | Executable behavior or invariant can regress and the suite is the clearest durable proof | test name, command, result, and every source, test, fixture, configuration, and argument-file path consumed by the proof |
| `command` | An existing build, lint, parser, schema, or repository validator directly proves the claim | exact command, result, relevant output, and every implementation, fixture, configuration, and argument-file path consumed by the command |
| `inspection` | Prose, metadata, static configuration, or another artifact is best verified directly | artifact plus `file:line` and inspected paths |

One item of evidence may satisfy several requirements. A requirement may combine
evidence types. Existing evidence is preferred when it directly proves the
requirement.

Every evidence-map row declares `Evidence paths` as the complete dependency set
for that proof. For executable evidence this includes every consumed
implementation, test, fixture, configuration, and argument-file input, not only
the command or test file named in the row. After a correction, unchanged rows
may carry forward only when the requirement text, exact command/arguments, and
every declared dependency path's blob hash are unchanged. A missing dependency,
path declaration, or hash makes the row stale; the tester refreshes it before
the next Freeze.

## When to author a test

Author a test only when all are true:

1. it protects observable behavior or a meaningful invariant;
2. a plausible regression would make the test fail; and
3. existing tests or commands do not already provide sufficient evidence.

Do not author tests solely for documentation or prose, release versions,
metadata, static manifests, exact strings, file existence, private-symbol
existence, implementation details, or a changed-file quota. For runtime
configuration, test the consumer behavior when that behavior warrants a test;
do not assert the configuration text itself.

`tests_authored: 0` is a valid successful result.

## Test changes and deletions

Tests may be changed or removed when they are redundant, obsolete,
implementation-coupled, biased toward the current output, or only assert prose
or artifact presence. Record the reason and the surviving evidence. Never
delete, weaken, skip, or mark a test expected-fail merely to hide a product
failure.

## Acceptance gate

The gate passes an AC or TC when its recorded evidence is relevant, successful,
current, and traceable to the requirement. It fails missing, irrelevant,
fabricated, stale, or unsuccessful evidence. QA must additionally return a
criterion-specific verdict for every AC. Security-relevant TCs require the
applicable security result. The number of authored tests is telemetry, never a
quota or pass condition.
