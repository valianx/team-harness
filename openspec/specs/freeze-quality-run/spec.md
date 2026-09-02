# freeze-quality-run Specification

## Purpose
Exactly one quality run per candidate tree, at Freeze, driven by the workspace-local `.team-harness/quality.json` manifest outside the product diff. Retires the cleaner pre/post transitions and CRAP enforce as a coupled unit while preserving the checks with real detection value.

## Requirements

### Requirement: One quality run per candidate tree at Freeze
The pipeline SHALL execute complete quality verification exactly once per
`candidate_tree`, at Freeze, as a single `quality-runner` invocation covering
the union of declared manifest commands and required plan checks. Before
implementation, it MAY check only prerequisites whose absence prevents
authorized work and the risk-required independent red condition. Preflight MUST NOT execute the
complete candidate quality set or create a second quality verdict. A changed
tree requires a fresh Freeze run; an unchanged tree never re-runs.

#### Scenario: Happy path reaches Freeze
- **WHEN** implementation and evidence authoring complete without corrections
- **THEN** each declared quality command executes exactly once at Freeze and its result binds the candidate tree

#### Scenario: A prerequisite is checked before implementation
- **WHEN** a required tool, manifest, or dependency must exist for assigned work
- **THEN** preflight verifies availability only and does not infer the final quality verdict

#### Scenario: A bounce changes the candidate tree
- **WHEN** validation correction produces a new candidate identity
- **THEN** Freeze verification runs exactly once against that new tree

### Requirement: Cleaner transitions and CRAP enforce retire together
`cleaner-transition.mjs` SHALL be deleted (not adapted) and CRAP policy SHALL run measure-only (`not_applied` verdict). Neither retires without the other, because the enforce baseline's sole producer is the cleaner PRE transition.

#### Scenario: A manifest declares a crap command
- **WHEN** the Freeze run executes a declared `crap` command
- **THEN** it records measurements without an enforce baseline and never blocks on `CRAP_REPORT_INCOMPLETE` or `BASELINE_INVALID`

### Requirement: Surviving checks keep their subjects
The ordinary path SHALL let the authorized implementer author or update tests
with production work and SHALL rely on one complete candidate-bound quality run
at Freeze. A separate pre-implementation tester and red-to-green contract SHALL
be required only when a deterministic risk predicate identifies at least one of:
bug reproduction independence, migration/data safety, public contract or
compatibility change, security-control change, or an explicit operator request.
The predicate and result SHALL be recorded before implementation; absence of a
matched condition MUST NOT spawn a tester.

Cleaner overreach proof SHALL remain a Freeze postcondition only when cleanup
ran. Cleaner SHALL be dispatched only when deterministic hygiene analysis
identifies at least one behavior-preserving change inside existing production
paths; an empty eligible set SHALL be an evidenced no-op with no specialist
dispatch.

#### Scenario: Ordinary implementation needs tests
- **WHEN** no independent-test risk condition matches
- **THEN** the implementer authors the required tests and production change in one bounded lease and Freeze runs the complete quality set once

#### Scenario: Independent test authorship protects a named risk
- **WHEN** the recorded predicate matches bug reproduction, migration/data safety, public compatibility, security control, or an explicit operator request
- **THEN** one fresh tester establishes the bounded pre-implementation contract before the implementer starts

#### Scenario: Hygiene finds no eligible cleanup
- **WHEN** deterministic analysis returns an empty behavior-preserving allowlist
- **THEN** the pipeline records cleaner not applicable and proceeds without spawning cleaner

#### Scenario: A cleanup pass modified files outside its allowlist
- **WHEN** Freeze compares cleanup changes with the recorded allowlist
- **THEN** out-of-allowlist modifications block with the existing overreach semantics

#### Scenario: Cleaner identifies product work
- **WHEN** a proposed change is semantic, test-related, documentation-related, or outside behavior-preserving ownership
- **THEN** Main routes it to the owning role through causal recovery and cleaner does not apply it

### Requirement: Freeze verification reads the manifest
Freeze build/lint verification SHALL use the workspace-local `.team-harness/quality.json` as its source of truth; heuristic command detection (CLAUDE.md → package.json → Makefile) applies only when no manifest exists, and a missing manifest yields a declared not-applicable result, never an unsatisfiable checkpoint.

#### Scenario: Workspace has no quality manifest
- **WHEN** Freeze runs without an absolute workspace-local `.team-harness/quality.json` that is absent from the product diff and, when nested below the checkout, ignored and untracked
- **THEN** quality verification records `MANIFEST_ABSENT`/not-applicable and Freeze proceeds on the remaining evidence rather than blocking forever
