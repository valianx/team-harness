# openspec-dependency-provisioning Specification

## Purpose
Defines how Team Harness obtains and verifies the OpenSpec CLI and upstream-generated runtime skills throughout planning, implementation verification and completed archive, within operator-authorized scope.

## Requirements

### Requirement: OpenSpec preflight verifies the complete toolchain
Before OpenSpec-dependent work, TH SHALL check the supported Node.js/npm prerequisites, the resolved OpenSpec CLI version and the active runtime's upstream-generated capabilities. The required completion capabilities SHALL include implementation verification as well as planning/apply. Missing or stale generated instructions SHALL be refreshed by supported upstream initialization or update, preserving unrelated runtime targets and workflow selections.

#### Scenario: Compatible toolchain is already installed
- **WHEN** prerequisites, CLI and required generated workflows satisfy the compatibility policy
- **THEN** TH records their bounded identities and continues in the same workspace without prompting for installation or regeneration

#### Scenario: OpenSpec is missing
- **WHEN** the CLI cannot be resolved
- **THEN** TH performs an already-authorized supported installation or obtains only missing scope authorization, and otherwise reports the pending dependency without fabricating OpenSpec output

#### Scenario: Generated skills are missing or stale
- **WHEN** the compatible CLI is present but a required generated capability, including verify, is absent or stale
- **THEN** TH uses the official profile/init/update path within existing authority, checks the generated result, and does not replace it with a TH-authored skill

#### Scenario: Node or npm prerequisite is unavailable
- **WHEN** Node.js or npm cannot satisfy the supported prerequisites
- **THEN** TH reports the exact prerequisite and continues independent work without silently installing or replacing the host runtime

#### Scenario: OpenSpec version is incompatible
- **WHEN** the resolved executable is outside the declared compatibility policy
- **THEN** TH reports the supported update path and preserves the current task for recovery instead of using an incompatible executable or requiring a new pipeline

### Requirement: TH declares a reproducible compatibility policy
TH releases that depend on OpenSpec SHALL identify a tested CLI version or bounded range, its prerequisites, supported runtime targets and required generated workflows. Updates SHALL follow upstream distribution and generation, recording the resolved version and checking capability compatibility. An upstream release SHALL NOT require copied templates to become usable; an untested version SHALL NOT be silently declared supported or resolved from an undeclared floating latest command.

#### Scenario: A provisioning command is prepared
- **WHEN** TH prepares to install or update OpenSpec
- **THEN** it selects a declared supported version and the installation owner's upstream update route, then verifies the actual executable and required workflows

#### Scenario: A newer upstream release is requested
- **WHEN** an update request names a release outside the current tested policy
- **THEN** TH identifies the compatibility checks needed before adoption and retains upstream ownership instead of freezing a private copy of its instructions

#### Scenario: Verify is omitted by the selected profile
- **WHEN** a supported CLI installation uses a profile without implementation verification
- **THEN** TH adds that capability through the supported configuration and generation workflow, preserving other selected workflows and runtime integrations

### Requirement: Provisioning outcome is verified and recoverable
After provisioning, TH SHALL re-run the complete preflight, verify the CLI plus expected generated-skill ownership and metadata, and record non-sensitive evidence in the active workspace. A failed or partial installation or generation MUST leave the pipeline recoverable without requiring a new pipeline invocation.

#### Scenario: Provisioning succeeds
- **WHEN** installation and OpenSpec integration generation complete successfully
- **THEN** TH records the verified versions and generated integration status and resumes the same workspace at the pending OpenSpec action

#### Scenario: Provisioning fails
- **WHEN** installation, version verification, or integration generation fails
- **THEN** TH records the bounded failure and retry guidance, remains stopped before OpenSpec Design work, and does not claim the dependency is ready

### Requirement: Preflight evidence excludes sensitive data
Dependency checks and provisioning evidence SHALL contain only command identity, resolved non-secret paths, versions, outcome, and timestamps. TH MUST NOT persist registry credentials, environment secrets, or credential-store contents.

#### Scenario: Provisioning needs package-manager authentication
- **WHEN** the package manager uses credentials from the environment or credential store
- **THEN** TH may execute the approved installation but records no credential values in repository or workspace artifacts

### Requirement: Provisioning reuses scoped authorization and native permissions
TH SHALL install or update the OpenSpec CLI and generated integrations only within operator-authorized scope and native runtime permissions. An explicit request covering that operation SHALL be sufficient task authority; TH SHALL NOT require a fresh response to a fixed preflight prompt when authorization already exists. Unrelated dependencies and configuration SHALL remain outside that operation.

#### Scenario: Operator already requested the update
- **WHEN** the operator has authorized the relevant installation or update
- **THEN** TH performs that bounded upstream operation under native permissions, verifies the actual toolchain and continues without another TH approval ritual

#### Scenario: Operator approves provisioning
- **WHEN** the operator approves a presented install or update action whose authority was missing
- **THEN** TH performs only that supported upstream operation, verifies the complete toolchain and resumes the pending work

#### Scenario: Provisioning is not authorized
- **WHEN** the requested work does not authorize a required dependency mutation
- **THEN** TH explains the concrete missing operation and requests only that authority, keeping the existing work resumable

#### Scenario: Operator declines provisioning
- **WHEN** the operator declines the dependency operation
- **THEN** TH makes no dependency changes and reports which OpenSpec work remains pending without discarding the shared workspace or completed independent work
