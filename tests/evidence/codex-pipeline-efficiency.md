# Codex pipeline-efficiency A/B evidence

Date: 2026-08-02
Task: Task 4 — Benchmark y no regresión (AC10–AC11; AC18 provenance preflight)

## Current run state

**NOT DEMONSTRATED — final for this attempt; no A/B verdict.** The M1 retry
obtained valid checkpoints and completed after an explicitly authorized
full-access launch, but it did not activate the candidate pipeline runtime.
The run therefore cannot show either an efficiency improvement or a quality
regression of the candidate.

This is intentional fail-closed handling, not an `available` zero or a partial
subtotal. `Cost: unavailable`: no exact provider/model/dimension/currency
pricing tuple with source and effective date was supplied.

## Provenance preflight status for a future live A/B

`tests/benchmark_codex_pipeline_efficiency.mjs` prepares and attests isolated
baseline/candidate plugin provenance before measurement. It does not run
`codex exec`, create a benchmark result, compare quality, or make gate
decisions.

A real Codex 0.146.0 smoke receipt passed after installing both snapshots in
isolated homes:

| Receipt field | Baseline | Candidate |
|---|---|---|
| Plugin version | 3.6.8 | 3.7.0 |
| Source/install tree hash | `eca98eab03dd62aa5af509161edd6b5854c07e85649a7da8d6e8cd2f6d6b93c5` | `430b71c2d5fc35452e8416091be9261a1a99343cf04badfc7f0dacb4dc14125f` |

The receipt was `PASS / MEASUREMENT_PERMITTED`, the source and installed
hashes matched per arm, the arms were distinct, and the smoke prompt contained
an explicit pipeline invocation. That prompt was not M1, S1, or S2, so no live
cell receipt exists yet and the state above remains **NOT DEMONSTRATED**.

Every future live A/B cell requires a fresh preflight receipt with
`status: "PASS"` / `reason_code: "MEASUREMENT_PERMITTED"` for its explicit
baseline source, candidate source, sealed prompt digest, and resolved Codex
binary. That receipt only permits measurement. It must be followed by the
same live operator gate decisions in A and B, independent quality-floor
receipts, Freeze, complete preview, and mandatory-suite evidence. A receipt
cannot synthesize, replay, approve, or replace any of those decisions.

### M1 diagnostic retry — invalid as an A/B benchmark

