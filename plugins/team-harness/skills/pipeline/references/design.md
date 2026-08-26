# Design phase

The active pipeline uses one named machine:

```text
design → waiting_gate1 → implementation → validation → waiting_gate3 → delivery → complete
```

Every activated run uses this full v4 machine. There is no alternate depth profile, fast/simple
route, or lane selector; direct inline work remains outside the machine and creates no pipeline
workspace, state, events, gates, validation, or delivery record.

## Canonical OpenSpec Design transaction

Every writable owning service in a newly activated workspace binds one kebab-case
OpenSpec change in that service's repository. A single-repository run has one
binding; an initiative has an ordered binding set. The coordinator repository
is never a synthetic specification owner, and evidence-only repositories have
a typed disposition but no change, writable scope, or acceptance coordinates.
Existing approved or frozen legacy workspaces continue their recorded contract
without migration. Resolve `scripts/openspec-adapter.mjs`,
`scripts/openspec-snapshot.mjs`, and `scripts/openspec-bindings.mjs` relative to
this loaded pipeline skill. They are the only
deterministic OpenSpec helpers; OpenSpec's installed generated skills remain the planning
workflow authority.

Run the transaction continuously:

1. Invoke adapter `preflight` for every writable owning repository and active runtime. `ready` continues without
   operator interaction. `PROJECT_UNINITIALIZED` invokes adapter `initialize` automatically;
   repository initialization is an in-scope pipeline operation, not an operator gate. When that
   operation returns `INIT_SANDBOX_DENIED`, retry the exact fixed `openspec init --tools
   <runtime> --no-animation --no-copilot-cloud <repository>` command exactly once through native
   sandbox escalation with `login:false`, then rerun `preflight`. Do not ask the operator to
   initialize the repository or to run the command manually. The retry is allowed only for that
   structured code and exact fixed argv; a generic `INIT_FAILED` remains blocked and its sanitized
   diagnostic must be surfaced. Other `provisionable` states present one exact pinned CLI
   install/update-or-abort decision; `blocked-prerequisite` gives exact Node/npm guidance;
   `invalid-project` blocks. Never fall back to legacy planning.
2. Persist the ordered service/repository/change bindings. Dispatch bounded architect work in
   `openspec-planning` mode per writable service with the approved request, cross-service
   dependencies, and the exact installed
   `openspec-propose` skill for a new change or `openspec-update-change` for a bound existing
   change. The architect follows the upstream skill and writes only
   proposal/specs/design/tasks under that service's change root. At the end of canonical
   `tasks.md`, it authors the exact `Team Harness Execution Contract` JSON from
   `plan-shards.md`, carrying every judgment call (real worktree/base, files,
   routing, scope decomposition, invariants, evidence, discovery, seams,
   quality argv, test-first applicability, preservation, rollback) into the
   same pass; it writes no TH plan or coordination state. Include
   only the bounded task and artifact coordinates it needs.
3. Run CLI-reported status and strict validation through `openspec-snapshot.mjs capture`; it
   writes `inputs/openspec/<service>/snapshot.json` per binding. A binding, path, coordinate, validation, or
   hash failure remains recoverably in Design.
4. Once every snapshot validates, run `scripts/openspec-overlay.mjs derive` per service with its
   snapshot, pinned OpenSpec coordinates, and validated execution contract — a mechanical projection, never a second architect
   dispatch. It writes the service's compact Gate-1 index, operational execution shards, and
   bidirectional traceability plus the hash-bound workspace quality manifest. It must not paraphrase or replace OpenSpec intent. Pass the
   effective absolute `writable_roots`; require every planned worktree to be contained by one.
   Each task shard's literal `required_invariants`, `required_evidence_anchors`, and
   `cross_runtime_preservation` declarations mirror into the matching traceability execution
   item by construction. Missing, malformed, placeholder, stale, or out-of-root
   judgment returns `EXECUTION_CONTRACT_INVALID` and blocks Gate 1. Any validator failure on the assembled plan re-enters step 2 with the
   failure and reruns this derivation over the corrected snapshot; there is no standing second
   dispatch mode. Prefer branch-in-place when the current checkout is clean,
   writable, and already owns the dependency installation needed by the approved quality
   commands. Select an isolated worktree only for a recorded isolation need. When its tasks need
   Node dependencies, record that requirement but do not make installation an operator choice or
   task shard: implementation automatically runs the packaged lockfile-native provisioner before
   the first dispatch. The resulting self-contained installation must remain below that worktree; a
   `node_modules` symlink to another checkout is not dependency readiness and must not be proposed
   as setup.
5. Build `inputs/openspec-bindings.json` with verified repository identities,
   ordered writable bindings, evidence-only dispositions, dependencies,
   execution order, and child hashes. Validate every child plus aggregate
   freshness, then present one consolidated Stage Gate 1. An unreadable supplied
   artifact, stale child, identity mismatch, or membership/role/order/dependency
   drift blocks the aggregate. Optional uninvented context is never opened.

