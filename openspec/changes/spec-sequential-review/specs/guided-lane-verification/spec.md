## MODIFIED Requirements

### Requirement: The review package is produced by an executable, not assembled from prose

The anchored review package SHALL be constructed by an executable that derives the changed surface from the repository, binds criteria from the authored change, classifies the security floor from the diff, resolves the required lens set, and refuses to emit a package when its preconditions fail. A coordinator MUST NOT hand-assemble a package. Package preconditions and the original review decision SHALL be enforced by the producer and `review-fan.mjs gate`; finding closure and subsequent author publication SHALL remain coordinator decisions under `spec-direct-lane`, without claiming an executable publication gate.

#### Scenario: A review is requested
- **WHEN** the verification fan is invoked for a committed range
- **THEN** the package is emitted by the producer with its changed surface, criteria, floor classification, and required lens set derived rather than recalled

#### Scenario: A precondition fails
- **WHEN** the tree is dirty, the range is not committed, or the named change does not validate
- **THEN** the producer exits non-zero with the failing precondition named, and emits no package

#### Scenario: A rule in this capability has no executable behind it
- **WHEN** a package or original gate rule is described as mechanically enforced
- **THEN** it names its producer or deterministic check; subsequent author-publication decisions are explicitly coordinator policy backed by executed closure checks

#### Scenario: Publication follows verified repairs
- **WHEN** the coordinator closes findings after the original review
- **THEN** it records the corrected revision and executable validation evidence under the author-publication policy without changing the package, original lens verdicts or gate result

### Requirement: A security dimension stops for a live three-way choice

Before publication, the guided lane's executable package producer SHALL classify the completed changed surface against the canonical security-floor categories. A true or unresolved classification MUST stop the lane and present the matching category together with three live options: raise the bar in-lane, take the pipeline, or narrow the scope. The lane MUST NOT absorb the security dimension on its own authority and MUST NOT eject to the pipeline without offering the in-lane option when no hard router applies. If the operator raises the bar in-lane, `security` and `adversary` become mandatory lenses without requiring a later explicit review request. The original review gate SHALL resolve ready only when every required lens passes with no blocker. After completed reviews and in-scope repairs, the coordinator MAY continue authorized author publication under `spec-direct-lane` when all security and adversary blockers have sufficient finding-specific closure evidence at the corrected commit. Original non-pass verdicts SHALL remain unchanged; failed execution, incomplete coverage, missing or untrusted returns and unresolved blockers SHALL still hold publication.

#### Scenario: Implementation reveals a security-sensitive surface
- **WHEN** the completed changed-surface classifier reports a security-floor category
- **THEN** the lane stops before publication and waits for the operator to choose between raising the bar in-lane, the pipeline, and narrowing scope

#### Scenario: The operator raises the bar in-lane
- **WHEN** the operator selects the in-lane option
- **THEN** the producer places `security` and `adversary` in the required lens set, and the original gate reports not-ready until both return a pass with no blocker

#### Scenario: Publication is attempted before required security lenses pass
- **WHEN** the in-lane security path was selected and either required security lens is absent, failed in execution, incomplete or untrusted
- **THEN** publication remains blocked even when the operator did not separately request verification

#### Scenario: Security findings are closed after complete reviews
- **WHEN** security and adversary completed with sufficient anchored coverage, their blockers are repaired within authorized scope, and finding-specific security checks and relevant suites pass on the corrected commit
- **THEN** Main preserves the original review results, records verified closure and continues otherwise authorized PR publication without a new reviewer pass

#### Scenario: A security blocker lacks closure evidence
- **WHEN** either required security lens reported a blocker whose correction is unverified or whose required check failed or was omitted
- **THEN** the affected PR remains blocked despite other passing checks or applied patches

#### Scenario: The floor applies and a required lens return is missing
- **WHEN** the original gate is computed with a required floor lens absent or returning a blocker
- **THEN** it resolves to not-ready and names the missing or blocking lens, never defaulting an absent return to a pass

#### Scenario: The work is multi-repository, multi-specialist, irreversible, multi-task, or operator-absent
- **WHEN** the work requires multiple writing specialists, independent deliverables, irreversible or operator-absent work
- **THEN** the pipeline remains a hard router and the in-lane option is not offered
