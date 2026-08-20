## Purpose

Give short tasks a durable spec without the pipeline floor. `/th:spec` is a coordinator-only OpenSpec flow: written intent and task decomposition, one conversational approval, inline implementation, archive after merge — zero specialist dispatches, no pipeline ceremony.

## ADDED Requirements

### Requirement: The direct lane runs without pipeline activation or specialist dispatches
`/th:spec` SHALL execute entirely in the coordinator: author `proposal.md` + `tasks.md` under `openspec/changes/` (adding `design.md` or spec deltas only when the task touches a specced capability), validate strictly with the pinned CLI, obtain one conversational approval turn, implement inline on a feature branch with monotonic task checkoffs, and open a normal PR under existing conventions. The lane SHALL create no workspace, state, events, summary, snapshot, overlay, traceability artifact, or gate ceremony, and SHALL dispatch no specialist by default. At most one full-scope ad hoc review MAY run on live operator request; the lane never runs a correction/re-audit loop.

#### Scenario: A short task worth written intent arrives
- **WHEN** the operator routes a single-repo, roughly day-sized task with no security floor through `/th:spec`
- **THEN** the coordinator authors and validates the change, gets one conversational approval, implements inline, and opens the PR — with zero specialist dispatches

#### Scenario: The operator asks for a review inside the lane
- **WHEN** the operator requests a QA or security look on the lane's diff
- **THEN** exactly one full-scope ad hoc review runs, and its sub-floor findings ride as PR concerns without opening a loop

### Requirement: Routing is predicated and escalation is explicit
The lane SHALL state its routing predicate: plain inline for mechanical, reversible work with no design decision worth recording; `/th:spec` for tasks that merit written intent and task decomposition (single repo, no security floor, no public-contract break); `/th:pipeline` for security-sensitive, multi-specialist, multi-task, or irreversible work — these remain hard routers the lane never absorbs. The lane is entered by explicit `/th:spec` invocation; the live escalation guidance (`1 — inline` / `2 — pipeline`) MAY additionally offer it as a third option only when the routing predicate passes. When an in-flight lane task grows a second specialist need or a security dimension, the lane SHALL stop and offer the pipeline.

#### Scenario: A lane task grows a security dimension
- **WHEN** implementation reveals that the change touches an authentication surface
- **THEN** the lane stops before proceeding and offers `/th:pipeline`, carrying the authored change over

#### Scenario: A trivial mechanical edit is proposed for the lane
- **WHEN** the task is a bounded reversible edit with no decision worth recording
- **THEN** the routing guidance keeps it plain inline and no change directory is created

### Requirement: Lane changes share the canonical OpenSpec surface
Lane-authored changes SHALL use the same `openspec/changes/` directory, schema, naming, and archive path as pipeline-authored changes, so both entry points coexist and archive identically.

#### Scenario: A lane change and a pipeline change coexist
- **WHEN** both flows have changes in flight
- **THEN** both validate under the same pinned CLI and archive through the same lifecycle with no lane-specific layout
