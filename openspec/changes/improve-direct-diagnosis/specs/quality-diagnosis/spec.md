## MODIFIED Requirements

### Requirement: Architecture audit demonstrates its scope and coverage
Audit SHALL identify the relevant components, relationships and quality scenarios within the agreed scope, using maintained arc42 perspectives and ATAM scenario references without claiming a formal ATAM evaluation. Its report SHALL connect examined areas and success, change or failure scenarios to actual evidence, findings and unverified limits. Relevant cross-component interactions SHALL have an identified inspection owner. For selected capabilities, audit SHALL trace the user/system outcome through its entry, effective configuration, implementing components and relevant runtime/dependency handoffs to the resulting behavior, making that coverage and its limits visible in the existing report. Enumerating files or completing phases SHALL NOT be represented as proof of behavioral coverage or absence of defects.

#### Scenario: All entry points were read but their interaction was not checked
- **WHEN** the audit has inspected every workflow entry but has not verified an applicable handoff between two workflows
- **THEN** the report distinguishes inventory coverage from that unverified interaction instead of declaring complete behavioral coverage

#### Scenario: A workflow crosses host and workspace boundaries
- **WHEN** the selected scope includes a native adapter and a local or Obsidian destination
- **THEN** the audit traces the effective instruction, configuration and consumer path and states which runtime outcomes were observed versus inferred

#### Scenario: A requested area cannot be examined
- **WHEN** a required source, host or scenario is unavailable
- **THEN** the report names the missing evidence and resulting coverage limit while retaining completed independent analysis

#### Scenario: A selected capability has an unverified destination handoff
- **WHEN** audit follows a user/system outcome through inspected source but lacks execution evidence for its final destination
- **THEN** the report presents the capability trace, distinguishes source observations from inferred runtime behavior and identifies the missing observation instead of claiming an observed end-to-end result

### Requirement: Project bug diagnosis investigates concrete failures
The find-bugs workflow SHALL diagnose an identified repository or module even without a PR or local diff. It SHALL select applicable upstream analysis and project checks, investigate candidates against their consumers and report concrete trigger, expected versus actual behavior, impact and source evidence. A useful functional candidate SHALL connect its behavioral question and input/precondition through the relevant data/state transitions and defective operation or contract to the downstream symptom. Relevant available version differences MAY focus that investigation but SHALL NOT establish a defect or regression by themselves; unsupported origin SHALL remain unknown. Static matches and architectural preferences SHALL remain candidates until supported. Diagnosis SHALL preserve the operator's requested scope and SHALL NOT itself authorize repairs or publication.

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

#### Scenario: Request state causes a downstream symptom
- **WHEN** a candidate cache key omits a tenant component
- **THEN** the analysis connects request inputs, key construction, cached state and the consuming response, stating whether the failure was reproduced or inferred from source

#### Scenario: An available earlier version differs
- **WHEN** an earlier implementation filters cancelled records and the current one includes them
- **THEN** diagnosis uses that difference as a lead, checks the current consumer contract and preserves uncertainty about defect or regression origin when evidence is insufficient

### Requirement: Diagnostic conclusions preserve evidence limitations
Audit and find-bugs SHALL report the examined candidate, relevant tool version/configuration, usable results and material errors, omissions or exclusions. Working reports SHALL use the selected workspace and link native operational evidence. Source observations SHALL remain distinct from inferred runtime behavior, and material uncertainty SHALL identify the unverified step or environmental assumption and the smallest missing observation that could resolve it. Resumed diagnosis SHALL reuse evidence whose question, source, environment and configuration still apply and renew affected evidence when those inputs change, preserving completed independent analysis. An empty report, exit code zero or reviewer agreement SHALL NOT imply exhaustive correctness. Recommendations to remove or merge code SHALL account for actual consumers, intentional generated copies and capabilities to preserve.

#### Scenario: A successful process skipped relevant files
- **WHEN** an analyzer exits successfully but reports errors or omitted files inside the requested scope
- **THEN** the report discloses those gaps and limits its conclusions to the evidence obtained

#### Scenario: A dependency or duplicate appears unused
- **WHEN** static analysis flags an exported entry or generated copy
- **THEN** diagnosis checks external/runtime consumers and generation ownership before recommending removal and explains any capability that must survive

#### Scenario: A resumed investigation changes one implementation
- **WHEN** a previously investigated cache implementation changes but independent inspected areas and their inputs remain applicable
- **THEN** diagnosis renews the affected evidence, reuses the independent evidence and names any remaining observation needed to confirm the cache behavior
