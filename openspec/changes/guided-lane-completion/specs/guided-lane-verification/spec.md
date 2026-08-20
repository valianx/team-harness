## Purpose

Give the guided lane validation that confirms rather than iterates, raises the bar on a security dimension instead of ejecting the task, checks the diff against written intent, and can be invoked explicitly.

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

### Requirement: Validation runs once and a fix closes by executing its oracle

The guided lane SHALL run at most one full-scope review of a branch. A fix applied to a finding MUST be closed by executing the falsifiable oracle the finding's criterion already carries — its scenario — and MUST NOT be closed by dispatching another review. The lane MUST NOT run a second full-scope review, and a closure MUST NOT be counted as an iteration round.

#### Scenario: A fix is applied for a covered finding
- **WHEN** the operator applies a fix for a finding that a bound written-intent criterion anticipated
- **THEN** closure is the execution of that criterion's scenario together with the deterministic suites, and no reviewer is dispatched

#### Scenario: A second full-scope review is requested
- **WHEN** a full-scope package is requested for a branch that already has a review anchor
- **THEN** the producer refuses and names the prior anchor

#### Scenario: The operator explicitly asks for a reviewer to look at a fix
- **WHEN** a live operator request asks for a reviewed closure pass over an applied fix
- **THEN** a delta-scoped package bounded to the range since the prior anchor is emitted, as an explicitly requested exception rather than a default step

### Requirement: The package carries the identity the shared contract joins on

The emitted package SHALL carry a `target_id` over its resolved root, coordinates, range, scope, criteria, changed surface, and lens lists, and a fresh `dispatch_id` per required lens. A package that omits either leaves the ship decision with nothing to bind a return to, and MUST NOT be emitted.

#### Scenario: A package is emitted for several lenses
- **WHEN** the producer emits a package whose required lens set has more than one member
- **THEN** it carries one `target_id` and one distinct `dispatch_id` per required lens

#### Scenario: The same range is packaged twice
- **WHEN** the producer emits a package for a range it packaged before
- **THEN** each `dispatch_id` is fresh, so a return from the earlier package cannot fill a slot in the later one

### Requirement: The ship decision performs the shared contract's exact keyed join

The ship decision SHALL implement the consolidation join defined in `agents/_shared/inline-review-contract.md`: one outstanding slot per required `(lens, dispatch_id, target_id, coordinates)`, exactly one return accepted into its own slot after exact equality of all four fields, and a return with no slot, a filled slot, another slot's lens, or a mismatched identity field rejected as untrusted. A pass MUST additionally require `lens_status: complete`. The decision MUST NOT key returns by lens alone.

#### Scenario: A duplicate return arrives for a filled slot
- **WHEN** a second return names a slot that already holds one
- **THEN** it is rejected as untrusted and cannot replace the return already accepted, whatever verdict it carries

#### Scenario: A return carries a stale or foreign identity
- **WHEN** a return's `dispatch_id`, `target_id`, or coordinates do not equal its slot's
- **THEN** it is rejected as untrusted and its slot stays unfilled

#### Scenario: A return is not terminally complete
- **WHEN** an accepted return carries a `lens_status` other than `complete`
- **THEN** the slot resolves non-pass regardless of its verdict

#### Scenario: Every required slot holds one complete passing return
- **WHEN** all identity fields match, no blocker is present, and no blocking disagreement is unresolved
- **THEN** the decision resolves ready

### Requirement: Criteria are read from the reviewed tree, never the working checkout

Written-intent criteria SHALL be read from the tree the reviewed range resolves to, so a package cannot bind criteria that are absent from its own immutable target. The producer MUST refuse rather than fall back to the working checkout when it cannot read the change from that tree.

#### Scenario: The working checkout carries a newer or untracked change directory
- **WHEN** the reviewed range's head does not contain the change content present in the checkout
- **THEN** the criteria come from the reviewed head, and the checkout-only content is not bound

#### Scenario: The named change is absent from the reviewed head
- **WHEN** the reviewed head has no such change directory
- **THEN** the producer refuses with that precondition named and emits no package

### Requirement: A finding is classified by whether the spec anticipated it

The ship decision SHALL classify every finding as covered or uncovered by comparing it against the bound written-intent criteria, and MUST report that classification rather than leaving it to judgement. An uncovered finding above the floor is a defect in the authored change and MUST return there for an operator-approved revision; an uncovered finding below the floor rides as a pull-request concern. Neither MAY become another review pass.

#### Scenario: A finding matches a bound criterion
- **WHEN** the ship decision evaluates a finding whose criterion is present in the package
- **THEN** it is reported as covered, and closing it requires only that criterion's oracle to pass

#### Scenario: A finding matches no bound criterion and sits above the floor
- **WHEN** the ship decision evaluates such a finding
- **THEN** it is reported as uncovered and named as a defect in the authored change, so the spec is revised and re-approved rather than a further review being run

#### Scenario: A finding matches no bound criterion and sits below the floor
- **WHEN** the ship decision evaluates such a finding
- **THEN** it is reported as a pull-request concern and does not hold the ship

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

#### Scenario: The work is multi-repository, multi-specialist, irreversible, multi-task, or operator-absent
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
