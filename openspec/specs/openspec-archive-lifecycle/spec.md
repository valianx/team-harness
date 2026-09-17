# openspec-archive-lifecycle Specification

## Purpose

Keep completed OpenSpec intent visible and consistent with delivered code while
avoiding a second approval or control protocol.

## Requirements

### Requirement: Completed changes are archived with the completing delivery
Once implementation and relevant checks are complete, Main SHALL prepare the
authorized archive on the implementation branch before the final PR candidate
when the change is ready. The same PR SHOULD contain implementation, updated
living specs and the archived change. A later recovery PR remains valid when a
previous delivery omitted or deferred the archive.

#### Scenario: A completed change is prepared for a PR
- **WHEN** the implementation and relevant checks are complete
- **THEN** Main reconciles living specs, prepares the archive and includes all of them in the candidate when appropriate

### Requirement: Archive readiness is reported, not mechanically enforced by TH
PR preparation SHALL compare relevant open changes with implementation and
verification evidence and report ready, pending or conflicting status with a
reason. A pending or deferred archive remains visible but does not create a
Team Harness gate or prevent ordinary work that the operator has authorized.

#### Scenario: An unrelated open change exists
- **WHEN** a PR contains ordinary work unrelated to an open OpenSpec change
- **THEN** Main leaves that change untouched and reports why it is outside the candidate

### Requirement: Archive preserves source ownership and history
Archiving SHALL move the completed change through the repository's standard
OpenSpec lifecycle, update links to its living specs and preserve historical
content. It SHALL not delete unrelated active or archived changes, rewrite
previous evidence or create a duplicate control record.

#### Scenario: A change is cancelled or retired
- **WHEN** the operator explicitly chooses retirement without applying its delta
- **THEN** Main archives it as cancelled and does not mark unfinished implementation or verification complete

### Requirement: Corrections keep code and intent coherent
If review or testing finds a defect after archive preparation, Main SHALL keep
implementation, living specs and the archived record consistent on the same
branch. It MAY amend the active intent and revalidate when the correction changes
the requested behavior.

#### Scenario: A PR comment reveals a scope change
- **WHEN** applying the correction would change acceptance or intended behavior
- **THEN** Main updates the canonical change and reports the revised scope before delivery

### Requirement: Evidence debris is not durable product state
Raw logs, transcripts, scratch scripts, screenshots and temporary review reports
SHALL remain in configured workspace or temporary storage unless they are
deliberately maintained product artifacts. Living specs record durable behavior,
not every execution detail.

#### Scenario: A review produces a large raw log
- **WHEN** the log is needed for diagnosis but is not part of the product
- **THEN** Main keeps it in permitted temporary storage and links only the durable conclusion
