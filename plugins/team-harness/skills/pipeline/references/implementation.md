# Implementation phase

Enter only from `phase: implementation` with a valid dual-record
`STAGE-GATE-1` release (`gate1_release: approved` — legacy
`approved-autonomous` stays legible — plus its matching `stage.gate.release`
event). If either half is absent, malformed, or inconsistent, load
`recovery.md`, prepare the gate with a fresh nonce, and stop.

## Working topology and protected Git metadata

Before any task dispatch, establish the approved working topology. A planned
worktree must already have an absolute `worktree`, exact `worktree_branch`, and
immutable full-SHA `worktree_base` in state; those fields declare intent and do
not prove the branch or worktree exists. Gate 1 authorizes the implementation
scope but never grants technical sandbox access to `.git`.

Run read-only `git worktree list --porcelain`, `git branch --list
<worktree_branch>`, and base-object verification first. When both targets are
absent, issue only `git worktree add -b <worktree_branch> <worktree>
<worktree_base>`. If protected Git metadata rejects the normal call, request
native escalation for that same exact command. Do not add `.git` to writable
roots, install a blanket Git allow rule, use a clone/copy bypass, or dispatch
against the dirty checkout.

A native approval-review timeout is neither denial nor a functional pipeline
failure. Do not automatically retry, recap, replace the command, create another
gate, change `phase: implementation`, or dispatch a specialist. Persist
`status: paused` and the exact pending command in `next_action`, then emit one
instruction to approve the technical action. A later live operator approval
authorizes one resubmission of the identical escalation; it does not itself
make `.git` writable. After success, verify the registered absolute path,
branch, and `HEAD == worktree_base`, then set `working_branch` and continue.
All matching on recovery means verify and resume; all absent means resume the
same approval step; partial or mismatched topology stops for operator direction
without destructive repair.

Before dispatch, validate the dependency topology required by the selected
quality commands. A direct `node_modules/.bin/<tool>` coordinate must resolve to
a regular local executable whose canonical target remains inside this checkout.
Reject a whole `node_modules` symlink to another checkout as
`PREREQUISITE_UNAVAILABLE`: it can trigger package-manager verification,
cross-OS stores, `npx`, or external caches and is not a self-contained worktree.
Quality-runner stays read-only and never repairs this condition.

Before the first specialist dispatch, when selected quality commands need Node
dependencies, resolve the packaged `scripts/worktree-dependencies.mjs` beside
the loaded pipeline skill and run exactly:

```text
node <worktree-dependencies-path> provision --repository <absolute-worktree>
```

This is an idempotent Gate-1 implementation prerequisite, not another Team
Harness gate, plan task, or conversational approval. It derives exactly one
supported root lockfile and permits only `pnpm install --frozen-lockfile`,
`npm ci`, `yarn install --immutable`, or `bun install --frozen-lockfile`. When
the top-level `node_modules` is an untracked symlink, the helper removes only
that link, never its target, then requires the install to produce a real local
directory. It never accepts multiple/missing lockfiles, mutable resolution,
`npx`, a shared checkout, or a tracked `node_modules` entry. An ordinary native
sandbox/network authorization may still be required to execute the exact
provisioning command, but it does not create or repeat a pipeline decision.

Require `outcome: ready|provisioned` before dispatch. Otherwise surface the
helper's exact `error_code`, `diagnostic`, and closed
`required_action: {cwd, argv}`. Retry only that same action after its stated
environment prerequisite is repaired; never improvise an `ln -s`, change
topology after Gate 1, or present a shared wrapper as installed dependencies.
Recovery reruns the same idempotent helper instead of discarding the worktree.

For branch-in-place, perform the same dirty-tree and ownership checks before
`git checkout -b`; Gate 1 likewise cannot supply that command's native Git
metadata permission.

Read `plan/delivery.md` to form dependency rounds. Before every task dispatch,
preflight its exact `plan/tasks/Task-N.md` and fail closed unless its
`required_invariants`, `required_evidence_anchors`, and
`cross_runtime_preservation` declarations supply every applicable obligation.
The resolver binds that shard and its named anchors inside the immutable
capsule; the specialist prompt still carries only the canonical dispatch
reference and correlation. Never compensate with a transcript, implementer
history, sibling tasks, or the full plan set. Delegate bounded, file-scoped
work to fresh V2 specialists with `fork_turns: none`;
state that other agents may be editing the repository and unrelated changes
must be preserved. Parallelize only tasks with disjoint ownership. The primary
thread records dispatches and results, waits for all tasks in a round, and
consolidates their evidence.

Disjoint `Files:` are necessary but not sufficient for concurrency. Never run
two committing implementer/tester lanes concurrently against the same canonical
worktree: they share Git index/ref metadata and repository-wide checks can
observe the other lane's incomplete state. Within one worktree dispatch tasks
sequentially, including their commit-integrity close. Parallel rounds are
allowed only across distinct canonical worktrees/repositories with disjoint
ownership. If a legacy/in-flight same-worktree lane's global command reports
only paths owned by another active task, classify it as
`concurrent-lane-interference`; do not edit, retry, or fail the current task.
Main waits for the existing round barrier and reruns the global check once on
the consolidated clean tree, assigning any persistent failure to its owning
task.

Before each committing specialist dispatch, resolve `git rev-parse
--absolute-git-dir` read-only and compare that exact directory with the live
writable roots. Add `git_metadata_write_mode: normal` only when it is contained;
otherwise add `native-escalation-required`. This field grants no extra scope.
For the latter, the specialist retries only exact path-scoped `git add` and
`git commit`/eligible same-owner amend through native escalation with
`login:false`. Run add and commit as separate native operations, never one
combined shell command; verify the staged path set between them and assign each
a bounded timeout. A commit timeout preserves the staged index, triggers only
read-only status plus configured-hook-path diagnosis, and returns
`git-hook-or-lock-timeout`; it never authorizes an automatic retry or
`--no-verify`. Protected `.git/worktrees/.../index.lock` `EROFS|EACCES|EPERM`
is a technical permission boundary, not a test/code failure. Never add `.git`
to writable roots or authorize reset, hook bypass, broad staging, source edits,
or tests under escalation. Approval timeout pauses on the exact pending Git
operation; it does not discard an already-created task/test commit or diff.
Record that pause as `git-metadata-permission`.

