## ADDED Requirements

### Requirement: Completed OpenSpec work receives upstream implementation verification
Before declaring a relevant OpenSpec change complete or preparing its completed archive, Main SHALL execute the installed upstream implementation-verification workflow against its requirements, tasks, design and implementation. This SHALL apply to spec, pipeline and direct PR preparation involving that change. Structural `openspec validate`, checked tasks, passing tests and optional TH author review SHALL NOT replace this workflow. Main SHALL assess concrete findings and resolve actual completion defects; a provider verdict alone SHALL NOT become a separate authorization gate.

#### Scenario: Implementation is ready for archive
- **WHEN** the change's implementation and relevant executable checks are complete
- **THEN** Main invokes the current upstream verify workflow before archive, records its scope and outcome in the shared workspace, and evaluates findings before declaring completion

#### Scenario: Optional author review is declined
- **WHEN** the operator declines a TH independent review of an OpenSpec change
- **THEN** upstream implementation verification still runs as part of completing that change without requiring another review approval

#### Scenario: Archive is declined or deferred
- **WHEN** the operator defers archive but continues authorized review or delivery
- **THEN** upstream implementation verification remains required for a completion claim, archive status stays separate, and any delivery made with verification pending is explicitly described as incomplete rather than falsely verified

#### Scenario: Verification cannot execute
- **WHEN** the upstream verify integration is missing, incompatible or fails before producing usable verification
- **THEN** completion remains pending with the exact missing action, independent work may continue, and Main does not substitute structural validation or label unexecuted verification as passed

#### Scenario: The task is planning or retirement only
- **WHEN** Main prepares an unimplemented proposal or retires an approved cancelled change
- **THEN** it validates the appropriate artifacts without claiming completed implementation or demanding implementation verification for nonexistent work

#### Scenario: A PR contains no relevant OpenSpec change
- **WHEN** ordinary work reaches PR preparation without a related OpenSpec change
- **THEN** this requirement does not create an artificial change or a new OpenSpec workflow

### Requirement: Verification evidence follows the implemented intent
Main SHALL bind upstream verification evidence to the examined change artifacts and implementation. A location-only archive operation MAY retain that evidence after source links are refreshed and structural validation succeeds. Changes to behavior, requirements or implementation after verification SHALL receive renewed verification for the affected intent through a context supported by the installed upstream workflow. Main SHALL invalidate only affected evidence and create or amend durable specs only when requirements, scenarios or intent change. TH SHALL NOT invent an archived-change CLI command, silently move history, create a durable spec solely to satisfy verification, or claim stale evidence covers a correction.

#### Scenario: Archive only relocates verified artifacts
- **WHEN** archive preserves the verified meaning and implementation
- **THEN** Main updates source references and validates the archived output without repeating implementation verification solely because paths changed

#### Scenario: A reviewer requests a correction after archive
- **WHEN** a correction changes the verified implementation or intended behavior
- **THEN** Main updates the same branch coherently and obtains renewed upstream verification through a demonstrated supported context, preserving the archive and renewing affected evidence; an intent change may need an active amendment, while a code-only fix does not create a durable spec solely for verification

#### Scenario: An archived correction has no supported verification context
- **WHEN** the installed upstream workflow cannot verify the archived correction through a demonstrated supported context
- **THEN** Main reports the specific recovery needed and keeps that verification pending without inventing a reopen command or creating another durable proposal just to bypass the limitation

#### Scenario: Work resumes with an archived change
- **WHEN** current sources still match valid verification evidence
- **THEN** Main reuses that evidence without rearchiving, while missing or stale verification remains explicit and requires a supported recovery
