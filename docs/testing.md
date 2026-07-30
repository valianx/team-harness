# Testing Conventions

> This file is the single source of truth for what this repo tests and how. `CLAUDE.md §11` points here.
>
> **What may be registered as a test is decided in [README.md § "What gets a test"](../README.md#what-gets-a-test).** Read that first — it is the binding rule, and it narrows the scope of everything below.

## Testing principles

Normative for every agent that authors a test here (primarily `tester`, also `qa` and `security`). Codified after issue #298 — a permission-widening bug in the dev-guard hook that shipped despite a green suite.

### (i) The oracle is the spec, not the implementation output

The expected value in an assertion must be derived from the contract, specification, or documented intent — NEVER from running the code under test and recording what it emits. A test whose expected value is "what the code currently does" is a snapshot of present behaviour: it cannot catch a defect already present when the snapshot is taken, and it turns red when that defect is later fixed. It actively defends the bug.

**#298 case study.** `tests/test_dev_guard.sh` asserted `assert_allow` on exactly the buggy default paths of the dev-guard hook. The oracle was "the script outputs `allow`", which was true, and which was the bug. The correct oracle is the permission-gate contract: a guard hook's non-covered default is *defer / no-decision* (exit 0, empty stdout), so the assertion must be `assert_nodecision`. Suite 83 flipped those assertions; this principle prevents the class from recurring.

### (ii) Hook, permission, and gate behaviour is validated in an isolated environment

A test exercising a `PreToolUse` hook, a permission gate, or any config-dependent security control MUST run in a clean environment containing ONLY the plugin's own hooks and wiring — never the developer's personal `~/.claude` config. Two masks make personal-config testing unsafe for this class:

- **Config bleed** — the developer's own `settings.json` and permission mode can mask a plugin-level bug whose symptom depends on environment.
- **Perceptual mask** — dialog-free operation on Edit/Write/benign-Bash is the *expected feel*, so a bug that auto-approves those actions produces exactly the experience the operator already expects. There is no symptom to notice. This is precisely how #298 escaped its author.

`tests/test_isolated_hook_env.sh` implements this: it builds a throwaway `HOME` wired with only the plugin's hooks (read from `.claude-plugin/hooks.json`), drives the chain with controlled tool payloads, and asserts the emitted decision comes solely from the installed hooks. It proves the hook *defers*; it cannot prove the GUI dialog renders — headless CI cannot observe Claude Code's real dialog, and that boundary is stated in the suite's own scope note.

### (iii) A failing test names a defect in code, not a missing sentence

A test in this repo asserts a property of executable code or a machine-readable artifact, evaluated by running it. If a failure could be cleared by adding or rewording prose, the assertion is measuring the wrong thing. The full rule, the diagnostic question, and the enumerated shapes that may not be registered are in [README.md § "What gets a test"](../README.md#what-gets-a-test).

A prior corpus of ~46,000 lines violated this and was deleted: seven suites asserting the presence, wording, byte-shape, or count of prose across `agents/` and `skills/`, plus behavioral tests whose pass condition was a model self-reporting compliance, plus tests pinned to architectures that no longer ship. The failure mode was not that they were useless — it was that they inverted authority. A failing literal search made adding a sentence the cheapest fix, so the specification stopped governing the prose and the prose started serving the check, and a contradiction could sit in a file with every check green because presence was the only thing measured.

**Consequence, stated plainly:** agent and skill prose has no mechanical guard. Its correctness rests on review — the agent's own file states its contract, a reviewer agent reads the artifact, the operator reads the result. Prose elsewhere in this repo that claims a test "pins", "asserts", or "cross-checks" a wording is stale unless it names a suite in the inventory below.

## What is tested

Everything below has inputs, outputs, and exit codes.

**Hook and gate logic** (`hooks/ts/bodies/*.ts` → `dist/*.cjs`, the single source of gate logic since the Bash→TS cutover, issue #446). Each suite feeds tool-call JSON payloads and asserts the emitted decision.

| Suite | Covers |
|---|---|
| `test_policy_block.sh` | Secret-scanning and destructive-command denial: `rm` on `/`/`~`/`$HOME`/wildcards, `git --force`/`--no-verify`/`reset --hard`/`clean -f`, SQL `DROP`/`TRUNCATE`, sensitive paths (`.env`, `.pem`, `.ssh/`, `.aws/credentials`), the `.env.example`-class allowlist, malformed payloads (fail-open) |
| `test_dev_guard.sh` | Outward-action gating by destination — a non-default-branch push allows; default-branch, tag and force pushes, `gh pr merge/review/comment`, `gh api` mutating PR endpoints and ClickUp MCP writes ask |
| `test_gcp_guard.sh` | Destructive `gcloud` verb gating |
| `test_session_start.sh` | SessionStart config read and language-directive injection |
| `test_language_user_prompt.sh` | UserPromptSubmit language handling |
| `test_subagent_start.sh` | The deterministic PreToolUse breadcrumb |
| `test_checkpoint_guard.sh`, `test_prepublish_guard.sh`, `test_prepublish_bump_floor.sh`, `test_worktree_guard.sh` | Unwired from `.claude-plugin/hooks.json` since v2.139.0; the live consumer is the opencode runtime via `teamHarnessPlugins()` |
| `test_gate_guard.sh` | Unwired; code retained |
| `test_isolated_hook_env.sh` | The isolated-environment harness itself (principle ii) |
| `test_hook_gates_hardening.sh` | Runtime execution of the hardening findings, including the ClickUp MCP matcher (F-008) |
| `test_launcher_fail_closed.sh` | `hooks/run-ts-hook.sh` fails closed on a corrupt artifact |
| `test_ts_hook_parity.sh`, `test_ts_hook_parity_ext.sh` | Decision parity across hook entry points |
| `test_sketch_guard.sh` | `hooks/sketch-guard.sh` (Bash, invoked via the Bash tool — not an event hook) |

**Structure that is machine-readable, not prose.**

| Suite | Covers |
|---|---|
| `test_agent_frontmatter.py` | YAML frontmatter parses for every `agents/*.md`, via PyYAML. Catches the silent-agent-drop class: an unquoted `": "` in a description breaks parsing, and Claude Code then drops the agent from the registered `subagent_type` list with no error surfaced |
| `test_opencode_agent_frontmatter.sh` | The same, for the opencode transform |
| `test_security_scan.py` | Read-only-tier agents carrying `Bash`, web-facing agents missing the §6.6 injection preamble, `hooks/*.sh` injection anti-patterns, hook-manifest command form, concrete secrets in shipped assets, and roster reachability |
| `test_permission_disjointness.py` | The permission-allowlist disjointness invariant (#18312 floor) |
| `test_flow_event_schema_sync.py` | Cross-repo flow-event schema sync |
| `test_lane_marker_identity.py` | Lane-marker byte identity |

**Installer, runtime, and tooling.**

| Suite | Covers |
|---|---|
| `go test ./cmd/install/` | The Go installer — preservation, mode transform, import candidates, platform behaviour |
| `test_installer_preservation.py` | Installer preservation rules |
| `test_opencode_config_resolver.sh` | opencode config-path resolution (SEC-OC-R3) |
| `test_opencode_session_enforcement.sh` | opencode `session.created` enforcement |
| `test_th_update_block_sync.sh` | The `/th:update` managed-block sync matrix |
| `test_update_opencode_sh.sh` | `update-opencode.sh` non-interactive pre-check |
| `test_bin_tty_execbit.py`, `test_bin_tty_behavioral.sh` | `bin/` TTY openability and exec bit (#473) |
| `tools/harness-migrate/test_harness_migrate.mjs`, `test_transform_conformance.mjs` | The bidirectional transform and its cross-language conformance |

**Runners.** `tests/run-all.sh` runs the suites above and exits non-zero if any fail; `TH_REQUIRE_RUNTIMES=1` (set in CI) converts a missing-runtime SKIP into a FAIL, so a green run means verified and never unchecked. `tests/run-behavioral.sh` runs the slower end-to-end tests that need environment the default run cannot guarantee.

## When to add a test

Add one when you change code that has an exit code. A new `policy-block` denylist or allowlist case needs an `assert_deny`/`assert_allow` line. A new hook decision path needs a payload case. A new installer behaviour needs a Go test. A new agent file is picked up automatically by `test_agent_frontmatter.py` — no manual registration.

Do **not** add one for a new pipeline phase, a new agent contract field, or a new mandatory prose section. That is the retired class: the contract belongs in the agent's own file, where it is actually read, and review is what enforces it.

## What the tests do NOT cover

- **Agent prompt behaviour.** Whether a model actually applies a contract it has been given is a behavioural question no assertion here answers.
- **Agent and skill prose.** No suite reads it. Deliberate — principle (iii).
- **Hook integration with the host.** The suites prove a hook's decision given a payload, not that the payload arrives; whether the host invokes a hook on every Bash/Write/Edit depends on its own wiring.
- **Live pipeline runs.** Phase transitions only fire inside a real pipeline.

For all four, restart the host and smoke-test by hand.
