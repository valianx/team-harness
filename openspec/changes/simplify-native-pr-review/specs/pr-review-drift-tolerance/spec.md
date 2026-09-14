## MODIFIED Requirements

### Requirement: The security lens requires a concrete trigger
`security_required` SHALL be true only on a concrete trigger: a sensitive-token content hit, an executable-suffix change, or an existing explicit or tier trigger (explicit operator request and tier-4 classification are preserved). Configuration suffixes SHALL classify as non-executable by default, and an indeterminate classification SHALL NOT default to required.

The configuration suffixes are the closed set `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.properties`; `.env` files and their variants stay outside it. The sensitive-path and sensitive-filename checks keep running first and are unchanged, so dependency manifests such as `package.json` and `go.mod` remain sensitive by filename regardless of suffix. `security_required` SHALL be a pure function of the resolved reason value and the trigger list, and the resolved reason SHALL appear in the preview so a not-required outcome is visible to the operator rather than silent.

#### Scenario: A config-only PR with no sensitive tokens
- **WHEN** a PR changes only configuration files with no sensitive-token hits
- **THEN** the security lens is not dispatched and Main consolidates the required review evidence without a separate consolidator

#### Scenario: A config file contains a credential-shaped token
- **WHEN** the diff's content scan hits a sensitive-token pattern in any file
- **THEN** the security lens is required exactly as today

#### Scenario: The operator explicitly requests the security lens
- **WHEN** an explicit trigger or a tier-4 classification is present
- **THEN** the security lens is required regardless of suffix classification