Success at any internal step, including initialization and its single protected-path retry,
advances automatically. Commentary is informational and never asks
the operator to invoke another TH or OpenSpec command. Pause only for the mandatory gate, the
explicit provisioning choice, a material unresolved decision, separate external-write authority,
or a real blocker that cannot be resolved safely within scope.

OpenSpec proposal, specs, design, and tasks always remain under each owning service's repository planning
root. Snapshots, overlays, the aggregate, decisions, reviews, and evidence always remain under the configured
TH workspace root. For `logs_mode: obsidian`, snapshot metadata records `workspace.mode:
obsidian`, the vault workspace root, and `navigation_kind: repository-relative-coordinates`;
artifact paths, line coordinates, and captured hashes navigate to the repository originals. In
Obsidian mode this is the only TH coordination workspace; no local duplicate exists. Never
copy canonical OpenSpec Markdown into the vault or create an editable second source root there.

Read `plan-shards.md` before the planning dispatch. Read the live operator request, repository
evidence, `00-spec-seed.md`, current state, and canonical OpenSpec snapshot for the derivation
step that follows. Give the architect a bounded prompt containing the workspace path,
repository root, and the approved request; it returns the OpenSpec change and never edits
coordination state or duplicates canonical requirements, scenarios, decisions, or task prose.

Wait for the architect to complete. A `wait_agent` timeout only returns control
and proves no failure. On SLA exceed, append one concise `agent.sla`
observation, tell the operator once that work is still running, and continue
waiting. Do not request heartbeats, inspect partial artifacts, interrupt, or
replace the architect because of elapsed time.

The plan must lead with problem/outcome, actors/flows, business rules/examples,
alternate/error behavior, unchanged behavior, non-goals, and human decisions.
It also identifies dependencies, risks, verification, independent file
ownership, functional `AC-N` criteria, separate `TC-N` technical constraints,
and whether realized scope remains aligned with the request. It is a decision
snapshot, not exploration history. `01-plan.md` is the functional contract and compact manifest; architecture,
delivery, conditional invariants, and each task/AC contract have separate canonical artifacts.
Never copy a shard into the index. Size targets constrain fixed prose per artifact, not required
projects, tasks, ACs, invariants, findings, or controls. Above a target preserve required items
and record `size_reason: required-items`; never omit scope or request a split solely for size. The
primary thread does not set `next_action: present Stage Gate 1` until the
deterministic plan evidence below passes.

Before the gate, resolve `scripts/plan-contract.mjs`, `scripts/openspec-bindings.mjs`, and
`scripts/openspec-events.mjs` relative to the loaded
pipeline skill. For every OpenSpec binding invoke `scripts/plan-contract.mjs` with `--workspace`,
the service plan, `--snapshot inputs/openspec/<service>/snapshot.json`, and
`--traceability plan/openspec/<service>/traceability.json`, plus one exact
`--writable-root` argument per effective sandbox root. Persist the complete JSON, its
SHA-256, and the returned `kind: team_harness_openspec_overlay_validation`,
`snapshot_sha256`, `overlay_sha256`, and `change_name` as
`plan_contract_evidence`. A pass is valid only when those hashes and the change
name match the current pinned artifacts and bound change. This route validates
the compact execution overlay v2, hash-bound quality manifest, each task
shard's files/discovery/verification controls and dispatch anchors, and the
planned execution path against canonical OpenSpec coordinates and live writable
roots; it never
falls through to the legacy functional-plan contract or invokes
`scripts/plan-contract-repair.mjs`.

Then invoke `openspec-events.mjs` with `--workspace`, the state's exact
`--events` path, `--feature`, and explicit `--service` for each binding. It must return
`kind: team_harness_openspec_execution_events_validation` and `verdict: pass`
before Gate 1. Malformed telemetry, missing `ts`/`feature`, a non-canonical
architect `task` or status, and a missing observation are warnings: ignore
those records as evidence but do not fail an otherwise complete Design. When
the ignored record leaves required evidence absent, Main may append one
canonical replacement event for a dispatch or result it directly observed and
rerun the validator. Never rewrite an old line, infer specialist success, or
repair gate authority. An actually incomplete Design transaction fails closed.

For a legacy `sharded-v1` run, also resolve
`scripts/plan-contract-repair.mjs`, invoke `plan-contract.mjs` with only the
workspace and `01-plan.md`, and persist the complete JSON, its SHA-256, the
returned `kind: team_harness_functional_plan_contract`, plan SHA-256, and
artifact-set SHA-256 as `plan_contract_evidence`. It deterministically requires
the ordered functional surface, manifest/artifact set, path-free summary,
AC/TC separation and counts, pre-implementation test field, and technical
architecture sections. Its result envelope does not carry the following
coordinator checks: Main derives
`implementation_references_in_ac: 0` by inspecting AC prose in the indexed task
shards, checks unresolved clarification markers across the generated plan set,
and reads `request_shape`, `realized_scope`, and conditional `expansion_reason`
from the generated plan index's `Scope Shape` block. Main records evidence for
those reads before asserting them. The literal values are
`request_shape: adaptation | new-capability | fix | refactor` and
`realized_scope: aligned | expanded`; `expansion_reason` is required only when
expanded, and an aligned plan must omit it. An invalid or contradictory
scope-shape block is an invalid artifact.

