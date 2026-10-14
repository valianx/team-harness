## MODIFIED Requirements

### Requirement: Architecture audit demonstrates its scope and coverage
Audit SHALL identify the relevant components, relationships and quality scenarios within the agreed scope, using maintained arc42 perspectives and ATAM scenario references without claiming a formal ATAM evaluation. Its report SHALL connect examined areas and success, change or failure scenarios to actual evidence, findings and unverified limits. Relevant cross-component interactions SHALL have an identified inspection owner. For selected capabilities, audit SHALL trace the user/system outcome through its entry, actors, contracts, data/state, effective configuration, implementing components and relevant runtime/dependency handoffs to the resulting behavior, including material success and failure scenarios and actual consumers across repository boundaries. Enumerating files or completing phases SHALL NOT be represented as proof of behavioral coverage or absence of defects.

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

### Requirement: Diagnostic conclusions preserve evidence limitations
Audit and find-bugs SHALL report the examined candidate, relevant tool version/configuration, usable results and material errors, omissions or exclusions. Working reports SHALL use the selected workspace and link native operational evidence. Source observations SHALL remain distinct from inferred runtime behavior, and material uncertainty SHALL identify the unverified step or environmental assumption and the smallest missing observation that could resolve it. Reproductions SHALL distinguish real modules/services from fixtures or simulated dependencies, identify their actual integration boundary and oracle, and preserve units and conditions of measurements. Successful defect reproduction SHALL NOT imply a passed product regression. Material causes SHALL retain canonical IDs, linked occurrences and status upgrades without inflated counts. Resumed diagnosis SHALL reuse evidence whose question, source, environment and configuration still apply and renew affected evidence when those inputs change, preserving completed independent analysis. An empty report, exit code zero or reviewer agreement SHALL NOT imply exhaustive correctness. Recommendations to remove or merge code SHALL account for actual consumers, intentional generated copies and capabilities to preserve.

#### Scenario: A successful process skipped relevant files
- **WHEN** an analyzer exits successfully but reports errors or omitted files inside the requested scope
- **THEN** the report discloses those gaps and limits its conclusions to the evidence obtained

#### Scenario: A dependency or duplicate appears unused
- **WHEN** static analysis flags an exported entry or generated copy
- **THEN** diagnosis checks external/runtime consumers and generation ownership before recommending removal and explains any capability that must survive

#### Scenario: A resumed investigation changes one implementation
- **WHEN** a previously investigated cache implementation changes but independent inspected areas and their inputs remain applicable
- **THEN** diagnosis renews the affected evidence, reuses the independent evidence and names any remaining observation needed to confirm the cache behavior

## ADDED Requirements

### Requirement: Cross-repository diagnosis preserves its focused function
TH SHALL retain direct `cross-repo` analysis of dependencies, contracts, invariants and failure behavior across repositories, distinct from general multi-repository source research and full-project auditing. It SHALL resolve explicit or contextual repositories and operator-provided profiles/flows, record unavailable inputs, use the shared coverage/findings methods, and select bounded independent questions without a fixed role quota per repository. Supported runtimes SHALL receive the same domain workflow through maintained projections.

#### Scenario: A research question concerns a declared invariant
- **WHEN** research routing selects cross-repo to determine whether producer and consumer honor an idempotency contract
- **THEN** that focused analysis remains available without a full audit, follows the boundary and reports evidence or the missing observation

#### Scenario: An operator profile is unavailable
- **WHEN** the requested profile or flow cannot be found at its resolved location
- **THEN** the analysis reports that exact missing input rather than fabricating topology or implying profiles ship with TH
