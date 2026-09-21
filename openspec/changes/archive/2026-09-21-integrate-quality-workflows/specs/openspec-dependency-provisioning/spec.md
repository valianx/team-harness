## ADDED Requirements

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