## Canonical dispatch reference

Main never serializes roots, hashes, pointers, helper paths, seals, discovery
scope, or artifact coordinates into a specialist prompt. It supplies the
workspace, service/tasks, role/mode, correction target paths, immutable
helper/evidence references, and declared workspace writes to
`correction-packet-preflight.mjs certify`. That
single resolver derives the repository, ownership, OpenSpec sources and seals,
live hashes, test evidence, quality commands, helpers, evidence roots, and
write scope; validates them together; and content-addresses one immutable
`team_harness_dispatch_capsule` below `inputs/dispatches/`.

Correction target paths come verbatim from the consolidated correction scope.
The resolver unions the requested tasks with the unique execution item owning
each target path. A missing or ambiguous owner blocks before authority; Main
never guesses or manually appends a shard/source/hash tuple. This derived owner
does not widen scope because its path was already in the correction package.

Prompt contents, reference verification, invalid-reference recovery, and
attempt start are owned only by
`agents/_shared/dispatch-contract.md` § "Pipeline specialist reference". Apply
that contract here; never restate or specialize it in this phase
reference.

The capsule is the one canonical owner of roots, owned files, discovery,
required seams, snapshot/execution/source coordinates, permanent and optional
evidence seals, immutable test evidence, quality command IDs, workspace helper
paths, and workspace writes. Normal implementation has no workspace report
write. Testers receive only their mode-specific coordinates. Evidence roots
remain coordinate-only/read-only, and the quality manifest remains an ignored,
untracked workspace artifact. The helper blocks stale, escaped, symlinked,
duplicate, case/hash/anchor, seal, evidence, or write-scope mismatch before it
can produce a reference; neither Main nor a specialist repairs individual
capsule fields by hand.

Before the first implementation specialist dispatch for an OpenSpec binding,
run the normal overlay and plan-contract preflight. If it fails only because
the compact plan index, task shards, workspace quality manifest, or
traceability overlay is missing or damaged, classify it as candidate
`derived-artifact-damage`; do not route directly to architect or Design. First
verify the released consolidated Gate 1, its nonce and gate identity, the exact
aggregate bytes/hash, binding membership/order, and the binding's approved
snapshot and overlay hashes. Also require no recorded implementation dispatch
and no progress event for that binding. Then invoke `openspec-bindings.mjs
repair-derived` exactly once with one bounded JSON argument carrying the
workspace, aggregate path/hash, service, complete consolidated gate record,
nonce, and `implementationStarted: false`. The binding helper verifies the
aggregate/gate, supplies the four approved SHA-256 values and live roots to the
overlay repair, and verifies the same aggregate/gate again afterward.

The repair is valid only when it returns the closed
`team_harness_openspec_derived_repair` pass result, stages and validates a
complete derivation from unchanged canonical source, reproduces the approved
overlay SHA-256 exactly, and persists matching commit-last repair evidence.
Immediately rerun overlay, plan-contract, aggregate-manifest, and consolidated
Gate-1 verification and bind those post-check results to the evidence before
continuing in the existing `implementation` phase. The snapshot, overlay,
aggregate, nonce, and gate identity must remain byte-identical; never rewrite
their approved hashes or ask for another Gate 1 for a successful repair.

`DERIVED_REPAIR_INELIGIBLE`, absent canonical execution judgment, source or
task-intent drift, a regenerated overlay mismatch, prior dispatch/progress,
unsafe paths, or failed rollback is not a derived repair. Mutate nothing and
surface the exact blocker. Never infer missing `Files`, quality commands,
evidence, discovery, seams, preservation, or rollback from task titles or
placeholder shards, and never auto-dispatch architect after Gate 1; only a
separate explicit live operator request may reopen Design under the normal
fresh-Gate contract.

After any eligible repair closes—and before Main certifies the first specialist
capsule for that service—invoke `openspec-bindings.mjs seal-dispatch`
with the same workspace, aggregate path/hash, service, complete Gate record,
nonce, and any verified legacy continuation identity. `seal-dispatch` and
`repair-derived` share one create-only per-service lock. `DERIVED_SET_BUSY`
means no packet may be built; retry sealing only after the active operation
closes. A successful seal writes
`inputs/openspec/<service>/dispatch-binding.json` over the exact plan index,
workspace quality manifest, and every overlay-declared shard. Its existence
makes all later repair ineligible.

At implementation recovery, invoke `openspec-bindings.mjs audit-dispatches`
before selecting any service or correction. The audit enumerates every
writable binding in aggregate order, verifies each binding at its own durable
progress position, and reports every missing or stale seal. For every `missing`
entry invoke the existing create-only `seal-dispatch`, including when that
service already has durable progress, then rerun the complete audit and require
`verdict: pass`. Never audit only the currently requested service or infer a
seal from completed tasks, prior agent events, or another binding's seal.

The dispatch-reference resolver reads the permanent seal, verifies the selected
shards against it, and embeds the verified coordinates in the capsule.
`DISPATCH_BINDING_STALE`, a missing/changed seal, or post-seal artifact drift
blocks capsule creation; neither Main nor the specialist substitutes a digest.

When a sealed task cannot proceed because its capsule lacks required external
evidence, Main applies `agents/_shared/coordinator-recovery.md`. Persist the
exact failure and declared-path audit, preserve any valid progress, then bind
only the verified read-only evidence coordinates needed by the unchanged
service, task shard, role, base seal, and Gate 1. The resulting task-local
dispatch identity is immutable and content-addressed. It supersedes the prior
identity only after `verify-evidence-dispatch` passes. Historical attempts stay
observable and never need resetting; repeating the same failed causal identity
is forbidden. Every fresh capsule derivation reruns
`verify-evidence-dispatch` before returning a verified dispatch reference.

