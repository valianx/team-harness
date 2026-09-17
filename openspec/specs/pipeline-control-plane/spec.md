# pipeline-control-plane Specification

## Purpose

Define the boundary after retiring the Team Harness execution control plane:
Team Harness coordinates a chosen workflow, while the native runtime owns
execution permissions, approvals and session authority.

## Requirements

### Requirement: Native runtime authority is the execution boundary
Team Harness SHALL use the selected runtime's native agent sessions, sandbox,
permissions and approval prompts for execution. TH workflow stages and status
messages MAY explain progress, but they MUST NOT grant, deny, pause or release
an action through a second permission or authority protocol.

#### Scenario: A workflow reaches implementation
- **WHEN** Main gives a bounded objective to a native specialist session
- **THEN** the session uses its native permissions and Main does not issue a TH-owned execution credential

#### Scenario: A native permission prompt appears
- **WHEN** the runtime asks for approval for a tool or outward action
- **THEN** that native decision remains the execution boundary and TH does not simulate or override it

### Requirement: Progress records are advisory and recoverable
Plans, workspace notes, review summaries, traces and receipts SHALL describe
observed progress and evidence. They MUST NOT be treated as a control log or as
independent authorization. Existing old control records may be read as history
when useful, but current work SHALL be checked against the repository and live
runtime state instead of replaying a retired protocol.

#### Scenario: A progress note disagrees with the repository
- **WHEN** a note names a task as complete but the current worktree does not contain the change
- **THEN** Main reports the discrepancy and uses the repository as the current fact source

#### Scenario: A previous workspace contains retired records
- **WHEN** recovery finds a legacy control file or gate projection
- **THEN** it preserves the history for diagnosis and continues through the current workflow without creating replacement nonces or control events

### Requirement: Coordination uses native sessions and bounded objectives
When the operator chooses coordinated development, Main MAY assign independent
tasks to native specialist sessions. Each assignment SHALL state the objective,
owned paths or modules, relevant source links, constraints and expected evidence.
The specialist result SHALL report changed paths, checks, findings, limitations
and decisions needed by Main; no lease, result envelope or role-owned inbox is
required.

#### Scenario: Two independent tasks are available
- **WHEN** their writable scopes do not overlap
- **THEN** Main may coordinate native sessions in parallel and reconcile their results before delivery

#### Scenario: A result recommends a route
- **WHEN** a specialist proposes a correction, handoff or publication outcome
- **THEN** Main considers the recommendation with the full task context and chooses the next action

### Requirement: Observations never create hidden routing quotas
Attempt counts, elapsed time, token use, tool calls, review labels and telemetry
MAY be reported for diagnosis. They SHALL NOT create a Team Harness retry quota,
specialist rotation rule, mandatory review count or automatic publication path.

#### Scenario: A task needs another attempt
- **WHEN** the previous approach failed but a different safe approach is available
- **THEN** Main may continue under the existing user objective without consulting an ordinal quota

### Requirement: Outward actions follow the existing delivery flow
PR creation, comments, pushes, merges, releases and other outward writes SHALL
use the applicable native permission and the user's authorization. Team Harness
skills may prepare a candidate and explain evidence, but they MUST NOT create a
duplicate hook decision or infer publication from a review label.

#### Scenario: A review reports no blocker
- **WHEN** the candidate is ready for PR preparation
- **THEN** Main uses `create-pr` and the native outward-action boundary rather than a TH gate or control-log release
