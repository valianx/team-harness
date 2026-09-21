## Purpose

Integrate maintained upstream verification and testing methods into TH workflows
while preserving native execution, provider ownership and the selected workspace.

## ADDED Requirements

### Requirement: Verification providers retain upstream ownership
TH SHALL consume Superpowers and BMAD TEA from their official installations and SHALL NOT vendor, rewrite or redistribute their skills, agents, templates or runtime hooks. Provider-generated integrations SHALL remain distinguishable from TH-owned assets and excluded from TH packaging and generated projections. TH SHALL maintain one shared integration reference documenting OpenSpec, Superpowers and TEA purposes, selection triggers, inputs, invocation, outputs, official lifecycle routes and known limitations. Consumer workflows SHALL reference it; provider algorithms, checklists and manuals SHALL remain upstream rather than being reimplemented in TH.

#### Scenario: A provider is installed or updated
- **WHEN** an authorized upstream installer creates or refreshes native integration files
- **THEN** TH discovers those files without adopting them as canonical TH sources or overwriting them during its own synchronization

#### Scenario: Distribution includes native integration directories
- **WHEN** TH assembles a runtime package or synchronizes generated copies
- **THEN** Superpowers and TEA assets stay outside that output while their native installations remain usable

#### Scenario: A workflow needs provider guidance
- **WHEN** spec, pipeline or direct work selects an external capability
- **THEN** it uses the shared TH integration reference for selection and context, then the currently installed upstream instructions for execution, without maintaining a second copy of the provider's method

### Requirement: Provider discovery and updates use native capabilities
TH SHALL resolve the active host's installed provider, source/version and supported invocation before use. Setup and update guidance SHALL use upstream installation and refresh routes, preserve unrelated configuration, and reuse existing scoped authorization under native permissions. Missing or incompatible capabilities SHALL be reported with a concrete recovery action; TH SHALL NOT claim successful activation from file presence alone.

#### Scenario: A compatible installation already exists
- **WHEN** a requested capability is available in the active runtime
- **THEN** TH reads its current installed instructions and invokes it without reinstalling the provider or asking for redundant authorization

#### Scenario: An authorized provider update completes
- **WHEN** the upstream update mechanism finishes
- **THEN** TH checks the actually resolved version and capability, refreshes the next invocation's instructions, and distinguishes installation from session activation, reporting a restart only when a documented host limitation or observed stale activation requires it

#### Scenario: The selected capability is unavailable
- **WHEN** the provider or its required host integration cannot be used
- **THEN** TH explains what remains unavailable and the supported recovery, continues independent work, and makes no claim that the provider executed

### Requirement: Superpowers contributes completion verification
TH SHALL execute installed Superpowers verification-before-completion at the completion stage of spec. Outside spec, TH SHALL select it when useful to substantiate completion claims or when requested, using native discovery rather than a TH copy. The integration SHALL preserve the current task and coordinator without automatically starting a second planning or subagent-development workflow. Installation guidance SHALL disclose relevant upstream bootstrap behavior and SHALL NOT invent a skills-only or bootstrap-disabled installation mode.

#### Scenario: Spec reaches completion
- **WHEN** the spec effort reaches its authorized completion stage
- **THEN** Main executes the installed Superpowers completion workflow using current evidence, obtains any required fresh checks, and retains the actual outcome in the shared workspace

#### Scenario: Completion evidence benefits from Superpowers
- **WHEN** a concrete completion claim about an implementation, fix, build or test result needs fresh supporting evidence, or the user requests the capability
- **THEN** it loads the upstream capability with the existing objective and applicable evidence, executes needed checks, and reports what was actually verified without replacing OpenSpec verification

#### Scenario: The host plugin installs bootstrap behavior
- **WHEN** the official installation also loads general Superpowers instructions
- **THEN** TH accurately describes that behavior and resolves any concrete conflict with the authorized task instead of patching upstream files or claiming an unsupported selective installation

### Requirement: TEA contributes bounded testing expertise
TH SHALL execute installed TEA test-design during spec design, test-review after implementation and relevant test execution, and trace before completing the spec change. Outside spec, selection SHALL follow the task or explicit request. Each invocation SHALL share current requirements and test evidence. Native skills SHALL be preferred for interactive work; a supported upstream runner MAY be used where it adds value. TH SHALL NOT enable TEA framework creation or install enforcement hooks merely to review tests.

#### Scenario: Spec advances through its stages
- **WHEN** the effort reaches design, test assessment or completion preparation
- **THEN** Main executes the corresponding installed TEA capability and retains its actual result in the selected workspace instead of merely recommending that someone invoke it

#### Scenario: An upstream assessment finds no applicable tests
- **WHEN** the executed upstream workflow establishes that no tests or scenarios apply to its bounded question
- **THEN** Main records that assessment and its reason without fabricating tests or claiming a successful test run, while all other applicable checks remain required

