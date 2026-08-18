## Purpose

Exactly one quality run per candidate tree, at Freeze, driven by the `quality.json` manifest. Retires the cleaner pre/post transitions and CRAP enforce as a coupled unit while preserving the checks with real detection value.

## ADDED Requirements

### Requirement: One quality run per candidate tree at Freeze
The pipeline SHALL execute quality verification exactly once per `candidate_tree`, at Freeze, as a single `quality-runner` invocation covering the union of declared manifest commands and the plan's required checks. A correction that changes the tree requires a fresh run; an unchanged tree never re-runs.

#### Scenario: Happy path reaches Freeze
- **WHEN** implementation and evidence authoring complete without corrections
- **THEN** each declared quality command executes exactly once, at Freeze, and its envelope anchors the run to the candidate tree

#### Scenario: A bounce changes the candidate tree
- **WHEN** a validation correction produces a new candidate tree
- **THEN** Freeze verification runs once more against the new tree

### Requirement: Cleaner transitions and CRAP enforce retire together
`cleaner-transition.mjs` SHALL be deleted (not adapted) and CRAP policy SHALL run measure-only (`not_applied` verdict). Neither retires without the other, because the enforce baseline's sole producer is the cleaner PRE transition.

#### Scenario: A manifest declares a crap command
- **WHEN** the Freeze run executes a declared `crap` command
- **THEN** it records measurements without an enforce baseline and never blocks on `CRAP_REPORT_INCOMPLETE` or `BASELINE_INVALID`

### Requirement: Surviving checks keep their subjects
The per-task red→green test contract (`test-transition.mjs`) SHALL survive unchanged, and the cleaner-overreach allowlist proof SHALL survive as a Freeze postcondition over the cleanup diff when a cleanup pass ran.

#### Scenario: A cleanup pass modified files outside its allowlist
- **WHEN** Freeze evaluates the cleanup diff against the recorded allowlist
- **THEN** out-of-allowlist modifications block with the same detection semantics the POST transition had

### Requirement: Freeze verification reads the manifest
Freeze build/lint verification SHALL use `quality.json` as its source of truth; heuristic command detection (CLAUDE.md → package.json → Makefile) applies only when no manifest exists, and a missing manifest yields a declared not-applicable result, never an unsatisfiable checkpoint.

#### Scenario: Repository has no quality manifest
- **WHEN** Freeze runs in a repo without `.team-harness/quality.json`
- **THEN** quality verification records `MANIFEST_ABSENT`/not-applicable and Freeze proceeds on the remaining evidence rather than blocking forever
