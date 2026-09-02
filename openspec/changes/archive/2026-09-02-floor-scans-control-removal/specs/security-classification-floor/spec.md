## ADDED Requirements

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
