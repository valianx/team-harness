# Codex runtime (POSIX-only beta)

Team Harness ships a Codex plugin at `plugins/team-harness/` and a repository
marketplace at `.agents/plugins/marketplace.json`. The tagged Git tree is the
artifact; there is no separate Codex archive.

## Install and lifecycle

Add the repository marketplace, install the plugin, and start a new thread:

```text
codex plugin marketplace add valianx/team-harness
codex plugin add team-harness@team-harness
```

Then invoke `$team-harness:setup`. The marketplace only distributes code;
setup converges the operational installation. It writes native settings to
`${CODEX_HOME:-$HOME/.codex}/.team-harness.json`, configures workspace and
language preferences, offers Memory/context7 MCP registration, verifies hook
trust, and places eleven bundled specialist agents in project or global scope:
six for the gated pipeline, one direct read-only inline reviewer, and four for
immutable PR review.
An explicit setup import can copy missing values from Claude Code or opencode
without printing opaque values; normal Codex modes never read another
runtime's configuration and existing Codex-native values always win.

Contributors testing an already trusted local checkout can replace the first
command with `codex plugin marketplace add .`.

For a smaller Git checkout, include both the catalog and its local plugin source:

```text
codex plugin marketplace add valianx/team-harness \
  --sparse .agents/plugins \
  --sparse plugins/team-harness
```

Use `$team-harness:update` for the normal update flow. It refreshes the
marketplace, compares versions, refreshes the installed plugin through an
idempotent native `codex plugin add` under native permissions, ensures native
settings exist, and automatically aligns all eleven
bundled agents in the configured scope. It also runs a guarded compatibility
bridge for the running thread's old versioned cache path. A missing or
previously bridged path can follow the new snapshot; a real active old snapshot
is preserved so its already-known skill and hook paths remain operational, and
the updater reports that a restart is required. It never overwrites a real
cached directory or an unrelated symlink. The updater also
repairs configuration and agents when the version is current. The underlying
manual sequence remains `codex plugin marketplace
upgrade team-harness`, then `codex plugin add team-harness@team-harness --json`.
Never remove the active plugin during an update: trusted `PreToolUse` hooks use
its versioned cache path and fail closed when that runtime disappears.
If post-install reconciliation stops partway through, rerun
`$team-harness:update`; bridge, config, and agent operations are idempotent, and
the updater preserves both the prior snapshot and completed safe writes rather
than attempting a destructive rollback.
Run `codex plugin marketplace remove team-harness` only when no installed
plugin still depends on it.

During local plugin development, make a real file change before reinstalling so
the development cache key changes; then run
`codex plugin add team-harness@team-harness --json` again and start a new
thread. If no source byte has changed, Codex may correctly reuse the same
cached snapshot.

Codex requires explicit trust before repository hooks execute. The plugin wires
only deterministic-deny hooks (`policy-block` and the catastrophic branch of
`gcp-guard`); approval-classifying guards are omitted because Codex has no
hook-level `ask` and native permissions own approvals. Review
`plugins/team-harness/hooks/hooks.json` and its scripts before trusting the
checkout; never bypass hook trust for an unreviewed repository. Hooks and the
installer beta currently require a POSIX shell. An update can bridge paths that
the current thread already knows, but newly added or renamed skills, agent or
MCP declarations, and hook registrations still require a new Codex thread.
Hook commands prefer Codex's native
`PLUGIN_ROOT`, accept the `CLAUDE_PLUGIN_ROOT` compatibility alias that Codex
itself provides without requiring Claude Code, recover a replacement snapshot
from the same Codex cache, and fail closed without a shell-level `127` when no
plugin runtime can be resolved.

For contributors, the generated project `.codex/config.toml` keeps
`workspace-write` plus `on-request` approvals, enables dependency network
access, and grants write access only to the current user's standard Go, uv,
npm, and Go module cache directories. This avoids shared predictable `/tmp`
paths and broad write access to `$HOME`. Temporary `.git`
directories remain protected by Codex and any test that constructs them still
requires a narrowly scoped live approval.

