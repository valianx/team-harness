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
language preferences and optional GitHub identity routes, offers Memory/context7
MCP registration, verifies hook trust, and places twenty bundled specialist
agents in project or global scope: seven standard logical roles, seven
spawn-overridable `pipeline-*` identities, one direct read-only inline reviewer,
and five for immutable PR review.
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
idempotent native `codex plugin add` under native permissions, then runs one
versioned convergence helper for the bridge, native settings, persistent
runtime classification, required features, all twenty bundled agents, MCP
inspection, hook validation, and final postconditions. The already-current path
performs no domain writes; a stale domain is repaired only when classification
requires it. The helper returns one closed receipt, so the coordinator does not
repeat each inspection after convergence.

Persistent runtime-profile changes remain a live operator decision. The first
pass completes the automatically authorized domains and returns a short
redacted summary; an unambiguous `yes`, `no`, or natural-language adjustment is
sufficient, without copying a recovery command or using a prescribed phrase.
A real active old snapshot is preserved so its already-known skill and hook
paths remain operational, while a missing or previously bridged path may follow
the new snapshot. The updater never overwrites a real cached directory or an
unrelated symlink and still repairs current-version installations. The native
snapshot sequence remains `codex plugin marketplace upgrade team-harness`,
followed by `codex plugin add team-harness@team-harness --json` only when the
semantic version comparison requires installation or an equal-version refresh
was forced.
Never remove the active plugin during an update: trusted `PreToolUse` hooks use
its versioned cache path and fail closed when that runtime disappears.
If post-install reconciliation stops partway through, rerun
`$team-harness:update`; the receipt identifies the failed domain, completed
idempotent work is skipped on the next pass, and the updater preserves both the
prior snapshot and safe writes rather than attempting a destructive rollback.
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
itself provides without requiring Claude Code, and recover a replacement
snapshot from the same Codex cache. When no plugin runtime can be resolved,
the launcher reports the broken cache as a system message and leaves the
decision to native Codex permissions instead of denying every tool call.

For contributors, the generated project `.codex/config.toml` keeps
`workspace-write` plus `on-request` approvals and enables dependency network
access. It deliberately omits `writable_roots`, allowing the global
setup/update reconciliation to supply the standard Go, uv, npm, and Go module
caches, Codex's private temp directory, preserved operator roots, and the
configured Obsidian Team Harness subtree. The same global profile selects
`approvals_reviewer = "auto_review"` so eligible CLI and Git escalations are
reviewed without stopping for a human prompt. This avoids shared predictable
`/tmp` paths and broad write access to `$HOME`. Temporary `.git`
directories remain protected by Codex and any test that constructs them still
requires a narrowly scoped live approval.

The plugin supplies all 57 canonical Team Harness skills. Ten lifecycle and
pipeline contracts remain hand-authored for Codex; the other 47 are generated
runtime adapters that package the canonical workflow, references, scripts, and
assets while translating invocation, configuration paths, tools, delegation,
and permission boundaries. This includes the diagram family and both GCP
skills. The twenty generated specialist definitions used by bounded skills,
the gated pipeline, direct inline review, and PR review remain a separate
setup/update concern.
Consumers do not need the Go installer.
Run `$team-harness:modes` for an alphabetical catalog with concise descriptions,
or use `/skills` and `$team-harness` completion in the Codex composer.
These helper commands remain available for diagnostics and manual recovery:

```bash
python3 PLUGIN/skills/setup/scripts/manage_agents.py inspect --scope project
python3 PLUGIN/skills/setup/scripts/manage_agents.py sync --scope project
python3 PLUGIN/skills/setup/scripts/manage_agents.py sync --scope global
```

The current release uses one version namespace across four sites: the Claude
plugin manifest, Claude marketplace entry, Codex plugin manifest, and the
installer's checked-in `var version` fallback. `CLAUDE.md` is contributor
guidance rather than release metadata and is not a version site.
CI and the prepublish guard require these sites to be changed together when a
distributed runtime input changes. Repositories that predate the Codex plugin
or installer path retain optional-site compatibility until that path exists.

The seven spawn-overridable pipeline identities are a mandatory prerequisite for the gated `pipeline` skill,
but not for lightweight `init` intake:
the primary thread must find a complete set of `pipeline-architect.toml`,
`pipeline-implementer.toml`, `pipeline-tester.toml`, `pipeline-cleaner.toml`,
`pipeline-qa.toml`, `pipeline-security.toml`, and `pipeline-delivery.toml` in either the project `.codex/agents/` or global
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
activate the pipeline or require a seven-agent preflight.

