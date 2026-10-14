# full-project-audit Specification

## Purpose
Provide one project-wide analysis invocation and an integral report whose findings, improvement opportunities and coverage limits remain attributable across repositories and specialist lenses.

## Requirements

### Requirement: Full audit resolves one analysis effort
TH SHALL provide `full-audit` for one or several project repositories. Main SHALL resolve an unambiguous target from the request or existing context, reuse the selected workspace, language and authorization, and record snapshots, environments, emphasis, principal output grouping and requested delivery. The invocation SHALL remain analysis-only and SHALL NOT activate a development pipeline, product repairs, production attacks/load or broader permissions.

#### Scenario: The current context identifies a multi-repository project
- **WHEN** the operator requests a full audit without repeating its known repository paths
- **THEN** Main uses that project association, records its scope and coordinates one analysis effort

### Requirement: Full audit assesses all applicable dimensions
The audit SHALL assess product/actors/threats, architecture/contracts, security, data/privacy, functional QA, UI/UX/accessibility, performance/efficiency, infrastructure/operations, supply chain/delivery and maintainability. Main SHALL select meaningful specialist questions, scenarios and tools by applicability and risk, preserve independent judgment where useful, and record an outcome or explicit limit for each material dimension and critical capability. Missing access SHALL NOT become passed or not applicable.

#### Scenario: A backend has no UI and inaccessible persistence
- **WHEN** the target is a backend without screens and its database cannot be reached
- **THEN** UI is excluded with a reason while persistence and relevant integration remain explicit unverified limits within the other applicable dimensions

### Requirement: Full audit delivers one integral report
The default principal deliverable SHALL be one `00-full-audit.md` in the selected workspace, containing decision summary, scope/topology, unique material findings, repository and boundary context, coverage/evidence/limits, prioritized improvements and optimizations, dependencies, tradeoffs and verifiable closure criteria. Findings SHALL retain canonical cause/ID and linked occurrences rather than summed lens counts; severity, priority and confidence SHALL remain distinct. Lens annexes and evidence SHALL be incorporated or linked without automatically becoming separately published documents. Explicit requested grouping or format SHALL take precedence.

#### Scenario: Two lenses report one boundary failure
- **WHEN** security and QA identify the same causal authorization defect in UI/API repositories
- **THEN** the report retains one cause/ID with both evidence scopes and gives a targeted improvement and closure check

### Requirement: Audit claims preserve reproduction and measurement scope
Material findings SHALL identify repositories/locations, actors, preconditions, trigger, expected versus actual effect and attributable evidence. Claims SHALL distinguish observed behavior, source inference, unverified steps and reasoned non-applicability; bind evidence to source/configuration/dependency/environment identity; identify real versus simulated modules and services; and preserve measurement units and conditions. A successful defect reproduction SHALL NOT be reported as a passed product regression, an isolated middleware fixture as full mounted integration, elapsed duration as CPU, or laboratory/expert results as field performance or participant-observed usability.

#### Scenario: An isolated fixture reproduces a defect
- **WHEN** a synthetic fixture with a simulated dependency produces the expected failure
- **THEN** the finding describes that successful reproduction and its scope while keeping product regression and real integration unverified

### Requirement: Audit coordination reuses current independent evidence
Main SHALL dispatch bounded distinct questions with explicit ownership through available native slots, with sequential fallback and no fixed reviewer quota per repository. Failed or timed-out advice SHALL preserve successful work and its remaining limits. Evidence whose question and relevant inputs still apply SHALL be reused; changed inputs SHALL renew affected analysis. Finding status upgrades SHALL update the existing ID, and a new reviewer, phase or report format alone SHALL NOT trigger an equivalent complete audit.

#### Scenario: A resumed audit confirms a pending observation
- **WHEN** the snapshot is unchanged and new targeted evidence confirms an existing suspected cause
- **THEN** Main upgrades that cause's status, preserves valid independent analysis and does not increase the unique finding count

### Requirement: Audit completion and external delivery are explicit
Completion SHALL mean the selected investigation and consolidation reached their declared outcome with visible limits, rather than that all controls passed or the product is certified. Requested external delivery SHALL use the format/provider owner, verify the required object/action capability before promising it, and read back content, returned URL, MIME/format, location and effective requested access. File sharing SHALL NOT imply folder access; unsupported requested actions SHALL remain specifically pending. Packaging alone SHALL reuse adequate independent coverage.

#### Scenario: Documents can be shared but the requested folder cannot
- **WHEN** the provider supports document delivery but cannot grant the requested folder access
- **THEN** Main preserves the requested report grouping, verifies the documents and states folder access pending with the folder link and specific capability limit