The exact retry reference is cell `M1-A`/`M1-B`, sealed prompt label `M1`, and
the resume invocation under [Run and measurement protocol](#run-and-measurement-protocol):

```bash
codex exec resume --json -m gpt-5.6-terra \
  -c 'model_reasoning_effort="medium"' "$PRIVATE_SESSION_ID" - < "$PROMPT_FILE"
```

The first direct-mode attempts used available Task 1 start/end checkpoints but
could not satisfy M1's required documentation edit: the nested CLI reported
`patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`
despite `workspace-write`. The explicitly authorized full-access retry resolved
that sandbox blocker. It remains invalid as a benchmark because the sealed M1
prompt explicitly selected direct mode (and prohibited `@Team-Harness
pipeline`), while both A and B loaded the same installed 3.6.8 plugin; B's
candidate files were present in its worktree but never active as the plugin
runtime.

The following are isolated Task 1 checkpoint deltas from that retry and are
diagnostic-only. They do **not** use the historical 65.64M cumulative value,
and they must not be interpreted as a candidate saving, regression, or cost.

| Metric | M1-A diagnostic | M1-B diagnostic |
|---|---:|---:|
| `input_tokens` | 87,545 (derived from cached + uncached) | 119,908 (derived from cached + uncached) |
| `cached_input_tokens` | 80,128 | 111,616 |
| `uncached_input_tokens` | 7,417 | 8,292 |
| `cache_write_input_tokens` | unavailable (not retained) | unavailable (not retained) |
| `output_tokens` | 633 | 612 |
| `reasoning_output_tokens` | unavailable (not retained) | unavailable (not retained) |
| `total_tokens` | 88,178 | 120,520 |
| Wall time, tool calls, waits, bytes, compactions, rounds, workspace size | unavailable for the full-access retry record | unavailable for the full-access retry record |

## Protocol checks (not A/B quality receipts)

The following checks passed in the candidate source worktree on 2026-08-02.
They validate the protocol/documentation and the collector's deterministic
fixtures only; they do **not** make any M1/S1/S2 cell comparable or change the
`NOT DEMONSTRATED` state above.

```bash
awk 'BEGIN { in_block = 0 } /^```/ { if ($0 == "```bash") in_block = 1; else in_block = 0; next } in_block { print }' tests/evidence/codex-pipeline-efficiency.md | bash -n
git diff --check
node tests/test_codex_usage.mjs
node tests/test_codex_pipeline_benchmark.mjs
python3 tests/test_pipeline_contract.py
python3 tests/test_codex_runtime.py
```

Results: fenced benchmark shell syntax PASS; diff whitespace PASS; Task 1
collector fixtures PASS; provenance-preflight fixtures PASS; real Codex 0.146.0
isolated provenance smoke PASS; pipeline contract PASS; Codex runtime structure
PASS.

## Dynamic diagnostic snapshot (not an A/B result)

This observed snapshot is provisional and belongs to the active root, not to
any benchmark cell. It must never be subtracted from, added to, or used as a
proxy for M1/S1/S2.

| Observation | Value |
|---|---:|
| Unique steps | 676 |
| Cached tokens | approximately 65.99M |
| Root cached tokens | approximately 38.17M |
| Root steps / tool calls / waits / compactions | 376 / 359 / 88 / 4 |

| Trigger | Cached tokens / steps |
|---|---:|
| `exec` | 49.04M / 491 |
| `wait_agent` | 7.74M / 84 |
| `wait` | 0.54M / 9 |
| `list_agents` | 0.89M / 13 |
| `send_message` | 1.91M / 22 |
| `followup_task` | 0.66M / 6 |
| no tool | 3.37M / 33 |

A theoretical per-step cap of 100k would avoid approximately 14.30M cached
tokens; an 80k cap would avoid approximately 21.35M. These are overlapping
counterfactuals and must not be summed with each other or with call-reduction
claims. The observed retracing causes were Task 1 beginning without prior
native-envelope characterization and Task 2's shard lacking an explicit
invariant to preserve Claude costs. This is diagnostic context only, not a
pricing estimate or a candidate-quality finding.

## Immutable comparison contract

| Input | Required value / handling |
|---|---|
| Baseline A | `e31bbd7eb26d24b5075803bed2e3b74621eedd24` (`origin/main` at the recorded baseline) |
| Candidate B | The current working tree over that SHA, materialized anew for every B cell; include tracked changes and non-ignored untracked files. |
| CLI | One resolved `codex` executable, binary digest, and `codex --version` for all six cells. |
| Model / effort | `gpt-5.6-terra` and one explicitly supplied effort value for all cells. A default effort is not evidence. |
| Active plugin runtime | A attests the fixed installed 3.6.8 snapshot; B attests the materialized/installed candidate snapshot. Files merely present in B's worktree are insufficient. |
| Prompts | One sealed prompt per case, with the same SHA-256 digest in A and B. Raw prompts remain outside the repository. |
| Decisions | The same live operator decision vector in A and B. Do not replay a file as a synthetic gate decision. |
| Collector | One hashed, external Task 1 collector copy for all cells; neither baseline nor candidate supplies a different collector. |
| Network / base | Do not run `git fetch`, `git pull`, `git merge`, `git rebase`, or any main-branch synchronization during the comparison. |

The runner keeps native root IDs, session IDs, rollout locations, raw event
streams, prompts, messages, diffs, and command output private. The durable
ledger may retain only pseudonymous cell labels, SHA-256 digests, allowlisted
collector shapes, aggregate counters, and pass/fail/unavailable statuses.

## Cases and status

| Cell | Work class | A status | B status | Prompt digest | Decision digest |
|---|---|---:|---:|---|---|
| M1 | Medium refactor | diagnostic only — invalid runtime | diagnostic only — invalid runtime | private M1 prompt | direct-mode, no gate vector |
| S1 | Bounded change 1 | not run — stopped after invalid M1 | not run — stopped after invalid M1 | not recorded | not recorded |
| S2 | Bounded change 2 | not run — stopped after invalid M1 | not run — stopped after invalid M1 | not recorded | not recorded |

The operator selects and seals the three prompts before starting A. They must
invoke `@Team-Harness pipeline`, not direct mode. A case is invalid if its B
prompt, active plugin runtime, or live decisions differ from its A counterpart.
The benchmark does not replace Stage Gate 1 or Stage Gate 3; a live operator
must make each decision in both cells. A non-delivery closing decision may be
used after the complete preview, so the benchmark never authorizes push, PR,
merge, tag, or release.

## Safe, repeatable setup

Run these commands from the candidate source checkout. They create only a
newly named `/tmp` benchmark root and detached worktrees beneath it. Replace
`medium` only before A begins, then use that exact same value everywhere.

Before launching a cell, the runner must materialize and install the plugin
runtime independently of the worktree: A uses the fixed 3.6.8 snapshot and B
uses the candidate snapshot. Record only the version and artifact digest. A
shared global 3.6.8 installation, a plugin discovered merely because its source
is present in B, or a direct-mode prompt invalidates the cell before metrics are
compared. The isolated runner treats the `plugin add --json` receipt as the
only installed-path authority, then cross-checks it against the local-source
provenance returned by `plugin list --json`; neither CLI stream is retained.

```bash
BASE=e31bbd7eb26d24b5075803bed2e3b74621eedd24
MODEL=gpt-5.6-terra
EFFORT=medium
SOURCE_ROOT="$(git rev-parse --show-toplevel)"
RUN_ROOT="$(mktemp -d /tmp/team-harness-codex-efficiency-ab.XXXXXX)"
case "$RUN_ROOT" in
  /tmp/team-harness-codex-efficiency-ab.*) ;;
  *) printf '%s\n' 'unsafe benchmark root' >&2; exit 1 ;;