For an already repaired legacy `sharded-v1` workspace whose original approved
aggregate contained placeholder overlays, never overwrite the original Gate or
pretend the new aggregate bytes were approved. Require the existing
operator-live repair decision, incident report, repair evidence, and success
event; then run `openspec-bindings.mjs migrate-v1` in `dry-run` mode followed by
`apply`. The helper writes only `inputs/gate1-v1-migration.json` and binds the
original Gate identity/aggregate to the repaired aggregate through the exact
authority-event and evidence hashes. Before dispatch or recovery, run
`verify-v1-migration` with the same coordinates. A missing or invalid chain,
normative-prefix drift, unrecorded checkbox advance, or implementation dispatch
that predates repair fails closed. A passing chain preserves Gate 1 and resumes
the existing implementation phase under the original Gate plus migration continuation identity,
without architect dispatch or a new gate.

The resolver derives discovery scope and `required_seams` from the selected
execution items. An unresolved seam or provider outside owned files and closed
dependencies is `packet-scope-insufficient`; return the shard for an authorized
plan correction rather than widening ownership.

The capsule provides paths and closed discovery coordinates, never concatenated
file contents. For initial source
inspection, first inspect metadata, then read at most one file per tool call
under a predeclared output cap. When a file is not known to fit, locate only
task-relevant symbols/anchors with bounded `rg -n` and read
separate bounded ranges. Never combine all task files, a whole directory, or
workspace artifacts into one inspection command. Also never place independent
reads in a parallel tool batch (`Promise.all`, multiple nested tool calls in one
orchestration response, or equivalent): their outputs share one response/context
budget and can truncate each other despite individual caps. One evidence read
means one file, one exact JSON Pointer/unique anchor/bounded line range, and one
independent predeclared cap. A verified whole-file SHA-256 establishes complete
artifact identity; dumping the full file is not proof of reading and is
prohibited. Tool-level truncation yields no read evidence: continue
sequentially with narrower child pointers or per-file/range reads and never
replay the aggregate command. Never run repository-wide `rg --files` and filter its
output afterward. Enumerate one capsule-supplied discovery directory with one
exact supplied `-g` glob per call; if that pair can still be large, route it
through the capsule's bounded-command helper before execution. Resolve
traceability through the capsule's exact JSON Pointer and `sources`, and
Markdown through its unique anchor plus bounded ranges; broad context searches
are dispatch defects, not discovery.

For an OpenSpec-bound workspace, first verify `inputs/openspec-snapshot.json`
against the repository and validate `plan/openspec-traceability.json`. The
capsule carries the snapshot, assigned execution item/shard, and pinned OpenSpec
task/design coordinates. Obtain `openspec instructions apply --change
<bound-change> --json` as implementation guidance and include its bounded result;
it never selects the phase, task, correction authority, state transition, or
gate. The implementer reads canonical intent at those exact repository-local
coordinates and must not rely on copied or paraphrased intent in a TH artifact.

Before the first implementation dispatch, Main also materializes the exact
snapshot-bound OpenSpec source set below `repository_root` when Design used a
different checkout, verifies every source hash, and adds those canonical paths
to the approved repository scope. Before Freeze, every created or changed
`openspec/changes/<change>/...` source must be tracked and present in the final
base-to-candidate diff. Missing or workspace-copied OpenSpec source blocks;
canonical proposal, design, specs, and tasks are product artifacts that reach
the pull request.

The overlay schema has no top-level `tasks` array. Main resolves the assigned
item from exactly `.execution_items[] | select(.id == "Task-N")`, requires one
match, and puts its JSON Pointer (`/execution_items/<zero-based-index>`), full
item hash, and exact `sources` array in the capsule. The specialist consumes
that capsule binding and never probes `.tasks[]` or guesses another structure.
For manual diagnosis only, the fail-closed source query is:
`jq -er --arg id 'Task-N' '[.execution_items[] | select(.id == $id)] |
if length == 1 then .[0].sources[] else error("execution item cardinality")
end' plan/openspec-traceability.json`. Zero or multiple matches block.
After a successful assigned task, permit and record only its exact monotonic
OpenSpec task-checkbox transition through `openspec-overlay.mjs
verify-progress`, passing the same workspace, snapshot, traceability,
complete live `--writable-root` set, and every exact `--authorized-task` ID.
The transition accepts OpenSpec's visible IDs (`5.1`) and canonical snapshot
IDs (`task:5.1`), normalizes both to the canonical form, rejects malformed or
duplicate-after-normalization input, and records only canonical IDs. Main
passes the IDs already returned by the specialist; it never reads the snapshot
to guess a different spelling or retries an alternate form.
The Gate-1 `inputs/openspec-snapshot.json` is immutable intent: task checkbox
state is excluded from its identity. This single recoverable operation verifies
source intent, atomically advances only `inputs/openspec-progress.json`, and
leaves both the snapshot and overlay bytes unchanged. Require its closed
`team_harness_openspec_progress_transition` pass result and then rerun
`plan-contract`; legitimate checkbox progress therefore never produces
`SNAPSHOT_STALE` and never requires hash rebinding. An exact repeat of the
latest authorized transition is idempotent. Any non-task drift, task-content
change beyond checkboxes, rollback, unauthorized ID, malformed progress chain,
or concurrent artifact change fails closed. Never invoke standalone `verify`
followed by manual rebind, repair hashes by hand, tolerate `SNAPSHOT_STALE`, or
redispatch an architect for checkbox-only progress. `verify-and-rebind` remains
a compatibility alias for `verify-progress` but performs no rebinding.
The standalone `openspec-snapshot.mjs verify` CLI rejects `phase:
implementation` with `ATOMIC_TRANSITION_REQUIRED` before mutating progress;
only the in-process verifier owned by `verify-progress` may advance it.

When rerunning the aggregate binding verifier in `phase: implementation`, pass
newly authorized task IDs only under their owning service key. Aggregate
freshness is binding-local: that service verifies the supplied transition, a
binding with no progress events verifies unchanged pre-Gate source, and a
binding with earlier durable progress performs an idempotent implementation
check against only its own latest event. An empty service authorization is not
a synthetic transition, and task IDs from one service never satisfy another.

## Pre-implementation behavioral test contract

