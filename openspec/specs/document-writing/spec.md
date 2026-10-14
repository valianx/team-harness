# document-writing Specification

## Purpose
Help Team Harness agents create and review documents with the information readers need, without repetitive prose or unnecessary artifacts.

## Requirements

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

### Requirement: Artifact delivery preserves requested grouping and verifies access
Document work SHALL establish principal outputs, annex treatment, format, destination and requested access from context before delivery. External delivery SHALL use the format/provider owner, verify capabilities separately for create, convert, move, share file and share folder, and read back content, URL, format/MIME, actual location and effective requested permissions. Unsupported actions SHALL remain specifically pending; a successful upload or file share SHALL NOT imply a shared folder. Working lens reports SHALL NOT automatically become separately published documents.

#### Scenario: Conversion preserves content but sharing is unavailable
- **WHEN** a consolidated report is converted and uploaded successfully while the requested folder-sharing action is unsupported
- **THEN** the delivered content and destination are verified and folder access remains explicitly pending without multiplying the principal documents