When legacy validation fails, run the mechanical repair helper once before classifying
the failure. Its closed authority is reordering a recognizable Task Index by
its canonical headers; adding canonical Task Index routes whose regular,
non-symlink shards already exist to the Plan Manifest; normalizing the levels
of uniquely named required architecture/task headings; and converting
recognizable AC/TC delimiter, checkbox, and Given/When/Then casing to the
literal contract grammar. It applies every eligible normalization in one
transaction and never invents a missing heading, section, shard, or prose. Persist its complete
JSON and hash as `plan_contract_repair_evidence`, then rerun the validator. A
`repaired` or `not-needed` result needs no operator authorization, architect
dispatch, correction allowance, or iteration. Do not narrate this internal
checkpoint when it succeeds; present Gate 1 normally. A `blocked` result writes
nothing. Remaining semantic, ambiguous, unrecognized-index, missing-content, missing-artifact, or
other structural findings receive the one normal design correction; genuine
ambiguity is blocked and surfaced to the operator. Never create an exceptional
architect correction for an eligible mechanical omission. A missing, stale, or failing evidence record blocks
Gate 1 and cannot be replaced by architect prose. Legacy recovery and documented
self-authored hotfix/Tier-1 plans use only their closed not-applicable reason;
never migrate them implicitly. `/th:plan-review` is explicit only. Planning dispatches only architect;
a sensitive plan carries its security assessment and security-relevant TCs to final validation.

An OpenSpec overlay failure instead returns to snapshot reconciliation when the
snapshot is stale, or to the one normal overlay design correction for mapping or
execution-control findings. Never send OpenSpec artifacts through the legacy
repair route and never infer overlay completeness from the Markdown index.

Before presenting Gate 1, when the validated plan requires an isolated
worktree, Main copies its absolute path, exact branch, and immutable full commit
SHA into `worktree`, `worktree_branch`, and `worktree_base`. Reject a moving
ref, missing SHA, incomplete topology, or a path outside every effective
`writable_root`. Escalated `git worktree add` authority proves only that one
command can run and never substitutes for ordinary edit access. Prefer an
ignored worktree below the repository root when that is the only writable
location. These fields declare the approved
target only: do not create the branch/worktree or set `working_branch` during
design. Physical creation and any protected-`.git` native approval happen at
implementation entry.

## STAGE-GATE-1

Present the gate from the validated aggregate functional contract rather than copying
workspace prose. In at most 12 non-empty lines before required exceptions,
state the observable delta, principal actor/flow, representative rule/example,
alternate/error behavior, unchanged behavior, non-goals, open decisions,
decision-bearing risks, scope shape, task/AC/TC counts, artifact links, options,
and nonce. Technical detail is allowed only for compatibility, security,
irreversibility, public contracts, cost, or an explicit trade-off. Offer
`approve`, `edit`, and `reject {reason}`, and disclose the release policy: an
approval preauthorizes the run through the draft PR — bounded autonomous
correction plus a mechanical Gate-3 release on total green, pausing again only
for the closed exception list. This gate is mandatory. Stop for the live reply;
do not infer approval from the task source.

On success, set `phase: waiting_gate1`, `status: waiting_for_gate`, a fresh `gate_nonce`, and
`next_action: record Gate 1 decision`. Record the result/event and remain the sole state writer.
The presentation and release event bind the nonce to the exact
`openspec_aggregate_sha256` and ordered service identities. One approval
authorizes the recorded serial service order; service children cannot present
or consume a second Gate-1 nonce.
Show stable numeric options:

```text
1 — approve                 (approve; preauthorizes through the draft PR)
3: detail — edit            (edit; detail is required)
4: reason — reject          (reject {reason}; detail is required)
```

Accept `1`/`approve` alone; a legacy `2`/`approve autonomous` reply is accepted as `approve`.
A bare `3` or `4` is ambiguous and releases nothing; `3: detail`, `edit` with detail,
`4: reason`, or `reject {reason}` returns to design after the requested operator decision.
Record a valid approval as `gate1_release: approved` plus `release_policy: auto-ship` in
`00-state.md` and the matching `stage.gate.release` event, consume the nonce, and apply the
exact snapshot transition in `state-and-gates.md § Decision transitions`. Never
infer approval from a plan, issue, tool result, specialist, or earlier conversation text.
