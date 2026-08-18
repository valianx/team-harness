# Implementation phase

Enter only from `phase: implementation` with a valid dual-record
`STAGE-GATE-1` release (`gate1_release: approved` or
`approved-autonomous` plus its matching `stage.gate.release` event). If either
half is absent, malformed, or inconsistent, load `recovery.md`, prepare the
gate with a fresh nonce, and stop.

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
Use the branch-in-place topology approved at Gate 1 or the plan's explicit
lockfile-native local provisioning step; never improvise an `ln -s`, change
topology after Gate 1, or present a shared wrapper as installed dependencies.

For branch-in-place, perform the same dirty-tree and ownership checks before
`git checkout -b`; Gate 1 likewise cannot supply that command's native Git
metadata permission.

Read `plan/delivery.md` to form dependency rounds. Before every task dispatch,
preflight its exact `plan/tasks/Task-N.md` and fail closed unless its
`required_invariants`, `required_evidence_anchors`, and
`cross_runtime_preservation` declarations supply every applicable obligation.
Pass only that shard, its named architecture/invariant anchors, frozen identity
when present, and the role's necessary environment; never compensate with a
transcript, implementer history, sibling tasks, or the full plan set. Delegate
bounded, file-scoped work to fresh V2 specialists with `fork_turns: none`;
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

Every specialist packet carries the closed root map `path_roots: {
repository_root: <absolute canonical worktree>, workspace_artifact_root:
<absolute canonical workspace> }`. Resolve task `files` and OpenSpec source
coordinates only below `repository_root`; resolve `plan/...`, `inputs/...`,
`reviews/...`, task shards, contracts, and `required_evidence_anchors` only
below `workspace_artifact_root`. Validate containment before reading. Never
interpret a workspace artifact path relative to the repository, invent `../`
traversal, or copy artifacts into the worktree. Missing root/domain or a path
that escapes its declared root blocks the dispatch packet.

Every V2 implementer/tester packet also carries `artifact_coordinates`, a
non-empty closed array of `{kind, root, path, anchor, sha256}` records. A task
shard uses `kind: task-shard`, `root: workspace_artifact_root`, its exact
case-sensitive Task Index path such as `plan/tasks/Task-3.md`, and `anchor:
null`. An invariant uses `kind: invariant-anchor`, the canonical
`plan/invariants.md` path, and an identifier such as `anchor: INV-2`; an
invariant identifier is never converted into an `INV-2.md` filename. Before
dispatch, Main resolves each record below its declared root, rejects symlinks,
proves exact component spelling and regular-file SHA-256, and requires each
non-null anchor to occur exactly once. It also proves the task coordinate
equals the Task Index and overlay `shard_path`. Missing, duplicate, stale,
case-mismatched, escaped, or invented coordinates are
`packet-artifact-invalid`; do not dispatch or ask a specialist to discover a
replacement path.

Every OpenSpec-bound initial or correction packet carries one inseparable
`openspec_snapshot: {path, sha256}` binding. `path` is the absolute canonical
snapshot file below `workspace_artifact_root`; a standalone digest, standalone
path, relative path, symlink, missing file, containment failure, or digest
mismatch is `packet-contract-invalid` and blocks before spawn. Main performs
that regular-file and SHA-256 preflight immediately before every fresh dispatch;
specialists never interpret a snapshot digest as a Git object or discover a
missing coordinate.

The packet declares `discovery_scope: {directories: [...], globs: [...]}` with
only repository-relative task-owned search roots. Before dispatch, Main checks
`required_seams`: every API, export, mutation adapter, public entry point,
callsite, verification registry, allowlist, or exemption manifest whose
validity a TC changes names its provider path, and that path is owned by this
task or supplied by an already-closed dependency. An unresolved seam or provider
outside both sets is `packet-scope-insufficient`; return the shard for an
authorized plan correction rather than dispatching it or allowing a specialist
to widen ownership.

