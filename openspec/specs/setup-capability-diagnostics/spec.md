# setup-capability-diagnostics Specification

## Purpose
Help operators identify a minimal useful Team Harness installation, inspect supported coding hosts without changing them, and configure only the capabilities they choose.

## Requirements

### Requirement: Explicit read-only inventory

Setup status SHALL inspect the selected runtime and resolved configuration root. An explicit cross-runtime inventory SHALL report Claude Code, Codex, OpenCode and Pi independently. Status MUST NOT install, update, authenticate, repair, invoke models, or change configuration, package registries, receipts or file modes.

#### Scenario: Inventory other CLIs
- **WHEN** the operator requests the cross-runtime inventory with only some CLIs available
- **THEN** every supported runtime has a separate result, missing CLIs are reported, and no installation or settings are changed

#### Scenario: Inspect a selected custom root
- **WHEN** a runtime is inspected with an explicit configuration root
- **THEN** its configuration and package evidence use that root without borrowing configuration from the default root

### Requirement: Evidence distinguishes installation from activation

The inventory SHALL report CLI availability/version, Team Harness package identity/version when established, configuration health, and activation separately. A manifest or prior convergence receipt MUST NOT establish live activation. Missing, unsupported or ambiguous evidence SHALL be reported as unknown with a concrete next step; settings metadata alone MUST NOT prove a current package installation.

#### Scenario: Configured but unverified package
- **WHEN** preferences record an installed version but no authoritative package source is established
- **THEN** the inventory reports the configuration and leaves package identity unverified

#### Scenario: Installed package without live activation evidence
- **WHEN** a valid selected native Team Harness package is found
- **THEN** its version is reported and activation remains unknown until the active host supplies an actual observation

### Requirement: Capability-specific minimum requirements

Setup SHALL offer the minimum native package and runtime configuration first, then optional capabilities. Requirements SHALL identify the operation they support. Missing optional Python helpers, GitHub CLI, Context7, Space, Obsidian or workflow providers MUST NOT invalidate a basic native installation. Codex agent configuration SHALL identify Python 3.11 or newer; Pi SHALL identify its supported Node minimum. A source-build Go toolchain MUST NOT be required for published native packages.

#### Scenario: Minimal installation without optional tools
- **WHEN** the native package prerequisites are satisfied and optional integrations are absent
- **THEN** setup offers the minimal configuration and reports optional capabilities independently

#### Scenario: Select an unsupported capability
- **WHEN** the operator chooses a capability whose prerequisite is missing or too old
- **THEN** setup names the capability, missing prerequisite and recovery without silently installing it or configuring another host

### Requirement: Portable optional interpreter discovery

Setup SHALL verify Python interpreter candidates appropriate to the platform using literal executable/argument arrays and bounded version probes. A missing `python3` name MUST NOT hide a suitable `python` or Windows `py -3`. No suitable interpreter SHALL produce a partial diagnostic with a recovery instruction rather than a false installation failure.

#### Scenario: Alternative Python executable
- **WHEN** `python3` is unavailable and another supported candidate satisfies the selected helper's version requirement
- **THEN** setup uses the verified executable and its required arguments

#### Scenario: No suitable interpreter
- **WHEN** all candidates are absent, incompatible or fail their bounded probe
- **THEN** setup reports that helper inspection is unavailable and preserves the native installation

### Requirement: Bounded probes and private reports

Status SHALL use fixed, noninteractive argument arrays without a shell, bounded execution and bounded captured output. It SHALL export only allowlisted status, versions, paths and diagnostic codes. Raw configuration values, credentials and native command output MUST NOT appear in the report or error messages.

#### Scenario: Hung or excessive probe output
- **WHEN** a CLI version probe hangs or exceeds the output limit
- **THEN** status stops that probe, reports a bounded diagnostic and continues independent runtime inspection

#### Scenario: Invalid configuration containing secrets
- **WHEN** a selected settings file is malformed or contains unknown credential fields
- **THEN** status reports configuration health without exporting its contents and does not rewrite the file

### Requirement: Preserve existing choices during guided setup

Setup SHALL reuse healthy installations and existing choices unless the operator chooses a change. Discovery of another host SHALL NOT authorize configuring it. Capability unavailability SHALL retain the selected workspace preference and remote binding; setup MUST NOT silently replace Space with local or Obsidian.

#### Scenario: Existing healthy configuration
- **WHEN** setup finds a healthy installation and preferences
- **THEN** it offers reuse and optional reconfiguration without resetting the native chat model, permissions or unrelated settings

#### Scenario: Space unavailable in selected host
- **WHEN** Space is selected but the active host lacks the required native Page access
- **THEN** setup reports the unavailable capability, preserves the selection and offers an explicit alternative for new work