The plugin supplies all 57 canonical Team Harness skills. Ten lifecycle and
pipeline contracts remain hand-authored for Codex; the other 47 are generated
runtime adapters that package the canonical workflow, references, scripts, and
assets while translating invocation, configuration paths, tools, delegation,
and permission boundaries. This includes the diagram family and both GCP
skills. The eleven generated specialist definitions used by the gated pipeline,
direct inline review, and PR review remain a separate setup/update concern.
Consumers do not need the Go installer.
Run `$team-harness:modes` for an alphabetical catalog with concise descriptions,
or use `/skills` and `$team-harness` completion in the Codex composer.
These helper commands remain available for diagnostics and manual recovery:

```bash
python3 PLUGIN/skills/setup/scripts/manage_agents.py inspect --scope project
python3 PLUGIN/skills/setup/scripts/manage_agents.py sync --scope project
python3 PLUGIN/skills/setup/scripts/manage_agents.py sync --scope global
```

The current release uses one version namespace across five sites: the Claude
plugin manifest, Claude marketplace entry, Codex plugin manifest, `CLAUDE.md`
current-version line, and the installer's checked-in `var version` fallback.
CI and the prepublish guard require these sites to be changed together when a
distributed runtime input changes. Repositories that predate the Codex plugin
or installer path retain optional-site compatibility until that path exists.

The six pipeline agents are a mandatory prerequisite for the gated `pipeline` skill,
but not for lightweight `init` intake:
the primary thread must find a complete set of `architect.toml`,
`implementer.toml`, `tester.toml`, `qa.toml`, `security.toml`, and
`delivery.toml` in either the project `.codex/agents/` or global
`$CODEX_HOME/agents/` scope before it delegates. Setup/update install them from
the marketplace snapshot. The direct read-only `inline-reviewer` is the only specialist used
by workspace-free inline review; it receives exactly one of the `tester`, `qa`, `security`,
or conditional `adversary` lenses. The four read-only PR review agents (`reviewer`,
`pr-review-qa`, `pr-review-security`, and `reviewer-consolidator`) are the corresponding
prerequisite for `review-pr`. A new Codex thread is needed only when Codex must discover changed declarations;
the updater's compatibility bridge keeps existing paths live. Shared direct skills remain
available without either specialist set and execute through Main unless their adapter names a
bounded native delegation.

## Roles and model projection

`Main` stays in ordinary direct mode until the live operator mentions the
plugin. `@Team-Harness init <task>` loads only the lightweight orchestrator
kernel: it begins conversational intake and handles simple bounded work directly
without workspace state, gates, or agent preflight. A live request for tester,
QA, or security is also supported as a workspace-free inline review; it does not
activate the pipeline or require a six-agent preflight.

Only that explicit pipeline invocation (or explicit approval after intake)
loads the phase contracts. `Main` then owns pipeline state and delegates
directly to `architect`, `implementer`, `tester`, `qa`, `security`, and
`delivery`. It does not spawn a seventh or persistent orchestrator and returns
to direct behavior when the workflow completes or is explicitly aborted.

### Workspace-free inline review

For a non-PR inline review, `Main` records `requested_lenses` and
`required_lenses` (every operator-named lens is required), resolves the canonical
repository root, requires a clean index/worktree, and binds the review to a
committed immutable commit or range; uncommitted inline review is unsupported. It
dispatches one native `inline-reviewer` instance per lens with the same target,
scope, intent, criteria, changed surface, and `target_id`. The reviewer reads
the project directly through `sandbox_mode = "read-only"`; it cannot write
files, create Team Harness workspace/state/events/gates, make a branch or
commit, perform delivery or publication, mutate external state, use network
tools, or dispatch another agent. There is no isolated runner, captured-content
transport, or evidence-manifest protocol.

