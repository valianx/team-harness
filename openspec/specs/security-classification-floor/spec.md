# security-classification-floor Specification

## Purpose
Keep a failure to classify from resolving as an absence of risk, and keep a finding from being closed against the one input that revealed it rather than against the property it broke.

## Requirements

### Requirement: Only a successful benign classification may waive the security lens

Security-lens resolution SHALL waive the lens only on a positive classification that the changed surface is non-executable. Every other resolved reason, including a classification that could not be reached, MUST require the lens.

#### Scenario: The classifier positively determines the change is non-executable
- **WHEN** classification resolves to a known non-executable change with no trigger
- **THEN** the security lens is not required

#### Scenario: Classification cannot be reached
- **WHEN** classification resolves to indeterminate for any reason — an empty diff, an empty changed-file list, an embedded null byte, or a read failure
- **THEN** the security lens is required, because a failure to classify is not evidence of safety

#### Scenario: A new indeterminate producer is added later
- **WHEN** a further code path resolves to indeterminate
- **THEN** it requires the lens without that path having to be enumerated anywhere, because the waiver is keyed to the positive classification rather than to a list of failure modes

### Requirement: Weakening a fail-closed default requires an explicit authorizing scenario

A change that moves a resolution from requiring a security control to not requiring it SHALL be accompanied by a scenario that authorizes exactly that waiver, and a deterministic check MUST fail when the waiver set grows without one.

#### Scenario: A reason is added to the waiver set
- **WHEN** the set of reasons that resolve to not-required gains a member
- **THEN** the deterministic check fails and names the added member, so the widening cannot ride along inside an unrelated change

#### Scenario: A change improves classification without touching the waiver
- **WHEN** classification accuracy is improved so more changes reach a positive benign classification
- **THEN** no check fails, because the waiver set is unchanged and the fail-closed default still governs everything it did before

### Requirement: A finding is closed against the property it broke, not the input that revealed it

A closure oracle for a finding SHALL state the property that must hold across every input that reaches the defect, and MUST NOT be satisfied by handling only the input the finding used to demonstrate it.

#### Scenario: A finding demonstrates a hole through one input
- **WHEN** a finding shows that one input reaches a control bypass
- **THEN** its closure oracle states that no input reaches that bypass, and closing it requires the property to hold rather than that one input to be handled

#### Scenario: The same hole is reachable through a second input
- **WHEN** a later review reaches the same bypass through a different input
- **THEN** it is recorded as the original finding reopened rather than as a new finding, because the property was never closed

### Requirement: Content classification reads removals as well as additions

Content-based security signals SHALL be evaluated over every line a change touches in a file,
removals included. A classification MUST NOT resolve benign because a control left the file rather
than arrived in it.

#### Scenario: A security control is removed at a path with no path-level signal
- **WHEN** a change removes a security control from a file whose path matches no path-level signal
- **THEN** the floor applies and names the category the removed control belongs to, because
  removing a control changes the security posture exactly as adding one does

#### Scenario: A security control is added at the same path
- **WHEN** the same control is added rather than removed
- **THEN** the floor applies with the same category, so the classification does not depend on the
  direction of the edit

#### Scenario: A changed line is disguised as a diff file header
- **WHEN** a removed line's own text makes its diff line byte-identical to a `---` file header
- **THEN** it is classified as content, because header recognition is positional — a `---`/`+++`
  line is a header only before the file's first hunk marker — and never a match on the line's text

#### Scenario: The change touches no security-relevant content in either direction
- **WHEN** neither the added nor the removed lines carry a content signal and no path signal matches
- **THEN** the floor does not apply, so widening the scan to removals does not make every change
  sensitive
