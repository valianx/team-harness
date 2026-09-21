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

### Requirement: Spec prepares its declared upstream providers at entry
At entry or resumption of spec, TH SHALL check OpenSpec, TEA and Superpowers
against its shared compatibility declarations and required native capabilities.
Within task authorization and native permissions, it SHALL install missing
providers or repair missing capabilities through their official installation
owners for the active host. Healthy installations SHALL be reused without an
automatic update or reinstall. Preparation SHALL NOT execute future workflow
stages or configure inactive hosts unless requested. Selecting spec SHALL cover
this declared preparation without separate approval per provider, while explicit
read-only/no-install instructions and native permissions remain controlling.

#### Scenario: New spec with missing tools
- **WHEN** the operator starts spec with TEA or Superpowers absent and has not restricted dependency preparation
- **THEN** TH provisions the missing providers through BMAD or the official host plugin route before their stages are needed, verifies required entries and continues the same effort

#### Scenario: Resume with working installations
- **WHEN** all three providers and required capabilities are already usable
- **THEN** TH reuses them without reinstalling or changing other host integrations

#### Scenario: Planning-only request
- **WHEN** spec is limited to planning
- **THEN** dependency preparation remains available but no test-review, trace or completion verification is falsely executed or claimed before implementation exists

### Requirement: Provider compatibility retains upstream ownership
TH SHALL declare the selected TEA and Superpowers capabilities, tested baselines,
provider prerequisites and official distribution owners alongside its OpenSpec
policy. The current agent SHALL use these declarations to select the supported
upstream operation, check the resolved version and read its installed instructions.
A different version SHALL receive relevant compatibility checks before use;
TH SHALL NOT replace upstream methods with bundled copies or invent an npm CLI
for a plugin-only provider.

#### Scenario: TEA requires a newer Node runtime
- **WHEN** the current Node runtime meets OpenSpec's prerequisite but not TEA's
- **THEN** TH identifies TEA's actual requirement and the supported recovery without silently replacing the host runtime or claiming TEA is ready

#### Scenario: Host marketplace resolves another version
- **WHEN** Superpowers resolves to a version different from the tested baseline
- **THEN** TH checks its required capability and native integration before use and records the resolved version instead of labeling it as the tested baseline

### Requirement: Provider preparation preserves workspace and reports actual readiness
Preparation SHALL preserve the selected local or Obsidian workspace and route
provider working outputs there through supported configuration. Installed files,
native discovery and active-session capability SHALL be distinguished. A failed
installation, unavailable native action or pending activation SHALL leave only
dependent work pending with a concrete recovery; independent work can continue.
An installation alone SHALL NOT imply a restart or successful method execution.

#### Scenario: Obsidian preparation
- **WHEN** TEA is prepared for an effort using Obsidian
- **THEN** its working reports use that effort's absolute workspace path without a repository-local mirror or copying installation assets into TH distribution

#### Scenario: Newly installed plugin is not visible in the current session
- **WHEN** installation succeeds but active-session availability cannot be established
- **THEN** TH reports installed versus unverified activation, uses a supported refresh or direct installed skill route when available, and proposes restart only for a demonstrated remaining host limitation

#### Scenario: Dependency mutation is declined or fails
- **WHEN** installation is declined, denied by the native host, or fails
- **THEN** TH preserves completed work, explains the affected capability and recovery, and neither retries an unchanged failure nor fabricates a successful stage

### Requirement: Quality workflows prepare their selected dependencies
At entry or resumption of audit, find-bugs or review-pr, TH SHALL resolve the analysis capabilities applicable to the selected objective, stack and active host through its shared dependency preparation. It SHALL check versions, prerequisites, invocation and supported project/output configuration, reuse healthy installations and officially install or repair missing selected capabilities within task authorization and native permissions. Installed, discoverable and usable states SHALL remain distinct. Required unavailable analysis SHALL remain pending with a concrete recovery. Unselected tools and inactive hosts SHALL NOT be installed merely because they appear in the provider catalog.

#### Scenario: A selected analyzer is missing
- **WHEN** an authorized diagnostic workflow selects an applicable analyzer that is absent and installation is not restricted
- **THEN** Main prepares it through its official owner, verifies its actual invocation and configuration and continues the same task without another approval ceremony per provider

#### Scenario: Resumption finds a healthy setup
- **WHEN** selected tools and their relevant project configuration remain usable
- **THEN** preparation reuses them without an automatic update, reinstall or change to inactive hosts

#### Scenario: Output settings do not preserve the workspace
- **WHEN** a selected tool defaults to placing working reports in the repository despite the chosen Obsidian workspace
- **THEN** Main uses a supported output route to the selected workspace and verifies it, or reports the specific unresolved limitation without creating a second workspace

#### Scenario: Installation or activation cannot complete
- **WHEN** a native permission, prerequisite or active-session limitation prevents a selected capability from being usable
- **THEN** only dependent work remains pending with the missing prerequisite stated and no fabricated analysis, restart requirement or provider substitute

#### Scenario: TH and Sentry skills coexist
- **WHEN** preparation encounters the shared find-bugs label
- **THEN** it resolves the requested owner before changing an installation, uses `th-find-bugs` for TH in OpenCode while preserving Sentry's `find-bugs`, and asks only when the live task leaves the owner ambiguous
