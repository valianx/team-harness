## MODIFIED Requirements

### Requirement: Capability selection and actual execution remain observable
The phase plan SHALL distinguish the spec workflow's declared provider stages from optional capabilities selected by objective, stack and risk. Selected capabilities SHALL have a purpose, scope, expected output and actual execution status with evidence. Missing prerequisites SHALL remain pending with recovery rather than becoming not applicable or passed. Declined or deferred work SHALL retain the operator/coordinator's reason and effect. Provider outputs SHALL remain evidence and recommendations; the coordinator and operator SHALL decide how to proceed and describe remaining limits truthfully. Completion SHALL account for the installed provider's required outputs and distinguish source inspection from executed test coverage. Unknown identities, counts and times SHALL remain unknown; later corrections SHALL preserve the original outcome and its disposition. For acceptance spanning components or a sensitive requirement, Main SHALL check the scenario's implementation or contract prerequisites against task order and the planned command's scenario coverage; independent test design MAY proceed before product acceptance can execute.

#### Scenario: The effort needs a functional investigation
- **WHEN** find-bugs and a supported Semgrep scan are selected for changed behavior
- **THEN** Main prepares and executes those capabilities at the relevant phase and retains their scope, findings, omissions and contextual dispositions without also requiring an unrelated general architecture audit

#### Scenario: A catalog capability does not fit the objective
- **WHEN** a provider is not selected because its question or supported stack does not apply
- **THEN** its non-selection has a concise reason and does not cause an installation or execution merely because it appears in the catalog

#### Scenario: A selected provider cannot produce its assessment
- **WHEN** its executable, native entry, inputs or output configuration remain unavailable
- **THEN** its stage is pending with the exact missing prerequisite and recovery, and independent work continues without presenting full validation

#### Scenario: A completed provider assessment reports concerns
- **WHEN** an executed tool or reviewer returns findings
- **THEN** the plan records execution separately from outcome, preserves the original result, and links Main's acceptance, refutation or deferral without demanding a new passing verdict

#### Scenario: A report omits required provider outputs
- **WHEN** a delegated assessment returns prose but its installed method also requires native artifacts
- **THEN** Main completes or explicitly records the missing outputs before claiming the provider completed, without rerunning unaffected analysis or implementing a replacement provider

#### Scenario: Source review is the available evidence
- **WHEN** scenarios were inspected but no corresponding behavior tests or host sessions ran
- **THEN** Main reports inspection and missing execution separately, uses the upstream coverage semantics and preserves any nonpassing outcome with its scope instead of inventing passing tests, timestamps or final-commit evidence

#### Scenario: Acceptance depends on implementations that are not ready
- **WHEN** an acceptance scenario spans components or a sensitive requirement
- **THEN** the existing task explains its scenario and implementation or contract prerequisites, and Main checks the required producers against task order while permitting independent test design to proceed

#### Scenario: A planned command excludes required acceptance scenarios
- **WHEN** the validation command omits scenarios named by the agreed acceptance
- **THEN** Main identifies the coverage gap and chooses a command reaching those scenarios, accepting equivalent commands without adding universal task fields

#### Scenario: Planning is the authorized endpoint
- **WHEN** acceptance needs product implementations that will be produced later
- **THEN** planning defines their prerequisites and future verification without executing product acceptance to claim planning completion