Only that explicit pipeline invocation (or explicit approval after intake)
loads the phase contracts. `Main` then owns pipeline state and delegates the
logical `architect`, `implementer`, `tester`, `cleaner`, `qa`, `security`, and
`delivery` roles through the corresponding `pipeline-*` identities. It does not spawn a persistent orchestrator and returns
to direct behavior when the workflow completes or is explicitly aborted.

### Workspace-free inline review

For a non-PR inline review, `Main` records `requested_lenses` and
`required_lenses` (every operator-named lens is required), resolves the canonical
repository root, requires a clean index/worktree, and binds the review to a
committed immutable commit or range; uncommitted inline review is unsupported. It
dispatches one native `inline-reviewer` instance per lens with the same target,
scope, criteria, and changed surface. The reviewer reads
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
agent bytes. Main resolves each range endpoint separately with hardened globals
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
is stale and cannot produce PASS. Consolidation groups returns by lens and keeps
the worse outcome where a lens returns more than once: missing, failed,
blocking, unavailable, and untrusted remain explicit non-pass outcomes; a stale
target binding is rejected or recaptured by Main before consolidation, so it prevents
consolidation rather than arriving as a lens outcome.
Global PASS requires every required
lens to be complete with `verdict: pass`, no blocker, and no unresolved blocking
disagreement. Any PR intent, number, or URL has exclusive `review-pr`
precedence and retains that flow's snapshot, lens selection, consolidation,
preview, and publication gate.

Skill activation cannot itself change Main's selected model, reasoning effort,
sandbox, or approval policy. The projection below applies to the thirteen
standard installed specialists:

| Claude role metadata | Codex model | Effort |
|---|---|---|
| `opus` | `gpt-5.6-sol` | `xhigh` |
| `sonnet` + `high` or `xhigh` | `gpt-5.6-luna` | `max` |
| `sonnet` + `medium` | `gpt-5.6-luna` | `max` |
| `haiku` | `gpt-5.6-luna` | `max` |

For the active pipeline only, an unambiguous live request such as “pipeline en
Luna max” selects one ephemeral model/effort pair. Main asks the operator to use
the native `/model` selector when the current chat is not already confirmed on
that pair, then passes the pair explicitly to every `pipeline-*` spawn. No exact
flag syntax is required. The choice is never written to Codex or Team Harness
configuration, pipeline state, events, reports, or handoffs, and expires when
the live Main thread ends. Without an override, explicit dispatch recreates the
standard per-role projection in the table above.

The role table is independent from the generic fallback. Global setup and
update install a missing fallback and atomically migrate the exact formerly
managed `gpt-5.6-terra` / `medium` pair to `gpt-5.6-luna` / `max`, with a
backup. Any other complete operator-selected pair is preserved as
`custom-preserved`. A
fallback or named-role change reports `restartRequired: true`; the active Codex
thread must be replaced because it does not hot-reload its agent registry.

Generated project configuration and global setup/update also include
`CLAUDE.md` in `project_doc_fallback_filenames`. Existing ordered fallback names
are preserved and `CLAUDE.md` is appended once. Codex still checks
`AGENTS.override.md` and `AGENTS.md` first at each directory level, so this
provides compatibility for repositories that only ship Claude instructions
without weakening native Codex guidance. A changed fallback list requires a new
session because project instructions are discovered at startup.

`.codex/README.md` is the generated roster. After editing canonical role
metadata or adapters, run `$sync-codex-agents`; do not hand-edit generated TOML.

Codex's native sandbox and permission path remain authoritative. Only
deterministic deny floors emit a hook decision; hook-level `ask` and classifier
`allow` are never translated into authorization.

**Accepted risk — fail-open launcher fallback.** When the hook launcher cannot
resolve a valid plugin root (stale or replaced cache, unmounted path, invalid
`PLUGIN_ROOT`), it surfaces one `systemMessage` (`plugin runtime missing`) and
makes no permission decision: the deny floor (`policy-block`, `gcp-guard`) is
inactive until the plugin is reinstalled, and native Codex permissions are the
only boundary. This is deliberate, not an oversight: the floor is a narrow
backstop against destructive actions under the honest-developer threat model
(`docs/dev-mode.md § "Threat model — honest-developer disposition"`), and a
broken cache denying every Bash call would convert a packaging failure into a
development outage. `tests/test_codex_hooks.sh` proves the safety half that is
non-negotiable either way: an unresolvable or unsafe root never executes a
fallback runner.

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
`gpt-5.6-luna` model and explicitly selected `max` reasoning effort, the same sealed
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
seven-agent pipeline roster. Its only output is a closed allowlisted receipt.
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