The packet provides paths, root domains, and the closed `discovery_scope`,
never concatenated file contents. For initial source
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
output afterward. Enumerate one supplied `discovery_scope.directory` with one
exact supplied `-g` glob per call; if that pair can still be large, route it
through `bounded_command_path` before execution. Resolve traceability through
the packet's exact JSON Pointer and `sources`, and resolve Markdown through its
supplied unique anchor plus bounded line ranges; broad context searches across
architecture, traceability, and OpenSpec are packet defects, not discovery.

For an OpenSpec-bound workspace, first verify `inputs/openspec-snapshot.json`
against the repository and validate `plan/openspec-traceability.json`. The role
packet carries the snapshot path and SHA-256, the assigned TH execution item and
shard, and only its pinned OpenSpec task/design coordinates with source artifact
path, line, and content hash. Obtain `openspec instructions apply --change
<bound-change> --json` as implementation guidance and include its bounded result;
it never selects the phase, task, correction authority, state transition, or
gate. The implementer reads canonical intent at those exact repository-local
coordinates and must not rely on copied or paraphrased intent in a TH artifact.

The overlay schema has no top-level `tasks` array. Main resolves the assigned
item from exactly `.execution_items[] | select(.id == "Task-N")`, requires one
match, and puts its JSON Pointer (`/execution_items/<zero-based-index>`), full
item hash, and exact `sources` array in the role packet. The specialist consumes
that packet binding and never probes `.tasks[]` or guesses another structure.
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

## Pre-implementation behavioral test contract

