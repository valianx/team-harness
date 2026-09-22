## Purpose

Make development progress and expected evidence understandable through four shared phases while preserving existing skills, native runtime authority and coordinator judgment.

## ADDED Requirements

### Requirement: Development exposes four observable phases
TH SHALL present Spec, Implementation, Validation and Publication as the visible phases of a development effort. Each phase SHALL identify its inputs, expected work, tools, retained outputs and evidence of completion. Existing skills SHALL supply these methods without adding a second planning source, a phase permission engine or mandatory pipeline activation. Planning completion SHALL remain distinct from implementation completion.

#### Scenario: The operator requests a spec
- **WHEN** the authorized endpoint is planning
- **THEN** the coordinator produces canonical intent and tasks, testing strategy and the workspace plan, reports the next phase, and leaves future implementation, validation and publication work pending

#### Scenario: Development advances to validation
- **WHEN** implementation and focused tests are available and the operator has not explicitly requested an earlier stop
- **THEN** the coordinator continues directly into validation without waiting for another operator message, presents its selected checks, provider assessments and independent reviews as a distinct phase, and reports their actual execution before claiming completion

#### Scenario: Implementation produces its expected work
- **WHEN** authorized implementation tasks are performed
- **THEN** the phase produces the required product changes and maintained tests, updates canonical task progress and records actual focused-check results while leaving later assessments visibly pending

### Requirement: Phase entry preserves continuity and authorized scope
Entering or resuming a phase SHALL recover the existing objective, canonical tasks, workspace, candidate evidence and authorized endpoint: planning, local completion, PR preparation or PR publication. Main SHALL complete missing prerequisites within that scope and reuse unaffected work, without requiring invocation of each selected tool or redundant approval at each transition. Codex, Claude Code and OpenCode SHALL expose equivalent phase guidance through their native entry points. Existing direct work, explicitly selected pipeline and existing-PR review SHALL retain their distinct purposes.

#### Scenario: The operator authorizes work through PR publication
- **WHEN** material decisions are resolved and prerequisites can be satisfied within scope
- **THEN** Main continues through all four phases using the existing authority and selected review decision without requiring separate prompts for each tool

#### Scenario: Validation is requested on an existing implementation
- **WHEN** the effort has usable intent, tests and a selected workspace
- **THEN** Main resumes from those inputs, completes missing selected assessments and avoids creating another spec or workspace merely because entry occurred at a later phase

#### Scenario: A correction affects part of the evidence
- **WHEN** a review leads to a scoped change
- **THEN** Main returns to implementation and renews affected checks, preserving original reviewer results and other still-applicable evidence without claiming an old candidate-bound receipt belongs to a new candidate

#### Scenario: Another supported host consumes the flow
- **WHEN** the same objective is continued through Claude Code or OpenCode instead of Codex
- **THEN** the native agent can discover the same phases and handoffs while retaining the configured local or Obsidian workspace and that host's execution permissions

#### Scenario: The endpoint is local completion
- **WHEN** the authorized work completes its applicable implementation and validation without a PR requirement
- **THEN** Main records local delivery and remaining limits in the same workspace without creating a PR or representing missing external publication as incomplete product work

### Requirement: Capability selection and actual execution remain observable
The phase plan SHALL distinguish the spec workflow's declared provider stages from optional capabilities selected by objective, stack and risk. Selected capabilities SHALL have a purpose, scope, expected output and actual execution status with evidence. Missing prerequisites SHALL remain pending with recovery rather than becoming not applicable or passed. Declined or deferred work SHALL retain the operator/coordinator's reason and effect. Provider outputs SHALL remain evidence and recommendations; the coordinator and operator SHALL decide how to proceed and describe remaining limits truthfully.

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

### Requirement: CRAP contributes real validation diagnostics
Validation SHALL assess CRAP applicability for new or changed executable functions and run selected measurement using actual cyclomatic complexity and test coverage from the same identified source candidate. The existing quality runner SHALL remain measure-only in the coordinated workflow, with no score-based publication authority. Reports SHALL identify measured and omitted scope and distinguish calculator tests from project measurements. Missing metrics or adapters SHALL NOT be converted to zero, success or non-applicability. Available evidence SHALL respect its original identity and input-binding rules when reused.

#### Scenario: Changed functions have usable metric inputs
- **WHEN** the selected project collectors can supply complexity and coverage for those functions
- **THEN** validation links a real CRAP report and its input identity from the phase plan, uses its values to guide review without an automatic blocking threshold, and preserves that identity when publication consumes the evidence

#### Scenario: The collector or coverage is absent
- **WHEN** CRAP was selected for measurable code but lacks its manifest, collector or metric inputs
- **THEN** the measurement stays pending with the missing source and supported recovery, and no synthetic score substitutes for project evidence

#### Scenario: Only prose changes
- **WHEN** the change has no applicable executable functions
- **THEN** CRAP is recorded as not applicable with that reason while relevant documentation and workflow validation still proceeds

#### Scenario: The calculator test suite passes
- **WHEN** tests exercise the CRAP formula with fixture data
- **THEN** that result proves only the exercised calculator behavior and does not claim the candidate's functions were measured

#### Scenario: Only part of the function surface is measurable
- **WHEN** metrics exclude functions because of missing coverage, platform limits or unsupported symbols
- **THEN** the report names the omission and partial scope rather than claiming a complete project measurement

### Requirement: Publication consumes the validated candidate and its limits
Publication SHALL use create-pr and the existing archive, review and artifact-hygiene contracts. Completed OpenSpec work SHALL be synchronized and archived before final candidate review and delivered in the same PR, preserving explicit lifecycle decisions under the existing contract. Main SHALL reuse the selected review decision and current evidence, disclose pending or declined work, and publish only within the authorized endpoint and the existing review completion conditions. Disclosure SHALL NOT turn an unanswered review choice or incomplete accepted review into a decline or successful review. Temporary work artifacts SHALL remain outside the product diff unless their durable inclusion is needed and explained. PR publication SHALL NOT imply merge or a completed remote review.

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
