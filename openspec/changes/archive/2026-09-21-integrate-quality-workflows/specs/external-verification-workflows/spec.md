## MODIFIED Requirements

### Requirement: Verification providers retain upstream ownership
TH SHALL consume Superpowers, BMAD TEA and selected quality tools or skills from their official maintained distributions and SHALL NOT vendor, rewrite or redistribute their engines, skills, agents, templates or runtime hooks. Provider-generated integrations SHALL remain distinguishable from TH-owned assets and excluded from TH packaging and generated projections. TH SHALL maintain one shared integration reference documenting OpenSpec, Superpowers, TEA and the selected quality providers' purposes, triggers, inputs, invocation, outputs, official lifecycle routes and known limitations. Consumer workflows SHALL reference it; provider algorithms, checklists and manuals SHALL remain upstream rather than being reimplemented in TH.

#### Scenario: A provider is installed or updated
- **WHEN** an authorized upstream installer creates or refreshes native integration files
- **THEN** TH discovers those files without adopting them as canonical TH sources or overwriting them during its own synchronization

#### Scenario: Distribution includes native integration directories
- **WHEN** TH assembles a runtime package or synchronizes generated copies
- **THEN** installed provider assets stay outside that output while their native installations remain usable

#### Scenario: A workflow needs provider guidance
- **WHEN** spec, pipeline or direct work selects an external capability
- **THEN** it uses the shared TH integration reference for selection and context, then the currently installed upstream instructions for execution, without maintaining a second copy of the provider's method

## ADDED Requirements

### Requirement: Quality capabilities contribute distinct evidence
TH SHALL distinguish deterministic analysis, contextual upstream skill review and coordinator interpretation. It SHALL select structural and unused-code analysis for applicable architecture questions, rule-based analysis for concrete bug candidates, and an installed change-review method for captured changes. Each selected capability SHALL receive the actual scope and relevant evidence and contribute its result to the existing workflow. A specialist applying an upstream method SHALL fulfill that selected analysis without a second equivalent TH pass. Tools, agents and workflows SHALL supply evidence and recommendations; Main and the operator SHALL decide how to proceed. Their scores, findings or verdicts SHALL NOT grant or revoke operational authority, invalidate completed work, mandate corrections or create an automatic delivery block. Main SHALL preserve original results, explain material dispositions and disclose missing evidence without claiming unexecuted checks passed.

#### Scenario: A provider recommends corrections or reports concerns
- **WHEN** a tool, agent or workflow returns a finding, failing score or recommended correction
- **THEN** Main assesses its evidence and scope with the operator's direction, records acceptance, rejection or deferral, and decides the next action without treating that result as an order or invalidation of completed work

#### Scenario: Architecture diagnosis concerns a JavaScript or TypeScript project
- **WHEN** its question requires dependency relationships or apparently unused code
- **THEN** TH selects the maintained analyzers suited to those questions with the project's relevant entry points and resolution configuration and investigates their evidence

#### Scenario: An installed skill assumes a live default branch
- **WHEN** it is selected to examine a captured PR
- **THEN** the coordinator supplies the captured base/head and permitted evidence instead of allowing the method to silently choose a different branch or mutate the frozen review target

#### Scenario: A specialist has already applied the selected method
- **WHEN** its bounded upstream assessment is complete for the current candidate
- **THEN** the coordinator reuses that assessment and assigns any further work to distinct unresolved questions rather than repeating the same review by provider name