This is an implementation checkpoint, not a phase or gate. For every task whose
Verification section declares `Pre-implementation test: required`, preflight
the workspace's `.team-harness/quality.json`, the `quality-runner.mjs` and
`test-transition.mjs` helpers from the verified workspace `helper_bundle`, and a clean current
commit. Missing `commands.test`, `test_contract.path_rules`, or either helper
blocks; never downgrade a required task to not-applicable during implementation.
The manifest must also reject with `NON_HERMETIC_COMMAND` any package-manager
exec/download shim (`npx`, `pnpx`, `bunx`, `npm exec|x`, `pnpm dlx`,
`yarn exec|dlx`, `bun x`, including Corepack-wrapped forms). Use only a
repository-owned package script or an exact already-installed local executable.
An SQLite/global-store/bootstrap failure is `test-environment`; never authorize
an install, mutate `node_modules`, or substitute a different argv as machine
evidence. For the sole `pnpm exec <tool>` exception, the quality runner must
prove an existing repository-local `node_modules/.bin/<tool>`, execute that
link directly without launching pnpm, and record `linked-local-bin` plus the
effective argv hash. Missing linkage is `PREREQUISITE_UNAVAILABLE`; never retry
pnpm with broader store access or allow its install/purge prompt. The same
non-installing rule applies to `pnpm <script>` and `pnpm run <script>`, including
`pnpm test` and `pnpm storybook`: the runner may execute them only after reading
the repository-local `package.json`, accepting a single simple script command,
resolving its executable through an existing repository-local
`node_modules/.bin` link, and recording `linked-local-script`. A simple
`node <repository-relative .js|.mjs|.cjs> ...` script instead resolves directly
to the current Node executable and records `repository-local-node-script`;
pnpm is never launched, so worktree dependency verification cannot touch a
global or cross-OS store. Compound shell scripts, unsafe Node coordinates, or
missing links/files fail closed before pnpm launches.
The runner validates manifest structure globally but applies hermetic runtime
classification and executable resolution only to the selected checks. A bad
runtime probe on an unselected independent command cannot block the current
checkpoint. When a selected manifest field fails, quality result schema v3
names only its safe `error_context.command_id` and `error_context.field`; use
those coordinates instead of dumping the manifest or runner source. A
`version_argv` must probe the effective resolved runtime, such as `node` when a
package script unwraps to a repository-local Node script.
The capsule names quality check IDs and the resolved runner/transition helper;
specialist prompts never
prescribe a raw package-manager fallback as authoritative evidence.
The same containment preflight applies when the manifest names
`./node_modules/.bin/<tool>` directly; success records
`repository-local-bin`, while a target in another checkout is
`PREREQUISITE_UNAVAILABLE` before either the command or its version probe runs.
Every coordinator-owned quality invocation supplies an absolute `--output`
path, verifies the bounded receipt against the atomically written complete JSON,
and persists that artifact directly. Never synthesize a temporary `.mjs`
wrapper or interpolate command, allowlist, or path strings into executable
source merely to capture quality evidence.

Immediately before the task's tester dispatch, record the current full commit
as that task's test baseline. Dispatch a fresh `tester` in
`mode: pre-implementation-contract` with only its task shard, named anchors,
manifest path, worktree/branch, a coordinator-owned workspace contract path,
and the exact packaged `test_transition_path` resolved by Main.
The tester may commit only the declared test files and writes the closed contract
JSON outside the source commit. Before it may return success, it invokes that
helper with `--validate-contract <contract_path> --repo <repository_root>
--workspace <workspace_artifact_root> --manifest <absolute_manifest_path>
--base <task_test_baseline> --candidate HEAD` and
requires the closed
`team_harness_test_contract_validation` pass result. `requirements` must be
SAFE_REQUIREMENT strings, never objects. This validation checks schema,
ancestry, exact candidate-diff equality, and manifest path rules without
running tests; unchanged preservation tests and non-test fixtures are invalid
`test_paths`. A failed self-validation returns `contract-invalid` and Main does not begin the red transition. Verify commit
the test-only diff directly and require that no production path changed; no
intermediate commit-integrity gate is created.

Before creating RED or dispatching an implementer, Main completes one
fan-complete readiness pass over the frozen task scope and quality manifest.
It invokes every declared non-test check required by the task set as a separate
non-authoritative readiness diagnostic through the quality runner so one failure cannot hide later
failures, and it also completes the RED command. Every invocation uses an
atomic output path and reaches a terminal result; stopping after the first
coverage, lint, format, build, environment, or dependency error is prohibited.
Main deduplicates the complete result set by root cause and prepares one
implementation package containing all observable failures, implicated
requirements and files, and deterministic closure checks. Missing dependencies,
non-hermetic commands, unavailable required environment, or invalid manifest
coordinates block before implementation. Expected not-yet-implemented behavior
failures remain in the same package. Main may repair the manifest from this
complete diagnostic set, reruns only diagnostics made stale by that repair, and
does not dispatch while any declared readiness diagnostic is absent or partial.
This readiness evidence is diagnostic, not the final Freeze quality verdict.

### Authorized dirty-progress recovery

The readiness route above assumes a clean candidate. When a post-interrupt
audit proves that the only tracked modifications are authorized production
progress inside the interrupted implementer's owned paths, preserve that diff.
Do not invoke `quality-runner.mjs` before the replacement: its clean-tree
precondition is a Freeze property and cannot be satisfied until an implementer
completes and commits the production work.

Under the same unchanged semantic authority, Main may run each selected local
command once through the capsule's `bounded-command.mjs` as a
**non-authoritative dirty-tree diagnostic**. Record the exact tracked status and
diff digest before and after every command; any command-caused mutation, new
out-of-scope path, or ambiguous ownership blocks recovery. These receipts may
inform the correction package but never count as readiness or Freeze quality
evidence. Re-audit the same owned paths immediately before dispatch, then send
the implementer the canonical dispatch reference with a new causal recovery
identity. Main neither edits,
commits, stashes, nor discards the preserved diff. After the implementer commits
a clean candidate, run the ordinary RED/GREEN transition, closure checks, and
single `post_implementation` Freeze quality checkpoint.

For an interrupted tester, the same causal handoff preserves only its declared
test/evidence paths. Skip production readiness and Freeze diagnostics; the
tester re-audits that scoped diff, resumes the same test-contract mode,
and either commits its owned tests or returns the remaining blocker. Main never
authors, commits, stashes, or discards the tester diff.