Before dispatch, Main validates the exact project-or-global agent definition
selected by Codex against the trusted packaged `inline-reviewer.toml`: it must
be a regular non-symlink with the exact Terra/high/read-only fields and raw-byte
SHA-256 digest. That digest does not attest an already-loaded profile: Main
dispatches only from a fresh Codex session that loaded the verified managed
profile and records `profile_session` solely as that lifecycle marker, never as
an in-memory byte attestation. Any install, setup, agent sync, mismatch, or
scope change requires an explicit restart before inline dispatch; otherwise the
lens is unavailable. Shipped Codex hooks cannot attest session start or loaded
agent bytes. Each lens package and return carry a fresh `dispatch_id` and
matching `expected_lens`; replay, duplicate, substitution, or identity mismatch
is untrusted. Main resolves each range endpoint separately with hardened globals
and `rev-parse --verify --end-of-options <rev>^{commit}`, accepting one full
commit OID only, binds `<oid>^{tree}`, and uses only those IDs. It rejects
dash-prefixed/control/range-as-endpoint/abbreviated/multi-output input. Codex
uses only the shared contract's exact immutable Git environment and
`git --no-pager` argv templates: optional locks, config injection, lazy
fetches/transports, fsmonitor, and automatic maintenance are disabled; replacement
objects, literal pathspecs, signature helpers, external diff/textconv, resolved
object IDs, and `--` path separation remain mandatory. Main preflights every
bound commit/tree/blob locally and reads tracked evidence only from bound blobs,
never the worktree. Claude Main MUST use those same controls for its no-Bash
reviewer's ephemeral immutable Git view or mark the lens unavailable. The reviewer is obligated to
stay under the project root, but that is not filesystem confinement: broad
read-only exposure remains a documented runtime residual. Main repeats the
exact hardened clean/local-object preflight and commit/tree binding before
consolidation; dirty, missing-object, or concurrently changed targets are stale
and recaptured rather than certified.

The four lenses are `tester`, `qa`, `security`, and conditional `adversary`.
The adversary lens is required when the security floor applies or the operator
requests it and is not added to ordinary reviews. The floor applies to changed
authentication, authorization/permissions, identity/session, credentials/secrets,
cryptography/transport, untrusted-input, file-upload, data-access/export,
executable-code, or security-policy/audit controls; ambiguity is sensitive. A
lens reports its status,
verdict, findings, coverage, limits, and disagreements. Main verifies the root
and commit/range before dispatch and again before consolidation; a moved target
is stale and cannot produce PASS. Consolidation is an exact one-return keyed
join on `(lens, dispatch_id, target_id, coordinates)`: missing, failed,
blocking, replayed, duplicate, substituted, unavailable, stale, or untrusted
slots remain explicit non-pass outcomes. Global PASS requires every required
lens to be complete with `verdict: pass`, no blocker, and no unresolved blocking
disagreement. Any PR intent, number, or URL has exclusive `review-pr`
precedence and retains that flow's snapshot, lens selection, consolidation,
preview, and publication gate.

Skill activation does not change Main's selected model, reasoning effort,
sandbox, or approval policy. The projection below applies to all eleven installed
specialists:

| Claude role metadata | Codex model | Effort |
|---|---|---|
| `opus` | `gpt-5.6-sol` | `xhigh` |
| `sonnet` + `high` or `xhigh` | `gpt-5.6-terra` | `high` |
| `sonnet` + `medium` | `gpt-5.6-terra` | `medium` |
| `haiku` | `gpt-5.6-terra` | `low` |

`.codex/README.md` is the generated roster. After editing canonical role
metadata or adapters, run `$sync-codex-agents`; do not hand-edit generated TOML.

Codex's native sandbox and permission path remain authoritative. Only
deterministic deny floors emit a hook decision; hook-level `ask` and classifier
`allow` are never translated into authorization.

## Controlled pipeline-efficiency A/B benchmark

`tests/evidence/codex-pipeline-efficiency.md` is the reproducible protocol and
run ledger for the Codex pipeline-efficiency benchmark. It compares a fixed
baseline with the candidate worktree; it is not a CI timing test and a source
change alone never implies an efficiency result.