esac
COLLECTOR_SOURCE="$SOURCE_ROOT/plugins/team-harness/skills/pipeline/scripts/codex-usage.mjs"
test "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" = "$BASE"
test -f "$COLLECTOR_SOURCE"
CODEX_BIN="$(command -v codex)"
CODEX_RESOLVED="$(readlink -f "$CODEX_BIN")"
mkdir -p "$RUN_ROOT/instrumentation" "$RUN_ROOT/private"
cp "$COLLECTOR_SOURCE" "$RUN_ROOT/instrumentation/codex-usage.mjs"
sha256sum "$RUN_ROOT/instrumentation/codex-usage.mjs"
sha256sum "$CODEX_RESOLVED"
"$CODEX_BIN" --version
git -C "$SOURCE_ROOT" diff --binary "$BASE" >"$RUN_ROOT/candidate.patch"
git -C "$SOURCE_ROOT" ls-files --others --exclude-standard -z \
  | tar -C "$SOURCE_ROOT" --null --files-from=- --create --file=- \
  >"$RUN_ROOT/candidate-untracked.tar"
sha256sum "$RUN_ROOT/candidate.patch" "$RUN_ROOT/candidate-untracked.tar"
```

For every one of `M1`, `S1`, and `S2`, create a new pair. The B overlay is
copied from the current candidate source without changing it; do not reuse a
worktree after its Codex session finishes.

```bash
CASE=M1
A_WORKTREE="$RUN_ROOT/$CASE-A"
B_WORKTREE="$RUN_ROOT/$CASE-B"
git -C "$SOURCE_ROOT" worktree add --detach "$A_WORKTREE" "$BASE"
git -C "$SOURCE_ROOT" worktree add --detach "$B_WORKTREE" "$BASE"
git -C "$B_WORKTREE" apply --whitespace=nowarn "$RUN_ROOT/candidate.patch"
tar -C "$B_WORKTREE" --extract --file="$RUN_ROOT/candidate-untracked.tar"
git -C "$A_WORKTREE" diff --quiet "$BASE"
git -C "$B_WORKTREE" diff --no-ext-diff "$BASE" | sha256sum
```

The last command records a private digest of the candidate overlay without
placing its raw diff in this artifact. The patch/archive pair freezes B before
the first A cell starts, so a later source-worktree edit cannot mix candidate
snapshots within one benchmark root.

## Run and measurement protocol

The live operator launches the same CLI in each fresh worktree with the sealed
pipeline prompt and selected effort, after attesting the distinct active plugin
snapshot for that cell, then supplies the same live decisions. The following is
the fixed invocation shape; `PROMPT_FILE`, the private stream, the native
rollout root, and the native root-thread ID never enter this repository.
Before A starts, calculate `PROMPT_DIGEST` privately and record only that digest
beside both cells. After each cell, normalize the ordered gate decisions to
their decision values (not their messages), calculate `DECISION_DIGEST`
privately, and require the two digests to match.

```bash
PRIVATE_A_STREAM="$RUN_ROOT/private/$CASE-A.jsonl"
PRIVATE_B_STREAM="$RUN_ROOT/private/$CASE-B.jsonl"
PROMPT_DIGEST="$(sha256sum <"$PROMPT_FILE" | awk '{print $1}')"
A_START_NS="$(python3 -c 'import time; print(time.monotonic_ns())')"
"$CODEX_BIN" exec --json --sandbox workspace-write \
  -C "$A_WORKTREE" -m "$MODEL" \
  -c "model_reasoning_effort=\"$EFFORT\"" \
  - <"$PROMPT_FILE" >"$PRIVATE_A_STREAM"