This is an implementation checkpoint, not a phase or gate. For every task whose
Verification section declares `Pre-implementation test: required`, preflight
the repository's `.team-harness/quality.json`, the `quality-runner.mjs` and
`test-transition.mjs` helpers relative to this loaded skill, and a clean current
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
missing links/files fail closed before pnpm launches. Specialist packets
name quality check IDs and the resolved runner/transition helper; they never
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
--manifest <manifest_path> --base <task_test_baseline> --candidate HEAD` and
requires the closed
`team_harness_test_contract_validation` pass result. `requirements` must be
SAFE_REQUIREMENT strings, never objects. This validation checks schema,
ancestry, exact candidate-diff equality, and manifest path rules without
running tests; unchanged preservation tests and non-test fixtures are invalid
`test_paths`. A failed self-validation returns `contract-invalid` and Main does not begin the red transition. Verify commit
the test-only diff directly and require that no production path changed; no
intermediate commit-integrity gate is created.

Main then invokes `node <test-transition-path> --transition red` against that
task baseline and current `HEAD` with `--output <coordinator evidence path>`.
The helper atomically persists the complete JSON result and prints only the
closed `team_harness_test_transition_receipt` containing verdict, result path,
SHA-256, byte count, and a fixed diagnostic summary. On failure the summary
identifies the transition stage, quality error, command outcome, and stream
availability without replaying raw output. Main verifies that receipt against the exact file and
requires both the persisted machine `verdict: pass` and tester
`failure_matches_contract: true`. Machine pass here means the exact manifest
test command completed nonzero, every changed path is a declared test path that
matches manifest rules, and test blob identities were recorded. Syntax,
fixture, dependency, infrastructure, unrelated-suite, already-green, or
semantic mismatch blocks before any implementer runs.

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
hashed red-evidence file. Green requires the same manifest, exact test command,
task baseline, and test blobs, with the red candidate ancestral to current
`HEAD`; the green call uses its own `--output` path, and any mismatch or nonzero result returns to bounded implementation
correction and consumes the normal max-3 budget. A task explicitly marked
`not-applicable` records that state and its plan-time reason without running the
checkpoint.

Test blobs are immutable only during their own active red-to-green transition.
After that task closes and before final Freeze, a fresh tester may make
one test-only correction when a previously green expectation contradicts the
same pinned OpenSpec intent. The correction must name the obsolete expectation,
change no production path, and produce current focused/global evidence. Never
change production behavior to satisfy a stale test; final Freeze, not a chain
of per-task test commits, owns the accepted suite identity.

## Efficient execution, rotation, and tool diagnostics

Wait for a specialist completion or live operator input rather than polling. A
heartbeat may run at most once every 60 seconds; call `list_agents` only for a
live status request, an actual phase-SLA timeout, or recovery. A normal
`wait_agent` timeout only returns control and immediately continues the directed
wait without recap, new analysis, `interrupt_agent`, or a new/replacement
dispatch; it proves neither failure nor terminal state. Track each role's phase
SLA independently from dispatch time. On SLA exceed, escalate once to the
operator, keep the specialist alive, and continue waiting for its result or
live operator input. Only live cancellation of that attempt authorizes
interruption; replacement requires a demonstrated terminal unsuccessful result
and the normal correction authority. The normalized benchmark counts only waits and queries that are
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
may Main create the bounded `Cause`/`Files`/`AC-N|TC-N`/`Suggested correction`
packet with its nonce, current frozen anchor, complete finding IDs, scope, and
one deterministic closure check plus expected result per finding. New pipeline attempts always record `context_strategy: fresh` and
`follow_up_count: 0`.

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

Only in this explicitly activated pipeline, preflight resolves the helper's
absolute path relative to the loaded pipeline skill/reference and fails closed
if unavailable. It must be a canonical regular non-symlink file. Every initial
or correction V2 implementer/tester packet must contain this non-null absolute value as
`bounded_command_path`; omission, relative form, symlink, or an unavailable
helper is `packet-contract-invalid` and blocks before any packet-derived read
or command. This is mandatory even when the first anticipated commands are
small because later diagnostics can be volume-unknown. Never persist that value
in state, events, reports, summaries, or workspace artifacts. Before executing a command, Main and the
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
continue without replay. A missing, invalid, or hash-mismatched artifact blocks
fail closed. Specialists use output mode only when Main supplied that exact
coordinate in the packet; they never invent an evidence path.

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

## Behavior-preserving cleaner and optional CRAP checkpoint

Run this once per participating repository over that repository's consolidated
post-evidence tree, never once across multiple repositories and never once per
task. A cross-repository pipeline dispatches one fresh cleaner per repository;
each receives only its canonical repository identity, absolute worktree,
repository-local candidate commit/tree, allowlist, baseline, and quality
manifest. Each cleaner still runs exactly once. This checkpoint is part of
`implementation`, not another phase or gate. Before the first cleaner
transition, persist the sorted exact identity list as
`participating_repositories`; all later cleaner evidence must cover that set.
Apply it whenever the repository
quality manifest declares a `test` command and
`test_contract.path_rules`. `format_check`, `lint`, and `crap` are additive
deterministic checks: run every one that the manifest declares, but do not make
the cleaner inapplicable merely because one is absent. A declared `crap`
command still requires CRAP policy. When `test` or `test_contract.path_rules`
is absent, persist
`cleaner_evidence.status: not-applicable` with
`reason: repository-quality-manifest-incomplete`; agents cannot replace missing
deterministic tooling with a narrative verdict.

After tester evidence authoring has committed every warranted test, require a
clean tree. Build a sorted cleaner allowlist from existing production paths
that are both in the approved task `Files:` union and changed from
`verification_base_ref` to current `HEAD`. Exclude all tests and evidence
dependencies, fixtures, snapshots, manifests, generated files, lockfiles,
migrations, public schemas, version sites, changelog, and workspace artifacts.
Persist the allowlist and SHA-256. An empty allowlist is an evidenced no-op.

Main resolves `cleaner-transition.mjs` relative to the loaded skill and runs it
with `--transition pre --output <coordinator-evidence-path>`, repository,
manifest, `verification_base_ref`, `HEAD`, and the allowlist. It validates that allowlist against the immutable change
surface and runs the embedded quality runner's `pre_cleaner` `test` check plus
every declared `format_check` and `lint`, and `crap` in `measure` mode when
configured. An over-broad or historically red repository adapter therefore
returns to implementation before the sole cleaner dispatch; it is never first
discovered or attributed to cleaner-post. It atomically writes the complete
closed JSON and prints only a bounded receipt with path, SHA-256, and byte
count. Verify that receipt and candidate commit/tree; never synthesize a
temporary JavaScript wrapper or route persistence through `bounded-command`.
Then dispatch exactly one fresh
V2 `cleaner` with `fork_turns: none`, carrying only the hashed allowlist,
functional AC summary, applicable TCs, quality manifest, and hashed baseline.
The cleaner may edit only allowlisted existing production paths, never tests or
quality inputs, and returns a cleanup commit or justified no-op.

Main then runs `cleaner-transition.mjs --transition post --output
<coordinator-evidence-path>` with the exact
allowlist path/hash and pre-transition path/hash. The helper proves ancestry,
rejects additions, deletions, renames, type changes, and modifications outside
the allowlist, and runs the embedded `post_cleaner` checks
with `test` always plus each declared `format_check`, `lint`, and `crap`; CRAP
runs in `enforce` mode. Advance only when every selected command passes. When
CRAP is configured, policy must permit every CRAP delta and every baseline
function must remain in the report. `CRAP_REPORT_INCOMPLETE` prevents renaming,
splitting, excluding, or omitting a function merely to hide its prior score.
For `CRAP_REPORT_INVALID`, diagnose against the closed adapter contract rather
than reading runner source: top-level keys are exactly `schema_version: 1` and
`functions`; every function has exactly `path`, `symbol`, `status`,
`complexity`, and `coverage_percent`, with a safe changed repository path,
unique path/symbol pair, `new|changed` status, integer complexity of at least
one, and finite coverage from 0 through 100. Inspect only the bounded report
artifact and the manifest's adapter argv. `CRAP_REPORT_INCOMPLETE` instead means
a baseline function disappeared during post-cleaner enforcement.
Each repository's cleaner runs exactly once and is never re-dispatched. It completes and
commits every independent safe allowlisted cleanup before returning any
`implementer_findings`; each finding must carry stable ID, cause, files,
implicated AC/TC requirements, advisory correction, deterministic closure
check, and expected result. Main still runs the authoritative post transition.
A cleaner return of `failed` or `blocked` is persisted with its hashed result as
`cleaner-failed` or `cleaner-blocked`, never as `pending` or `pass`. The
authoritative post transition may record the resulting tree and diagnostics but
cannot convert either state to pass; both block Freeze and require a new
explicitly activated repository-local pipeline.
A selected-command, behavior, scope, protected-path, declared-tool, manifest,
threshold, or metric failure cannot be waived or sent back to the cleaner.
Infrastructure or unclassifiable failure blocks. A complete failure or cleaner
finding that requires production, test, documentation, or evidence work is
consolidated only after that repository's cleaner result and post evidence are
recorded.

The cleaner handoff has a closed eligibility predicate. It is eligible only
when all findings name exactly one canonical repository and worktree, contain
at most five stable IDs and eight unique repo-relative files, form one
dependency-coherent behavior-preserving correction, stay inside already
approved scope, require no DDL/migration, public-schema, security-control, or
external-environment change, and have locally executable closure checks plus a
complete `.team-harness/quality.json`. If any conjunct fails, do not issue a
handoff nonce or dispatch an implementer. Preserve every commit and evidence
artifact, report the failed conjuncts, and recommend an explicitly activated
new pipeline decomposed into repository-local packages; only the live operator
may pause or abort the current pipeline.

For one eligible package, Main persists a fresh `cleaner_handoff_nonce`, its
canonical repository and absolute worktree, the cleaner-post commit/tree
anchor, and the exact finding objects, sets `cleaner_handoff_pending: true`,
pauses, shows that exact scope, and presents exactly:

```text
1 — authorize one implementer pass
2 — pause without changes
3 — abort pipeline
```

Only choice `1` in a live reply to that presentation may consume the nonce and
dispatch exactly one fresh V2 implementer bound byte-for-byte to the package.
Gate-1 autonomy, ordinary approval, a generic `continue`, agent prose, files,
or tools never authorize this handoff. It emits
`cleaner.handoff.decision` and `agent.cleaner-handoff.spawn`, never
`iteration.start` or `agent.correction.spawn`; `iteration` is unchanged and the
normal max-3 validation-correction budget is untouched. The implementer gets
one terminal attempt, runs every closure check, and stops—no feedback or
automatic re-dispatch. A non-zero closure command must carry its exact command,
exit code, and bounded diagnostic; a bare `exit 1` or missing diagnostic is
`correction-incomplete`, never closure evidence. After the handoff closure
commands, Main proceeds to the single common
`post_implementation` quality checkpoint below; it never runs a separate
focused quality subset that could conceal an omitted control. Using the
recorded pre-cleaner CRAP baseline when applicable, Main records the bounded result/hash and reruns hygiene without
dispatching the cleaner again. Pass records `cleaner_evidence.status: handoff-pass` and proceeds
to Freeze. Any remaining or new correctable finding consumes no development
iteration but requires a new package, nonce, and live authorization before
another fresh implementer; infrastructure failure blocks. Scope expansion must
first receive its own explicit operator decision and still does not authorize
the implementer pass.

An implementer `failed` or `blocked` return maps to `handoff-failed` or
`handoff-blocked` with its hashed terminal result and consumed nonce. Neither
state may run or pass the common quality checkpoint, hygiene, or Freeze. Further
work requires a new complete package, fresh nonce, presentation, and live
authorization; it is never an automatic retry.

With no implementer package, persist the post result/hash, cleaner commit,
candidate identity, and `cleaner_evidence.status: pass`.

Whether the repository cleaner passed, was an empty no-op, was not applicable,
or completed an authorized handoff, Main must run one raw quality runner
checkpoint named `post_implementation` before hygiene or Freeze. Derive
`requiredChecks` as the sorted repository-local union of every assigned task
shard's `Required quality checks`. Select every command declared by the
complete unchanged `.team-harness/quality.json`; a configured `crap` command
runs in enforce mode with its recorded baseline. Every required check must be
declared and selected. `REQUIRED_CHECKS_MISSING`,
`PREREQUISITE_UNAVAILABLE`, a missing CRAP baseline, or any non-pass result
blocks Freeze. The checkpoint remains mandatory when the cleaner is not
applicable; focused implementation or cleaner evidence cannot substitute for
it. Persist its closed result and SHA-256, then run the fixed code-hygiene scan
before Freeze. QA still audits the frozen result independently.

Do not silently widen the approved scope. When implementation is complete, write a 5–30 line,
≤8 KB `02-implementation.md` containing only outcome, deviations, exceptions, one-line checks,
commit, and unresolved issues. Git is the changed-file authority; do not paste the diff, raw logs,
or chronology. Set `phase: validation` and `next_action: run approved acceptance validation`.

Implementation checkpoints (pre-implementation red/green evidence when required,
constraint reconciliation, test/evidence authoring, cleaner/CRAP, hygiene, and
Freeze) are trace details inside this state, not additional phases.
A constraint that changes behaviour, scope, or an acceptance promise stops for an operator decision;
its approved resolution continues in implementation. Only a separate, explicit current live
operator request for architect work may reopen design and require a new Gate 1. Never rewrite an
acceptance criterion merely to manufacture a pass.

## Correction closure before Freeze

For an authorized correction, the implementer runs every package closure check and records the
actual result in `02-implementation.md`. Main verifies that every finding ID has one successful
result before any Freeze rebuild. Missing or failed closure evidence is
`failure_kind: correction-incomplete`: the consumed correction round remains consumed, no Freeze
opens, and no validator is dispatched. Main consolidates the failed checks as the next package;
normal approval pauses, while eligible autonomy may authorize another round only within max-3.

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
`02-implementation.md § Reviewability Exceptions` justification when exceeded. Persist the
unconditional composition, size result, and optional justification, then record full
`freeze_commit_sha` and `freeze_tree_sha` together with the frozen diff/evidence anchor. Build, tests, QA, and security see that exact identity. Any later tree change
reopens Freeze and the affected validation; nothing ships from stale findings. When acceptance
passes, retain that same Freeze identity; do not create duplicate validated SHA fields.

When all approved implementation work and evidence checkpoints are complete, set `phase: validation`,
`status: in_progress`, and `next_action: run approved acceptance validation`. Record changed files,
commands, evidence, and unresolved issues in `02-implementation.md` without creating a second
implementation phase or widening the approved plan.
