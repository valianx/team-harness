## MODIFIED Requirements

### Requirement: The operator plan remains a lightweight view of canonical work
The coordinator SHALL present a concise plan in the operator's language with the intended result, current status, work steps and their expected results, progress derived from canonical tasks, next action and links to existing OpenSpec sources. It SHALL expose the four development phases and the selected capabilities' purposes, scopes, execution status, actual outcomes and evidence links, distinguishing future work, missing evidence and explicit omissions from completed checks. It SHALL use the active runtime's workspace preferences, create no local duplicate in Obsidian mode, preserve unrelated plans and reuse the same source-bound view across later work sessions. It SHALL refresh the view after intent or task changes and at phase milestones. The plan SHALL NOT introduce independent requirements, task completion, approval authority or a separate mandatory state schema, and its existence SHALL NOT activate a pipeline.

#### Scenario: The operator uses an Obsidian workspace
- **WHEN** a validated spec change is ready for presentation and workspace preferences select Obsidian
- **THEN** the coordinator writes only the plan in that configured workspace, links the repository's canonical proposal and tasks, and creates no local workspace copy or pipeline control files

#### Scenario: Work continues on another day
- **WHEN** a task completes or the operator resumes the same canonical change later
- **THEN** the coordinator refreshes the existing source-bound plan from canonical tasks instead of creating another dated view

#### Scenario: An existing plan belongs to another workflow
- **WHEN** the default destination contains a user or pipeline plan
- **THEN** the coordinator preserves it and places the spec view in a separate workspace directory

#### Scenario: Scope or lifecycle changes
- **WHEN** canonical intent changes, validation finishes, delivery advances or an approved archive moves the source
- **THEN** the view reflects observed progress and current source links while retaining the lane's existing approval requirements and showing remaining work explicitly

#### Scenario: The operator asks which tools ran
- **WHEN** a phase reaches a reporting milestone
- **THEN** the same plan distinguishes executed assessments and their actual outcomes, not-applicable capabilities with reasons, pending dependencies, and explicitly declined or deferred work, with links to evidence and the next action
