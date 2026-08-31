## MODIFIED Requirements

### Requirement: One quality run per candidate tree at Freeze
The pipeline SHALL execute complete quality verification exactly once per
`candidate_tree`, at Freeze, as a single `quality-runner` invocation covering
the union of declared manifest commands and required plan checks. Before
implementation, it MAY check only prerequisites whose absence prevents
authorized work and the per-task red condition. Preflight MUST NOT execute the
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

### Requirement: Surviving checks keep their subjects
The per-task red-to-green test contract SHALL survive. Cleaner overreach proof
SHALL remain a Freeze postcondition only when cleanup ran. Cleaner SHALL be
dispatched only when deterministic hygiene analysis identifies at least one
behavior-preserving change inside existing production paths; an empty eligible
set SHALL be an evidenced no-op with no specialist dispatch.

#### Scenario: Hygiene finds no eligible cleanup
- **WHEN** deterministic analysis returns an empty behavior-preserving allowlist
- **THEN** the pipeline records cleaner not applicable and proceeds without spawning cleaner

#### Scenario: A cleanup pass modified files outside its allowlist
- **WHEN** Freeze compares cleanup changes with the recorded allowlist
- **THEN** out-of-allowlist modifications block with the existing overreach semantics

#### Scenario: Cleaner identifies product work
- **WHEN** a proposed change is semantic, test-related, documentation-related, or outside behavior-preserving ownership
- **THEN** Main routes it to the owning role through causal recovery and cleaner does not apply it
