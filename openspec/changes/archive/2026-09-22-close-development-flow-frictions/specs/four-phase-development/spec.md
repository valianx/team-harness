## MODIFIED Requirements

### Requirement: Capability selection and actual execution remain observable
The phase plan SHALL distinguish the spec workflow's declared provider stages from optional capabilities selected by objective, stack and risk. Selected capabilities SHALL have a purpose, scope, expected output and actual execution status with evidence. Missing prerequisites SHALL remain pending with recovery rather than becoming not applicable or passed. Declined or deferred work SHALL retain the operator/coordinator's reason and effect. Provider outputs SHALL remain evidence and recommendations; the coordinator and operator SHALL decide how to proceed and describe remaining limits truthfully. Completion SHALL account for the installed provider's required outputs and distinguish source inspection from executed test coverage. Unknown identities, counts and times SHALL remain unknown; later corrections SHALL preserve the original outcome and its disposition.

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

### Requirement: Publication consumes the validated candidate and its limits
Publication SHALL use create-pr and the existing archive, review and artifact-hygiene contracts. Completed OpenSpec work SHALL be synchronized and archived before final candidate review and delivered in the same PR, preserving explicit lifecycle decisions under the existing contract. Main SHALL reuse the selected review decision and current evidence, disclose pending or declined work, and publish only within the authorized endpoint and the existing review completion conditions. Disclosure SHALL NOT turn an unanswered review choice or incomplete accepted review into a decline or successful review. Temporary work artifacts SHALL remain outside the product diff unless their durable inclusion is needed and explained. PR publication SHALL NOT imply merge or a completed remote review. Preparation SHALL discover repository release, commit and verification conventions before claiming PR readiness and resolve existing authorship and publication identity before their respective writes. Platform-specific verification SHALL retain its actual environment and omissions rather than treating a different host's success as equivalent.

#### Scenario: An evaluated candidate is ready for publication
- **WHEN** the authorized objective includes publishing its PR
- **THEN** create-pr checks the candidate and artifact scope, reuses applicable evidence and review closure, and publishes the implementation with completed OpenSpec archive without another approval ceremony for unchanged work

#### Scenario: Only PR preparation is requested
- **WHEN** the endpoint excludes outward publication
- **THEN** the phase returns the concrete prepared result and remaining action without creating a PR or claiming remote checks ran

#### Scenario: Remote review has not run
- **WHEN** the published PR has pending, skipped or failed CI or reviewer execution
- **THEN** Main reports that actual state and the next action, retaining any explicit wait-before-push instruction and no automatic merge authority

#### Scenario: An accepted local review is still incomplete
- **WHEN** a selected lens has not returned usable evidence or a real required finding remains unresolved
- **THEN** Main reports and addresses that concrete gap under the existing review contract instead of treating disclosure as completion, while concerns with evidence-backed closure need no fabricated passing verdict

#### Scenario: Repository publication conventions require release preparation
- **WHEN** an agreed PR changes distributed assets whose repository requires release metadata and generated copies
- **THEN** Main prepares those changes and the supported required checks before the final publication candidate, preserving applicable version work already included in that PR

#### Scenario: Multiple GitHub accounts are available
- **WHEN** a publication target has a retained identity or configured route
- **THEN** Main verifies that identity and access before writing, uses the supported scoped credential route and preserves unrelated account settings instead of first attempting the globally active account

#### Scenario: A check needs another platform or a native capability
- **WHEN** the selected suite cannot exercise a requirement in the current shell, filesystem or permission context
- **THEN** Main identifies the concrete prerequisite, uses a supported environment where available and retains which checks ran or remain unverified without silently skipping them or claiming cross-platform success
