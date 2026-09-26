# guided-lane-verification Specification

## Purpose
Give the guided lane validation that confirms rather than iterates, raises the bar on a security dimension instead of ejecting the task, checks the diff against written intent, and can be invoked explicitly.

## Requirements

### Requirement: The review package is produced by an executable, not assembled from prose
The verification helper SHALL derive immutable coordinates, changed surface and bound criteria when used. Its security classification is optional risk advice. Main selects requested/relevant lenses and owns the publication decision; no classification or helper summary grants or denies execution authority.

#### Scenario: A review is requested
- **WHEN** a committed range is packaged
- **THEN** the helper preserves anchored evidence and requested coverage without adding an automatic security lens.

#### Scenario: A precondition fails
- **WHEN** the tree is dirty, the range is not committed, or the named change does not validate
- **THEN** the producer exits non-zero with the failing precondition named, and emits no package

#### Scenario: A rule in this capability has no executable behind it
- **WHEN** a package precondition or summary normalization rule is described as mechanically enforced
- **THEN** it names its producer or deterministic check; author-publication decisions remain coordinator judgments backed by executed closure checks

#### Scenario: Publication follows verified repairs
- **WHEN** the coordinator closes findings after the original review
- **THEN** it records the corrected revision and executable validation evidence without rewriting original returns or historical reports; no helper readiness field vetoes that disposition

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

### Requirement: A second return for a lens cannot bury the first
The review summary SHALL preserve every return and finding, report the most severe reported outcome for each lens independently of arrival order, and leave disposition to Main. An agent MUST NOT be required to echo an identifier the coordinator generated.

#### Scenario: A benign return follows a failing one for the same lens
- **WHEN** the summary evaluates both
- **THEN** both returns and all findings remain visible and the lens outcome reflects the failing return without determining publication

#### Scenario: A return arrives for a lens nobody required
- **WHEN** the summary evaluates it
- **THEN** it is kept and reported separately without deciding delivery or satisfying selected coverage

#### Scenario: A return omits a field the coordinator generated
- **WHEN** such a return is evaluated
- **THEN** its findings survive because no correlation field is required of an agent

### Requirement: Criteria are read from the reviewed tree, never the working checkout

Written-intent criteria SHALL be read from the tree the reviewed range resolves to, so a package cannot bind criteria that are absent from its own immutable target. The producer MUST refuse rather than fall back to the working checkout when it cannot read the change from that tree.

#### Scenario: The working checkout carries a newer or untracked change directory
- **WHEN** the reviewed range's head does not contain the change content present in the checkout
- **THEN** the criteria come from the reviewed head, and the checkout-only content is not bound

#### Scenario: The named change is absent from the reviewed head
- **WHEN** the reviewed head has no such change directory
- **THEN** the producer refuses with that precondition named and emits no package

### Requirement: A finding is classified by whether the spec anticipated it
The review summary SHALL report known criterion matches and unknown coverage honestly. Missing criterion mapping MUST NOT be interpreted as an authored-spec defect. Supported `locations`, `file`, `files`, `path` with `line`, and structured evidence locations SHALL retain their evidence during normalization. A path alone MUST NOT imply a criterion match. Main determines whether a finding requires a code correction, an intent change or a documented concern.

#### Scenario: Unmapped finding
- **WHEN** a finding has no known criterion
- **THEN** its coverage is unknown and its evidence is preserved for Main's judgment

#### Scenario: A finding matches a bound criterion
- **WHEN** the summary evaluates a finding whose criterion is present in the package
- **THEN** it reports the known match and Main verifies the affected property when closing the finding

#### Scenario: A finding matches no bound criterion and sits above the floor
- **WHEN** the summary evaluates such a finding
- **THEN** coverage is unknown; Main assesses the actual finding rather than declaring a spec defect from absent mapping

#### Scenario: A finding matches no bound criterion and sits below the floor
- **WHEN** the summary evaluates such a finding
- **THEN** coverage remains unknown and the evidence remains visible for Main's disposition

#### Scenario: Equivalent location formats
- **WHEN** equivalent findings use the supported location forms
- **THEN** scope classification agrees and original evidence remains available

#### Scenario: Ambiguous or invalid locations
- **WHEN** a finding carries an absolute, traversing or malformed location
- **THEN** the summary does not silently classify it as outside the delta or discard its evidence

### Requirement: A security dimension stops for a live three-way choice
Security impact SHALL inform Main's choice of checks and independent advice without forcing a lane-choice menu or extra TH authorization. Existing scoped authorization remains valid. Main SHALL disclose missing requested coverage, judge actual blockers and verify corrections before delivery.

#### Scenario: Sensitive authorized work
- **WHEN** a candidate changes a security-related surface
- **THEN** Main evaluates relevant risks and continues the approved method under native permissions.

#### Scenario: Implementation reveals a security-sensitive surface
- **WHEN** the completed changed-surface classifier reports a security-floor category
- **THEN** the classifier provides risk advice and Main selects useful validation without a mandatory three-way choice.

#### Scenario: The operator raises the bar in-lane
- **WHEN** the operator selects the in-lane option
- **THEN** Main honors the requested additional scrutiny and selects suitable reviewers; the classifier adds no compulsory lens.