A_END_NS="$(python3 -c 'import time; print(time.monotonic_ns())')"
B_START_NS="$(python3 -c 'import time; print(time.monotonic_ns())')"
"$CODEX_BIN" exec --json --sandbox workspace-write \
  -C "$B_WORKTREE" -m "$MODEL" \
  -c "model_reasoning_effort=\"$EFFORT\"" \
  - <"$PROMPT_FILE" >"$PRIVATE_B_STREAM"
B_END_NS="$(python3 -c 'import time; print(time.monotonic_ns())')"
```

The runner records monotonic start/end timestamps around each invocation and
holds the native identifiers only in memory. It calls the one copied collector
at the same start/end boundaries for both cells:

```bash
node "$RUN_ROOT/instrumentation/codex-usage.mjs" \
  --rollouts-root "$PRIVATE_ROLLOUT_ROOT" \
  --root-thread-id "$PRIVATE_ROOT_THREAD_ID" --checkpoint
```

If an initial invocation reaches a gate, the operator resumes its own private
session and types the live decision on standard input. The session ID stays
only in the runner's memory; do not use `--last`, which could select the other
cell. Repeat this shape for each live decision and append the resulting native
events to the same cell stream:

```bash
"$CODEX_BIN" exec resume --json -m "$MODEL" \
  -c "model_reasoning_effort=\"$EFFORT\"" \
  "$PRIVATE_SESSION_ID" - >>"$PRIVATE_A_STREAM"
