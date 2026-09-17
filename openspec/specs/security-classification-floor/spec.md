# security-classification-floor Specification

## Purpose

Use changed-surface classification to improve review selection and explain
uncertainty without turning a TH classifier into a second permission or release
system.

## Requirements

### Requirement: Classification considers the complete changed surface
Security signals SHALL be evaluated over changed paths and touched content in
both additions and removals. An unresolved or unscannable classification SHALL
be reported as unknown with its limitation; it SHALL not be presented as proof
that the change is harmless.

#### Scenario: A security control is removed
- **WHEN** a changed line removes an authentication, authorization, secret or other security control
- **THEN** the classifier reports the relevant signal just as it would for an added control

#### Scenario: The changed surface cannot be classified
- **WHEN** a binary, missing or otherwise unscannable input prevents classification
- **THEN** Main reports the uncertainty and can request a useful security or adversarial review

### Requirement: Classification informs recommendations
Main SHALL treat classifier output as a recommendation only. The classifier MAY recommend security or adversarial review based on the
changed surface, trusted policy or the operator's request. The recommendation is
advisory: Main chooses the useful evidence with the task context and no absent
or non-pass lens automatically releases or blocks publication.

#### Scenario: The signal suggests a security review
- **WHEN** the changed surface matches a security category
- **THEN** Main explains the category and selects or offers an appropriate review without creating a TH gate

### Requirement: Finding closure tests the affected property
When a reviewer or operator identifies a security concern, Main SHALL verify
its correction against the affected behavior and relevant checks across the
changed scope. Handling only the demonstration input is insufficient, but closure is a
coordinator decision based on evidence rather than a fixed severity gate.

#### Scenario: The same weakness has another input path
- **WHEN** a second path reaches the property that the finding identified
- **THEN** Main keeps the concern open or broadens the correction instead of treating the first example as complete proof
