# quality-diagnosis Specification

## Purpose
Provide architectural and functional diagnosis with reconstructible coverage, maintained upstream analysis and evidence whose limits remain visible to the operator.

## Requirements

### Requirement: Security self-scan describes its actual checks
The self-scan entry SHALL describe the checks actually executed, including native
review projections. Its read-only role checks SHALL cover the installed inline
reviewer and report an inappropriate write or execution tool if introduced.

#### Scenario: Inline reviewer gains a mutating tool
- **WHEN** the self-scan inspects that changed role
- **THEN** it reports the role/tool regression rather than omitting the role

#### Scenario: The operator reads self-scan help
- **WHEN** the current scan is described
- **THEN** the advertised checks and purpose agree with the executed scanner


### Requirement: Architecture audit demonstrates its scope and coverage
Audit SHALL identify the relevant components, relationships and quality scenarios within the agreed scope, using maintained arc42 perspectives and ATAM scenario references without claiming a formal ATAM evaluation. Its report SHALL connect examined areas and success, change or failure scenarios to actual evidence, findings and unverified limits. Relevant cross-component interactions SHALL have an identified inspection owner. Enumerating files or completing phases SHALL NOT be represented as proof of behavioral coverage or absence of defects.

#### Scenario: All entry points were read but their interaction was not checked
- **WHEN** the audit has inspected every workflow entry but has not verified an applicable handoff between two workflows
- **THEN** the report distinguishes inventory coverage from that unverified interaction instead of declaring complete behavioral coverage

#### Scenario: A workflow crosses host and workspace boundaries
- **WHEN** the selected scope includes a native adapter and a local or Obsidian destination
- **THEN** the audit traces the effective instruction, configuration and consumer path and states which runtime outcomes were observed versus inferred

#### Scenario: A requested area cannot be examined
- **WHEN** a required source, host or scenario is unavailable
- **THEN** the report names the missing evidence and resulting coverage limit while retaining completed independent analysis

### Requirement: Project bug diagnosis investigates concrete failures
The find-bugs workflow SHALL diagnose an identified repository or module even without a PR or local diff. It SHALL select applicable upstream analysis and project checks, investigate candidates against their consumers and report concrete trigger, expected versus actual behavior, impact and source evidence. Static matches and architectural preferences SHALL remain candidates until supported. Diagnosis SHALL preserve the operator's requested scope and SHALL NOT itself authorize repairs or publication.

#### Scenario: A project has no uncommitted changes
- **WHEN** the operator requests find-bugs for a module on a clean checkout
- **THEN** it examines the selected module and its relevant consumers rather than requiring a branch diff or running the full PR-review flow

#### Scenario: A scanner reports a potential defect
- **WHEN** a rule matches code whose surrounding behavior may make the match inapplicable
- **THEN** the coordinator checks that context and retains the match's disposition without presenting it as a confirmed defect solely because the scanner reported it

#### Scenario: Rule-based bug analysis applies to the selected source
- **WHEN** find-bugs selects rule-based analysis of supported source code
- **THEN** it executes prepared Semgrep CE with explicit rules and scope, retains raw JSON or SARIF and records version, configuration, errors and skipped files in the workspace; no matches or exit zero alone does not establish correctness

#### Scenario: A shared cause is established
- **WHEN** diagnosis confirms a defect whose mechanism may occur elsewhere in the selected scope
- **THEN** the analysis examines relevant related occurrences and reports the search limits without broadening the task to an unrelated repository

### Requirement: Diagnostic conclusions preserve evidence limitations
Audit and find-bugs SHALL report the examined candidate, relevant tool version/configuration, usable results and material errors, omissions or exclusions. Working reports SHALL use the selected workspace and link native operational evidence. An empty report, exit code zero or reviewer agreement SHALL NOT imply exhaustive correctness. Recommendations to remove or merge code SHALL account for actual consumers, intentional generated copies and capabilities to preserve.

#### Scenario: A successful process skipped relevant files
- **WHEN** an analyzer exits successfully but reports errors or omitted files inside the requested scope
- **THEN** the report discloses those gaps and limits its conclusions to the evidence obtained

#### Scenario: A dependency or duplicate appears unused
- **WHEN** static analysis flags an exported entry or generated copy
- **THEN** diagnosis checks external/runtime consumers and generation ownership before recommending removal and explains any capability that must survive
