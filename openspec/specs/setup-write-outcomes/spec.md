# setup-write-outcomes Specification

## Purpose
Make provisioning reports describe observed writes, failures and retained configuration without overstating setup completion.

## Requirements

### Requirement: OpenCode ownership is isolated by configuration root
The shared OpenCode installation ledger SHALL validate every record and resolve ownership only for the selected configuration root. Valid records for another root SHALL NOT block installation or authorize writes or deletion there. Malformed records and unbound legacy records outside their supported default root SHALL remain refused.

#### Scenario: Two roots use the same component
- **WHEN** each root is installed, updated and removed independently
- **THEN** each operation preserves the other root's assets and ownership while invalid ledger records still fail before writes

#### Scenario: A root is addressed with alternate casing
- **WHEN** the filesystem proves two existing link-free case variants identify the same directory
- **THEN** update and removal reuse its ownership, including supported default-root legacy records, while case-distinct or unproven roots remain independent

### Requirement: Bootstrap forwards substantive update requests
The OpenCode updaters SHALL NOT short-circuit a scope, configuration-directory or provider-tier request solely because the global installation already has the current release. Supported separated and equals-form arguments SHALL reach the installer unchanged. Root resolution SHALL prefer the explicit directory over OPENCODE_CONFIG_DIR, then project scope and the global default; selected paths SHALL receive the same validation without falling back after an invalid override.

#### Scenario: The global version is current but a project is stale
- **WHEN** update is requested with project scope
- **THEN** the installer updates the selected project rather than returning the global current-version result

#### Scenario: An environment override selects a different installation
- **WHEN** OPENCODE_CONFIG_DIR selects a stale installation while the global installation is current
- **THEN** update changes the validated override installation and preserves the global installation's bytes

### Requirement: OpenCode configuration must be a JSON object
Installation preflight and configuration writers SHALL reject null and other non-object Team Harness configuration values with an ordinary error before changing assets, backups or ownership records.

#### Scenario: An existing configuration contains null
- **WHEN** installation or update reads that configuration
- **THEN** it fails without panic or partial installation and can be retried after the configuration is repaired

### Requirement: Native installation records use portable paths
Installation and removal SHALL represent files beneath the selected configuration root with portable root-relative record paths on Windows and POSIX. Equivalent native path separators SHALL NOT prevent ownership records from being written.

#### Scenario: Windows removes a managed asset
- **WHEN** the selected root and managed file use native Windows separators
- **THEN** removal records the root-relative closure successfully without persisting a machine-specific absolute path.

#### Scenario: A POSIX path contains a literal backslash
- **WHEN** installation validates or writes beneath that native directory name
- **THEN** it preserves the literal name and refuses symlink redirection through any real path component without writing outside the selected root

### Requirement: Setup records the selected distribution version
Codex setup SHALL derive installation metadata from the selected plugin's manifest rather than a release literal, preserving unrelated operator preferences.

#### Scenario: Setup follows an update
- **WHEN** setup runs from a newer selected plugin
- **THEN** its recorded installed version equals that plugin's version and does not regress to a historical example.

### Requirement: Windows bootstrap arguments remain literal
Supported Windows bootstrap entrypoints SHALL preserve each forwarded argument, including whitespace, quotes and trailing backslashes, and retain the child exit status.

#### Scenario: Custom installation directory contains spaces
- **WHEN** an operator supplies a directory argument containing spaces
- **THEN** the installer receives exactly one unchanged directory value.

### Requirement: Release bootstraps verify executable downloads
Every release bootstrap SHALL compare the downloaded binary's SHA256 digest against the exact asset-name entry in the published SHA256SUMS before executing or unblocking that binary. Hexadecimal comparison SHALL ignore letter case. Missing hash tools, failed downloads, missing exact entries and digest mismatches SHALL return failure without running the binary. Success and failure SHALL remove temporary downloads, and successful launch SHALL preserve the child's exit status.

#### Scenario: The checksum cannot verify the selected asset
- **WHEN** verification fails or only a similarly named asset is listed
- **THEN** the bootstrap refuses execution, returns failure and removes its temporary download directory

#### Scenario: The published digest uses uppercase hexadecimal
- **WHEN** the exact asset's digest matches the downloaded binary regardless of letter case
- **THEN** the bootstrap executes that same verified file and preserves its arguments and exit status

### Requirement: Native lifecycle help preserves installation state
Native plan, apply, update, uninstall and model-setup commands SHALL handle --help and -h before dispatching operations, returning success with guidance without modifying managed assets, preferences or ownership records.

#### Scenario: Help accompanies a mutating command
- **WHEN** help is requested for an existing OpenCode or Codex installation
- **THEN** the command returns guidance and preserves all installation bytes

### Requirement: Reconciliation preserves additional nested MCP settings
Claude and OpenCode MCP reconciliation SHALL preserve custom headers and recognize a desired nested object already contained in the existing configuration as current, without repeated backups or writes.

#### Scenario: Custom header accompanies the configured authorization header
- **WHEN** both desired values and an additional custom header are already present
- **THEN** repeated reconciliation leaves the file unchanged.

#### Scenario: A required header differs
- **WHEN** an existing required header has a different value
- **THEN** reconciliation updates that value while retaining unrelated headers.

### Requirement: Provisioning reports observed write outcomes
Setup SHALL distinguish operator decline from a refused or failed approved configuration write. It SHALL verify the result before announcing provisioned rules, SHALL disclose partial or unknown state when verification is incomplete, and SHALL NOT record a runtime refusal as a durable operator decline.

#### Scenario: The operator declines
- **WHEN** the operator declines the provisioning offer
- **THEN** setup preserves the existing decline behavior and performs no provisioning write

#### Scenario: The runtime rejects an approved write
- **WHEN** the operator approved but the runtime refuses the write
- **THEN** setup reports provisioning as unconfirmed, names the pending target and continues independent steps without repeating the same rejected action or widening access

#### Scenario: A later step fails after partial progress
- **WHEN** some configuration operation may have succeeded but final verification is unavailable or fails
- **THEN** setup reports the known partial or unknown result, continues independent steps without retrying the write, and does not claim that nothing changed or that all rules were provisioned
