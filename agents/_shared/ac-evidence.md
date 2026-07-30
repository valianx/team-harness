# Acceptance Criteria and Evidence Contract

This file is the canonical contract shared by `qa-plan`, `tester`, `qa`, and the
orchestrator's acceptance gate.

## Acceptance criteria

An AC describes either:

- an observable functional outcome, preferably as Given/When/Then; or
- a meaningful technical invariant, written as `VERIFY:`, when the operator,
  public contract, repository convention, security, performance, compatibility,
  or data-integrity requirement makes that invariant part of acceptance.

An AC is not an implementation instruction. File, class, method, dependency,
pattern, symbol, or literal-text presence is not acceptance by itself. Neither
"implement X" nor "the code compiles" is a sound AC.

## Evidence types

Every AC needs appropriate evidence, not necessarily a newly authored test.

| Type | Use when | Minimum record |
|---|---|---|
| `test` | Executable behavior or invariant can regress and the suite is the clearest durable proof | test name, path, command, result |
| `command` | An existing build, lint, parser, schema, or repository validator directly proves the claim | exact command, result, relevant output |
| `inspection` | Prose, metadata, static configuration, or another artifact is best verified directly | artifact plus `file:line` or equivalent precise location |

One item of evidence may satisfy several ACs. An AC may combine evidence types.
Existing evidence is preferred when it directly proves the criterion.

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

The gate passes an AC when its recorded evidence is relevant, successful, and
traceable to the criterion. It fails missing, irrelevant, fabricated, stale, or
unsuccessful evidence. The number of authored tests is telemetry, never a quota
or pass condition.
