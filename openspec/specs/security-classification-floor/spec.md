# security-classification-floor Specification

## Purpose
Keep a failure to classify from resolving as an absence of risk, and keep a finding from being closed against the one input that revealed it rather than against the property it broke.

## Requirements

### Requirement: Only a successful benign classification may waive the security lens
Security classification MUST be advisory. Main selects relevant reviewers from the task and requested coverage; unknown classification MUST be reported honestly and MUST NOT impose an automatic security lens or permission gate.

#### Scenario: Unclassified candidate
- **WHEN** a classifier cannot determine impact
- **THEN** Main sees the limitation and chooses appropriate validation using task context.

#### Scenario: The classifier positively determines the change is non-executable
- **WHEN** classification resolves to a known non-executable change with no trigger
- **THEN** the classifier reports benign advisory evidence; it does not decide the reviewer set.

#### Scenario: Classification cannot be reached
- **WHEN** classification resolves to indeterminate for any reason — an empty diff, an empty changed-file list, an embedded null byte, or a read failure
- **THEN** the classifier reports unknown with the reason and Main chooses relevant validation without an automatic lens requirement.

#### Scenario: A new indeterminate producer is added later
- **WHEN** a further code path resolves to indeterminate
- **THEN** it reports unknown consistently without adding a new authorization or required-review rule.

### Requirement: Weakening a fail-closed default requires an explicit authorizing scenario
Changes to product behavior MUST be justified by the approved objective and relevant scenarios. A TH classification or reviewer remedy MUST NOT create an additional approval requirement for unchanged authorized work.

#### Scenario: Approved cleanup
- **WHEN** the operator approved removal of duplicated TH enforcement
- **THEN** Main implements and verifies that change without seeking a waiver from the retired enforcement.

#### Scenario: A reason is added to the waiver set
- **WHEN** the set of reasons that resolve to not-required gains a member
- **THEN** Main evaluates the changed advisory classification against approved behavior; there is no permission waiver set for current work.

#### Scenario: A change improves classification without touching the waiver
- **WHEN** classification accuracy is improved so more changes reach a positive benign classification
- **THEN** tests verify the more accurate advisory result without creating or weakening runtime permissions.

### Requirement: A finding is closed against the property it broke, not the input that revealed it
Main MUST evaluate findings against the affected property and verify corrections with suitable evidence. Consolidation MUST retain findings from every same-lens return independently of arrival order and normalize supported location fields. Unmapped criteria MUST be treated as unknown coverage, not fabricated specification defects.

#### Scenario: Duplicate returns
- **WHEN** one lens returns different findings in two reports
- **THEN** both findings remain available to Main in either return order.

#### Scenario: A finding demonstrates a hole through one input
- **WHEN** a finding shows that one input reaches a control bypass
- **THEN** its closure oracle states that no input reaches that bypass, and closing it requires the property to hold rather than that one input to be handled

#### Scenario: The same hole is reachable through a second input
- **WHEN** a later review reaches the same bypass through a different input
- **THEN** it is recorded as the original finding reopened rather than as a new finding, because the property was never closed

### Requirement: Content classification reads removals as well as additions
When classification is used, it MUST consider additions and removals and report unscannable content as unknown.

#### Scenario: Removed control
- **WHEN** a diff removes security-related behavior
- **THEN** advisory analysis includes the removed content without acquiring authority over delivery.

#### Scenario: A security control is removed at a path with no path-level signal
- **WHEN** a change removes a security control from a file whose path matches no path-level signal
- **THEN** the advisory classifier names the removed control's category, and Main considers its impact.

#### Scenario: A security control is added at the same path
- **WHEN** the same control is added rather than removed
- **THEN** the classifier reports the same advisory category regardless of edit direction.

#### Scenario: A changed line is disguised as a diff file header
- **WHEN** a removed line's own text makes its diff line byte-identical to a `---` file header
- **THEN** it is classified as content, because header recognition is positional — a `---`/`+++`
  line is a header only before the file's first hunk marker — and never a match on the line's text

#### Scenario: The change touches no security-relevant content in either direction
- **WHEN** neither the added nor the removed lines carry a content signal and no path signal matches
- **THEN** classification may report no signal; it does not imply all product risks have been ruled out.
