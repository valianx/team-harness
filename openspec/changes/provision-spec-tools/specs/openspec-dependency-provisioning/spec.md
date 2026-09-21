## ADDED Requirements

### Requirement: Spec prepares its declared upstream providers at entry
At entry or resumption of spec, TH SHALL check OpenSpec, TEA and Superpowers
against its shared compatibility declarations and required native capabilities.
Within task authorization and native permissions, it SHALL install missing
providers or repair missing capabilities through their official installation
owners for the active host. Healthy installations SHALL be reused without an
automatic update or reinstall. Preparation SHALL NOT execute future workflow
stages or configure inactive hosts unless requested.

#### Scenario: New spec with missing tools
- **WHEN** the operator starts spec with TEA or Superpowers absent and authorizes dependency preparation
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
