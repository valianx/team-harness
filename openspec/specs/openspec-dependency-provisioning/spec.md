# openspec-dependency-provisioning Specification

## Purpose
Defines a consistent and operator-controlled way for Team Harness to obtain and verify the OpenSpec CLI and upstream-generated runtime skills required by its Design phase.

## Requirements

### Requirement: Design preflight verifies the complete OpenSpec toolchain
Before OpenSpec-dependent Design work begins, TH SHALL verify that Node.js and npm satisfy the supported prerequisites, that the `openspec` executable resolves to the TH-supported version, and that the active runtime's OpenSpec-generated skills exist with compatible ownership and generation metadata.

#### Scenario: Compatible toolchain is already installed
- **WHEN** Node.js, npm, OpenSpec, and the active runtime's generated skills satisfy the TH compatibility policy
- **THEN** TH records their bounded identities and continues the same pipeline run without prompting for installation or regeneration

#### Scenario: OpenSpec is missing
- **WHEN** the OpenSpec executable cannot be resolved
- **THEN** TH presents a live choice to install the TH-supported version or abort the pipeline and performs no installation before explicit approval

#### Scenario: Generated skills are missing or stale
- **WHEN** the compatible OpenSpec CLI is installed but the active runtime's generated skills are absent, incompatible, or stale
- **THEN** TH presents a live choice to run the supported OpenSpec initialization or update workflow, or abort, and does not continue Design

#### Scenario: Node or npm prerequisite is unavailable
- **WHEN** Node.js is below the supported floor or Node.js or npm cannot be resolved
- **THEN** TH blocks before OpenSpec planning, provides exact prerequisite guidance and an abort option, and does not install Node.js or npm

#### Scenario: OpenSpec version is incompatible
- **WHEN** Node.js and npm are compatible but OpenSpec is outside the TH-supported version policy
- **THEN** TH offers the declared OpenSpec update path or abort and does not continue Design with the incompatible executable

### Requirement: Provisioning requires explicit operator approval
TH MUST NOT silently install or update Node.js, npm, OpenSpec, or generated OpenSpec integrations. Any CLI installation or generated-skill initialization/update SHALL start only from an explicit live operator response to the exact preflight prompt.

#### Scenario: Operator approves provisioning
- **WHEN** the operator explicitly approves the offered install or update action
- **THEN** TH performs only the offered pinned CLI installation and/or upstream-supported `openspec init` or `openspec update` action and verifies the complete toolchain before continuing

#### Scenario: Operator declines provisioning
- **WHEN** the operator chooses abort or declines the installation
- **THEN** TH records the pipeline as aborted according to its existing rules and makes no dependency changes

### Requirement: TH declares a reproducible compatibility policy
Each TH release that depends on OpenSpec SHALL declare the supported Node.js floor, npm prerequisite, exact OpenSpec version or bounded compatibility range, and supported runtime targets. Automated provisioning MUST NOT resolve an undeclared floating latest version or synthesize TH-maintained copies of generated OpenSpec skills.

#### Scenario: A provisioning command is prepared
- **WHEN** TH prepares to install or update OpenSpec
- **THEN** the command targets the version declared by the installed TH release rather than an unbounded latest release

### Requirement: Provisioning outcome is verified and recoverable
After provisioning, TH SHALL re-run the complete preflight, verify the CLI plus expected generated-skill ownership and metadata, and record non-sensitive evidence in the active workspace. A failed or partial installation or generation MUST leave the pipeline recoverable without requiring a new pipeline invocation.

#### Scenario: Provisioning succeeds
- **WHEN** installation and OpenSpec integration generation complete successfully
- **THEN** TH records the verified versions and generated integration status and resumes the same workspace at the pending Design action

#### Scenario: Provisioning fails
- **WHEN** installation, version verification, or integration generation fails
- **THEN** TH records the bounded failure and retry guidance, remains stopped before OpenSpec Design work, and does not claim the dependency is ready

### Requirement: Preflight evidence excludes sensitive data
Dependency checks and provisioning evidence SHALL contain only command identity, resolved non-secret paths, versions, outcome, and timestamps. TH MUST NOT persist registry credentials, environment secrets, or credential-store contents.

#### Scenario: Provisioning needs package-manager authentication
- **WHEN** the package manager uses credentials from the environment or credential store
- **THEN** TH may execute the approved installation but records no credential values in repository or workspace artifacts