Main then invokes `node <test-transition-path> --transition red` against that
task baseline and current `HEAD` with `--output <coordinator evidence path>`.
The helper atomically persists the complete JSON result and prints only the
closed `team_harness_test_transition_receipt` containing verdict, result path,
SHA-256, byte count, and a fixed diagnostic summary. On failure the summary
identifies the transition stage, quality error, command outcome, and stream
availability without replaying raw output. Main verifies that receipt against the exact file and
requires both the persisted machine `verdict: pass` and tester
`failure_matches_contract: true`, `failure_stage: target-behavior`, a
non-empty `upstream_constraints_checked` list or the literal no-validator
value, and `pending_shard_dependencies: []`. Before accepting those fields,
Main verifies that fixtures passed every existing validator and durable
identity contract named by the task anchors/current product seam, and that
every method/helper/mock/API seam needed to enter the test belongs to the
current task or a completed declared dependency. A shared helper coupled to a
future shard is split while preserving that later shard's RED. Machine pass here means the exact manifest
test command completed nonzero, every changed path is a declared test path that
matches manifest rules, and test blob identities were recorded. Syntax,
fixture, upstream-validation, pending-dependency, infrastructure,
unrelated-suite, already-green, or semantic mismatch blocks before any
implementer runs; neither tester prose nor production-validation weakening can
override this boundary.

The equivalent `red '<JSON object>'` CLI form is supported for parity with the
OpenSpec helpers. Main chooses one form before invocation and never retries the
other after `ARGUMENT_INVALID`; malformed input executes no quality command.
Because `--output` keeps stdout bounded, invoke the helper directly with a
small output cap rather than through `bounded-command.mjs`. Never replay the
full result after truncation; the receipt-bound artifact is the sole evidence.

Only after every required task in the dispatch has valid red evidence may the
fresh implementer receive its assigned shards plus the corresponding contract
and red-evidence pointers/hashes. Contract test paths are frozen inputs: the
implementer never edits or deletes them. After its implementation commit, Main
runs `--transition green` once per required task with the same contract hash and
hashed red-evidence file. Transition schema v3 binds RED/GREEN to the canonical
test fragment—manifest schema version, `commands.test`, and `test_contract`—not
to unrelated coverage, lint, format, build, or database commands. Green requires
that same test binding, contract bytes, effective test command/runtime and
version fingerprint, task baseline, and test blobs, with the red candidate ancestral to current
`HEAD`; the green call uses its own `--output` path, and any mismatch or nonzero result returns to bounded implementation
correction under the causal recovery contract. Correction and attempt counts
remain append-only observations and never limit that recovery. A task explicitly marked
`not-applicable` records that state and its plan-time reason without running the
checkpoint.

A change limited to non-test manifest controls preserves valid RED/GREEN when
the computed test binding is identical, but invalidates the affected readiness
diagnostics and the final full-manifest quality evidence. A change to
`commands.test`, `test_contract`, contract bytes, test blobs, baseline, effective
test resolution, or version fingerprint starts a new RED/GREEN transition.
Before any later correction dispatch, Main likewise completes every selected
closure/readiness diagnostic, groups all terminal findings by root cause, and
creates one comprehensive correction package. A single surfaced symptom never
authorizes an immediate dispatch while another selected diagnostic is pending.

Before generating a correction nonce, presenting choices, or recording an
autonomous decision, derive the canonical dispatch reference above. `repair-index`
may add only missing `pending` rows; Main closes them before retrying. No
`dispatch-reference-ready-before-authority` result means no nonce or consumed
authority. Before spawn, re-certify the same scope identity. A mechanical
transport/capsule repair with unchanged identity reuses the decision;
identity drift requires a fresh consolidated package and decision.

Test blobs are immutable only during their own active red-to-green transition.
After that task closes and before final Freeze, a tester may make a test-only
correction when a previously green expectation contradicts the
same pinned OpenSpec intent. The correction must name the obsolete expectation,
change no production path, and produce current focused/global evidence. Never
change production behavior to satisfy a stale test; final Freeze, not a chain
of per-task test commits, owns the accepted suite identity.

## Efficient execution, rotation, and tool diagnostics

Apply `agents/_shared/coordinator-liveness.md`; this phase adds no wait, SLA,
probe, interruption, continuation, or replacement variant.
The normalized benchmark counts only waits and queries that are
not caused by completion, input, a real timeout, or recovery; the current
policy must keep that count at no more than 30% of the normalized baseline
(at least a 70% reduction) while retaining immediate operator interruption.

Track each active specialist attempt's compaction signal, tool-call count,
cumulative processed-token count, and substantial scope changes. Target at
most 30 tool calls and make a bounded handoff ready at 50 tool calls. Before
continuing after its first compaction, at 75 tool calls, at 8 M cumulative
processed tokens, or after a second substantial scope change, rotate to a
fresh session. The handoff names the exact task, owned files, current
outcome/evidence pointers, and remaining decision or work; it carries no
transcript, raw tool output, or stale prior snapshot. Rotation never waives
required AC evidence, QA, security, Freeze, mandatory suites, or either gate.

Close a terminal implementation attempt and prohibit post-terminal
`followup_task`. Feedback, scope expansion, and every correction require a fresh
agent (V2 `fork_turns: none`). Only after the mandatory live correction decision
may Main persist the bounded correction package with its nonce, current frozen
anchor, complete finding IDs, scope, and one deterministic closure check plus
expected result per finding. The resolver binds it into the capsule; the prompt
still carries only the canonical reference and correlation. Record new work
with a concise `agent.spawn` observation.

Main separately writes a recoverable handoff and requires a fresh user thread
after its first compaction or before continuing at 100 coordinator tool calls
or 20 M cumulative processed tokens. When that boundary is near, prefer a
completed implementation → validation handoff. This rotation does not create a
nested orchestrator or automatically replace native Main.

## Atomic commit-integrity evidence

