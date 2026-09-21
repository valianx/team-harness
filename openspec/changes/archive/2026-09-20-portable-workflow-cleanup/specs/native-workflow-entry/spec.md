## ADDED Requirements

### Requirement: Installation exposes supported native workflows
Installation and update MUST retain native discovery of TH skills and voice guidance without replacing the general agent, adding nesting requirements or offering mandatory remote memory. Retired installer entrypoints MUST direct users to the supported installation method before downloading an unusable binary. Existing user configuration and supported subcommand forwarding MUST be preserved.

#### Scenario: Retired no-argument installer
- **WHEN** the legacy Claude bootstrap is invoked without a supported subcommand
- **THEN** it explains the native marketplace installation path without first downloading the retired interactive installer.

#### Scenario: No artificial restart requirement
- **WHEN** setup or update only changes reloadable TH workflow resources
- **THEN** it refreshes supported resources and requests a restart only for a demonstrated native host limitation.
