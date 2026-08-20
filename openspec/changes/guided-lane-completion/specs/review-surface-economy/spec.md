## Purpose

Let the frozen review surface exclude path prefixes that a deterministic checker has proven byte-equal or regenerable at the reviewed tree, without weakening what any verifier is allowed to look at.

## ADDED Requirements

### Requirement: Eligibility is computed by an executable that runs the checkers

The eligible exclusion prefix set SHALL be computed by an executable that invokes each covering deterministic checker over the reviewed tree and derives eligibility from that checker's own expected file set. Eligibility MUST NOT be asserted by prose, by recall, or by a maintained list of prefixes kept in a document.

#### Scenario: The exclusion set is needed for a freeze
- **WHEN** the review artifact is being constructed
- **THEN** the executable runs the covering checkers, derives the prefix set from their expected file sets and results, and emits both the pathspec and the enumeration the packet records

#### Scenario: A checker fails or skips
- **WHEN** any covering checker returns a failure or a skip
- **THEN** the executable emits an empty exclusion set and reports which checker withheld eligibility

#### Scenario: A prefix is named in a document but not covered by a checker
- **WHEN** eligibility is computed
- **THEN** only prefixes the executed checkers cover are eligible, and a documented prefix with no executed checker behind it is excluded from eligibility

### Requirement: Exclusion is applied only where the review artifact is built

A checker-verified path exclusion SHALL be applied at the step that constructs the frozen review artifact, and MUST NOT be carried as dispatch prose or written as a review-scope clause into any verifier's own contract.

#### Scenario: An exclusion is in effect for a run
- **WHEN** the frozen review diff is built with a checker-verified prefix set excluded
- **THEN** the exclusion appears only in the artifact-construction step, and every verifier contract and dispatch remains free of any instruction narrowing what it may review

### Requirement: Exclusion requires locally executed checker evidence at the reviewed tree

A prefix SHALL be excluded only when a deterministic parity checker covering it has been executed locally over the frozen tree and its green result recorded as suite evidence for that exact tree anchor. A checker result from continuous integration MUST NOT be used as the precondition, and a skipped checker MUST be treated as absent evidence.

#### Scenario: The parity checkers ran locally and passed at the frozen tree
- **WHEN** the covering checkers are executed at the frozen tree anchor and return green, recorded as suite evidence
- **THEN** the prefixes they exhaustively cover become eligible for exclusion for that anchor only

#### Scenario: A checker was skipped because its runtime was unavailable
- **WHEN** a covering checker reports a skip rather than a pass
- **THEN** its prefixes are not eligible and remain in the frozen review surface

#### Scenario: The tree changes after the checker ran
- **WHEN** a correction produces a new freeze anchor
- **THEN** prior checker evidence does not carry over and eligibility MUST be re-established at the new anchor

### Requirement: Only exhaustively verified prefixes may be excluded

A prefix SHALL be excluded only when its checker detects both content drift and unexpected extra files under that prefix. A prefix verified only by substring, marker, or other semantic assertion MUST remain in the review surface.

#### Scenario: A projection prefix is source-driven and blind to extra files
- **WHEN** a checker verifies every source file has a byte-equal target but cannot detect a target file with no source counterpart
- **THEN** that prefix is not eligible for exclusion

#### Scenario: Hand-authored generator inputs are considered
- **WHEN** eligibility is evaluated for hand-authored inputs from which generated artifacts derive
- **THEN** they remain in the review surface, because no checker verifies the inputs themselves

### Requirement: The excluding run stays internally consistent and auditable

When an exclusion is in effect, the same prefix set SHALL filter the verification packet's changed-files table and the scan list that acceptance validation derives from the repository, and the packet MUST enumerate every excluded prefix with its file and line counts and the checker that covered it.

#### Scenario: Acceptance validation derives its own scan list
- **WHEN** validation resolves changed paths from the repository rather than from the packet table
- **THEN** the same exclusion filter applies to that derivation, so an excluded path does not register as a packet integrity mismatch

#### Scenario: A reviewer asks what was removed from the surface
- **WHEN** the packet is read
- **THEN** it names each excluded prefix, its file and line counts, and the checker whose green local result made it eligible

### Requirement: An exclusion never impersonates a clean review surface

A frozen review diff that is empty solely because every changed path was excluded SHALL be reported as fully checker-verified rather than blocking as an unexpectedly empty artifact, and MUST NOT be presented as a change set with nothing to review.

#### Scenario: A change touches only checker-verified projections
- **WHEN** every changed path falls under an eligible excluded prefix
- **THEN** the run reports the surface as fully checker-verified, names the covering checkers, and does not block on emptiness
