## MODIFIED Requirements

### Requirement: TEA contributes bounded testing expertise
TH SHALL execute installed TEA test-design during Spec, test-review after implementation and relevant test execution during Validation, and trace before completing the spec change. The testing strategy SHALL inform selection of upstream ATDD and automation during Implementation, framework or CI setup when that infrastructure is part of the objective, and NFR assessment when relevant non-functional evidence is needed. Selected additional methods SHALL be executed at their corresponding stages without requiring the operator to invoke them individually; the entire TEA catalog SHALL NOT be imposed on every effort. Outside spec, selection SHALL follow the task or explicit request. Each invocation SHALL share current requirements and test evidence. Native skills SHALL be preferred for interactive work; a supported upstream runner MAY be used where it adds value. TH SHALL NOT enable TEA framework creation or install enforcement hooks merely to review tests.

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

#### Scenario: Implementation needs acceptance tests or expanded automation
- **WHEN** the test strategy selects ATDD or automation for the authorized change
- **THEN** Main prepares the installed upstream entry and executes it during implementation with the existing intent, tests and workspace, without creating a competing development plan

#### Scenario: Test infrastructure is already sufficient
- **WHEN** test-design can use existing test and CI infrastructure
- **THEN** TH reuses it and does not run framework or CI setup just to fulfill a catalog checklist

#### Scenario: Non-functional behavior needs evidence
- **WHEN** relevant reliability, performance, security or maintainability requirements select NFR analysis
- **THEN** Main executes the installed NFR method with actual implementation evidence during validation and retains its limitations and recommendations for coordinator judgment
