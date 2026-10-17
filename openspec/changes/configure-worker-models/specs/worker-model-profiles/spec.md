## Purpose

Let operators choose native providers and models for specialist workloads while preserving their chat model, preferences and existing worker conversations.

## ADDED Requirements

### Requirement: Guided native catalog selection
OpenCode and Pi SHALL offer reasoning, general and mechanical worker profiles using their actual native model catalogs. Each profile SHALL default to inheritance. Setup MUST NOT choose a fixed provider/model for the operator, refresh catalogs implicitly, authenticate or execute inference to configure a profile. A listed model MUST NOT be presented as proof of authentication or successful execution.

#### Scenario: Configure a profile
- **WHEN** the operator selects a provider and model from the available catalog and confirms the preview
- **THEN** TH saves that explicit native identity for the chosen worker profile

#### Scenario: Cancel selection
- **WHEN** the operator cancels before confirmation
- **THEN** no preferences, generated agents or primary model settings are changed

### Requirement: Consistent profile precedence
TH SHALL resolve an explicit role override before its assigned workload profile, then inheritance. A role override SHALL support either a profile reference or an explicit native model/inherit selection. Suggested role categories SHALL have one neutral source and be visible during configuration. Primary/coordinator roles MUST NOT receive worker model overrides.

#### Scenario: Role selection overrides category
- **WHEN** a worker role has an explicit selection different from its category
- **THEN** both supported runtimes use the role selection

#### Scenario: Inherit deliberately
- **WHEN** the effective selection is inherit
- **THEN** the worker uses the host's inherited model behavior without a TH provider/model default

### Requirement: Validated preference preservation
TH SHALL store worker profiles in the selected runtime's native TH preferences. It SHALL validate the complete requested object before publishing changes and preserve unknown preferences, credentials and native settings. Invalid input or unavailable catalog evidence MUST NOT replace a healthy saved selection.

#### Scenario: Invalid configuration
- **WHEN** a profile contains an invalid mode, identity, category or role selection
- **THEN** TH reports the error and leaves the existing configuration unchanged

#### Scenario: Existing preferences
- **WHEN** a valid profile update is saved
- **THEN** unrelated preferences and native model/permission settings retain their values

### Requirement: OpenCode specialist-only application
OpenCode SHALL apply confirmed worker profiles to TH specialists before rendering their installation plan. Go and JavaScript transforms SHALL agree on model output. The new profile operation MUST preserve the primary/chat/orchestrator model selection, including an existing explicit choice. Without the new preference, existing tier behavior SHALL remain compatible; migration into profiles SHALL require explicit confirmation.

#### Scenario: Apply new profiles
- **WHEN** confirmed profiles are applied to an existing OpenCode installation
- **THEN** generated specialists use their effective selections and the primary model choice is preserved

#### Scenario: Existing tier installation
- **WHEN** an installation has legacy tier preferences and no new worker profiles
- **THEN** its existing behavior is retained and migration is offered without an automatic rewrite

### Requirement: Pi conversation continuity
Pi SHALL resolve profiles when creating a new worker conversation, using native model capabilities for the worker's thinking selection. Saving profiles MUST NOT alter the primary model/thinking, queued/open worker conversations, follow-ups, resumptions, sessions or usage ownership. Worker selections SHALL remain bound to their conversation.

#### Scenario: Save while a worker is open
- **WHEN** a new profile is saved during an existing worker conversation
- **THEN** that conversation and follow-up retain their model/thinking and only later new dispatches use the saved choice

#### Scenario: Select a model with different thinking support
- **WHEN** a new worker's selected model supports different thinking levels
- **THEN** Pi uses its public capability rules for that worker without changing the primary session

### Requirement: Unavailable selection stays explicit
TH SHALL diagnose missing, unavailable or retired selected identities without silently substituting another provider/model or clearing the saved profile. Native catalog failure SHALL be reported as unavailable verification, not as proof that a configured model does not exist.

#### Scenario: Missing selected model
- **WHEN** an explicit worker selection cannot be found in an available native catalog
- **THEN** TH reports the exact selection gap and preserves the preference instead of using another model

#### Scenario: Catalog unavailable
- **WHEN** native catalog discovery cannot complete
- **THEN** configuration remains unchanged and TH offers a concrete recovery without pretending the catalog was empty
