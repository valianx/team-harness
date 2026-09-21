## ADDED Requirements

### Requirement: Reusable context agrees with its snapshot identity
Review context comparison SHALL validate the identifiers and content identity
needed to reuse technical evidence. Missing or inconsistent identity SHALL NOT
be reported as current solely because stored hashes compare equal.

#### Scenario: Commit identity changes while a saved hash remains unchanged
- **WHEN** compared contexts disagree on a reviewed commit or omit required identity
- **THEN** comparison invalidates technical reuse or reports invalid context

#### Scenario: Complete unchanged captures are compared
- **WHEN** both captures carry valid matching code identity
- **THEN** comparison preserves normal technical reuse and independent conversation-change handling
