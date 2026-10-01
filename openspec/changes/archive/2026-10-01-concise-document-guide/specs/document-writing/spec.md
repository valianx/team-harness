## Purpose

Help Team Harness agents create and review documents with the information readers need, without repetitive prose or unnecessary artifacts.

## ADDED Requirements

### Requirement: Documentation uses proportionate editorial guidance
TH SHALL provide a distributed writing and review guide used by documentation, planning and specialist document assignments. Content, pages and visuals SHALL serve the reader's task rather than quotas. Explicit user templates and requested depth SHALL remain authoritative.

#### Scenario: A short note is sufficient
- **WHEN** the requested subject can be explained in one short note
- **THEN** the agent writes that note without adding an index, companion pages or mandatory diagrams, and documentation review accepts that structure

#### Scenario: Detailed evidence is necessary
- **WHEN** required steps, evidence or risks need a longer explanation
- **THEN** the agent retains that information without imposing a universal word limit or repeating it in multiple sections

### Requirement: Editorial changes preserve substance and scope
The guide SHALL preserve facts, quantities, conditions, uncertainty, quotations and references. Review-only requests SHALL return actionable findings without editing. Effective text SHALL remain unchanged unless a requested transformation requires edits.

#### Scenario: Shortening a conditional migration note
- **WHEN** the source gives a two-hour estimate for 50 users, requires a backup and does not guarantee zero downtime
- **THEN** the concise result retains those facts and does not turn the estimate into a guarantee

#### Scenario: Review without changes
- **WHEN** the user requests only an audit of a concise document containing a quotation, URL and condition
- **THEN** the agent reports justified findings or a brief no-finding result without rewriting the document
