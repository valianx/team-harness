# Plan-review A/B benchmark

Compare the supplied plan-review guidance at two immutable Git commits using
fresh native Codex or Claude review processes. Python 3 and Git are sufficient
for preparation, reporting and tests. Live execution also needs the selected
native CLI and its existing authentication. The runner installs nothing and
does not read or copy credentials or change provider settings.

`spec` and `pipeline` are prompt context labels. This measures one structured
textual plan review, including its proposed correction, coverage and preservation
checks. It does not execute either workflow, implement the proposed plan, measure
coordinator repairs or observe the total consumption of a development session.

## Prepare and inspect

Run from the repository root. Choose two committed revisions and an explicit
output directory outside Git or inside an ignored workspace. The repository's
`workspaces/` directory is ignored; outputs elsewhere in a Git checkout are
rejected before writing evidence. The examples below use an ignored workspace.

```sh
python3 tools/benchmarks/plan_review/benchmark.py prepare \
  --repo . --baseline-ref '<baseline-commit>' --candidate-ref '<candidate-commit>' \
  --out workspaces/plan-review-ab/study \
  --runtimes codex --flows spec,pipeline --cases all \
  --repetitions 2 --seed 42 --workers 1 --timeout 180 \
  --codex-model '<model-id>' --codex-effort '<effort>'

python3 tools/benchmarks/plan_review/benchmark.py summarize \
  --manifest workspaces/plan-review-ab/study/manifest.json
```

Preparation calls no models. It freezes `agents/plan-reviewer.md`,
`skills/plan-review/SKILL.md` and
`skills/spec/references/development-phases.md` from each commit, together with
prompts, fixtures, answer schema, commands, seed, repetitions and concurrency.
The manifest records commits/trees, source/file, case, runner and protocol hashes.
Only source bodies and case inputs reach the model: source frontmatter, variant
labels, commit identities and case oracles are excluded.

Each runtime uses the same explicitly chosen model and effort for A and B.
`codex` and `claude` resolve through `PATH`; `--codex-binary` and
`--claude-binary` accept an absolute executable path. For Claude-only preparation,
use `--runtimes claude --claude-model '<model-id>' --claude-effort '<effort>'`.
For both runtimes, supply both configurations. Compare results within the same
runtime and flow; aggregate totals across runtimes describe workload only.

Planned native invocations are
`2 × cases × runtimes × flows × repetitions`. AB/BA pair orders are seeded and
balanced separately within each runtime/flow, with a difference of at most one
when its pair count is odd. `--workers` is frozen at preparation and accepts one
or two concurrent pairs; each pair's variants execute sequentially. Concurrency
and interruptions between batches can affect observed timing.

## Explicit live execution

Only `run` invokes native clients and can incur provider usage. Inspect the
prepared manifest and prompts before choosing the bound for each invocation.
Preparation, `summarize`, `analyze.py` and repository tests make no model calls.

```sh
python3 tools/benchmarks/plan_review/benchmark.py run \
  --manifest workspaces/plan-review-ab/study/manifest.json --max-trials 2
```

`--max-trials` is required and reserves only that many pending trials before
launching. Repeat the command to resume; completed successes and errors are
immutable and skipped. A started trial without a result has ambiguous consumption
and is skipped too. Before launching any selected trial, the runner reconstructs
its native argv from the declared runtime configuration and exact study paths,
requires matching trial configuration and stored argv, and checks the complete
bounded selection's prompts, working directories and answer schema bytes against
the built-in protocol. The selected native binary remains a trusted operator
choice. Changing fixtures, prompts, commands, schema, runner or protocol stops reuse;
prepare a new study in a new directory when changing inputs. A crash can leave
`.run.lock`; remove it only after confirming the earlier process has stopped.
Timeouts terminate the native process group. This process isolation currently
requires a POSIX host.

Each trial uses a fresh process, empty working directory and stdin prompt.
Codex uses ephemeral execution, ignores user configuration/rules, disables host
instructions, skills, plugins, apps, hooks, memory, delegation and action tools,
and requests a read-only sandbox. Its native CLI does not expose a blanket empty
tool allowlist: any observed tool item invalidates the review. Claude uses safe
restricted mode, no session persistence, an empty tool list and empty MCP
configuration. Its final envelope does not supply a full action trace, so tool
counts remain unknown. These isolation settings are part of the frozen protocol;
CLI flag/configuration incompatibilities are recorded as failures. Use a new
study when adapting the protocol to another CLI release.