#### Scenario: Publication is attempted before required security lenses pass
- **WHEN** the in-lane security path was selected and either required security lens is absent, failed in execution, incomplete or untrusted
- **THEN** Main discloses unavailable requested coverage, judges actual risks and addresses genuine unresolved blockers without treating a classifier as authority.

#### Scenario: Security findings are closed after complete reviews
- **WHEN** security and adversary completed with sufficient anchored coverage, their blockers are repaired within authorized scope, and finding-specific security checks and relevant suites pass on the corrected commit
- **THEN** Main preserves the original review results, records verified closure and continues otherwise authorized PR publication without a new reviewer pass

#### Scenario: A security blocker lacks closure evidence
- **WHEN** either required security lens reported a blocker whose correction is unverified or whose required check failed or was omitted
- **THEN** the affected PR remains blocked despite other passing checks or applied patches

#### Scenario: A non-security required lens still blocks publication
- **WHEN** the security and adversary conditions are satisfied but `qa` or `tester` reports an actual publication blocker without sufficient finding-specific closure evidence
- **THEN** the affected PR remains blocked until that required-lens blocker is closed; security clearance does not waive it

#### Scenario: The floor applies and a required lens return is missing
- **WHEN** the original gate is computed with a required floor lens absent or returning a blocker
- **THEN** the report names missing selected coverage without inventing a pass; Main owns the delivery decision.

#### Scenario: The work is multi-repository, multi-specialist, irreversible, multi-task, or operator-absent
- **WHEN** the work requires multiple writing specialists, independent deliverables, irreversible or operator-absent work
- **THEN** Main follows the approved scope and native permissions, coordinating dependencies and genuinely missing decisions without automatically forcing pipeline.

### Requirement: Review lenses do not count as specialists
Review lenses SHALL provide independent evidence without imposing a specialist-count routing limit. Main may delegate bounded implementation and review work within the same spec objective.

#### Scenario: Several specialists are useful
- **WHEN** a bounded objective benefits from independent tasks and reviewers
- **THEN** Main assigns explicit ownership and retains the current working method.

#### Scenario: An operator requests four review lenses at once
- **WHEN** a live review request names tester, qa, security, and adversary
- **THEN** the request is served as one review with one reviewer instance per lens and does not trigger the multi-specialist hard router

### Requirement: Authored written intent binds as review criteria

The review package SHALL accept criteria whose provenance is the authored `openspec/changes/<change>/` requirements, carried by reference to their anchored path, and the reviewer return MUST keep an artifact-derived criterion distinguishable from a live-operator criterion.

#### Scenario: A lane review runs on a branch with an authored change
- **WHEN** the lane assembles the review package for a branch whose change directory holds validated requirements
- **THEN** those requirements are bound as criteria with their own provenance value, and the return reports coverage against them separately from criteria the operator stated live

### Requirement: The verification fan has an explicit invocation surface
A skill SHALL request the inline verification fan over a committed range with a named lens set. Package construction MUST reject a dirty tree or uncommitted range. Its `summary` command SHALL report findings, lens outcomes and coverage without a publication-readiness decision; `gate` SHALL remain an equivalent compatibility alias. Advisory concerns, missing selected coverage and reported blockers MUST remain visible without causing a summary execution error. Invalid summary inputs SHALL still fail explicitly.

#### Scenario: The operator invokes the verification skill on a clean branch
- **WHEN** the skill receives a committed range and a lens set
- **THEN** selected reviewers inspect that immutable range and the summary preserves their outcomes for Main's decision

#### Scenario: The working tree is dirty
- **WHEN** the skill is invoked while the index or worktree carries uncommitted changes
- **THEN** packaging stops and reports that uncommitted review is unsupported without dispatching a lens

#### Scenario: Advisory result and compatibility alias
- **WHEN** a valid input contains concerns or blockers and is summarized through either command
- **THEN** both commands produce the same factual result without readiness or publication reasons and exit successfully

#### Scenario: Invalid input
- **WHEN** package or return input is malformed
- **THEN** the command reports the operational error with a nonzero exit instead of inventing a successful review

### Requirement: Review preparation and recovery are proportionate
Main SHALL supply the anchored candidate, selected question, relevant intent and
available test evidence with concrete omissions in a concise dispatch. Reviewers
SHALL inspect the changed surface and pertinent dependencies, reuse applicable
provider assessments, report findings and coverage limits, and avoid a general
audit or repeating checks without a concrete reason. Native runtime permissions
SHALL govern execution. Recovery SHALL address an observed cause rather than
requiring another execution path for every failed reviewer.

#### Scenario: A small reviewed change has current test results
- **WHEN** the candidate has checks and a test-quality assessment
- **THEN** the reviewer evaluates the selected question using those results and investigates concrete gaps without starting an equivalent test-review workflow

#### Scenario: A reviewer cannot read its target
- **WHEN** native execution fails before reading the anchored candidate
- **THEN** Main attempts a supported focused repair when useful, or preserves the failure and any findings as limited coverage without a compulsory CLI retry or invented pass

#### Scenario: A reviewer returns useful partial work
- **WHEN** an execution stops before completing its selected scope
- **THEN** Main retains findings and unchecked scope and judges delivery under existing authorization and explicit operator prerequisites
