## MODIFIED Requirements

### Requirement: The direct lane runs without pipeline activation or specialist dispatches
`/th:spec` SHALL execute entirely in the coordinator: author `proposal.md` + `tasks.md` under `openspec/changes/` (adding `design.md` or spec deltas only when the task touches a specced capability), validate strictly with the pinned CLI, obtain one conversational approval turn, implement inline on a feature branch with monotonic task checkoffs, and open a normal PR under existing conventions. The lane SHALL create only a readable `01-plan.md` in its configured workspace; it SHALL create no pipeline state, events, pipeline summary, snapshot, overlay, traceability artifact or gate ceremony, and SHALL dispatch no specialist by default. At most one full-scope ad hoc review MAY run on live operator request; the lane never runs a correction/re-audit loop. The lane SHALL describe its publication guarantee in terms of what it produces, and MUST NOT state a publication precondition that no deterministic control enforces.

#### Scenario: A short task worth written intent arrives
- **WHEN** the operator routes a single-repo, roughly day-sized task through `/th:spec`
- **THEN** the coordinator authors and validates the change, presents its readable workspace plan for conversational approval, implements inline, and opens the PR with zero specialist dispatches

#### Scenario: The operator asks for a review inside the lane
- **WHEN** the operator requests a QA or security look on the lane's diff
- **THEN** exactly one full-scope ad hoc review runs, and its sub-floor findings ride as PR concerns without opening a loop

#### Scenario: The lane documents when publication is blocked
- **WHEN** the lane's own text describes what holds a change back from publication
- **THEN** it names the control that actually produces that outcome, so a reader cannot mistake coordinator discipline for an enforced gate

## ADDED Requirements

### Requirement: The operator plan remains a lightweight view of canonical work
The coordinator SHALL present a concise plan in the operator's language with the intended result, current status, work steps and their expected results, progress derived from canonical tasks, next action and links to existing OpenSpec sources. It SHALL use the active runtime's workspace preferences, create no local duplicate in Obsidian mode, preserve unrelated plans and reuse the same source-bound view across later work sessions. It SHALL refresh the view after intent or task changes and at validation and delivery milestones. The plan SHALL NOT introduce independent requirements, task completion or approval authority, and its existence SHALL NOT activate a pipeline.

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