```

## Freeze and complete preview

Freeze each cell relative to its own pre-run input tree. The temporary index
keeps that calculation out of the model's real index and includes non-ignored
untracked files. Run the first block immediately before the cell and the
second immediately after it; retain only `INPUT_TREE`, `FINAL_TREE`, and
`FROZEN_DIFF_SHA` in the private ledger.

```bash
INPUT_INDEX="$RUN_ROOT/private/$CASE-$SIDE-input.index"
GIT_INDEX_FILE="$INPUT_INDEX" git -C "$WORKTREE" read-tree HEAD
GIT_INDEX_FILE="$INPUT_INDEX" git -C "$WORKTREE" add -A
INPUT_TREE="$(GIT_INDEX_FILE="$INPUT_INDEX" git -C "$WORKTREE" write-tree)"
rm -f -- "$INPUT_INDEX"
```

```bash
FINAL_INDEX="$RUN_ROOT/private/$CASE-$SIDE-final.index"
GIT_INDEX_FILE="$FINAL_INDEX" git -C "$WORKTREE" read-tree HEAD
GIT_INDEX_FILE="$FINAL_INDEX" git -C "$WORKTREE" add -A
FINAL_TREE="$(GIT_INDEX_FILE="$FINAL_INDEX" git -C "$WORKTREE" write-tree)"
GIT_PAGER=cat GIT_INDEX_FILE="$FINAL_INDEX" \
  git -C "$WORKTREE" diff --cached --no-ext-diff "$INPUT_TREE"
FROZEN_DIFF_SHA="$(GIT_INDEX_FILE="$FINAL_INDEX" \
  git -C "$WORKTREE" diff --cached --no-ext-diff "$INPUT_TREE" \
  | sha256sum | awk '{print $1}')"
rm -f -- "$FINAL_INDEX"
```

The rendered command is the complete local preview and is never copied into
this artifact. Equal `FROZEN_DIFF_SHA` values prove byte equivalence. If they
differ, an independent reviewer must inspect both complete previews and record
only a semantic-equivalence PASS/FAIL receipt and digest. Without that receipt,
semantic equivalence is unavailable. Any change after `FINAL_TREE` requires a
new Freeze, preview, and affected quality receipt.

Use the checkpoint delta, not a cumulative total. A collector result with
`usage_status: unavailable`, a reason code, an invalid checkpoint, or a
root-reachable discovery failure invalidates the entire cell's token result.
Do not salvage a subtotal from other sessions.

| Required metric | Authoritative capture | Fail-closed condition |
|---|---|---|
| Token components | Same Task 1 collector checkpoint delta: `input_tokens`, `cached_input_tokens`, `uncached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`, `total_tokens` | Any collector unavailable/invalid result or differing collector digest |
| Wall time | Monotonic start/end surrounding the matching CLI invocation | No monotonic pair or clocks from different hosts |
| Tool calls | Deduplicated native tool-call items in that cell's private JSON stream | No stable native type/identifier |
| Waits | Count and elapsed duration of explicit native wait start/end pairs | Missing or ambiguous native wait boundaries |
| Bytes | Byte length of that cell's private captured native stream | Stream missing or changed after capture |
| Compactions | Explicit native compaction events only | Event type not available or ambiguous |
| Rounds | Completed live decision/phase rounds from the same private stream | No stable, complete boundary for the round |
| Workspace size | Byte total of the worktree excluding `.git`, measured before and after the cell with the same local tool | Different exclusion rule/tool or missing measurement |

No metric is inferred from prose, elapsed estimates, total-token pricing, or a
different session. `reasoning_output_tokens` is a dimension only; it is never
added to `total_tokens` again.

## AC10 quality receipt

For each A/B cell, collect the same immutable quality receipt before comparing
efficiency. The receipt must show all of the following as PASS, with the exact
command/version or review authority recorded privately and its result/digest
recorded in the ledger:

| Coverage that must remain intact | Required evidence |
|---|---|
| Sharding and verify packet | The scenario's sealed verify packet reports every required check PASS. |
| R0 and mandatory suites | `TH_REQUIRE_RUNTIMES=1 bash tests/run-all.sh` is green in both cells. |
| Freeze | Pre-validation frozen tree/diff digest is recorded; any later tree change invalidates that cell and requires a fresh receipt. |
| Security floor | Same pinned scanner/reviewer reports zero new Critical or High findings in B relative to A. Missing severity data is not a pass. |
| Gates and AC | The same live gate vector completes; every scenario acceptance criterion has an explicit PASS receipt in both cells. |
| Complete preview | A complete human-visible frozen preview was reviewed before the non-delivery closing decision. Store its digest/status, never its raw diff. |

The command below is the minimum repository-suite check; it does not by itself
replace the sealed verify packet, security comparison, live gates, Freeze, or
preview receipt.

```bash
TH_REQUIRE_RUNTIMES=1 bash tests/run-all.sh
```

## AC11 comparison and disposition

For a case to be comparable, all required metrics and every AC10 receipt must
be present for both A and B. Compare only like-for-like cells: the frozen
semantic outcome and preview status must be equivalent, not merely similar
text or a matching test name.

| Disposition | Rule |
|---|---|
| Rejected | B loses any AC PASS, mandatory suite, gate/Freeze/preview receipt, semantic equivalence, or introduces a Critical/High finding. |
| Not demonstrated | A/B inputs differ, any metric/quality datum is unavailable, or quality is intact but the sealed three-case comparison does not demonstrate a measured saving. |
| Supported (no USD claim) | All three cases are comparable, all quality receipts pass, and the recorded token components demonstrate the predeclared savings criterion. USD remains `Cost: unavailable` without exact pricing provenance. |

A future run must append only allowlisted outcome rows here. It must not turn
the current `NOT DEMONSTRATED` state into a pass from a dry run, a fixture, or
a partial collector result.

## Cleanup and recovery

Only remove worktrees created below the validated `$RUN_ROOT`; never remove the
candidate source checkout, `$HOME`, a shared `/tmp` directory, or native Codex
session storage. On a normal completion or an interrupted run, recover with:

```bash
case "$RUN_ROOT" in
  /tmp/team-harness-codex-efficiency-ab.*) ;;
  *) printf '%s\n' 'refusing unsafe cleanup root' >&2; exit 1 ;;
