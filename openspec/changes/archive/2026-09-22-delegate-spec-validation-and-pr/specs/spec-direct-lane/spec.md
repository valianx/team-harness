## RENAMED Requirements

- FROM: `### Requirement: The direct lane runs without pipeline activation or specialist dispatches`
- TO: `### Requirement: The direct lane delegates completion phases without pipeline activation`

## MODIFIED Requirements

### Requirement: The direct lane delegates completion phases without pipeline activation
The spec workflow MUST keep written intent, implementation and coordination with the current chat agent while invoking bounded native agents for Validation and PR preparation/publication. Main SHALL retain the shared workspace, operator authority, review selection and decisions on findings. The phase agents SHALL execute the existing validate and create-pr methods with supplied context, without becoming orchestrators or activating a pipeline. Main MAY delegate independent implementation work when useful; this is not an automatic implementation-agent phase.

#### Scenario: Independent tasks
- **WHEN** approved spec work has disjoint implementation tasks
- **THEN** Main may delegate useful bounded work while keeping the same objective and OpenSpec change.

#### Scenario: A short task worth written intent arrives
- **WHEN** the operator routes a single-repo, roughly day-sized task through `/th:spec`
- **THEN** Main uses OpenSpec and the shared workspace, implements or delegates useful bounded work, invokes validation and prepares completed archive for authorized delivery.

#### Scenario: The operator asks for a review inside the lane
- **WHEN** the operator requests a QA or security look on the lane's diff
- **THEN** Main obtains the requested independent read-only advice, preserves findings and verifies necessary corrections without changing workflow or repeating equivalent completed provider work.

#### Scenario: The lane documents when publication is blocked
- **WHEN** the lane's own text describes what holds a change back from publication
- **THEN** it names the control that actually produces that outcome, so a reader cannot mistake coordinator discipline for an enforced gate.

#### Scenario: Implementation reaches validation
- **WHEN** implementation reaches its authorized Validation phase
- **THEN** Main invokes spec-validator with the candidate, intent, tests, selected checks, provider entries and absolute workspace; the agent executes applicable checks and provider methods, returns actual evidence and gaps, and Main judges findings and owns corrections.

#### Scenario: A PR is prepared and published
- **WHEN** the endpoint includes PR preparation or publication
- **THEN** Main invokes pr-creator with the repository, branch/base, scope, evidence and exact authorized endpoint, reuses its preparation for later publication, and the agent follows create-pr without repeating validation, dispatching itself, assuming merge authority or writing work reports into the product diff.

#### Scenario: A phase is outside the endpoint
- **WHEN** the operator requests planning only or local completion without a PR
- **THEN** Main does not dispatch the excluded validation or PR phase and reports only work actually performed.

#### Scenario: Native dispatch is unavailable
- **WHEN** the selected phase role or model cannot be invoked through the active host
- **THEN** Main reports the specific limitation and pending delegated work, preserves independent progress and seeks only a genuinely missing decision rather than silently substituting a different model or claiming an agent ran.

#### Scenario: An existing phase assessment remains applicable
- **WHEN** work resumes with current candidate-bound evidence or prepared PR artifacts
- **THEN** Main reuses the existing agent/session and applicable work, renews only affected checks after corrections, and retains original findings and the coordinator's dispositions separately.
