# Testing Conventions

> This file is the single source of truth for what this repo tests and how. `CLAUDE.md §11` points here.
>
> **What may be registered as a test is decided in [README.md § "What gets a test"](../README.md#what-gets-a-test).** Read that first — it is the binding rule, and it narrows the scope of everything below.

## Testing principles

Normative for every agent that authors a test here (primarily `tester`, also `qa` and `security`). Codified after issue #298 — a permission-widening bug in the now-retired dev-guard hook that shipped despite a green suite.

### (i) The oracle is the spec, not the implementation output

The expected value in an assertion must be derived from the contract, specification, or documented intent — NEVER from running the code under test and recording what it emits. A test whose expected value is "what the code currently does" is a snapshot of present behaviour: it cannot catch a defect already present when the snapshot is taken, and it turns red when that defect is later fixed. It actively defends the bug.

**Historical #298 case study.** The retired `tests/test_dev_guard.sh` asserted `assert_allow` on exactly the buggy default paths of the former dev-guard hook. The oracle was "the script outputs `allow`", which was true, and which was the bug. Its contract required the non-covered default to *defer / no-decision* (exit 0, empty stdout), so the correct assertion was `assert_nodecision`. The hook and its exclusive suite have since been removed; the lesson about deriving expectations from intent still applies.

### (ii) Config-dependent behaviour is validated in an isolated environment

A config-dependent hook or integration test uses temporary configuration and controlled payloads, without depending on the developer's personal settings. Two masks make personal-config testing unreliable:

- **Config bleed** — the developer's own `settings.json` and permission mode can mask a plugin-level bug whose symptom depends on environment.
- **Perceptual mask** — dialog-free operation on Edit/Write/benign-Bash is the *expected feel*, so a bug that auto-approves those actions produces exactly the experience the operator already expects. There is no symptom to notice. This is precisely how #298 escaped its author.

The retained session, language and subagent suites exercise context and observation behavior. OpenCode installer tests exercise native-guide registration, deduplication and preservation of user instructions and agent selection. `tests/test_hook_registration.mjs` checks the shipped wiring and retirement of the disconnected context adapter. These checks do not prove how a host's native permission dialog renders or what a live user's policy allows.

### (iii) A failing test names a defect in code, not a missing sentence

A test in this repo asserts a property of executable code or a machine-readable artifact, evaluated by running it. If a failure could be cleared by adding or rewording prose, the assertion is measuring the wrong thing. The full rule, the diagnostic question, and the enumerated shapes that may not be registered are in [README.md § "What gets a test"](../README.md#what-gets-a-test).

A prior corpus of ~46,000 lines violated this and was deleted: seven suites asserting the presence, wording, byte-shape, or count of prose across `agents/` and `skills/`, plus behavioral tests whose pass condition was a model self-reporting compliance, plus tests pinned to architectures that no longer ship. The failure mode was not that they were useless — it was that they inverted authority. A failing literal search made adding a sentence the cheapest fix, so the specification stopped governing the prose and the prose started serving the check, and a contradiction could sit in a file with every check green because presence was the only thing measured.

**Consequence, stated plainly:** agent and skill prose has no mechanical guard. Its correctness rests on review — the agent's own file states its contract, a reviewer agent reads the artifact, the operator reads the result. Prose elsewhere in this repo that claims a test "pins", "asserts", or "cross-checks" a wording is stale unless it names a suite in the inventory below.

## Selected test evidence

`node tests/test_hook_outputs.mjs` exercises retained hook outputs with actual
regular files, hard links, symbolic links and native Claude event payloads. It
runs in Linux's full suite and the Windows job; Windows link-privilege omissions
remain explicit and require the Linux lane for symbolic-link coverage.

Select the shell, OS, runtimes and filesystem capabilities from the applicable
CI job before running its commands. Here, the complete `tests/run-all.sh` job
runs on Linux; native Windows coverage is listed in
[test.yml](../.github/workflows/test.yml)'s `windows-hooks` job. Git Bash with
Windows Node/Python is not a Linux environment. Use a Linux checkout for POSIX
fixtures and run affected Windows checks natively; a Linux pass proves neither
Windows execution nor live model behavior. Identify missing capabilities (for
example symlink permission), retain the failed result and repair test assumptions
where portable behavior is intended. Do not count a skipped assertion as verified.

Main and test authors distinguish a successful command from execution of the tests
selected by the approved requirements or live request. Use the runner's available
native output or report to record the selected check, revision, command, result,
and any omission reason. Report available executed/failed/skipped counts; absent
counts stay unknown. Do not introduce a universal parser or per-scenario registry.

A required test that was skipped, deselected, or never collected leaves its
scenario unverified even when the command exits zero. If the output cannot prove
execution, state that limit. An unrelated optional skip does not invalidate
otherwise sufficient evidence; distinguish it from the selected required checks.

Reuse sufficient existing tests, commands, or inspection. Keep default adapter,
service and API tests hermetic with in-memory port fakes or mocks; real services
belong in a separately marked, explicit opt-in integration tier. Missing Docker,
databases or caches must not silently skip the default suite. Database transactions
and other behavior depending on real integration still need relevant integration
evidence or an explicit gap; mocks do not prove those boundaries. This rule adds
no test quota, universal full-suite run, or specialist dispatch.

## What is tested

Everything below has inputs, outputs, and exit codes.

**Retained runtime and behavior checks.**

Claude context and observation behavior is checked through the retained session-start,
language-prompt and subagent-context suites where those assets are installed. The
host's native permission and approval UI remains outside the repository's headless
test boundary. Retired policy, outward-action and process-hook suites are not a
current Team Harness enforcement surface and are not listed as required checks.

Repository behavior suites continue to cover installer preservation, agent and skill
frontmatter, security review selection, evidence handling, pipeline control-plane
state, OpenSpec lifecycle validation, and other executable or machine-readable
contracts listed below.
**Structure that is machine-readable, not prose.**

| Suite | Covers |
|---|---|
| `test_agent_frontmatter.py` | YAML frontmatter parses for every `agents/*.md`, via PyYAML. Catches the silent-agent-drop class: an unquoted `": "` in a description breaks parsing, and Claude Code then drops the agent from the registered `subagent_type` list with no error surfaced |
| `test_opencode_agent_frontmatter.sh` | The same, for the opencode transform |
| `test_security_scan.py` | Exact source allowlists for all five PR agents, optional Codex projection validation, read-only-tier Bash grants, secrets, and roster reachability |
| `test_review_context.py` | PR security-selection reason enums and capture validity, review-policy parsing, preserved findings and advisory verifier assessments, exact coverage and status-specific evidence, selected preflight blockers, snapshot mergeability classification, PR-update reconciliation with preserved evidence, rendering, and conversation capture behavior; native Windows ACL inheritance and preservation also run through `test_review_context_windows.py` |
| `test_regression_evidence.mjs` | Real base/head assertion comparisons, preexisting failures, inconclusive execution, deadlines, bounded diagnostics, stale/tampered evidence and unchanged operator checkout; no model calls |
| `test_hook_registration.mjs` | Retained context/observation hook registration, launcher bundles and OpenCode integration; retired enforcement wiring is absent. |
| `test_openspec_launcher.mjs` | Executes the Windows npm JavaScript entrypoint transport with literal arguments and paths containing spaces/symbols; checks missing runtime and invalid input. Runs in Linux and native Windows CI. |
| `test_sync_skills_platform.mjs` | Shared setup asset byte drift on Windows and POSIX; executable mode drift on POSIX. Runs in the full suite and native Windows CI. |
| `test_codex_binary_resolution.py` | Resolves a real Windows directory junction or POSIX directory symlink, executes the pinned binary with an empty PATH, and rejects relative, missing, traversal, control-character, directory and non-executable candidates. |
| `test_pipeline_control_plane.mjs` | Legacy v5 helper compatibility: closed leases/results, actual Git scope reconciliation, Main-only mutation, safe specialist exports, canonical log replay/projections, causal recovery, Freeze quality, capsules, and the administrative close of a workspace without a control log (symlinked control or events paths refused) |
| `test_lane_marker_identity.py` | Lane-marker byte identity |
| `test_openspec_scope.py` | Every active OpenSpec change against the repository-owned rules in `openspec/config.yaml` — a non-empty delta, a declared capability, proposal words, task items and requirement ceiling. A change whose every task is checked but is not archived prints a WARN. Optional benchmark measurements stay in the workspace. |
| `test_design_oversize_behavioral.sh` | The design requirement-count ceiling — an oversize delta is decided from the canonical delta and `openspec/config.yaml` alone, with no workspace, identity, or gate input or output |
| `test_retired_phrases.py` | The closed retired-phrase list behind `/th:lint` Check 12 — a contract that restates a helper's flags, decision procedure, or attempt ordinals, plus the shrink-only exemption map |
| `test_authoring_budgets.py` | Advisory word/line/contents health signals, plus the shrink-only word ceilings recorded in `tests/fixtures/authoring-baseline.json`. Three things fail: a contents link pointing to no real heading, a ceiling raised above (or an entry dropped from) the fixture at the base ref, and a ceiling violation — a file over its ceiling, or a ceiling left more than 2% above a file's current count |

**Installer, runtime, and tooling.**

The fixed workspace-artifact registry and its prose mention check were retired
with native assignments. Current evidence may use caller-selected paths; reference
resolution and independent scenario review cover the guidance, while legacy helper
behavior remains covered by its executable suites.

| Suite | Covers |
|---|---|
| `go test ./cmd/install/` | The Go installer — preservation, mode transform, import candidates, platform behaviour |
| OpenCode native-guide installer tests | Guide registration, managed-path deduplication, and preservation of user instructions and agent selection. |
| `test_th_update_block_sync.sh` | The `/th:update` managed-block sync matrix |
| `test_update_opencode_sh.sh` | `update-opencode.sh` non-interactive pre-check |
| `test_bin_tty_execbit.py`, `test_bin_tty_behavioral.sh` | `bin/` TTY openability and exec bit (#473) |
| `test_github_identity_routes.py` | Cross-runtime GitHub route validation, longest-prefix resolution, isolated/account-switch strategies, config preservation, secret rejection, and generated-helper byte/mode identity |
| `tools/harness-migrate/test_harness_migrate.mjs`, `test_transform_conformance.mjs` | The bidirectional transform and its cross-language conformance |

**Runners.** `tests/run-all.sh` runs ordinary development verification and exits non-zero if any behavioral or structural check fails; `TH_REQUIRE_RUNTIMES=1` (set in CI) converts a missing-runtime SKIP into a FAIL. `TH_RELEASE_TESTS=1` adds release-only version coordination. `tests/run-behavioral.sh` runs slower end-to-end tests that need environment the default run cannot guarantee.

## When to add a test

Add one when you change code that has an exit code. A new runtime behavior needs an observable test case. A new installer behaviour needs a Go test. A new agent file is picked up automatically by `test_agent_frontmatter.py` — no manual registration.

Do **not** add one for a new pipeline phase, a new agent contract field, or a new mandatory prose section. That is the retired class: the contract belongs in the agent's own file, where it is actually read, and review is what enforces it.

## What the tests do NOT cover

- **Agent prompt behaviour.** Whether a model actually applies a contract it has been given is a behavioural question no assertion here answers.
- **Agent and skill prose.** No suite reads it. Deliberate — principle (iii).
- **Native host activation.** Repository suites do not prove how the host presents permission prompts or reloads a running session; report that boundary explicitly and use the host's own evidence.
- **Live pipeline runs.** Phase transitions only fire inside a real pipeline.

For host activation limits, reconnect only when the host demonstrates that a
specific changed component cannot be refreshed in place.