Results retain structured answers, status, wall time, native numeric usage and
event types. Available usage survives parsing/tool failures. Raw streams and
tool output are not retained; their hashes and bounded, redacted native
diagnostics are. Codex warning items do not invalidate completed reviews;
top-level errors and failed turns do. One native invocation is one process,
while model request counts remain unknown when the client does not report them.
Complete Authorization, Proxy-Authorization and cookie header values are redacted
alongside bearer/basic tokens and named secrets before diagnostics are retained.

## Quality and descriptive analysis

The synthetic cases cover producer prerequisites, validation command omission,
weakened preservation during repair, equivalent exact verification, a legitimate
aggregate-only contract, transfer to stock lots and unavailable history. Oracles
are separate from model input. The `held_out` transfer label signals that its
outcomes should be inspected after fixtures/configuration are fixed; it does not
automatically hide a case from `--cases all`.

The embedded scorer is provisional. Requirement/task/location matches, supported
pytest selection and preservation flags cannot prove semantic correctness.
Inspect `blind/*.json` without variant metadata and compare the answers with the
separate case oracles. Retain technical judgments for misses, false positives,
origin, correction, order, independent design, coverage and guarantees. The
analyzer uses external adjudication only, never provisional scores.

Place adjudication packages in a separate directory as `batch-*.json`. Each
package supplies `method`, `adjudicator`, `study_manifest_sha256` and `rows`.
`study_manifest_sha256` is SHA-256 of the exact `manifest.json` bytes, not canonical
JSON. Rows join by `trial_id`; each row supplies nonnegative integer
`material_expected`, `material_detected` and `false_positives`, plus boolean or
null `origin_correct`, `correction_sufficient`, `task_order_preserved`,
`parallel_design_preserved`, `coverage_sufficient` and `guarantees_preserved`.
Null preserves an unknown judgment; a missing field remains missing. The analyzer
rejects missing/wrong study bindings and contradictory labels, deduplicates
equivalent rows and excludes conflicting duplicates. This binding remains
compatible with earlier prepared study/adjudication packages.
The three required counts cannot be null, boolean, negative or non-integer;
rejected or incomplete rows do not imply complete adjudication or zero counts.
Only complete adjudications count toward clean controls. Analysis stops before
writing reports if the cases no longer match the prepared fixture hash.

Native receipts have a separate binding: `started.json` requires the trial ID,
stored command, declared runner/protocol/concurrency identity and the canonical
manifest digest in `manifest_sha256`. Canonical JSON sorts keys, retains Unicode
and uses compact separators; this digest differs from the adjudication package's
hash of the exact manifest bytes. Results must match trial and protocol identity;
new results also carry the canonical manifest digest. Earlier results without
that additional field remain valid when their started receipt binds them to the
current study. Both `summarize` and the analyzer exclude missing or mismatched
native receipts from quality, latency and usage comparisons, preserving integrity
issues and an explicit excluded-evidence count/state. Legitimate native failures
retain reported usage; absent usage remains unknown.

```sh
python3 tools/benchmarks/plan_review/analyze.py \
  --manifest workspaces/plan-review-ab/study/manifest.json \
  --adjudication-dir workspaces/plan-review-ab/adjudication \
  --out workspaces/plan-review-ab/metrics
```

`analysis.json` and `report.md` preserve errors, pending/interrupted trials,
unavailable usage, absent adjudication and explicit nulls. They report sample
variation, latency and B-minus-A paired differences. Quality denominators reflect
applicable case requirements; invalid controls are not counted as correct.
Use `by_runtime` to compare A/B under an equivalent model/effort configuration;
`trial_rows` retain runtime and flow for inspection within each context.
When several runtimes are present, `all` and `by_flow` are descriptive workload
aggregates. Do not combine quality or token metrics from different models into
a conclusion about the guidance's effect.
The analyzer reads only the supplied study and adjudication packages, without
loading earlier study results or diagnostic trials.

Codex cached input is a subset of its input total. Claude uncached input,
cache-read and cache-creation categories are disjoint and are included once in
its input total when all are reported. Reasoning is a subset of output and is
never added again. The analyzer consumes native turn receipts once, falling back
to the single usage receipt; unavailable categories remain null. It makes no USD
estimate, statistical significance claim or inference of general superiority.
Synthetic cases, repetition count, schema scaffolding and native isolation limit
what a study can establish.

## Hermetic verification

```sh
python3 -B -m unittest discover -s tests -p 'test_plan_review_*.py' -v
```

Tests create temporary Git snapshots, synthetic receipts/adjudications and fake
CLI executables. They exercise isolation, required execution bounds, balanced
order, timeouts, immutable resume, token accounting and analysis integrity.
They use no credentials, paid calls, installation state or recorded study data.
They verify runner mechanics; they do not measure model quality.