Record one `base_commit` when implementation opens. Per-task commits are
optional checkpoints and never become orchestration identity. At Freeze only,
resolve packaged `commit-integrity.mjs` and invoke it directly with
`--repository`, the final `--commit HEAD`, that implementation `--base-sha`,
exact `--branch`, declared `--worktree`, the union of approved
`--allowed-path` values, any matching annotated `--scope-drift-path`, and
`--output <coordinator evidence path>`. The helper performs the six Git-backed
conjuncts against the complete `base_commit..HEAD` delta without a shell: tree
cleanliness, base ancestry, baseline movement, branch, worktree, and final
scope. The reported commit must equal HEAD. It atomically persists the complete
fixed-shape result and prints only a bounded
`team_harness_commit_integrity_receipt` with path, SHA-256, and byte count.
Verify the receipt and persisted result before separately applying the
coordinator-owned lane-coverage conjunct. Only both passes satisfy Freeze.
An optional `red_commit` is owned by `test-transition`; delivery records a
separate `delivery_commit` only when delivery itself changes the tree. No other
commit SHA blocks or advances pipeline state.

Do not concatenate the HEAD, tree, status, changed paths, test paths, branch,
worktree, or merge-base probes into one shell/tool call. A native tool message
such as `Output exceeded available model context` is transport failure, not Git
evidence and not an integrity failure. When the helper already wrote its
artifact, inspect only that exact artifact/receipt without rerunning Git. If no
artifact exists, execute the documented individual Git conjunct commands as
separate capped calls; this decomposition is the fail-closed recovery, never a
replay of the failed composite command. An individual truncation leaves that
conjunct unevaluated and blocks rather than silently passing.

At implementation entry, resolve only `helper-bundle.mjs` relative to the
loaded pipeline skill/reference and invoke `materialize` before any correction
authority or specialist dispatch. Persist its workspace-relative manifest
coordinate, digest, bundle identity, and compatibility epoch as
`helper_bundle`. From then on, invoke `verify` and resolve every operational
helper path—including `bounded-command.mjs`, `test-transition.mjs`, quality,
OpenSpec, liveness, write-scope, and correction preflight—only from that
immutable workspace bundle. A plugin-cache path is a transient bootstrap
source and is never a packet or state coordinate. A missing, stale, or
hash-mismatched bundle blocks before authority. Every initial or correction
dispatch resolver derives the exact helper paths from this bundle and places
them only inside the immutable capsule; Main never serializes them into the
prompt. Missing or stale helpers block capsule creation. Persist only the
bundle manifest coordinate and identity outside the capsule. Before executing
a command, Main and the
implementer classify its expected output volume from the known command scope
and output mode. Routine commands with an expected small, bounded result run
directly, including targeted file reads and searches, concise status checks,
and focused tests configured for concise results. The direct route is valid only
when the execution tool receives a hard output cap before launch (for example,
its native output-token limit) that is no larger than the known-small result
budget. If no such cap exists or the command can exceed it, classify the volume
as unknown and use the helper before execution. Use the resolved helper only
for large, verbose, or volume-unknown intermediate data such as full suites,
verbose builds, and broad logs, diffs, or searches. Unknown volume selects the
helper; it does not make the wrapper the default for known-small results.

For a command assigned to the bounded route, use
`node <bounded_command_path> -- <argv...>`. Add `--success-diagnostic` before
`--` only when the bounded result text is required. The routing decision occurs
before execution; never probe a command and never reactively retry it through
a different route after its output has entered the transcript.

For an authoritative check or a deferred execution whose terminal response may
be lost to context truncation, Main predeclares an absolute evidence coordinate
and uses `node <bounded_command_path> --output <absolute_result_path> --
<argv...>`. The helper fails before child execution when the coordinate is
unsafe, writes the complete envelope atomically, and renders only a fixed
`team_harness_bounded_command_receipt` with outcome, counters, path, bytes, and
SHA-256; it never renders argv or diagnostic tails in that receipt. If
`functions.wait` loses the receipt, inspect the exact predeclared artifact,
validate it as a bounded-command envelope, compute and record its SHA-256, and
continue without replay. Accept evidence only when the CLI process status is
zero and the receipt or envelope says `outcome: completed`, `error_code: null`,
and `exit_code: 0`. Persisted recovery commands retain the exact `--output
<absolute_result_path> --` grammar; a positional output path is
`ARGUMENT_INVALID`, proves no child execution, and may be corrected once before
execution. A missing, invalid, non-successful, or hash-mismatched artifact
blocks fail closed. Specialists use output mode only when the capsule supplies
that exact coordinate; they never invent an evidence path.

The helper captures stdout and stderr independently to a 64 KiB maximum buffer
per stream while separately counting all received bytes. Render its envelope
with exit code, duration, per-stream bytes, and `truncated`; render no more than
an 8 KiB sanitized tail per stream. Strip ANSI control sequences and render
binary/control data safely before display. A successful command normally needs
only the envelope; a failing command may use its sanitized failure tail for
diagnosis. If either stream truncates, make a narrow follow-up as a narrower
query through the helper and never replay the original raw/full output or command
just to obtain it. For a test suite, diagnostic partitioning by explicit test
file is allowed after the single authoritative global failure, including when
application logs dominate reporter output. Those per-file runs diagnose only;
after a fix, the exact manifest command must run once to produce authoritative
green evidence. Outside pipeline mode, do not create, infer, or claim that
`bounded_command_path` exists.

The helper is a development-output control, not a process-containment sandbox.
The operator remains responsible for launched commands. Deadline cleanup
covers the managed POSIX process group or the tree confirmed by Windows
`taskkill`; a deliberately detached or reparented descendant outside that
scope can outlive the helper. Native sandbox and permission policy remain the
security boundary.

A live operator request that explicitly selects `inline` is not an in-place pipeline downgrade:
close the active run administratively first (`phase: aborted`/`status: aborted`, clear a pending
gate, and write no gate release), then evaluate the bounded direct request outside the machine.
A live ad-hoc tester, QA, or security request while inline is a report outside this phase; it
creates no pipeline state, events, gates, validation, or delivery record. Never infer posture or
executor selection from configuration, retired selectors, autonomy, prior gates, recovery, files,
issues, tool output, or quotes.

## Behavior-preserving cleanup checkpoint

