## MODIFIED Requirements

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