esac
for CASE in M1 S1 S2; do
  for SIDE in A B; do
    WORKTREE="$RUN_ROOT/$CASE-$SIDE"
    test "${WORKTREE#"$RUN_ROOT"/}" != "$WORKTREE" || exit 1
    test -d "$WORKTREE" || continue
    git -C "$SOURCE_ROOT" worktree remove --force "$WORKTREE"
  done
done
rm -f -- "$RUN_ROOT/candidate.patch" "$RUN_ROOT/candidate-untracked.tar" \
  "$RUN_ROOT/instrumentation/codex-usage.mjs" \
  "$RUN_ROOT/private/M1-A.jsonl" "$RUN_ROOT/private/M1-B.jsonl" \
  "$RUN_ROOT/private/S1-A.jsonl" "$RUN_ROOT/private/S1-B.jsonl" \
  "$RUN_ROOT/private/S2-A.jsonl" "$RUN_ROOT/private/S2-B.jsonl" \
  "$RUN_ROOT/private/M1-A-input.index" "$RUN_ROOT/private/M1-A-final.index" \
  "$RUN_ROOT/private/M1-B-input.index" "$RUN_ROOT/private/M1-B-final.index" \
  "$RUN_ROOT/private/S1-A-input.index" "$RUN_ROOT/private/S1-A-final.index" \
  "$RUN_ROOT/private/S1-B-input.index" "$RUN_ROOT/private/S1-B-final.index" \
  "$RUN_ROOT/private/S2-A-input.index" "$RUN_ROOT/private/S2-A-final.index" \
  "$RUN_ROOT/private/S2-B-input.index" "$RUN_ROOT/private/S2-B-final.index"
rmdir "$RUN_ROOT/instrumentation" "$RUN_ROOT/private" "$RUN_ROOT"
```

If an interrupted run leaves additional case worktrees, enumerate them with
`git -C "$SOURCE_ROOT" worktree list` and remove only paths underneath the
validated `$RUN_ROOT` one at a time. If a private directory remains nonempty,
inspect the exact file names before deleting them; do not use a recursive
cleanup. This Task 4 attempt created a validated temporary root and retains it
for the root coordinator's cleanup decision. Its local path is supplied only to
the authorized runner and is not persisted in this evidence artifact.