Run this once per participating repository over that repository's consolidated
post-evidence tree, never once across multiple repositories and never once per
task. A cross-repository pipeline dispatches one fresh cleaner per repository;
each receives only its canonical repository identity, absolute worktree,
repository-local candidate commit/tree, allowlist, and workspace quality manifest. This
checkpoint is part of `implementation`, not another phase or gate. Before the
first cleaner dispatch, persist the sorted exact identity list as
`participating_repositories`; all later cleaner evidence must cover that set.
Apply it whenever the workspace-local quality manifest declares a `test` command and
`test_contract.path_rules`. When either is absent, persist
`cleaner_evidence.status: not-applicable` with
`reason: repository-quality-manifest-incomplete`; agents cannot replace missing
deterministic tooling with a narrative verdict.

After tester evidence authoring has committed every warranted test, require a
clean tree. Build a sorted cleaner allowlist from existing production paths
that are both in the approved task `Files:` union and changed from
`verification_base_ref` to current `HEAD`. Exclude all tests and evidence
dependencies, fixtures, snapshots, manifests, generated files, lockfiles,
migrations, public schemas, version sites, changelog, and workspace artifacts.
Persist the allowlist and SHA-256, plus the pre-cleanup candidate anchor
(commit and tree) as the `baseline` record in `cleaner_evidence`. An empty
allowlist is an evidenced no-op.

Dispatch exactly one fresh V2 `cleaner` with `fork_turns: none`, carrying only
the hashed allowlist, functional AC summary, applicable TCs, and quality
manifest. The cleaner may edit only allowlisted existing production paths,
never tests or quality inputs, and returns a cleanup commit or justified
no-op. There is no pre- or post-cleanup quality run and no CRAP enforcement:
quality executes exactly once per candidate tree, at Freeze (below). A
pre-existing red suite therefore surfaces at that single run, attributed by
the recorded baseline anchor.

**Overreach proof — Freeze postcondition.** When a cleanup commit exists, Main
proves at Freeze that the cleanup stayed inside its grant:
`git diff --name-status --no-renames {baseline_commit} {cleaner_commit}` must
contain only `M` rows whose paths are in the recorded allowlist. Any addition,
deletion, rename, type change, or modification outside the allowlist blocks
Freeze for that attempt with the same detection semantics the retired post
transition had. The cleanup commit must descend from the baseline commit.
Persist the proof output and SHA-256 as the `post` record in
`cleaner_evidence`; with no cleanup commit the proof is an evidenced
not-applicable.

Each repository's cleaner runs exactly once per immutable candidate and manifest
identity and is never re-dispatched for that same attempt. It completes and
commits every independent safe allowlisted cleanup before returning any
`implementer_findings`; each finding must carry stable ID, cause, files,
implicated AC/TC requirements, advisory correction, deterministic closure
check, and expected result.
A cleaner return of `failed` or `blocked` is persisted with its hashed result as
`cleaner-failed` or `cleaner-blocked`, never as `pending` or `pass`; both block
Freeze for that attempt. They
do not close the pipeline or discard work. On a live operator recovery,
preserve the old hashed evidence, same workspace, same branch, commits, and
valid edits; return to implementation, apply only an in-scope correction,
commit a new candidate, and run one fresh cleaner attempt for that new
candidate/manifest identity. Update the current state pointer only after the
prior terminal attempt is durably bound in events; never overwrite or relabel
its artifacts. Use fresh attempt-qualified evidence paths for every recovered
record so no atomic output target can replace an earlier result.
This recovery records the appropriate correction observation. It needs no new
Gate 1 while intent and approved scope are unchanged; scope expansion still
requires its explicit decision.
A selected-command, behavior, scope, protected-path, declared-tool, manifest,
threshold, or metric failure cannot be waived or sent back to the cleaner.
Infrastructure or unclassifiable failure blocks. A complete failure or cleaner
finding that requires production, test, documentation, or evidence work is
consolidated only after that repository's cleaner result and overreach-proof
evidence are recorded.

The cleaner handoff has a closed eligibility predicate. It is eligible only
when all findings name exactly one canonical repository and worktree, contain
at most five stable IDs and eight unique repo-relative files, form one
dependency-coherent behavior-preserving correction, stay inside already
approved scope, require no DDL/migration, public-schema, security-control, or
external-environment change, and have locally executable closure checks plus a
complete workspace-local `.team-harness/quality.json`. If any conjunct fails, do not issue a
handoff nonce or dispatch an implementer. Preserve every commit and evidence
artifact, report the failed conjuncts, and pause the current pipeline for an
in-place recovery plan decomposed into repository-local packages. Preserve the
same workspace and branch; only a real change of intent or approved scope
requires the applicable operator decision. Only the live operator may pause or
abort the current pipeline.

For one eligible package, Main persists the complete immutable handoff package
containing repository, absolute worktree, cleanup commit/tree anchor, exact
findings, eligibility result, and closure checks. Because the package remains
inside the released Gate-1 intent and scope, Main dispatches it under that
existing authority and the causal recovery identity; it does not pause for a
second authorization ceremony. The implementer runs every closure check. A
non-zero closure command must carry its exact command, exit code, and bounded
diagnostic; a bare `exit 1` or missing diagnostic is
`correction-incomplete`, never closure evidence. Main preserves progress,
classifies the cause, and may redispatch only after a verifiable causal change.
After the handoff closure
commands, Main proceeds to the single
`post_implementation` Freeze quality run below; it never runs a separate
focused quality subset that could conceal an omitted control. Main records the
bounded result/hash and reruns hygiene without
dispatching the cleaner again. Pass records `cleaner_evidence.status: handoff-pass` and proceeds
to Freeze. Any remaining or new correctable finding receives a new immutable
package and causal recovery identity; infrastructure failure pauses only when
no verifiable recovery exists. Scope expansion must first receive its own
explicit operator decision and still does not authorize
the implementer pass.

An implementer `failed` or `blocked` return maps to `handoff-failed` or
`handoff-blocked` with its hashed terminal result and causal recovery identity. Neither
state may run or pass the Freeze quality run, hygiene, or Freeze. Further
work requires a new complete package and a verifiable causal change. It remains
under the existing Gate-1 authority unless intent or approved scope changes.

