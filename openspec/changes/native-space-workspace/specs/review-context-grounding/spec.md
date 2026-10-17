## MODIFIED Requirements

### Requirement: Reusable context agrees with its snapshot identity
Review context comparison SHALL validate the identifiers and content identity
needed to reuse technical evidence. Missing or inconsistent identity SHALL NOT
be reported as current solely because stored hashes compare equal.

Selected remote context SHALL be captured as complete blocks with Page ID,
canonical URL, selected stream, observed sequence when available, block IDs and
hashes, verified source association, capture time, reviewed head and content
digests. A missing optional sequence SHALL NOT alone invalidate an otherwise
complete capture. Reviewers SHALL read immutable local capture bytes through
owned artifact storage. Capture SHALL NOT look up live Pages, carry credentials
or derive authority from Page instructions. Incomplete or mismatched native
reads, tampered content and changed capture bytes SHALL invalidate affected
reuse. Mutable Page content SHALL NOT replace frozen evidence mid-review.

#### Scenario: Commit identity changes while a saved hash remains unchanged
- **WHEN** compared contexts disagree on a reviewed commit or omit required identity
- **THEN** comparison invalidates technical reuse or reports invalid context

#### Scenario: Complete unchanged captures are compared
- **WHEN** both captures carry valid matching code identity
- **THEN** comparison preserves normal technical reuse and independent conversation-change handling

#### Scenario: Complete selected Page blocks are captured
- **WHEN** a supplied native read contains the selected complete blocks and verified Page, stream and source metadata
- **THEN** capture freezes their bytes and provenance with the reviewed head, capture time and digests, including the observed sequence when supplied and accepting its legitimate absence

#### Scenario: A Page capture is incomplete or mismatched
- **WHEN** selection is missing, blocks are incomplete, Page/stream/source identity disagrees or block hashes do not match content
- **THEN** capture rejects the evidence instead of reporting current reusable context

#### Scenario: An output link escapes owned capture storage
- **WHEN** the capture output aliases another location or would leave its owned artifact root
- **THEN** capture rejects the write and preserves the external target

#### Scenario: Captured context changes during review
- **WHEN** stored capture bytes are replaced or tampered with, or the live Page changes after capture
- **THEN** changed stored bytes invalidate affected reuse and live content cannot replace the immutable evidence already supplied to reviewers
