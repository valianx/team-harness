# tests/

Verification suite for the components added in the harness-hardening + Reviewability Contract changes. **Not a general test suite** for the repo (the repo is mostly declarative `.md` assets and has no behavioural code) — these tests cover the two surfaces that *are* testable:

1. The functional behaviour of `hooks/policy-block.sh` (executable bash + python).
2. The structural integrity of the agent / skill / hook `.md` and `.json` files (cross-references, mandatory sections, frontmatter fields).

## Why this exists

CLAUDE.md says "no test suite" for this repo. That is still mostly true — agent prompts only run inside Claude Code, and validating prompt behaviour requires a live LLM. But two new pieces are testable without an LLM:

- `hooks/policy-block.sh` is a regular shell script with a JSON contract. Its behaviour can be asserted by feeding payloads and checking the output.
- The Reviewability Contract, the new pipeline phases, and the JSONL trace are spec changes baked into `.md` files. We can check that what each agent declares about itself is internally consistent (the implementer's caps match the reviewer's score; the orchestrator references the gates that the agents implement; the hook config wires `policy-block.sh` for every OS).

If the structural tests pass and the policy-block tests pass, the harness changes are at least *internally coherent*. End-to-end behavioural testing still requires running pipelines through Claude Code.

## Files

| File | What it covers |
|---|---|
| `test_policy_block.sh` | Functional tests for `hooks/policy-block.sh`. ~40 cases: rm destructive vs safe, git destructive vs safe, SQL DROP/TRUNCATE, sensitive file paths, allow-list variants, malformed payloads. |
| `test_agent_structure.py` | Structural tests across `agents/`, `skills/`, `hooks/`. 11 suites covering tool allowlists, the 5-column Roster, the new phases (1.5 / 2.5 / 3.5 / 3.6 / 4.5), the tester / qa / reviewer / implementer / delivery contracts, the `PreToolUse` wiring, and the README cross-references. |
| `run-all.sh` | Wrapper that runs both and summarises. Exit code 0 if all pass. |

## How to run

```bash
# Run everything
bash tests/run-all.sh

# Or each suite individually
bash tests/test_policy_block.sh
python3 tests/test_agent_structure.py
```

Both scripts are pure bash + python3 (stdlib). No third-party dependencies.

## What the tests do NOT cover

- **Agent prompt behaviour.** The implementer's `Reviewability self-check` is a checklist embedded in a system prompt — whether Claude actually applies it is a behavioural question that requires running the pipeline.
- **Hook integration with Claude Code.** `policy-block.sh` is tested in isolation (stdin/stdout). Whether Claude Code actually invokes it on every Bash/Write/Edit/NotebookEdit call depends on `~/.claude/settings.json` being correctly merged. To verify the integration, restart Claude Code and try a benign command (e.g., `rm -rf /tmp/foo` should pass) and a destructive one (e.g., `rm -rf /` should be blocked with the policy reason).
- **The orchestrator pipeline.** Phase 2.5 / 4.5 only fire inside a real pipeline run. To smoke-test, run a feature through `/issue` or a plain feature description and check that `00-execution-events.jsonl`, `done.yml`, and `04-internal-review.md` appear in `session-docs/{feature}/`.

## Adding a new test

- For new policy-block patterns: add `assert_deny` / `assert_allow` lines to `test_policy_block.sh` with one-line names.
- For new agent invariants: add a `check(name, condition, detail)` line in the appropriate suite of `test_agent_structure.py`. If the suite doesn't exist yet, add a new suite header (`=== Suite N: ... ===`) and a section comment.
- Both files are append-only by design; do not refactor an existing case unless the assertion itself is wrong.