With no implementer package, persist the overreach-proof result/hash, cleaner
commit, candidate identity, and `cleaner_evidence.status: pass`.

Task dispatch preflight blocks only a selected required task whose row is
missing or pending; unrelated future rows remain diagnostic so dependency order
can advance. Freeze is the global barrier: recompute the required set from all
writable overlays and require `required_missing_count: 0` plus
`status_counts.pending: 0` before quality or hygiene can pass.

Whether the repository cleanup passed, was an empty no-op, was not applicable,
or completed an authorized handoff, Main runs exactly one quality runner
checkpoint named `post_implementation` per candidate tree, at Freeze, before
hygiene. Derive
`requiredChecks` as the sorted repository-local union of every assigned task
shard's `Required quality checks`. Select every command declared by the
complete unchanged workspace-local `.team-harness/quality.json`; a configured
`crap` command runs measure-only (`policy_mode: measure`, verdict
`not_applied`) — it records
measurements and never blocks on a baseline or a missing function. Every
required check must be declared and selected: `REQUIRED_CHECKS_MISSING`,
`PREREQUISITE_UNAVAILABLE`, or any non-pass result
blocks Freeze. A missing manifest with an empty `requiredChecks` union is
`MANIFEST_ABSENT`: record quality verification as not-applicable and let
Freeze proceed on the remaining evidence — never an unsatisfiable checkpoint;
heuristic build/lint command detection applies only in that manifest-absent
fallback and is informational. A correction that changes the candidate tree
requires a fresh run bound to the new tree; an unchanged candidate tree never
re-runs. The run remains mandatory when the cleanup is not
applicable; focused implementation or cleaner evidence cannot substitute for
it. Persist its closed result and SHA-256, evaluate the overreach proof above
when a cleanup commit exists, then invoke the verified helper-bundle
`code-hygiene.mjs` exactly per `docs/code-hygiene-gate.md § 3.1` and require its
hash-matched receipt/result before Freeze. Coordinator prose never recreates
the helper's patterns or argv. The final base-to-candidate path proof must include every changed
snapshot-bound `openspec/` source and must exclude
`.team-harness/quality.json`; either mismatch blocks Freeze. QA still audits
the frozen result independently.

Do not silently widen the approved scope. Each implementer returns a bounded
structured status with its exact `workspace_writes`, outcome, deviations,
exceptions, one-line checks, correction closure results, commit, and unresolved
issues. Main rejects success if `workspace_writes` contains a path or operation
not authorized by the capsule. After all repository results in the round are
durably recorded, Main alone writes or replaces the 5–30 line, ≤8 KB
`02-implementation.md` consolidation. Git is the changed-file authority; do not
paste the diff, raw logs, or chronology. Main then sets `phase: validation` and
`next_action: run approved acceptance validation`.

Implementation checkpoints (pre-implementation red/green evidence when required,
constraint reconciliation, test/evidence authoring, cleanup, the Freeze quality
run, hygiene, and
Freeze) are trace details inside this state, not additional phases.
A constraint that changes behaviour, scope, or an acceptance promise stops for an operator decision;
its approved resolution continues in implementation. Only a separate, explicit current live
operator request for architect work may reopen design and require a new Gate 1. Never rewrite an
acceptance criterion merely to manufacture a pass.

## Correction closure before Freeze

For an authorized correction, the implementer runs every package closure check
and returns the actual result in `finding_resolutions`. Main verifies that every
finding ID has one successful result, records it durably, and consolidates it
into `02-implementation.md` before any Freeze rebuild. Missing or failed
closure evidence is `failure_kind: correction-incomplete`: no Freeze opens and
no validator is dispatched. Main preserves valid progress, consolidates the
failed checks as the next package, and follows
`agents/_shared/coordinator-recovery.md` without a numeric retry or correction
ceiling.

## Post-Gate-1 plan-write boundary

The coordinator, not a specialist, classifies post-Gate-1 plan concerns. It may
repair only mechanical fields (references, identifiers, paths, counts, format,
or field coherence without semantic change), or transcribe the exact canonical
field required by a live operator-approved resolution. A concern that changes
intent, scope, behavior, AC meaning, or a security obligation is decision-bearing:
pause for the bounded operator decision, then record `phase: implementation` and
continue through implementation → Freeze → validation; retain the final security
floor when the decision is sensitive. Plan repair and transcription do
not increment `iteration` or dispatch `architect`. Only a separate, explicit
current live operator request may dispatch `architect`, set `phase: design`, and
require a new Gate 1.

Before Freeze and before validation opens, assemble version/changelog and commit the complete candidate. Require a
clean worktree, then compute size and diff composition from `verification_base_ref...HEAD`.
Choose the SemVer axis by supported-contract impact: PATCH is the default for compatible bounded fixes and
improvements; MINOR requires a named material new public capability. Added/deleted files, diff size, commit prefix,
and the number of fixes never decide the axis. Persist a one-sentence `version_rationale`; MINOR must name the new
public contract. If the change is incompatible with a supported public contract, do not select or recommend MAJOR
and do not edit version sites. Block as `major-release-required`, name the contract and migration impact, and require
a separate explicitly scoped operator-led release-planning task.
Mechanical paths are only `CHANGELOG.md`, `changelog.d/*`, and exact resolved version sites;
every other path is substantive. The 400-line/8-file caps require a bounded
implementer `reviewability_exceptions` justification when exceeded; Main
persists it in `02-implementation.md § Reviewability Exceptions`. Persist the
unconditional composition, size result, and optional justification, then record full
`freeze_commit_sha` and `freeze_tree_sha` together with the frozen diff/evidence anchor. Build, tests, QA, and security see that exact identity. Any later tree change
reopens Freeze and the affected validation; nothing ships from stale findings. When acceptance
passes, retain that same Freeze identity; do not create duplicate validated SHA fields.

When all approved implementation work and evidence checkpoints are complete, set `phase: validation`,
`status: in_progress`, and `next_action: run approved acceptance validation`.
Main records changed files, commands, evidence, and unresolved issues from all
verified specialist returns in `02-implementation.md` without creating a second
implementation phase or widening the approved plan.
