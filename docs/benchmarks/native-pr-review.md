# Native PR-review implementation evidence

Change: `simplify-native-pr-review`, issues [#661](https://github.com/valianx/team-harness/issues/661)
and the bounded PR-review pilot from [#662](https://github.com/valianx/team-harness/issues/662).
Baseline: `a2683ae3dedc5d06f5ff3eb96c7cc6b95ef6ab48` (3.29.7). Evidence date: 2026-09-14.

This report separates implemented behavior, native capability observations and comparative
quality evidence. Passing projection tests is not evidence that a model completed a review or
that one runtime is equivalent to another. No PR was published and no issue was closed by this
implementation run. No restart was needed for the checks described below.

## Component inventory for #662

| Component | Purpose and inputs → outputs | Authority / guarantees | Dependencies and native equivalent | Decision and cost evidence |
| --- | --- | --- | --- | --- |
| PR consolidation role | Independent drafts and frozen code → one draft and finding dispositions | Advises; Main owns final decisions and all writes | Review reports, code, identities; native primary session can synthesize | Move required execution to Main; retain installed role for compatibility. Removes a required handoff when multiple drafts exist; token/latency benefit remains to be measured. |
| Fixed review preflight | Runtime and installed roster → readiness report | Diagnostics; cannot grant permissions | GH auth, ignored workspace, native role definitions | Adapt to selected roles. Reviewer/verifier defaults; explicit selections support policy-off. Missing unused consolidator is no blocker. |
| Review prompt router | Task, options and phase → pertinent workflow detail | Instructions, not a separate enforcement layer | Native skills and read tools | Adapt to progressive loading. Snapshot, coordination, verification and publication references retain the detailed contracts. Prompt size alone is not a quality result. |
| Snapshot/context helpers | Repository, PR and captured GitHub/code state → owned frozen worktree and identity ledger | Main-controlled capture, bounded cleanup, integrity and freshness | Git, GH, Python; native file/Git APIs do not replace semantic identity checks | Retain. Their guarantees remain useful regardless of agent count. |
| Finding/verification helper | Original findings and independent assessments → validated coverage and unchanged findings | No automatic severity, deletion or final ledger decisions | Frozen identities validated by Main; existing artifact helper | Adapt. Main retains source reports, original input, verifier identity and final disposition ledger for resume. |
| Preview/publication | Canonical body/comments, exact approval and fresh context → one GitHub review | Main plus live operator/native permission policy | Approved-byte hashes, changed-line anchors, GH review endpoint | Retain. Removing an agent does not relax outward-write authority. |
| Runtime adapters/generators | Canonical roles and runtime schema → native roles/skills | Native permissions remain authoritative | Claude tool lists, Codex TOML, OpenCode permission rules | Retain and align. Verifier omission in the JavaScript converter and security scan fixed; implementer writing retained. |
| Research chain | Research question and sources → evidence and synthesis | Research advice, not operator decisions | Search, native context isolation and lead synthesis | Defer behavior changes. No measured benefit from deleting the general research chain is claimed here. |
| Pipeline/generic wrappers | Approved development plan and state → role dispatch, recoverable progress and delivery | Existing live authorization and scoped writers | Project knowledge, runtime adapters, state helpers | Retain pending a separate component-specific experiment. No blanket removal or new mandatory control layer. |

## Runtime and capability matrix

| Runtime | Observed version / configuration | Evidence obtained | Remaining limitation |
| --- | --- | --- | --- |
| Codex | CLI 0.154.0; native role TOML; read-only exec transport | Native isolated read returned the exact canary without modifying it. Generated reviewer models/effort remain unchanged. Selected-role helper respects project overrides and ignores unused roles. | A role-file sandbox is a default, not proof against parent permission overrides or external writes. A model-backed read smoke is not a mutation/delegation-denial test. Comparative native dispatch is evaluated separately below. |
| Claude Code | 2.1.270; canonical `tools` allowlists | Native `Read/Glob/Grep` smoke in restricted plan mode returned the canary without modification. Scanner exercises verifier Bash/Write/Task violations and an implementer control. | Restricted/plan smoke does not prove every plugin/subagent inheritance path. Native comparative dispatch and effective configured effort require trace evidence. |
| OpenCode | Official portable 1.18.30; legacy `permission` schema | Native `debug agent` loads all five projected PR roles. Even with a permissive temporary parent config, each exposes read/glob/grep and disables bash, edit, write, task, webfetch, websearch, todowrite and skill. The implementer retains those writing/delegation tools. Go/JS shared fixture covers the verifier independently. | Zero authenticated providers were reported. Model-backed review/dispatch and writing attempts await an operator-configured provider/model. Newer V2 configuration names are not asserted supported or injected into this legacy configuration. |

The standalone tools were downloaded into a task-specific temporary directory, without a system
install or changing the user's runtime configuration. Go 1.27.1 archives were checked against
the official SHA-256 manifest. Node 24.19.0 and Python 3.13.15 were used on Windows; Python 3.14.4
was available in Ubuntu 26.04 WSL.

Native read smoke receipts (not review benchmarks):

| Runtime | Wall time | Observed output / usage | Receipt scope |
| --- | --- | --- | --- |
| Codex | 21.879 s | Exact canary; 44,364 input, 28,160 cached input, 304 output tokens reported by the native turn | gpt-5.6-luna/max, read-only; stdout SHA-256 `42294e13dac903f22084c5e054d0e2f0909549fe5a81c32881c0e7dcbe29b882` |
| Claude Code | 20.208 s | Exact canary; native aggregate reports 4 input, 4,974 cache-creation input, 15,886 cache-read input and 1,631 output tokens | sonnet/high resolved to claude-sonnet-5; native auxiliary haiku usage was also reported. stdout SHA-256 `987654999be49ad1295048350adb78165585c4bea2c96ab2b2492eb3a6fb3bee` |

These are different smoke configurations and accounting formats, not a cost comparison. Raw
native streams stay in the local task evidence directory; only relevant aggregates and digests
are recorded here.

## Frozen comparison fixtures and independent assessment

| Cell | Base → reviewed head | Purpose |
| --- | --- | --- |
| Small / negative control, historical PR #655 | `8d920d4af38d64e16ba2c21bd9eea275ccd11104` → `bd5d629eded9b23a12d17ff53d592d15686f0da5` | Advisory wording and generated mirrors; version-only Go edits still trigger the existing executable classification. No independently established blocker in the reference assessment. |
| Cross-component security, pre-repair PR #643 | `a67350c4a63d7d894c1463ec8f3fb3e857f9fcd7` → `baec8f39f8a86a6bd879aa1b6ae3b2dd552f2e29` | Descriptor identity and Windows archive-path handling, across canonical and projected helpers. |
| Generated/launcher surface, pre-repair PR #643 | `a67350c4a63d7d894c1463ec8f3fb3e857f9fcd7` → `819a319bd335ed72348f764c36ad65af4f743c84` | Native Windows launcher resolution and error behavior across generated hook surfaces. |

The reference assessment was prepared by a separate read-only code investigation before model
trials. It inspected historical source and repair commits, without running historical code or
using PR text as an oracle. Repair tests are repository-authored supporting evidence, not an
external independent authority. Freeze this assessment outside model-visible inputs:

- R1: `regression-evidence.mjs` at the first pre-repair head checks a path and later reads it by
  path (historical lines 18–23). A concurrent replacement can invalidate the checked identity.
  The sequence is code-established; exploitability requires the stated concurrent-writer precondition.
- R2: historical materialization at lines 69–93 accepts Windows-invalid/reserved components and
  trailing dots/spaces. Acceptance is code-established; alias/escape consequences depend on the
  Windows filesystem. `819a319b...` adds descriptor and path-confinement repairs.
- R3: `plugins/team-harness/hooks/hooks.json` at the second pre-repair head invokes bare `node`
  on Windows (historical lines 13/25), permitting a local executable to shadow the intended
  runtime under the specified shell/search conditions. `faa5bea4...` switches to PATH-only lookup.
- R4: malformed/throwing launcher cases return a runtime message or propagate an exception
  instead of an explicit deny. The missing deny is code-established; the host's actual reaction
  needs native evidence. `faa5bea4...` adds the corresponding failure cases and repair.

Controls: stable regular files, already rejected symlinks/path components, legitimate intentional
differences, valid allow/ask/deny launcher results, version-only changes and generated duplicates.
Do not score one logical defect multiple times merely because it appears in several projections.

## Comparison protocol and status

Four arms use the same frozen input and fixed general/security/verification obligations:
A current workflow; B context/progress-only with unchanged assignments; C Main consolidation
with fixed initial assignments; D adaptive allocation on C. Native Main, specialist model/effort,
tool visibility, prompt digest, base/head, technical/context identities and coverage must be
recorded per arm. Initial assessments cannot see one another or the reference answers.

The first offline pilot excludes live capture, persistence and publication in every arm. It
provides identical frozen coordinates, allows no source execution or outward writes, and asks
for returned review data. This isolates coordination but does not establish the full production
review workflow's integrity or publication behavior. Those remain separately tested contracts.

The first small-fixture Codex A/B/C/D and Claude A/B attempts each reached the common 300-second
limit without a complete final review or full native usage receipt. Claude A returned two
independent specialist reports with matching snapshot identities, which is partial dispatch
evidence only. Claude B explicitly overrode configured sonnet reviewers with opus in its native
agent calls, violating the fixed-model condition; it cannot support a controlled comparison.
Actual native call/model evidence takes precedence over an agent's self-reported configuration.
The workflow now explicitly says to omit model/effort overrides unless selected by the operator.

Claude C/D did not start because the inline agent definitions exceeded the Windows command-line
limit (`WinError 206`). A local harness repair moves definitions into an isolated temporary plugin,
freezes the candidate inputs, and terminates its own process tree on timeout. The repaired candidate
run was initially blocked when automatic approval review rejected sending the unpublished local
candidate to Claude/Anthropic. The operator subsequently authorized that specific transfer and
requested PR publication afterward. The repaired small-fixture candidate D is running with the
four configured native plugin roles loaded; no comparative outcome is recorded yet. OpenCode
model trials separately need an operator-configured provider and model.

The first harness stopped only the parent at timeout; some streams continued briefly afterward.
Its initial stream digests are therefore provisional, not sealed final receipts. None of these
attempts establishes quality/recall, end-to-end usage, or an improvement. They are inconclusive,
not reviews with zero findings. The other frozen fixtures have not yet been compared.

Record final findings found/missed, false positives, selected coverage, source-to-final ledger
accounting, actual native dispatch, retries, authority violations, wall time and available
consumption. Repeat a cell if stochastic disagreement changes its conclusion. No improvement
or three-runtime quality parity is established yet; task 4.2 remains open.

## Automated verification and boundaries

- `test_review_context.py`: Windows passed 55 of 58 cases, with three symlink-creation errors
  (`WinError 1314`). WSL passed 57 and skipped only the Windows junction case, which passed on
  Windows. The union covers all 58 cases, including selected readiness, preserved assessments,
  missing coverage, concrete security selection and retained snapshot/cleanup behavior.
- JavaScript migration: 118 passed, one explicitly platform-gated symlink case skipped on
  Windows. Shared transform conformance: 40 passed, including the independent verifier fixture.
- Go Windows transform/OpenCode subset passed. Five failures in the broader installer suite
  were reproduced on the immutable baseline: remove-ledger path separators, Codex ledger parent
  SID ownership, filesystem-root diagnosis, Codex lifecycle and retired-owned-agent cleanup.
  They are recorded as existing Windows failures, not hidden or repaired outside this scope.
- The full Go installer suite passes in Ubuntu 26.04 WSL with Go 1.27.1. Running it under
  `setsid --wait` removes the controlling terminal used by an interactive installer test; no
  production change was needed. OpenCode agent-frontmatter installation checks also pass there,
  covering all five review roles and the native orchestrator. OpenCode config-directory checks
  pass 9/9 and session-enforcement checks pass 19/19.
- Security scan: 0 FAIL / 9 pre-existing manifest-form WARN; the executable verifier capability
  fixtures pass. Generated Codex role check and generator suite pass.
- Full `test_codex_runtime.py` reaches an existing POSIX-mode check failure on Windows for the
  two `manage_github_identities.py` copies. The identical failure was reproduced on the baseline;
  Windows cannot represent the asserted `0755` mode through this Node check. Content drift and
  role-generation checks remain separate evidence, not a claim that this full suite passed.
- Strict validation of `simplify-native-pr-review` passes. The overlapping active
  `pr-regression-evidence` verification requirement was reconciled without archiving unrelated
  changes. Archive guidance now places completed authorized changes in their delivery PR.

The implementation does not add per-PR benchmark gates. This evidence is for the approved
development experiment. Keep the change active until its remaining verification and authorized
same-branch archive are complete; do not close #662 as a general research/pipeline rewrite.