The baseline is immutable (`e31bbd7eb26d24b5075803bed2e3b74621eedd24`). For
each of the three cases, A and B must start from separate, freshly created
worktrees. B is a materialization of the candidate's tracked and non-ignored
untracked working-tree content over that baseline. The benchmark must neither
fetch, pull, merge, rebase, nor otherwise synchronize `main` while it runs.

Both sides use the same resolved `codex` executable and version, the same
`gpt-5.6-terra` model and explicitly selected reasoning effort, the same sealed
prompt digest, and the same live gate decisions. The raw prompt, operator
messages, session/thread IDs, rollout paths, raw JSONL, command transcript,
and diff are private measurement inputs: they are not copied into the evidence
artifact. The artifact records only allowlisted totals, statuses, hashes, and
quality receipts.

The working-tree contents alone do not prove which plugin runtime an invocation
uses. A valid pipeline comparison must attest that A loads the fixed installed
3.6.8 snapshot and B loads the materialized/installed candidate snapshot, while
both invoke `@Team-Harness pipeline` with equivalent live decisions. If either
cell falls back to the same installed plugin, or runs direct mode, the run is
diagnostic-only and cannot support an efficiency conclusion.

Before any live cell, run the local provenance preflight with two explicit,
existing source roots, an empty safe run root, the private prompt file, and the
already resolved `codex` executable:

```bash
node tests/benchmark_codex_pipeline_efficiency.mjs \
  --baseline-source-root "$BASELINE_SOURCE_ROOT" \
  --candidate-source-root "$CANDIDATE_SOURCE_ROOT" \
  --run-root "$RUN_ROOT" \
  --prompt-file "$PROMPT_FILE" \
  --codex "$CODEX_RESOLVED"
```

The preflight never fetches or changes either source root, never invokes an A/B
`codex exec`, and never creates a quality verdict. It requires distinct source
plugin tree hashes, an explicit `@Team-Harness pipeline` prompt, two isolated
`CODEX_HOME`s under an empty `/tmp/team-harness-codex-efficiency-ab.*` root,
the locally installed cache/provenance match for each side, and the complete
six-agent pipeline roster. Its only output is a closed allowlisted receipt.
`status: "PASS"` means **measurement permitted**, not savings demonstrated or
quality accepted. A live comparison still requires that PASS plus the same
live gate decisions, independent quality receipts, Freeze, and mandatory
suites for both cells.

Copy the Task 1 collector once into the isolated benchmark root, hash it, and
use that exact external copy for both sides. A result is comparable only after
the collector has passed its root-reachable native-discovery self-check for the
same CLI release. Collect the token components through checkpoint deltas;
`reasoning_output_tokens` remains a reported dimension and is never added to
`total_tokens` again. Wall time, native tool calls, waits, captured-stream
bytes, compactions, decision rounds, and workspace bytes are independently
counted from the same externally captured run. If any required native field is
absent or cannot be stably identified, record it as unavailable rather than
deriving a plausible value.

The quality floor is independent of cost measurement: both cells must have the
same acceptance-criterion PASS receipt, green mandatory suites, no new
Critical/High security finding, an unchanged frozen semantic outcome, and a
complete human-visible preview. A quality failure rejects B. Missing,
non-comparable, or unavailable measurement does not become a pass or a price
estimate; it leaves the candidate not demonstrated. USD is always rendered as
`Cost: unavailable` unless a separate exact provider/model/dimension/currency
price tuple, source, and effective date are available.

## Verify

```bash
node tools/codex-runtime/generate.mjs --check
node tools/codex-runtime/test_generate.mjs
node tools/codex-runtime/sync-skills.mjs --check
node tools/codex-runtime/validate-marketplace.mjs
node tools/codex-runtime/sync-hooks.mjs --check
bash tests/test_codex_hooks.sh
python3 tests/test_codex_runtime.py
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/team-harness
```

The final command is an optional contributor check when the system
`plugin-creator` skill is installed; CI uses the repository structural validator.
