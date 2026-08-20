## Purpose

Record the dispatch costs that are deterministically derivable from the coordinator's own artifacts, and state plainly which components remain unavailable rather than estimating them.

## ADDED Requirements

### Requirement: The events validator enforces the attempt record

The executable that validates the execution trace SHALL reject an attempt record that omits a derivable measure this capability requires, and SHALL reject a token component presented as available without its complete frozen component set. Conformance MUST NOT rest on prose describing the expected shape.

#### Scenario: An attempt record omits a derivable measure
- **WHEN** the trace is validated and an attempt omits either its derived wall time or its declared-input budget
- **THEN** validation fails and names the attempt and the missing measure

#### Scenario: An attempt reports a wall time it did not derive
- **WHEN** an attempt's reported wall time does not match the interval between its own spawn and close timestamps
- **THEN** validation fails, because an unchecked number is one the producer could have invented

#### Scenario: A token component is presented without its full set
- **WHEN** an attempt reports available token components with any of the frozen set missing
- **THEN** validation fails, and the unavailable branch remains the only accepted alternative

### Requirement: Per-attempt wall time is derived from the coordinator's own events

Every dispatch attempt SHALL carry a wall time derived from the coordinator's recorded spawn and close timestamps for that attempt, and this derivation MUST NOT depend on runtime telemetry the coordinator cannot read.

#### Scenario: A dispatch opens and closes
- **WHEN** an attempt's spawn and close events are recorded
- **THEN** its wall time is derived from those two timestamps and reported per attempt

#### Scenario: An attempt stalls and is closed without a result
- **WHEN** an attempt is closed after a stall with no returned result
- **THEN** its wall time is still recorded and marked as consumed without a result, so stalled time is visible rather than absorbed

### Requirement: Each dispatch records a deterministic declared-input budget

Every dispatch SHALL record the size of its declared input manifest, computed from the files the dispatch requires, so that fixed context cost is attributable per role. This budget MUST be labelled as a declared-input measure and MUST NOT be presented as consumed tokens.

#### Scenario: A verifier dispatch requires a large frozen artifact
- **WHEN** a dispatch's declared inputs include the frozen review artifact
- **THEN** the recorded budget attributes that artifact's size to the dispatch, and the report distinguishes the budget from consumed tokens

#### Scenario: The same role is dispatched repeatedly
- **WHEN** one role is dispatched several times in a run
- **THEN** the per-role total of declared-input budget is reported, so a repeated fixed cost is visible

### Requirement: Unattributed coordinator cost is stated, not left as a remainder

A run's cost report SHALL state the difference between its total and the sum of its attributed parts as unattributed coordinator overhead, and MUST NOT distribute that difference across attributed items.

#### Scenario: Phase totals do not sum to the run total
- **WHEN** the attributed phase values sum to less than the recorded run total
- **THEN** the report names the difference as unattributed coordinator overhead rather than silently omitting it

### Requirement: Unavailable token components stay unavailable

Per-attempt token components SHALL continue to report as unavailable wherever the runtime does not expose them, and the coordinator MUST NOT split a phase total, mine transcripts or tool output, correlate native identifiers, or estimate in order to populate them.

#### Scenario: A runtime exposes no per-subagent usage
- **WHEN** attempt metrics are written for a dispatch on such a runtime
- **THEN** the token components report as unavailable with the established reason, and no derived or estimated value is substituted

#### Scenario: Wall time and declared-input budget are available while tokens are not
- **WHEN** an attempt has derivable wall time and a computed input budget but no token components
- **THEN** both derivable measures are recorded and the token components remain unavailable, without the presence of one implying the other
