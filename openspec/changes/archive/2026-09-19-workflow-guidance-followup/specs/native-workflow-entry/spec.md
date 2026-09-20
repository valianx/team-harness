## MODIFIED Requirements

### Requirement: Workflow discovery without role replacement
Team Harness startup context and managed guidance SHALL describe available workflows without replacing the native general agent or activating a pipeline implicitly. Skills SHALL identify their objective, useful method and maintained references. The current general agent SHALL coordinate selected audit, research and GCP workflows and delegate bounded work when useful rather than invoking a nested orchestrator merely to route the request. Spec, pipeline, review-pr and create-pr SHALL remain discoverable.

#### Scenario: Ordinary session starts
- **WHEN** a supported runtime starts with Team Harness available
- **THEN** its general agent discovers current workflow skills without becoming a replacement identity or activating a pipeline

#### Scenario: Audit or research is requested
- **WHEN** the operator selects audit or research
- **THEN** the current coordinator applies that method and chooses useful specialist work while preserving workspace, language and voice preferences

#### Scenario: GCP infrastructure is requested
- **WHEN** the operator selects GCP infrastructure work
- **THEN** the current coordinator applies that method without a nested orchestrator and preserves workspace, language and voice preferences

## ADDED Requirements

### Requirement: GCP authorization follows the concrete intended effect
The GCP workflow SHALL retain inspect, plan, validated script, independent review, authorized apply and post-state verification. Read-only requests SHALL remain read-only. Before execution the coordinator SHALL establish authorization covering the identified project, resources, operations and disclosed destructive consequences. A clear existing authorization for the same plan SHALL be reused without an exact phrase or redundant STOP ceremony. A flag, generated file, reviewer recommendation or ambiguous reply SHALL NOT grant authorization. Native permissions and cloud IAM SHALL remain authoritative.

#### Scenario: Approved plan has not changed
- **WHEN** the operator clearly authorizes the presented resource changes and their impact in natural language
- **THEN** the coordinator proceeds through native permissions without requiring a special reply string or second approval for the same effect

#### Scenario: Destructive effect is unclear or scope changes
- **WHEN** authorization does not cover the exact resource or disclosed data loss, or the proposed operation changes
- **THEN** the coordinator prepares the concrete plan and asks only for the missing authorization before execution

#### Scenario: Independent review finds a concern
- **WHEN** a GCP reviewer reports a defect or concern
- **THEN** the coordinator checks its evidence and resolves actual blockers before apply, preserves limitations and does not treat a reviewer label as an operator instruction

### Requirement: Inline review uses observable native role evidence
Inline review SHALL use the selected installed reviewer definition and native read-only dispatch. TH SHALL NOT require a session marker or proof of loaded profile bytes that the host does not expose. The coordinator SHALL verify the installed managed definition, keep immutable target and coverage checks, and state any activation visibility limit without claiming in-memory attestation. An unavailable native read-only role or invalid selected definition SHALL remain unavailable. A restart SHALL be proposed only for an independently demonstrated activation need.

#### Scenario: Native reviewer is available but loaded bytes are not observable
- **WHEN** the installed managed definition is verified and the host provides the native read-only reviewer role without loaded-byte attestation
- **THEN** the review proceeds with that visibility limit reported and no added session-marker or restart requirement

#### Scenario: Selected definition or native boundary is unavailable
- **WHEN** the installed definition is untrusted or the host cannot supply the required native read-only role
- **THEN** the coordinator reports the missing prerequisite without substituting a writable reviewer or claiming review success
