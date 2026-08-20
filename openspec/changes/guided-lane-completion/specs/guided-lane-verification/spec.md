## Purpose

Give the guided lane a terminating verification loop that audits its own fixes, raises the bar on a security dimension instead of ejecting the task, checks the diff against written intent, and can be invoked explicitly.

## ADDED Requirements

### Requirement: The review package is produced by an executable, not assembled from prose

The anchored review package SHALL be constructed by an executable that derives the changed surface from the repository, binds criteria from the authored change, classifies the security floor from the diff, resolves the required lens set, and refuses to emit a package when its preconditions fail. A coordinator MUST NOT hand-assemble a package, and no rule in this capability may ship as prose without that producer or a deterministic checker enforcing it.

#### Scenario: A review is requested
- **WHEN** the verification fan is invoked for a committed range
- **THEN** the package is emitted by the producer with its changed surface, criteria, floor classification, and required lens set derived rather than recalled

#### Scenario: A precondition fails
- **WHEN** the tree is dirty, the range is not committed, or the named change does not validate
- **THEN** the producer exits non-zero with the failing precondition named, and emits no package

#### Scenario: A rule in this capability has no executable behind it
- **WHEN** the change is verified
- **THEN** every requirement here resolves to a producer that constructs the governed artifact or to a deterministic check that fails when the rule is broken

### Requirement: Full scope runs once, each fix earns one delta-scoped closure pass

The guided lane SHALL run at most one full-scope review of a branch, and MUST bound every subsequent verification to the closure of one applied fix — the reopening construction the finding named and the files that fix touched. A closure pass MUST NOT reopen the full surface, and the lane MUST NOT run a second full-scope review.

#### Scenario: A fix is applied after the full-scope review
- **WHEN** the operator applies a fix for a finding returned by the lane's full-scope review
- **THEN** exactly one closure pass runs over the new commit, scoped to that fix's reopening construction and changed files, and returns a closure verdict without re-reviewing the unchanged surface

#### Scenario: A closure pass finds something outside its scope
- **WHEN** a closure pass observes a candidate defect outside the fix's own surface
- **THEN** it is recorded as a pull-request concern and does not open a further verification pass

#### Scenario: Two fixes are applied in sequence
- **WHEN** a second fix is applied after the first fix's closure pass has returned
- **THEN** the second fix earns its own single closure pass, and neither pass escalates into a full-scope re-review

#### Scenario: A second full-scope package is requested
- **WHEN** the producer is invoked for full scope on a branch for which a prior review anchor is supplied
- **THEN** it refuses, names the prior anchor, and emits a delta-scoped package bounded to the range since that anchor

### Requirement: A security dimension stops for a live three-way choice

When work in the guided lane is found to touch a category in the security floor's list, the lane MUST stop before proceeding and present the matching category together with three live options: raise the bar in-lane, take the pipeline, or narrow the scope. The lane MUST NOT absorb the security dimension on its own authority and MUST NOT eject to the pipeline without offering the in-lane option.

#### Scenario: Implementation reveals a security-sensitive surface
- **WHEN** the producer classifies the changed surface as matching a security floor category
- **THEN** the lane stops, names the matching category as the producer reported it, and waits for the operator to choose between raising the bar in-lane, the pipeline, and narrowing scope

#### Scenario: The operator raises the bar in-lane
- **WHEN** the operator selects the in-lane option
- **THEN** the producer places `security` and `adversary` in the required lens set, and the ship decision reports not-ready until both return a pass with no blocker

#### Scenario: The floor applies and a required lens return is missing
- **WHEN** the ship decision is computed with a required floor lens absent or returning a blocker
- **THEN** it resolves to not-ready and names the missing or blocking lens, never defaulting an absent return to a pass

#### Scenario: The work is multi-repository, irreversible, multi-task, or operator-absent
- **WHEN** any of those conditions holds alongside the security dimension
- **THEN** the pipeline remains a hard router and the in-lane option is not offered

### Requirement: Review lenses do not count as specialists

The lane's `multi-specialist` hard router MUST be evaluated on agents that write, and a review request naming several lenses SHALL be treated as one review rather than as a second specialist need.

#### Scenario: An operator requests four review lenses at once
- **WHEN** a live review request names tester, qa, security, and adversary
- **THEN** the request is served as one review with one reviewer instance per lens and does not trigger the multi-specialist hard router

### Requirement: Authored written intent binds as review criteria

The review package SHALL accept criteria whose provenance is the authored `openspec/changes/<change>/` requirements, carried by reference to their anchored path, and the reviewer return MUST keep an artifact-derived criterion distinguishable from a live-operator criterion.

#### Scenario: A lane review runs on a branch with an authored change
- **WHEN** the lane assembles the review package for a branch whose change directory holds validated requirements
- **THEN** those requirements are bound as criteria with their own provenance value, and the return reports coverage against them separately from criteria the operator stated live

### Requirement: The verification fan has an explicit invocation surface

A skill SHALL exist that requests the inline verification fan over a committed range with a named lens set, and it MUST fail closed when the tree is dirty or the range is not committed rather than reviewing uncommitted work.

#### Scenario: The operator invokes the verification skill on a clean branch
- **WHEN** the skill is invoked with a committed range and a lens set
- **THEN** one reviewer instance per lens runs against that immutable range and the consolidated result reports a global pass only when every required lens returns a pass with no blocker

#### Scenario: The working tree is dirty
- **WHEN** the skill is invoked while the index or worktree carries uncommitted changes
- **THEN** it stops and reports that uncommitted review is unsupported, without dispatching any lens
