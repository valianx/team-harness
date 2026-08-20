## MODIFIED Requirements

### Requirement: Routing is predicated and escalation is explicit
The lane SHALL state its routing predicate: plain inline for mechanical, reversible work with no design decision worth recording; `/th:spec` for tasks that merit written intent and task decomposition (single repo, no public-contract break); `/th:pipeline` for multi-repository, multi-specialist, multi-task, or irreversible work — these remain hard routers the lane never absorbs. A security dimension is not a hard router: it stops the lane for the live three-way choice owned by `guided-lane-verification`, whose in-lane option raises the required lens set instead of ejecting the task. The lane is entered by explicit `/th:spec` invocation; the live escalation guidance (`1 — inline` / `2 — pipeline`) MAY additionally offer it as a third option only when the routing predicate passes. When an in-flight lane task grows a second specialist need, the lane SHALL stop and offer the pipeline.

#### Scenario: A lane task grows a security dimension
- **WHEN** implementation reveals that the change touches an authentication surface
- **THEN** the lane stops and presents the three-way choice rather than ejecting, because a hard router would contradict the capability that owns the security stop

#### Scenario: A lane task grows a second specialist need
- **WHEN** the task turns out to require a second specialist that writes
- **THEN** the lane stops and offers `/th:pipeline`, carrying the authored change over

#### Scenario: A trivial mechanical edit is proposed for the lane
- **WHEN** the task is a bounded reversible edit with no decision worth recording
- **THEN** the routing guidance keeps it plain inline and no change directory is created

### Requirement: The direct lane runs without pipeline activation or specialist dispatches
`/th:spec` SHALL execute entirely in the coordinator: author `proposal.md` + `tasks.md` under `openspec/changes/` (adding `design.md` or spec deltas only when the task touches a specced capability), validate strictly with the pinned CLI, obtain one conversational approval turn, implement inline on a feature branch with monotonic task checkoffs, and open a normal PR under existing conventions. The lane SHALL create no workspace, state, events, summary, snapshot, overlay, traceability artifact, or gate ceremony, and SHALL dispatch no specialist by default. At most one full-scope ad hoc review MAY run on live operator request; the lane never runs a correction/re-audit loop. The lane SHALL describe its publication guarantee in terms of what it produces, and MUST NOT state a publication precondition that no deterministic control enforces.

#### Scenario: A short task worth written intent arrives
- **WHEN** the operator routes a single-repo, roughly day-sized task through `/th:spec`
- **THEN** the coordinator authors and validates the change, gets one conversational approval, implements inline, and opens the PR — with zero specialist dispatches

#### Scenario: The operator asks for a review inside the lane
- **WHEN** the operator requests a QA or security look on the lane's diff
- **THEN** exactly one full-scope ad hoc review runs, and its sub-floor findings ride as PR concerns without opening a loop

#### Scenario: The lane documents when publication is blocked
- **WHEN** the lane's own text describes what holds a change back from publication
- **THEN** it names the control that actually produces that outcome, so a reader cannot mistake coordinator discipline for an enforced gate