#### Scenario: Test quality needs independent examination
- **WHEN** added or changed tests need examination of assertion quality, coverage or reliability, or the user requests a testing-quality review
- **THEN** TH invokes the installed workflow for the relevant scope and evaluates its report without imposing every TEA workflow or treating a score as delivery authority

#### Scenario: New behavior needs a testing strategy
- **WHEN** a new integration boundary, interacting cases or an identified coverage gap requires test design
- **THEN** TH selects upstream TEA test-design with existing requirements and tests and uses the result in the current implementation/testing work without starting another development plan

#### Scenario: Requirement coverage needs explanation
- **WHEN** requirement-to-test coverage is unclear, spans components or must be demonstrated by request
- **THEN** TH selects upstream TEA trace and shares its coverage analysis with OpenSpec verification and relevant acceptance review

#### Scenario: TEA is used from OpenCode
- **WHEN** BMAD has generated an OpenCode skill pointer supported by its installed version
- **THEN** TH invokes that upstream entry, without inventing a dedicated OpenCode CLI adapter or maintaining its own pointer implementation

#### Scenario: A provider has a higher runtime prerequisite
- **WHEN** the resolved TEA package requires a newer Node version than TH's current floor
- **THEN** TH reports that provider-specific prerequisite and follows authorized upstream provisioning without silently changing the global TH prerequisite

### Requirement: Provider work shares the selected workspace
TH SHALL pass the existing task context and the same resolved absolute local or Obsidian workspace to every provider invocation. Working test designs, coverage analyses, research and verification/review reports SHALL be retained as Markdown there, including a faithful summary when the provider only returns conversational output. Operational formats required by a provider MAY be retained there or in permitted temporary storage with useful links. Provider output SHALL be directed through documented settings or flags, verified at its actual destination, and SHALL NOT become tracked execution debris or a second task plan. Canonical OpenSpec artifacts, product code, maintained tests and durable documentation SHALL remain in their owning repository locations; provider installation metadata SHALL remain upstream-managed.

#### Scenario: Output routing is supported
- **WHEN** a selected provider accepts an output destination
- **THEN** TH supplies the resolved workspace path and verifies the actual destination, preserving paths with spaces and the configured local or Obsidian mode

#### Scenario: Output routing is not supported
- **WHEN** a proposed capability requires an incompatible fixed artifact location
- **THEN** TH reports that limitation and a supported recovery action; if the current spec stage requires the capability, its execution remains pending rather than silently skipped, with no duplicate workspace or provider rewrite

#### Scenario: The effort uses Obsidian mode
- **WHEN** the task is already bound to an Obsidian workspace
- **THEN** all retained provider working notes and reports use that same effort folder without creating a repository-local mirror or moving canonical OpenSpec and product files into the vault

#### Scenario: The effort uses local mode
- **WHEN** the task is already bound to a local workspace
- **THEN** provider working notes and reports remain under that resolved home, separated from tracked product files, without switching to Obsidian or creating another workspace

### Requirement: Verification evidence has distinct responsibilities
TH SHALL distinguish project test execution, OpenSpec implementation verification, Superpowers completion evidence, TEA testing analysis and selected TH independent review. Applicable evidence SHALL be reused with its scope, sources and outcome; providers SHALL receive the relevant context without replacing the coordinator's judgment. A report or exit code SHALL NOT be represented as proof that other checks ran.

#### Scenario: Work stops at an earlier authorized stage
- **WHEN** the user requests planning only or the effort has not reached implementation/completion
- **THEN** TH executes only the capabilities belonging to reached stages and does not manufacture future-stage evidence or perform unauthorized implementation

#### Scenario: A spec stage resumes or consumes prior evidence
- **WHEN** the same stage already has a completed applicable upstream assessment or a later stage receives its results
- **THEN** Main reuses completed applicable work, executes any newly reached capability with that evidence and renews only affected checks, without using evidence reuse to skip an upstream capability that has not run

#### Scenario: A stage dependency cannot execute
- **WHEN** a required spec capability is unavailable or fails before a usable assessment
- **THEN** Main reports the exact pending capability and recovery, continues independent authorized work and does not claim that stage is fully verified or replace the missing method with a TH imitation

#### Scenario: Multiple capabilities examine the same change
- **WHEN** upstream verification and an independent reviewer can use existing test results
- **THEN** Main shares those results and requests only necessary additional checks, preserving original findings and their dispositions without automatically repeating a full suite or review round

#### Scenario: A specialist uses an upstream testing method
- **WHEN** a native specialist performs the selected testing-quality analysis using TEA
- **THEN** TH consumes that result as the selected lens instead of automatically running a second equivalent TH method, while other reviewers can investigate distinct unresolved questions

#### Scenario: A provider makes an incorrect recommendation
- **WHEN** Main can establish from current evidence that a finding is inapplicable
- **THEN** Main records the reason and continues the authorized objective without requiring the provider to issue a new approval token
