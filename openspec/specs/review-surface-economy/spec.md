# review-surface-economy Specification

## Purpose
Let the review surface exclude the exact changed paths a deterministic checker proves byte-identical to their canonical source at the reviewed tree, without weakening what any verifier is allowed to look at.

## Requirements

### Requirement: Eligibility is computed by an executable that runs the checkers

The eligible exclusion set SHALL be computed by an executable that invokes each covering deterministic checker over the reviewed tree and admits a path only when that checker returned green and the path's bytes equal its canonical source's bytes **in the reviewed tree**. Eligibility MUST NOT be asserted by prose, by recall, or by a list kept in a document, and MUST NOT be proven against the working checkout.

#### Scenario: The exclusion set is needed for a freeze
- **WHEN** the review artifact is being constructed
- **THEN** the executable runs the covering checkers, admits only paths whose reviewed-tree bytes equal their source's, and emits both the pathspec and the enumeration the packet records

#### Scenario: The checkout is not the reviewed head
- **WHEN** eligibility is computed while a different commit is checked out
- **THEN** every byte comparison is taken from the reviewed head, so a projection that drifted at that head is not excluded

#### Scenario: A checker fails or skips
- **WHEN** any covering checker returns a failure or a skip
- **THEN** the executable emits an empty exclusion set and reports which checker withheld eligibility

#### Scenario: A path is named in a document but not covered by a checker
- **WHEN** eligibility is computed
- **THEN** only paths the executed checkers prove are eligible, and a documented path with no executed checker behind it is not excluded

### Requirement: Exclusion is applied only where the review artifact is built

A checker-verified path exclusion SHALL be applied at the step that constructs the frozen review artifact, and MUST NOT be carried as dispatch prose or written as a review-scope clause into any verifier's own contract.

#### Scenario: An exclusion is in effect for a run
- **WHEN** the frozen review diff is built with a checker-verified prefix set excluded
- **THEN** the exclusion appears only in the artifact-construction step, and every verifier contract and dispatch remains free of any instruction narrowing what it may review

### Requirement: Exclusion requires locally executed checker evidence at the reviewed tree

A path SHALL be excluded only when a deterministic parity checker covering it has been executed locally over the frozen tree and its green result recorded as suite evidence for that exact tree anchor. A checker result from continuous integration MUST NOT be used as the precondition, and a skipped checker MUST be treated as absent evidence.

#### Scenario: The parity checkers ran locally and passed at the frozen tree
- **WHEN** the covering checkers are executed at the frozen tree anchor and return green, recorded as suite evidence
- **THEN** the files they prove become eligible for exclusion for that anchor only

#### Scenario: A checker was skipped because its runtime was unavailable
- **WHEN** a covering checker reports a skip rather than a pass
- **THEN** its files are not eligible and remain in the frozen review surface

#### Scenario: The tree changes after the checker ran
- **WHEN** a correction produces a new freeze anchor
- **THEN** prior checker evidence does not carry over and eligibility MUST be re-established at the new anchor

### Requirement: Exclusion names exact verified files, never a directory prefix

Exclusion SHALL be expressed as the exact set of file paths a checker proves, derived from that checker's own expected file set, and MUST NOT be expressed as a directory prefix. A changed path absent from every checker's expected set therefore stays in the review surface by construction, whether it is an unexpected extra file, a hand-authored generator input, or a path verified only by a substring or marker assertion.

#### Scenario: An unexpected file appears inside an otherwise verified directory
- **WHEN** a changed path under a verified directory is absent from the covering checker's expected set
- **THEN** it is not excluded and remains in the review surface, without disqualifying its verified siblings

#### Scenario: A hand-authored generator input changes
- **WHEN** an input from which a generated artifact derives is changed
- **THEN** it remains in the review surface, because no checker's expected set contains it

#### Scenario: A path is verified only by a substring or marker assertion
- **WHEN** eligibility is computed for such a path
- **THEN** it is not excluded, because no checker proves its bytes

### Requirement: The excluding run stays internally consistent and auditable

When an exclusion is in effect, the same excluded file set SHALL filter the verification packet's changed-files table and the scan list that acceptance validation derives from the repository, and the packet MUST enumerate every excluded path group with its file and line counts and the checker that proved it.

#### Scenario: Acceptance validation derives its own scan list
- **WHEN** validation resolves changed paths from the repository rather than from the packet table
- **THEN** the same exclusion filter applies to that derivation, so an excluded path does not register as a packet integrity mismatch

#### Scenario: A reviewer asks what was removed from the surface
- **WHEN** the packet is read
- **THEN** it names each excluded group, its file and line counts, and the checker whose green local result made it eligible

### Requirement: An exclusion never impersonates a clean review surface

A frozen review diff that is empty solely because every changed path was excluded SHALL be reported as fully checker-verified rather than blocking as an unexpectedly empty artifact, and MUST NOT be presented as a change set with nothing to review.

#### Scenario: A change touches only checker-verified projections
- **WHEN** every changed path is in the eligible excluded set
- **THEN** the run reports the surface as fully checker-verified, names the covering checkers, and does not block on emptiness
