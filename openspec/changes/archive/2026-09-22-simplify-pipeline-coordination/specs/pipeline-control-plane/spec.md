## RENAMED Requirements

- FROM: `### Requirement: The control plane uses exactly two primitives`
- TO: `### Requirement: Pipeline coordination follows useful dependency boundaries`

## MODIFIED Requirements

### Requirement: Pipeline coordination follows useful dependency boundaries
An operator-selected pipeline MUST coordinate its existing specialists through bounded native assignments and useful reports. Main SHALL group coherent work, respect dependencies and ownership, reuse applicable sessions and evidence, and preserve independent review. Obsolete lease, Gate, Freeze, report-name or result-envelope requirements SHALL NOT be prerequisites for current work. Native permissions and the operator's objective govern execution.

#### Scenario: Native assignment
- **WHEN** approved pipeline work is ready
- **THEN** Main supplies objective, relevant sources, workspace and ownership without manufacturing a TH authorization object or fixed packet.

#### Scenario: Coherent sequential work
- **WHEN** several tasks share context and one owner can complete them coherently
- **THEN** Main groups them and continues the useful session rather than creating an executor per task or phase.

#### Scenario: Independent work can run concurrently
- **WHEN** tasks have independent inputs and nonconflicting ownership
- **THEN** Main may delegate them concurrently and serialize shared Git mutations; unavailable parallelism does not invalidate prior progress.

#### Scenario: A small step needs no specialist
- **WHEN** Main already has the context and delegation adds no concrete benefit
- **THEN** Main may complete it directly without invoking every available role or abandoning the selected pipeline.

#### Scenario: Main dispatches approved work
- **WHEN** a specialist can work under existing authority
- **THEN** it uses current sources, reports evidence and limitations, and Main incorporates the result without a second permission exchange.

#### Scenario: A third coordination object is proposed
- **WHEN** another schema would duplicate scope, permission or completion tracking
- **THEN** Main reuses native tasks and the existing workspace plan.

#### Scenario: Delivery has current evidence without legacy files
- **WHEN** the evaluated candidate and authorized endpoint are known but historical v4 reports are absent
- **THEN** Main or the assigned delivery specialist uses create-pr with available evidence, recovers relevant factual context and reports only genuine missing work.

#### Scenario: A metadata correction leaves behavior unchanged
- **WHEN** candidate preparation corrects release metadata or PR prose
- **THEN** Main renews affected checks and evidence without automatically restarting implementation and full validation.
