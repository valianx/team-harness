# tests/

Verification suite for the components added in the harness-hardening + Reviewability Contract changes. **Not a general test suite** for the repo (the repo is mostly declarative `.md` assets and has no behavioural code) — these tests cover the two surfaces that *are* testable:

1. The functional behaviour of `hooks/ts/bodies/policy-block.ts` (compiled to `hooks/ts/dist/policy-block.cjs`, run via `hooks/run-ts-hook.sh`).
2. The structural integrity of the agent / skill / hook `.md` and `.json` files (cross-references, mandatory sections, frontmatter fields).

## Why this exists

CLAUDE.md says "no test suite" for this repo. That is still mostly true — agent prompts only run inside Claude Code, and validating prompt behaviour requires a live LLM. But two new pieces are testable without an LLM:

- `hooks/ts/bodies/policy-block.ts` is a node script with a JSON contract. Its behaviour can be asserted by feeding payloads and checking the output.
- The Reviewability Contract, the new pipeline phases, and the JSONL trace are spec changes baked into `.md` files. We can check that what each agent declares about itself is internally consistent (the implementer's caps match the reviewer's score; the orchestrator references the gates that the agents implement; the hook config wires policy-block for every OS).

If the structural tests pass and the policy-block tests pass, the harness changes are at least *internally coherent*. End-to-end behavioural testing still requires running pipelines through Claude Code.

## Files

| File | What it covers |
|---|---|
| `test_policy_block.sh` | Functional tests for `hooks/ts/bodies/policy-block.ts`. ~48 cases: rm destructive vs safe, git destructive vs safe, SQL DROP/TRUNCATE, sensitive file paths, allow-list variants, malformed payloads. |
| `test_agent_structure.py` | Structural tests across `agents/`, `skills/`, `hooks/`. 19 suites covering tool allowlists, the 5-column Roster, the pipeline phases (1.5 / 1.6 / 2.5 / 3.5 / 3.6 / 4.5), the tester / qa / reviewer / implementer / delivery contracts, the `PreToolUse` wiring, the README cross-references, the dispatch-blocked auto-takeover contract, and agent identity & cross-reference consistency (filename ↔ frontmatter name, orphan agents, dangling references, phase numbers, skill resolution, tools allowlist typos). |
| `test_agent_frontmatter.py` | YAML frontmatter parseability for every `agents/*.md` (catches the silent-agent-drop class of bug: an unquoted `": "` in a description breaks YAML parsing and Claude Code drops the agent from `subagent_type` with no error). Uses PyYAML via `uv run --with PyYAML python`. |
| `run-all.sh` | Wrapper that runs the three free/fast suites above and summarises. Exit code 0 if all pass. |
| `test_orchestrator_boot_behavioral.sh` | **Behavioral end-to-end test** (costs ~78K tokens / ~$1 per run, ~10s). Dispatches the orchestrator via `claude -p` and asserts the boot probe + dispatch-blocked exit behave correctly when the agent runs as a nested subagent (the empirically-confirmed harness failure mode). Catches platform/model regressions that structural tests cannot. |
| `run-behavioral.sh` | Wrapper for behavioral tests (`test_*_behavioral.sh`). **NOT included in `run-all.sh`** because it costs API tokens. Run on demand before releases, after upgrading Claude Code, or after editing contract-critical agent prose. |

## How to run

```bash
# Run all free/fast structural + functional suites (no API tokens)
bash tests/run-all.sh

# Run the behavioral end-to-end suite (costs API tokens — on demand)
bash tests/run-behavioral.sh

# Or each suite individually
bash tests/test_policy_block.sh
python3 tests/test_agent_structure.py
uv run --with PyYAML python tests/test_agent_frontmatter.py
bash tests/test_orchestrator_boot_behavioral.sh   # behavioral, costs tokens
```

The free suites are pure bash + python3 (stdlib + PyYAML for frontmatter parsing). The behavioral suite requires `claude` CLI (Claude Code) authenticated, and that `uv run bin/install.py` has been run so `~/.claude/agents/` has the current orchestrator.

## When to run which

| Trigger | Run |
|---------|-----|
| Pre-commit / every save | `bash tests/run-all.sh` (free, ~2s) |
| Before a release tag | both: `run-all.sh` AND `run-behavioral.sh` |
| After editing any `agents/*.md` contract-critical prose (status blocks, boot sequences, dispatch invariants) | both |
| After upgrading Claude Code (`claude --version` changed) | `run-behavioral.sh` |
| Weekly heartbeat against platform drift | `run-behavioral.sh` |
| Investigating a "the harness is broken" report | start with `run-all.sh`, escalate to `run-behavioral.sh` if structural is green |

## What the tests do NOT cover

- **Agent prompt behaviour.** The implementer's `Reviewability self-check` is a checklist embedded in a system prompt — whether Claude actually applies it is a behavioural question that requires running the pipeline.
- **Hook integration with Claude Code.** `policy-block` is tested in isolation (stdin/stdout). Whether Claude Code actually invokes it on every Bash/Write/Edit/NotebookEdit call depends on `~/.claude/settings.json` being correctly merged. To verify the integration, restart Claude Code and try a benign command (e.g., `rm -rf /tmp/foo` should pass) and a destructive one (e.g., `rm -rf /` should be blocked with the policy reason).
- **The orchestrator pipeline.** Phase 2.5 / 4.5 only fire inside a real pipeline run. To smoke-test, run a feature through `/issue` or a plain feature description and check that `00-execution-events.jsonl` (local mode) or `00-execution-events.md` (obsidian mode), `done.yml`, and `04-internal-review.md` appear in `workspaces/{feature}/`.

## Adding a new test

- For new policy-block patterns: add `assert_deny` / `assert_allow` lines to `test_policy_block.sh` with one-line names.
- For new agent invariants: add a `check(name, condition, detail)` line in the appropriate suite of `test_agent_structure.py`. If the suite doesn't exist yet, add a new suite header (`=== Suite N: ... ===`) and a section comment.
- Both files are append-only by design; do not refactor an existing case unless the assertion itself is wrong.
